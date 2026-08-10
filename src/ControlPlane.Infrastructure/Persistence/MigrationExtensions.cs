using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ControlPlane.Infrastructure.Persistence;

public static class MigrationExtensions
{
    /// <summary>Applies pending EF Core migrations at startup. SQLite is a local file: no
    /// separate deploy step, the schema is brought up to date on process start.</summary>
    public static IServiceProvider ApplyMigrations(this IServiceProvider serviceProvider)
    {
        using IServiceScope scope = serviceProvider.CreateScope();
        using ControlPlaneDbContext context = scope.ServiceProvider.GetRequiredService<ControlPlaneDbContext>();

        context.Database.Migrate();

        return serviceProvider;
    }
}
