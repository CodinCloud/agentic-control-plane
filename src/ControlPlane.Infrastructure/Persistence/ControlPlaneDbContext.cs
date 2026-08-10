using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Domain.HookEvents;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Infrastructure.Persistence;

public sealed class ControlPlaneDbContext(DbContextOptions<ControlPlaneDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<HookEvent> HookEvents => Set<HookEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ControlPlaneDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }
}
