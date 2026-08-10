using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.ModelUsages;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Stats.GetStats;

/// <summary>Computes the observability baseline KPIs over a rolling window.</summary>
public sealed record GetStatsQuery(DateTime? Since) : IQuery<StatsResponse>;

public sealed record StatsResponse(
    StatsWindow Window,
    StatsTotals Totals,
    IReadOnlyList<AgentTokenStats> TokensByAgent,
    IReadOnlyList<ToolReliabilityStats> ToolReliability,
    ContextPressureStats ContextPressure,
    PermissionsStats Permissions,
    IReadOnlyList<SessionStats> Sessions);

public sealed record StatsWindow(DateTime Since, DateTime Until);

public sealed record StatsTotals(
    int Events,
    int Sessions,
    long BillableTokens,
    long CacheReadTokens,
    double CacheHitRatio);

/// <summary>KPI 1 — the real cost of delegation. <c>AgentType</c> null = main session, kept as-is (the front labels it).</summary>
public sealed record AgentTokenStats(string? AgentType, int Events, long BillableTokens, double Share);

/// <summary>KPI 2 — success must be earned.</summary>
public sealed record ToolReliabilityStats(
    string ToolName,
    int Calls,
    int Failures,
    double FailureRate,
    int? P50DurationMs,
    int? P95DurationMs);

/// <summary>KPI 3 — context saturation, PreCompact events ventilated by trigger (the <c>source</c> column).</summary>
public sealed record ContextPressureStats(int AutoCompactions, int ManualCompactions, int SessionsAffected);

/// <summary>
/// KPI 4 — friction of the loop. <c>PermissionRequest</c> and <c>PermissionDenied</c> are two
/// distinct lifecycle events, not two states of the same one — a request doesn't imply a
/// denial and a denial doesn't require a prior counted request — so they're counted
/// independently, with no rate derived from one against the other.
/// </summary>
public sealed record PermissionsStats(int Requested, int Denied);

/// <summary>KPI 5 — context occupancy and model, per live session.</summary>
public sealed record SessionStats(
    string SessionId,
    string? Project,
    string? Model,
    DateTime LastSeenAt,
    long ContextTokens,
    int Events,
    long BillableTokens);

