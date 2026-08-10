using ControlPlane.Domain.Pricing;

namespace ControlPlane.Application.Abstractions.Pricing;

/// <summary>
/// Donne aux handlers la grille tarifaire en vigueur, sans leur faire connaître d'où elle
/// vient. L'implémentation (Infrastructure) superpose la section <c>ModelPricing</c> de la
/// configuration au socle embarqué dans <see cref="ModelPricingDefaults"/>.
///
/// <para>La grille est résolue une fois au démarrage : la corriger demande un redémarrage,
/// pas une recompilation — c'est le compromis retenu en décision #3 de la spec 004.</para>
/// </summary>
public interface IModelPricingProvider
{
    PricingTable Current { get; }
}
