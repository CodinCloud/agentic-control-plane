using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Timeline.GetTimeline;

/// <summary>
/// One lane per agent, plus the main-session reference banner, over a rolling window.
/// <c>SessionId</c> is an optional filter, not a requirement — this is a local mono-user
/// tool, and the frozen frontend contract calls this endpoint without it. When absent, the
/// handler falls back to the most recently active session of the window.
/// </summary>
public sealed record GetTimelineQuery(string? SessionId, DateTime? Since) : IQuery<TimelineResponse>;

/// <summary><c>MainSession</c> and <c>Lanes</c> are null/empty together, only when the window has
/// no session at all — an empty database is a valid state, not a validation error.</summary>
public sealed record TimelineResponse(TimelineWindow Window, MainSessionSummary? MainSession, IReadOnlyList<AgentLane> Lanes);

/// <summary><c>LastTurnStartedAt</c> is the retained session's most recent
/// <c>UserPromptSubmit</c> — the exact start of the last turn, null if none fired in the
/// window. Read from <c>HookEvent</c>, a lifecycle event, per the ModelUsage/HookEvent split
/// documented on <see cref="GetTimelineQueryHandler"/>.</summary>
public sealed record TimelineWindow(DateTime Since, DateTime Until, DateTime? LastTurnStartedAt);

/// <summary>The reference banner — the whole session, not a lane among others.</summary>
public sealed record MainSessionSummary(
    string SessionId,
    string? Model,
    DateTime StartedAt,
    DateTime? EndedAt,
    int Messages,
    long BillableTokens);

/// <summary>One agent's bar. <c>EndedAt</c> null = still in progress, see <see cref="GetTimelineQueryHandler"/>.</summary>
public sealed record AgentLane(
    string AgentId,
    string? AgentType,
    string? TaskDescription,
    DateTime StartedAt,
    DateTime? EndedAt,
    long DurationMs,
    int Messages,
    long BillableTokens,
    long CacheReadTokens,
    string? Model,
    int? SpawnDepth);

