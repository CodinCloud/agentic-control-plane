namespace ControlPlane.Domain.Pricing;

/// <summary>
/// La grille embarquée, en USD par million de tokens. Elle sert de socle : la section
/// <c>ModelPricing</c> d'<c>appsettings.json</c> se superpose et l'emporte, entrée par entrée,
/// de sorte qu'un nouveau modèle se tarife en éditant un JSON — sans recompiler.
///
/// <para>Les tarifs de cache dérivent du tarif d'entrée : 1,25× en TTL 5 min, 2× en TTL 1 h,
/// 0,1× en lecture.</para>
///
/// <para>⚠️ <c>claude-sonnet-5</c> porte ici son <b>tarif d'introduction</b> (2,00 / 10,00),
/// en vigueur jusqu'au <b>2026-08-31</b>. À partir du 2026-09-01 le tarif standard est
/// 3,00 / 15,00 — à corriger dans <c>appsettings.json</c>. Comme le coût est recalculé à la
/// lecture (décision #4 de la spec 004), cette correction réécrira rétroactivement tout
/// l'historique Sonnet.</para>
/// </summary>
public static class ModelPricingDefaults
{
    public static IReadOnlyDictionary<string, ModelPrice> Prices { get; } =
        new Dictionary<string, ModelPrice>(StringComparer.OrdinalIgnoreCase)
        {
            ["claude-opus-5"] = new(5.00m, 25.00m, 6.25m, 10.00m, 0.50m),
            ["claude-sonnet-5"] = new(2.00m, 10.00m, 2.50m, 4.00m, 0.20m),
            ["claude-opus-4-8"] = new(5.00m, 25.00m, 6.25m, 10.00m, 0.50m),
            ["claude-haiku-4-5"] = new(1.00m, 5.00m, 1.25m, 2.00m, 0.10m),
        };

    public static PricingTable Table { get; } = new(Prices);
}
