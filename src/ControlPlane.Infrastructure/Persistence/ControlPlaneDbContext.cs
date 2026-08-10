using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Domain.AgentRuns;
using ControlPlane.Domain.HookEvents;
using ControlPlane.Domain.ModelUsages;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Infrastructure.Persistence;

public sealed class ControlPlaneDbContext(DbContextOptions<ControlPlaneDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<HookEvent> HookEvents => Set<HookEvent>();

    public DbSet<ModelUsage> ModelUsages => Set<ModelUsage>();

    public DbSet<AgentRun> AgentRuns => Set<AgentRun>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ControlPlaneDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }
}