/// <summary>
/// Tout ce qui compte des tokens ou nomme un modèle vient de <c>ModelUsage</c> — jamais de
/// HookEvent, voir GetStatsQueryHandler. La seule chose lue depuis HookEvent ici est la
/// clôture (<c>SubagentStop</c>/<c>Stop</c>) qui décide si une barre est encore ouverte ;
/// aucun total n'en dérive.
/// </summary>
internal sealed class GetTimelineQueryHandler(IApplicationDbContext context, IDateTimeProvider dateTimeProvider)
    : IQueryHandler<GetTimelineQuery, TimelineResponse>
{
    private static readonly TimeSpan DefaultWindow = TimeSpan.FromHours(24);

    // "Un agent est en cours si son dernier message date de moins de 2 minutes et qu'aucun
    // SubagentStop ne le clôt" — contrat figé, plans/002-timeline-agents.md.
    private static readonly TimeSpan InProgressThreshold = TimeSpan.FromMinutes(2);

    public async Task<Result<TimelineResponse>> Handle(GetTimelineQuery query, CancellationToken cancellationToken)
    {
        DateTime until = dateTimeProvider.UtcNow;
        DateTime since = query.Since ?? until - DefaultWindow;

        string? sessionId = string.IsNullOrWhiteSpace(query.SessionId)
            ? await ResolveMostRecentlyActiveSessionId(since, cancellationToken)
            : query.SessionId;

        if (sessionId is null)
        {
            // No session at all in the window — an empty, well-formed response (not a
            // validation error): a fresh database is a valid state for a local tool.
            return Result.Success(new TimelineResponse(new TimelineWindow(since, until, null), null, []));
        }

        List<UsageRow> usageRows = await context.ModelUsages
            .AsNoTracking()
            .Where(u => u.SessionId == sessionId && u.TimestampUtc >= since)
            .Select(u => new UsageRow(
                u.Id,
                u.AgentId,
                u.AgentType,
                u.Model,
                u.TimestampUtc,
                u.InputTokens,
                u.OutputTokens,
                u.CacheCreationTokens,
                u.CacheReadTokens))
            .ToListAsync(cancellationToken);

        string[] agentIds = usageRows.Where(u => u.AgentId != null).Select(u => u.AgentId!).Distinct().ToArray();

        Dictionary<string, AgentRunLabel> runsByAgentId = await context.AgentRuns
            .AsNoTracking()
            .Where(r => agentIds.Contains(r.AgentId))
            .Select(r => new AgentRunLabel(r.AgentId, r.TaskDescription, r.SpawnDepth))
            .ToDictionaryAsync(r => r.AgentId, cancellationToken);

        HashSet<string> closedAgentIds = (await context.HookEvents
                .AsNoTracking()
                .Where(e => e.EventName == "SubagentStop" && e.AgentId != null && agentIds.Contains(e.AgentId))
                .Select(e => e.AgentId!)
                .Distinct()
                .ToListAsync(cancellationToken))
            .ToHashSet();

        bool mainSessionClosed = await context.HookEvents
            .AsNoTracking()
            .AnyAsync(e => e.SessionId == sessionId && e.EventName == "Stop", cancellationToken);

        DateTime? lastTurnStartedAt = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.SessionId == sessionId && e.EventName == "UserPromptSubmit")
            .OrderByDescending(e => e.ReceivedAtUtc)
            .Select(e => (DateTime?)e.ReceivedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        MainSessionSummary mainSession = BuildMainSession(sessionId, usageRows, until, mainSessionClosed);

        List<AgentLane> lanes = BuildLanes(usageRows, runsByAgentId, closedAgentIds, until)
            .OrderBy(lane => lane.StartedAt)
            .ToList();

        return Result.Success(new TimelineResponse(new TimelineWindow(since, until, lastTurnStartedAt), mainSession, lanes));
    }

    /// <summary>The session whose last <see cref="ModelUsage"/> in the window is the most
    /// recent — the useful default for a local mono-user tool when the caller doesn't pin a
    /// session: opening the page should show something, not a validation error.</summary>
    private async Task<string?> ResolveMostRecentlyActiveSessionId(DateTime since, CancellationToken cancellationToken)
    {
        return await context.ModelUsages
            .AsNoTracking()
            .Where(u => u.TimestampUtc >= since)
            .OrderByDescending(u => u.TimestampUtc)
            .Select(u => u.SessionId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static MainSessionSummary BuildMainSession(string sessionId, List<UsageRow> usageRows, DateTime now, bool closed)
    {
        List<UsageRow> own = usageRows.Where(u => u.AgentId is null).ToList();

        if (own.Count == 0)
        {
            return new MainSessionSummary(sessionId, null, now, now, 0, 0);
        }

        DateTime startedAt = own.Min(u => u.TimestampUtc);
        DateTime lastMessageAt = own.Max(u => u.TimestampUtc);
        DateTime? endedAt = ResolveEndedAt(lastMessageAt, now, closed);
        long billable = own.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
        string? model = own.OrderByDescending(u => u.Id).First().Model;

        return new MainSessionSummary(sessionId, model, startedAt, endedAt, own.Count, billable);
    }

    private static List<AgentLane> BuildLanes(
        List<UsageRow> usageRows,
        Dictionary<string, AgentRunLabel> runsByAgentId,
        HashSet<string> closedAgentIds,
        DateTime now)
    {
        return usageRows
            .Where(u => u.AgentId is not null)
            .GroupBy(u => u.AgentId!)
            .Select(group =>
            {
                DateTime startedAt = group.Min(u => u.TimestampUtc);
                DateTime lastMessageAt = group.Max(u => u.TimestampUtc);
                bool closed = closedAgentIds.Contains(group.Key);
                DateTime? endedAt = ResolveEndedAt(lastMessageAt, now, closed);
                long durationMs = (long)((endedAt ?? now) - startedAt).TotalMilliseconds;
                long billable = group.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
                long cacheRead = group.Sum(u => (long)u.CacheReadTokens);
                UsageRow last = group.OrderByDescending(u => u.Id).First();
                AgentRunLabel? label = runsByAgentId.GetValueOrDefault(group.Key);

                return new AgentLane(
                    group.Key,
                    last.AgentType,
                    label?.TaskDescription,
                    startedAt,
                    endedAt,
                    durationMs,
                    group.Count(),
                    billable,
                    cacheRead,
                    last.Model,
                    label?.SpawnDepth);
            })
            .ToList();
    }

    /// <summary>Same rule for the main session (closed by <c>Stop</c>) and for an agent lane
    /// (closed by <c>SubagentStop</c>): still open when the last message is recent and no
    /// closing hook fired for it.</summary>
    private static DateTime? ResolveEndedAt(DateTime lastMessageAt, DateTime now, bool closed)
    {
        bool inProgress = !closed && now - lastMessageAt < InProgressThreshold;
        return inProgress ? null : lastMessageAt;
    }

    private sealed record UsageRow(
        long Id,
        string? AgentId,
        string? AgentType,
        string? Model,
        DateTime TimestampUtc,
        int InputTokens,
        int OutputTokens,
        int CacheCreationTokens,
        int CacheReadTokens);

    private sealed record AgentRunLabel(string AgentId, string? TaskDescription, int? SpawnDepth);
}
