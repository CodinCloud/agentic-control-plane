using ControlPlane.Domain.HookEvents;
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

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
