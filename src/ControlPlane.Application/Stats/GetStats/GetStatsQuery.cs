using System.Text.Json;
using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
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
                e.InputTokens,
                e.OutputTokens,
                e.CacheCreationTokens,
                e.CacheReadTokens,
                e.Source))
            .ToListAsync(cancellationToken);

        StatsTotals totals = BuildTotals(rows);
        List<AgentTokenStats> tokensByAgent = BuildTokensByAgent(rows, totals.BillableTokens);
        List<ToolReliabilityStats> toolReliability = BuildToolReliability(rows);
        ContextPressureStats contextPressure = BuildContextPressure(rows);
        PermissionsStats permissions = BuildPermissions(rows);
        List<SessionStats> sessions = await BuildSessionsAsync(rows, cancellationToken);

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

    private static StatsTotals BuildTotals(List<EventRow> rows)
    {
        long input = rows.Sum(r => (long)(r.InputTokens ?? 0));
        long output = rows.Sum(r => (long)(r.OutputTokens ?? 0));
        long cacheCreation = rows.Sum(r => (long)(r.CacheCreationTokens ?? 0));
        long cacheRead = rows.Sum(r => (long)(r.CacheReadTokens ?? 0));

        long billable = input + output + cacheCreation;

        // Cache-read tokens are excluded from billable and tracked separately — they aren't
        // priced the same as the rest, and folding them in would wash out the signal.
        long cacheDenominator = cacheRead + input + cacheCreation;
        double cacheHitRatio = cacheDenominator == 0 ? 0 : (double)cacheRead / cacheDenominator;

        int sessions = rows.Select(r => r.SessionId).Where(s => s != null).Distinct().Count();

        return new StatsTotals(rows.Count, sessions, billable, cacheRead, cacheHitRatio);
    }

    private static List<AgentTokenStats> BuildTokensByAgent(List<EventRow> rows, long totalBillable)
    {
        return rows
            .GroupBy(r => r.AgentType) // null key preserved: main session, never re-labeled here.
            .Select(g =>
            {
                long billable = g.Sum(r => (long)(r.InputTokens ?? 0) + (r.OutputTokens ?? 0) + (r.CacheCreationTokens ?? 0));
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

    private async Task<List<SessionStats>> BuildSessionsAsync(List<EventRow> rows, CancellationToken cancellationToken)
    {
        List<SessionAggregate> aggregates = rows
            .Where(r => r.SessionId != null)
            .GroupBy(r => r.SessionId!)
            .Select(g =>
            {
                // Context occupancy = input + cache_read + cache_creation of the *last*
                // event carrying tokens_used (Stop, PostToolUse, SubagentStop) — the input
                // tokens of a call *are* the context sent to the model, so this is exact and
                // free. InputTokens != null is the marker of a tokens_used-bearing event.
                EventRow? contextRow = g
                    .Where(r => r.InputTokens != null)
                    .OrderByDescending(r => r.Id)
                    .FirstOrDefault();

                long contextTokens = contextRow is null
                    ? 0
                    : (contextRow.InputTokens ?? 0) + (contextRow.CacheReadTokens ?? 0) + (contextRow.CacheCreationTokens ?? 0);

                long billable = g.Sum(r => (long)(r.InputTokens ?? 0) + (r.OutputTokens ?? 0) + (r.CacheCreationTokens ?? 0));

                return new SessionAggregate(
                    g.Key,
                    g.Select(r => r.Project).FirstOrDefault(p => p != null),
                    g.Max(r => r.ReceivedAtUtc),
                    g.Count(),
                    billable,
                    contextTokens);
            })
            .ToList();

        Dictionary<string, string?> modelBySession = await LoadModelsBySessionAsync(
            aggregates.Select(a => a.SessionId).ToArray(),
            cancellationToken);

        return aggregates
            .Select(a => new SessionStats(
                a.SessionId,
                a.Project,
                modelBySession.GetValueOrDefault(a.SessionId),
                a.LastSeenAt,
                a.ContextTokens,
                a.Events,
                a.BillableTokens))
            .OrderByDescending(s => s.LastSeenAt)
            .ToList();
    }

    /// <summary>
    /// Model isn't a stored column: it's read from the raw payload of each session's
    /// SessionStart event and propagated by session_id join — computed at read time,
    /// never persisted, exactly like context occupancy above.
    /// </summary>
    private async Task<Dictionary<string, string?>> LoadModelsBySessionAsync(
        string[] sessionIds,
        CancellationToken cancellationToken)
    {
        if (sessionIds.Length == 0)
        {
            return new Dictionary<string, string?>();
        }

        var sessionStarts = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.EventName == "SessionStart" && e.SessionId != null && sessionIds.Contains(e.SessionId))
            .Select(e => new { e.SessionId, e.Id, e.Payload })
            .ToListAsync(cancellationToken);

        return sessionStarts
            .GroupBy(r => r.SessionId!)
            .ToDictionary(g => g.Key, g => ExtractModel(g.OrderByDescending(r => r.Id).First().Payload));
    }

    private static string? ExtractModel(string payload)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(payload);

            return document.RootElement.TryGetProperty("model", out JsonElement model) &&
                   model.ValueKind == JsonValueKind.String
                ? model.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
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
        int? InputTokens,
        int? OutputTokens,
        int? CacheCreationTokens,
        int? CacheReadTokens,
        string? Source);

    private sealed record SessionAggregate(
        string SessionId,
        string? Project,
        DateTime LastSeenAt,
        int Events,
        long BillableTokens,
        long ContextTokens);
}
