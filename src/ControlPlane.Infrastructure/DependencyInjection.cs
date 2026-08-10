using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Infrastructure.Clock;
using ControlPlane.Infrastructure.Persistence;
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

        return services;
    }
}
