using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Events.GetFilterOptions;

/// <summary>Distinct values available to filter the event list/timeline by.</summary>
public sealed record GetFilterOptionsQuery : IQuery<FilterOptionsResponse>;

public sealed record FilterOptionsResponse(
    IReadOnlyList<string> Projects,
    IReadOnlyList<SessionOption> Sessions,
    IReadOnlyList<string> EventNames,
    IReadOnlyList<string> AgentTypes,
    IReadOnlyList<string> ToolNames);

public sealed record SessionOption(string Id, string? Project, DateTime StartedAt, int EventCount);

internal sealed class GetFilterOptionsQueryHandler(IApplicationDbContext context)
    : IQueryHandler<GetFilterOptionsQuery, FilterOptionsResponse>
{
    public async Task<Result<FilterOptionsResponse>> Handle(GetFilterOptionsQuery query, CancellationToken cancellationToken)
    {
        List<string> projects = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.Project != null)
            .Select(e => e.Project!)
            .Distinct()
            .OrderBy(p => p)
            .ToListAsync(cancellationToken);

        List<string> eventNames = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.EventName != null)
            .Select(e => e.EventName!)
            .Distinct()
            .OrderBy(n => n)
            .ToListAsync(cancellationToken);

        List<string> agentTypes = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.AgentType != null)
            .Select(e => e.AgentType!)
            .Distinct()
            .OrderBy(a => a)
            .ToListAsync(cancellationToken);

        List<string> toolNames = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.ToolName != null)
            .Select(e => e.ToolName!)
            .Distinct()
            .OrderBy(t => t)
            .ToListAsync(cancellationToken);

        // GroupBy(SessionId).Select(... Max(Project) ...) doesn't translate on SQLite — Max
        // over a string column isn't supported by the provider. A plain projection of the
        // three columns needed is SQL-translatable; the grouping itself happens in memory,
        // same approach as GetStatsQuery.
        List<SessionRow> sessionRows = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.SessionId != null)
            .Select(e => new SessionRow(e.SessionId!, e.Project, e.ReceivedAtUtc))
            .ToListAsync(cancellationToken);

        List<SessionOption> sessions = sessionRows
            .GroupBy(r => r.SessionId)
            .Select(g => new SessionOption(
                g.Key,
                g.Select(r => r.Project).FirstOrDefault(p => p != null),
                g.Min(r => r.ReceivedAtUtc),
                g.Count()))
            .OrderByDescending(s => s.StartedAt)
            .ToList();

        return Result.Success(new FilterOptionsResponse(projects, sessions, eventNames, agentTypes, toolNames));
    }

    private sealed record SessionRow(string SessionId, string? Project, DateTime ReceivedAtUtc);
}
