using ControlPlane.Domain.Pricing;

namespace ControlPlane.Domain.Tests.Pricing;

/// <summary>
/// Oracles 1, 3 et 4 de la Definition of Done — plans/004-cout-equivalent-api.md.
/// </summary>
public sealed class CostCalculatorTests
{
    private const string Opus = "claude-opus-5";
    private const int OneMillion = 1_000_000;

    private static readonly PricingTable Table = ModelPricingDefaults.Table;

    /// <summary>Un million de tokens dans un seul compartiment à la fois : le montant obtenu
    /// doit être exactement le tarif de ce compartiment. C'est ce qui interdit de retomber sur
    /// l'addition indifférenciée que cette spec corrige.</summary>
    public static TheoryData<string, TokenUsage, double> Compartiments => new()
    {
        { "entrée", new TokenUsage(OneMillion, 0, 0, 0, 0, 0), 5.00 },
        { "sortie", new TokenUsage(0, OneMillion, 0, 0, 0, 0), 25.00 },
        { "écriture de cache 5 min", new TokenUsage(0, 0, OneMillion, 0, 0, 0), 6.25 },
        { "écriture de cache 1 h", new TokenUsage(0, 0, 0, OneMillion, 0, 0), 10.00 },
        { "lecture de cache", new TokenUsage(0, 0, 0, 0, 0, OneMillion), 0.50 },
    };

    [Theory]
    [MemberData(nameof(Compartiments))]
    public void Chaque_compartiment_est_tarife_a_son_propre_taux(string compartiment, TokenUsage usage, double attenduUsd)
    {
        decimal? cout = CostCalculator.Compute(Table, Opus, usage);

        Assert.Equal((decimal)attenduUsd, cout);
        Assert.NotNull(compartiment);
    }

    /// <summary>Oracle 3 — repli sur le TTL 1 h quand la ventilation manque (lignes ingérées
    /// avant que la projection ne lise le bloc <c>cache_creation</c>).</summary>
    [Fact]
    public void Sans_ventilation_le_cache_est_tarife_comme_du_TTL_1h()
    {
        var usage = new TokenUsage(0, 0, 0, 0, OneMillion, 0);

        decimal? cout = CostCalculator.Compute(Table, Opus, usage);

        Assert.Equal(10.00m, cout);
        Assert.NotEqual(6.25m, cout);
    }

    /// <summary>La ventilation, quand elle est là, prime sur le total plat — sans quoi le
    /// cache serait compté deux fois sur toute ligne récente.</summary>
    [Fact]
    public void La_ventilation_prime_sur_le_total_plat()
    {
        var usage = new TokenUsage(0, 0, 400_000, 600_000, OneMillion, 0);

        decimal? cout = CostCalculator.Compute(Table, Opus, usage);

        // 400k × 6,25 + 600k × 10,00 = 2,50 + 6,00
        Assert.Equal(8.50m, cout);
    }

    [Fact]
    public void Aucune_ecriture_de_cache_ne_coute_rien()
    {
        (int fiveMinutes, int oneHour) = CostCalculator.SplitCacheWrite(new TokenUsage(0, 0, 0, 0, 0, 0));

        Assert.Equal(0, fiveMinutes);
        Assert.Equal(0, oneHour);
    }

    /// <summary>Oracle 4 — un modèle hors grille n'a pas de coût, et surtout pas un coût nul :
    /// zéro minorerait silencieusement tous les totaux qui l'agrègent.</summary>
    [Theory]
    [InlineData("claude-experimental-9")]
    [InlineData("gpt-cinq")]
    [InlineData("")]
    [InlineData(null)]
    public void Un_modele_hors_grille_na_pas_de_cout(string? model)
    {
        decimal? cout = CostCalculator.Compute(Table, model, new TokenUsage(OneMillion, OneMillion, 0, 0, 0, 0));

        Assert.Null(cout);
    }

    /// <summary>Un usage réel mélange les cinq compartiments : le total est la somme des cinq
    /// termes, pas un volume multiplié par un taux moyen.</summary>
    [Fact]
    public void Un_usage_reel_somme_les_cinq_compartiments()
    {
        var usage = new TokenUsage(
            InputTokens: 2_000,
            OutputTokens: 1_000,
            CacheCreation5mTokens: 4_000,
            CacheCreation1hTokens: 16_000,
            CacheCreationTotalTokens: 20_000,
            CacheReadTokens: 100_000);

        decimal? cout = CostCalculator.Compute(Table, Opus, usage);

        // (10 000 + 25 000 + 25 000 + 160 000 + 50 000) / 1e6 = 270 000 / 1e6
        Assert.Equal(0.27m, cout);
    }

    /// <summary>Le même travail sur Sonnet coûte moins cher que sur Opus — c'est exactement
    /// la comparaison que le compteur en tokens rendait impossible.</summary>
    [Fact]
    public void Le_meme_usage_coute_moins_cher_sur_Sonnet_que_sur_Opus()
    {
        var usage = new TokenUsage(OneMillion, OneMillion, 0, 0, 0, 0);

        decimal? opus = CostCalculator.Compute(Table, "claude-opus-5", usage);
        decimal? sonnet = CostCalculator.Compute(Table, "claude-sonnet-5", usage);

        Assert.Equal(30.00m, opus);
        Assert.Equal(12.00m, sonnet);
    }
}