/// <summary>
/// Tout ce qui compte des tokens ou nomme un modèle vient de <see cref="ModelUsage"/> (les
/// transcripts). Tout ce qui compte des événements de cycle de vie — outils, permissions,
/// compactions, sessions — vient de HookEvent. Les deux sources ne doivent jamais être
/// additionnées : un même travail y apparaît sous deux formes, et les mélanger produit un
/// double comptage.
/// </summary>
internal sealed class GetStatsQueryHandler(IApplicationDbContext context, IDateTimeProvider dateTimeProvider)
    : IQueryHandler<GetStatsQuery, StatsResponse>
{
    private static readonly TimeSpan DefaultWindow = TimeSpan.FromHours(24);

    public async Task<Result<StatsResponse>> Handle(GetStatsQuery query, CancellationToken cancellationToken)
    {
        DateTime until = dateTimeProvider.UtcNow;
        DateTime since = query.Since ?? until - DefaultWindow;

        // A localhost observability tool doesn't need per-KPI SQL aggregation: pulling the
        // window's rows (minus the heavy payload/cwd columns) into memory in one query keeps
        // every KPI computation — including the duration percentiles below — simple, exact,
        // and free of GroupBy-translation edge cases, at a dataset size that's always bounded
        // by the window.
        List<EventRow> rows = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.ReceivedAtUtc >= since)
            .Select(e => new EventRow(
                e.Id,
                e.ReceivedAtUtc,
                e.EventName,
                e.SessionId,
                e.Project,
                e.AgentType,
                e.ToolName,
                e.DurationMs,
                e.Source))
            .ToListAsync(cancellationToken);

        // No hook payload actually carries tokens_used in practice, despite the docs, so
        // tokensByAgent and the per-session context/model below are computed from
        // ModelUsage (read from transcript JSONL) rather than from the rows above. The
        // rest of the KPIs (toolReliability, contextPressure, permissions) stay on
        // HookEvent — hooks are the only source for those.
        List<UsageRow> usageRows = await context.ModelUsages
            .AsNoTracking()
            .Where(u => u.TimestampUtc >= since)
            .Select(u => new UsageRow(
                u.Id,
                u.SessionId,
                u.AgentId,
                u.AgentType,
                u.Model,
                u.InputTokens,
                u.OutputTokens,
                u.CacheCreationTokens,
                u.CacheReadTokens))
            .ToListAsync(cancellationToken);

        StatsTotals totals = BuildTotals(rows, usageRows);
        List<AgentTokenStats> tokensByAgent = BuildTokensByAgent(usageRows, totals.BillableTokens);
        List<ToolReliabilityStats> toolReliability = BuildToolReliability(rows);
        ContextPressureStats contextPressure = BuildContextPressure(rows);
        PermissionsStats permissions = BuildPermissions(rows);
        List<SessionStats> sessions = BuildSessions(rows, usageRows);

        var response = new StatsResponse(
            new StatsWindow(since, until),
            totals,
            tokensByAgent,
            toolReliability,
            contextPressure,
            permissions,
            sessions);

        return Result.Success(response);
    }

    /// <summary>
    /// Tokens (<c>BillableTokens</c>, <c>CacheReadTokens</c>, <c>CacheHitRatio</c>) come from
    /// <see cref="ModelUsage"/>, not <see cref="rows"/>: no hook payload actually carries
    /// tokens_used in practice (see the query above), so a HookEvent-sourced total was an
    /// artefact of hand-injected test fixtures rather than a real figure. <c>Events</c> and
    /// <c>Sessions</c> stay HookEvent-sourced — they're lifecycle-event counts, which is
    /// exactly what HookEvent is for.
    /// </summary>
    private static StatsTotals BuildTotals(List<EventRow> rows, List<UsageRow> usageRows)
    {
        long input = usageRows.Sum(u => (long)u.InputTokens);
        long output = usageRows.Sum(u => (long)u.OutputTokens);
        long cacheCreation = usageRows.Sum(u => (long)u.CacheCreationTokens);
        long cacheRead = usageRows.Sum(u => (long)u.CacheReadTokens);

        long billable = input + output + cacheCreation;

        // Cache-read tokens are excluded from billable and tracked separately — they aren't
        // priced the same as the rest, and folding them in would wash out the signal.
        long cacheDenominator = cacheRead + input + cacheCreation;
        double cacheHitRatio = cacheDenominator == 0 ? 0 : (double)cacheRead / cacheDenominator;

        int sessions = rows.Select(r => r.SessionId).Where(s => s != null).Distinct().Count();

        return new StatsTotals(rows.Count, sessions, billable, cacheRead, cacheHitRatio);
    }

    /// <summary>
    /// KPI 1, from <see cref="ModelUsage"/>: <c>Events</c> counts assistant messages (one
    /// per <see cref="UsageRow"/>), not hook events — there's no per-tool granularity at
    /// this level, only per-turn. <c>Share</c>'s denominator is <paramref name="totalBillable"/>,
    /// i.e. <see cref="StatsTotals.BillableTokens"/> as computed by <see cref="BuildTotals"/> —
    /// both are ModelUsage-sourced now, so they're the same figure and shouldn't be
    /// recomputed twice.
    /// </summary>
    private static List<AgentTokenStats> BuildTokensByAgent(List<UsageRow> usageRows, long totalBillable)
    {
        return usageRows
            .GroupBy(u => u.AgentType) // null key preserved: main session, never re-labeled here.
            .Select(g =>
            {
                long billable = g.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
                double share = totalBillable == 0 ? 0 : (double)billable / totalBillable;

                return new AgentTokenStats(g.Key, g.Count(), billable, share);
            })
            .OrderByDescending(a => a.BillableTokens)
            .ToList();
    }

    private static List<ToolReliabilityStats> BuildToolReliability(List<EventRow> rows)
    {
        return rows
            .Where(r => r.ToolName != null)
            .GroupBy(r => r.ToolName!)
            .Select(g =>
            {
                // calls = total attempts (PostToolUse + PostToolUseFailure), not just the
                // successful ones — otherwise a tool that only ever fails shows 0 calls and
                // an undefined (100%) failure rate, which reads as broken rather than "always
                // fails".
                int failures = g.Count(r => r.EventName == "PostToolUseFailure");
                int calls = g.Count(r => r.EventName is "PostToolUse" or "PostToolUseFailure");
                double failureRate = calls == 0 ? 0 : (double)failures / calls;

                // SQLite has no PERCENTILE_CONT/NTILE-friendly built-in. Since the durations
                // for a tool are already in memory (see the single window query above), we
                // sort them and take the nearest-rank index — an exact percentile over the
                // window's sample, not an approximation, without a per-tool round-trip.
                // Durations cover every attempt, failures included: a tool that fails slowly
                // is still a signal worth surfacing.
                List<int> durations = g
                    .Where(r => r.DurationMs.HasValue)
                    .Select(r => r.DurationMs!.Value)
                    .Order()
                    .ToList();

                return new ToolReliabilityStats(
                    g.Key,
                    calls,
                    failures,
                    failureRate,
                    Percentile(durations, 50),
                    Percentile(durations, 95));
            })
            .OrderByDescending(t => t.Calls)
            .ToList();
    }

    private static ContextPressureStats BuildContextPressure(List<EventRow> rows)
    {
        List<EventRow> preCompacts = rows.Where(r => r.EventName == "PreCompact").ToList();

        int auto = preCompacts.Count(r => string.Equals(r.Source, "auto", StringComparison.OrdinalIgnoreCase));
        int manual = preCompacts.Count(r => string.Equals(r.Source, "manual", StringComparison.OrdinalIgnoreCase));
        int sessionsAffected = preCompacts.Select(r => r.SessionId).Where(s => s != null).Distinct().Count();

        return new ContextPressureStats(auto, manual, sessionsAffected);
    }

    private static PermissionsStats BuildPermissions(List<EventRow> rows)
    {
        // Straight off event_name, not Error (which folds denial_reason/permission_reason
        // together with unrelated error sources and would over-count denials).
        int requested = rows.Count(r => r.EventName == "PermissionRequest");
        int denied = rows.Count(r => r.EventName == "PermissionDenied");

        return new PermissionsStats(requested, denied);
    }

    private static List<SessionStats> BuildSessions(List<EventRow> rows, List<UsageRow> usageRows)
    {
        List<SessionAggregate> aggregates = rows
            .Where(r => r.SessionId != null)
            .GroupBy(r => r.SessionId!)
            .Select(g => new SessionAggregate(
                g.Key,
                g.Select(r => r.Project).FirstOrDefault(p => p != null),
                g.Max(r => r.ReceivedAtUtc),
                g.Count()))
            .ToList();

        Dictionary<string, (long ContextTokens, string? Model)> contextAndModelBySession = BuildContextAndModelBySession(usageRows);
        Dictionary<string, long> billableTokensBySession = BuildBillableTokensBySession(usageRows);

        return aggregates
            .Select(a =>
            {
                (long contextTokens, string? model) = contextAndModelBySession.GetValueOrDefault(a.SessionId, (0, null));
                long billableTokens = billableTokensBySession.GetValueOrDefault(a.SessionId, 0);

                return new SessionStats(a.SessionId, a.Project, model, a.LastSeenAt, contextTokens, a.Events, billableTokens);
            })
            .OrderByDescending(s => s.LastSeenAt)
            .ToList();
    }

    /// <summary>
    /// Billable tokens per session, from <see cref="ModelUsage"/> — same reasoning as
    /// <see cref="BuildTotals"/>. Unlike <see cref="BuildContextAndModelBySession"/> (which
    /// deliberately excludes subagent usage because it lives in an isolated context window),
    /// this sums every usage row for the session, main and delegated alike: it's a cost
    /// figure, and delegation is still cost incurred by the session.
    /// </summary>
    private static Dictionary<string, long> BuildBillableTokensBySession(List<UsageRow> usageRows)
    {
        return usageRows
            .GroupBy(u => u.SessionId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens));
    }

    /// <summary>
    /// Context occupancy and model, from <see cref="ModelUsage"/> instead of HookEvent:
    /// no hook payload carries <c>tokens_used</c> in practice. Only the main session's own
    /// usages (<c>AgentId is null</c>) are considered — a subagent runs its own isolated
    /// context window, so folding its usage in here would misrepresent the main session's
    /// occupancy. Context occupancy = input + cache_read + cache_creation of the *last*
    /// usage: the input tokens of a call *are* the context sent to the model, so this is
    /// exact and free. Model is read off that same last usage.
    /// </summary>
    private static Dictionary<string, (long ContextTokens, string? Model)> BuildContextAndModelBySession(List<UsageRow> usageRows)
    {
        var result = new Dictionary<string, (long ContextTokens, string? Model)>();

        foreach (IGrouping<string, UsageRow> group in usageRows.Where(u => u.AgentId is null).GroupBy(u => u.SessionId))
        {
            UsageRow last = group.OrderByDescending(u => u.Id).First();
            long contextTokens = (long)last.InputTokens + last.CacheReadTokens + last.CacheCreationTokens;

            result[group.Key] = (contextTokens, last.Model);
        }

        return result;
    }

    /// <summary>Nearest-rank percentile over an already-sorted sample. Null when there's no data.</summary>
    private static int? Percentile(List<int> sortedValues, double percentile)
    {
        if (sortedValues.Count == 0)
        {
            return null;
        }

        int rank = (int)Math.Ceiling(percentile / 100.0 * sortedValues.Count);
        int index = Math.Clamp(rank - 1, 0, sortedValues.Count - 1);

        return sortedValues[index];
    }

    private sealed record EventRow(
        long Id,
        DateTime ReceivedAtUtc,
        string? EventName,
        string? SessionId,
        string? Project,
        string? AgentType,
        string? ToolName,
        int? DurationMs,
        string? Source);

    private sealed record SessionAggregate(
        string SessionId,
        string? Project,
        DateTime LastSeenAt,
        int Events);

    private sealed record UsageRow(
        long Id,
        string SessionId,
        string? AgentId,
        string? AgentType,
        string? Model,
        int InputTokens,
        int OutputTokens,
        int CacheCreationTokens,
        int CacheReadTokens);
}
