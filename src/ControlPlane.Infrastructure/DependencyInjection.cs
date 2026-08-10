using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Pricing;
using ControlPlane.Application.Abstractions.Transcripts;
using ControlPlane.Infrastructure.Clock;
using ControlPlane.Infrastructure.Persistence;
using ControlPlane.Infrastructure.Pricing;
using ControlPlane.Infrastructure.Transcripts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ControlPlane.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        string connectionString = configuration.GetConnectionString("ControlPlane")
            ?? "Data Source=control-plane.db";

        services.AddDbContext<ControlPlaneDbContext>(options => options
            .UseSqlite(connectionString)
            .UseSnakeCaseNamingConvention());

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ControlPlaneDbContext>());

        services.AddSingleton<IDateTimeProvider, DateTimeProvider>();

        // Grille tarifaire : socle embarqué dans le domaine, que la section ModelPricing
        // d'appsettings.json vient recouvrir entrée par entrée. Résolue une fois au démarrage.
        services.Configure<ModelPricingOptions>(configuration.GetSection(ModelPricingOptions.SectionName));
        services.AddSingleton<IModelPricingProvider, ModelPricingProvider>();

        // Same decoupling mechanism as the WebSocket event broadcaster (Api/Realtime): an
        // in-memory queue drained by a BackgroundService, so a transcript read can never
        // slow down or fail hook ingestion.
        services.AddSingleton<TranscriptIngestionQueue>();
        services.AddSingleton<ITranscriptIngestionQueue>(provider => provider.GetRequiredService<TranscriptIngestionQueue>());
        services.AddHostedService<TranscriptIngestionBackgroundService>();

        return services;
    }
}
