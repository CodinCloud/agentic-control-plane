namespace ControlPlane.Domain.Pricing;

/// <summary>
/// Traduction pure de tokens en dollars. Aucune I/O, aucune dépendance : c'est la pièce que
/// les tests couvrent directement.
///
/// <para><b>Ce que le chiffre veut dire.</b> Le poste travaille sous abonnement forfaitaire,
/// pas en facturation à l'usage : ce montant n'est pas une facture, c'est la valorisation du
/// travail aux tarifs API publics — « combien ce travail aurait coûté en pay-per-token ».
/// L'UI porte le mot « équivalent ». Voir plans/004-cout-equivalent-api.md §"Sémantique".</para>
///
/// <para><b>En <see cref="decimal"/>, jamais en <see cref="double"/>.</b> Un montant ne se
/// calcule pas en virgule flottante binaire ; la division par un million n'a pas de
/// représentation exacte en base 2 et les erreurs s'accumuleraient sur des milliers de
/// lignes.</para>
/// </summary>
public static class CostCalculator
{
    private const decimal TokensPerMillion = 1_000_000m;

    /// <summary>
    /// Coût d'un usage, ou <c>null</c> si le modèle est absent de la grille. Null et non zéro :
    /// un tarif manquant est une information, le remplacer par zéro minorerait silencieusement
    /// tous les totaux qui l'agrègent.
    /// </summary>
    public static decimal? Compute(PricingTable table, string? model, TokenUsage usage)
    {
        ArgumentNullException.ThrowIfNull(table);

        if (!table.TryResolve(model, out ModelPrice price))
        {
            return null;
        }

        (int fiveMinutes, int oneHour) = SplitCacheWrite(usage);

        decimal total =
            usage.InputTokens * price.InputPerMTok
            + usage.OutputTokens * price.OutputPerMTok
            + fiveMinutes * price.CacheWrite5mPerMTok
            + oneHour * price.CacheWrite1hPerMTok
            + usage.CacheReadTokens * price.CacheReadPerMTok;

        return total / TokensPerMillion;
    }

    /// <summary>
    /// Répartit les écritures de cache entre les deux TTL.
    ///
    /// <para>Quand la ventilation est présente, elle fait foi. Quand elle est absente — les
    /// lignes ingérées avant que <c>TranscriptProjection</c> ne lise le bloc
    /// <c>cache_creation</c>, et que l'idempotence par <c>MessageId</c> empêche de reprendre —
    /// <b>tout est traité comme du TTL 1 h</b>. Ce n'est pas arbitraire : mesuré sur les
    /// transcripts du poste, 93 % des écritures de cache sont en 1 h (5 608 939 tokens contre
    /// 437 956). Se replier sur 1 h coûte ~5 % d'erreur ; se replier sur 5 min en coûterait
    /// ~37 %. On se trompe du côté le moins cher en erreur.</para>
    /// </summary>
    public static (int FiveMinutes, int OneHour) SplitCacheWrite(TokenUsage usage)
    {
        int ventilated = usage.CacheCreation5mTokens + usage.CacheCreation1hTokens;

        if (ventilated > 0)
        {
            return (usage.CacheCreation5mTokens, usage.CacheCreation1hTokens);
        }

        return usage.CacheCreationTotalTokens > 0
            ? (0, usage.CacheCreationTotalTokens)
            : (0, 0);
    }
}
