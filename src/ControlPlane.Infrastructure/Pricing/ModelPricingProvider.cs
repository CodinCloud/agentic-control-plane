using ControlPlane.Application.Abstractions.Pricing;
using ControlPlane.Domain.Pricing;
using Microsoft.Extensions.Options;

namespace ControlPlane.Infrastructure.Pricing;

/// <summary>
/// Construit la grille <b>une fois</b>, au démarrage : socle embarqué, puis superposition de la
/// section <c>ModelPricing</c>. Pas d'<c>IOptionsMonitor</c> — le rechargement à chaud
/// n'apporterait rien ici et coûterait une invalidation de cache à raisonner ; corriger un
/// tarif demande un redémarrage, ce qui est le contrat annoncé.
/// </summary>
internal sealed class ModelPricingProvider : IModelPricingProvider
{
    public ModelPricingProvider(IOptions<ModelPricingOptions> options)
    {
        Current = Build(options.Value);
    }

    public PricingTable Current { get; }

    private static PricingTable Build(ModelPricingOptions options)
    {
        var prices = new Dictionary<string, ModelPrice>(ModelPricingDefaults.Prices, StringComparer.OrdinalIgnoreCase);

        foreach ((string model, ModelPriceOptions price) in options.Models)
        {
            // Une clé vide capterait tous les modèles par préfixe et tarifierait n'importe quoi
            // au premier tarif venu — on l'ignore plutôt que de laisser la grille mentir.
            if (string.IsNullOrWhiteSpace(model))
            {
                continue;
            }

            prices[model] = new ModelPrice(
                price.InputPerMTok,
                price.OutputPerMTok,
                price.CacheWrite5mPerMTok,
                price.CacheWrite1hPerMTok,
                price.CacheReadPerMTok);
        }

        return new PricingTable(prices);
    }
}
