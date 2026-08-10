using ControlPlane.Domain.AgentRuns;
using ControlPlane.Domain.HookEvents;
using ControlPlane.Domain.ModelUsages;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Abstractions.Data;

/// <summary>
/// Persistence-ignorant abstraction over the database. Application references EF Core
/// (see ControlPlane.Application.csproj), so this exposes <see cref="DbSet{TEntity}"/>
/// directly — handlers write <c>context.HookEvents.Add(...)</c> /
/// <c>context.HookEvents.Where(...)</c> like any EF-aware Application layer; the concrete
/// <see cref="DbContext"/> lives in Infrastructure.
/// </summary>
public interface IApplicationDbContext
{
    DbSet<HookEvent> HookEvents { get; }

    /// <summary>Token usage read from transcript JSONL files — a separate source from
    /// <see cref="HookEvents"/>, see <see cref="ModelUsage"/>.</summary>
    DbSet<ModelUsage> ModelUsages { get; }

    /// <summary>One row per subagent spawn — brief, report, task description, spawn depth.
    /// See <see cref="AgentRun"/>.</summary>
    DbSet<AgentRun> AgentRuns { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
