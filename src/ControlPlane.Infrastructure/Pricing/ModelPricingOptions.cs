namespace ControlPlane.Infrastructure.Pricing;

/// <summary>
/// Section <c>ModelPricing</c> d'<c>appsettings.json</c>. Chaque entrée se superpose au socle
/// embarqué (<see cref="ControlPlane.Domain.Pricing.ModelPricingDefaults"/>) : la
/// configuration l'emporte, entrée par entrée, et les modèles qu'elle ne mentionne pas gardent
/// leur tarif par défaut.
///
/// <para>La clé d'un modèle est un <b>préfixe</b> — <c>claude-opus-5</c> couvre aussi bien
/// l'alias court que ses variantes datées.</para>
/// </summary>
public sealed class ModelPricingOptions
{
    public const string SectionName = "ModelPricing";

    /// <summary>Tarifs par modèle, en USD par million de tokens.</summary>
    public Dictionary<string, ModelPriceOptions> Models { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

/// <summary>Les cinq compartiments tarifaires d'un modèle, en USD par million de tokens.</summary>
public sealed class ModelPriceOptions
{
    public decimal InputPerMTok { get; init; }

    public decimal OutputPerMTok { get; init; }

    public decimal CacheWrite5mPerMTok { get; init; }

    public decimal CacheWrite1hPerMTok { get; init; }

    public decimal CacheReadPerMTok { get; init; }
}
