namespace ControlPlane.Domain.Pricing;

/// <summary>
/// La grille tarifaire, résolue par <b>préfixe le plus long</b>. Les transcripts portent des
/// alias courts (<c>claude-opus-5</c>) mais l'API publie aussi des variantes datées
/// (<c>claude-haiku-4-5-20251001</c>) : une correspondance exacte manquerait les secondes, et
/// une correspondance par préfixe naïve laisserait <c>claude-opus-4</c> capter
/// <c>claude-opus-4-8</c>. Prendre le préfixe le plus long lève l'ambiguïté sans imposer une
/// entrée par variante.
///
/// <para>Un modèle absent de la grille n'a <b>pas</b> de coût — il n'a pas un coût nul. C'est
/// tout l'objet de <see cref="TryResolve"/> : rendre l'absence explicite pour que l'appelant
/// la signale au lieu de la noyer dans un total.</para>
/// </summary>
public sealed class PricingTable
{
    private readonly IReadOnlyList<KeyValuePair<string, ModelPrice>> _entries;

    public PricingTable(IReadOnlyDictionary<string, ModelPrice> prices)
    {
        ArgumentNullException.ThrowIfNull(prices);

        // Trié une fois à la construction, du préfixe le plus long au plus court : la
        // résolution devient un simple « premier qui correspond gagne ».
        _entries = prices
            .OrderByDescending(entry => entry.Key.Length)
            .ThenBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>Grille vide — aucun modèle n'est tarifé, tous les coûts sont null.</summary>
    public static PricingTable Empty { get; } = new(new Dictionary<string, ModelPrice>());

    public bool TryResolve(string? model, out ModelPrice price)
    {
        if (!string.IsNullOrWhiteSpace(model))
        {
            foreach ((string prefix, ModelPrice candidate) in _entries)
            {
                if (model.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    price = candidate;
                    return true;
                }
            }
        }

        price = null!;
        return false;
    }
}
