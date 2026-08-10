using ControlPlane.Domain.Pricing;

namespace ControlPlane.Domain.Tests.Pricing;

/// <summary>Oracle 5 de la Definition of Done — plans/004-cout-equivalent-api.md.</summary>
public sealed class PricingTableTests
{
    private static readonly ModelPrice Cheap = new(1m, 2m, 3m, 4m, 5m);
    private static readonly ModelPrice Expensive = new(10m, 20m, 30m, 40m, 50m);

    /// <summary>Les transcripts portent des alias courts, l'API publie aussi des variantes
    /// datées : la grille doit encaisser les deux sans entrée dupliquée.</summary>
    [Fact]
    public void Un_identifiant_date_resout_vers_lalias_court()
    {
        Assert.True(ModelPricingDefaults.Table.TryResolve("claude-haiku-4-5-20251001", out ModelPrice price));
        Assert.Equal(1.00m, price.InputPerMTok);
    }

    [Fact]
    public void Un_alias_court_resout_directement()
    {
        Assert.True(ModelPricingDefaults.Table.TryResolve("claude-opus-5", out ModelPrice price));
        Assert.Equal(5.00m, price.InputPerMTok);
    }

    /// <summary>Le cœur de la règle : c'est le préfixe <b>le plus long</b> qui gagne. Une
    /// correspondance par préfixe naïve laisserait <c>claude-opus-4</c> capter
    /// <c>claude-opus-4-8</c> et le tariferait au mauvais prix.</summary>
    [Fact]
    public void Le_prefixe_le_plus_long_lemporte()
    {
        var table = new PricingTable(new Dictionary<string, ModelPrice>
        {
            ["claude-opus-4"] = Cheap,
            ["claude-opus-4-8"] = Expensive,
        });

        Assert.True(table.TryResolve("claude-opus-4-8", out ModelPrice matched));
        Assert.Equal(Expensive.InputPerMTok, matched.InputPerMTok);
    }

    [Fact]
    public void La_resolution_ignore_la_casse()
    {
        Assert.True(ModelPricingDefaults.Table.TryResolve("CLAUDE-OPUS-5", out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("un-modele-inconnu")]
    public void Un_modele_absent_ne_resout_pas(string? model)
    {
        Assert.False(ModelPricingDefaults.Table.TryResolve(model, out _));
    }

    [Fact]
    public void La_grille_vide_ne_resout_jamais()
    {
        Assert.False(PricingTable.Empty.TryResolve("claude-opus-5", out _));
    }
}
