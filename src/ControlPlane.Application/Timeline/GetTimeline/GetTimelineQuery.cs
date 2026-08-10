using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Timeline.GetTimeline;

/// <summary>
/// One banner per session over a rolling window, each carrying its own agent lanes.
/// <c>SessionId</c> is an optional filter: absent, every session active in the window is
/// returned; provided, only that one. There is no "most recently active session" election —
/// a compaction or a <c>/clear</c> spawns a new session while the previous one is still on
/// screen with agents in flight, and a control plane that only shows one is blind to its own
/// scope.
/// </summary>
public sealed record GetTimelineQuery(string? SessionId, DateTime? Since) : IQuery<TimelineResponse>;

/// <summary>An empty <c>Sessions</c> list is a valid state (empty database), not a validation error.</summary>
public sealed record TimelineResponse(TimelineWindow Window, IReadOnlyList<SessionSummary> Sessions);

/// <summary><c>LastTurnStartedAt</c> is the window's most recent <c>UserPromptSubmit</c> across
/// every session in scope (all of them, or just the filtered one) — the exact start of the
/// last turn, null if none fired in the window. Read from <c>HookEvent</c>, a lifecycle event,
/// per the ModelUsage/HookEvent split documented on <see cref="GetTimelineQueryHandler"/>.
/// <c>Since</c>/<c>Until</c> are the same for every session: that shared axis is what makes two
/// parallel sessions comparable at a glance, so it is never narrowed per session.</summary>
public sealed record TimelineWindow(DateTime Since, DateTime Until, DateTime? LastTurnStartedAt);

/// <summary>
/// One session's banner, plus its own lanes. <c>IsActive</c> is purely the freshness of the
/// session's last <see cref="ControlPlane.Domain.ModelUsages.ModelUsage"/> (own or delegated):
/// hooks don't carry a reliable session-state signal, so no other one is invented. A session
/// with no agent at all still appears, with an empty <c>Lanes</c> — that absence is itself a
/// measurement (e.g. the fresh session a compaction just opened).
/// </summary>
public sealed record SessionSummary(
    string SessionId,
    string? Project,
    string? Model,
    DateTime StartedAt,
    DateTime? EndedAt,
    int Messages,
    long BillableTokens,
    bool IsActive,
    IReadOnlyList<AgentLane> Lanes);

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
/// HookEvent, voir GetStatsQueryHandler. <c>Project</c> vient de <c>HookEvent</c> (un événement
/// de cycle de vie) ; les deux sources ne sont jamais additionnées. La seule autre chose lue
/// depuis HookEvent ici est la clôture (<c>SubagentStop</c>/<c>Stop</c>) qui décide si une
/// barre est encore ouverte ; aucun total n'en dérive.
/// </summary>
internal sealed class GetTimelineQueryHandler(IApplicationDbContext context, IDateTimeProvider dateTimeProvider)
    : IQueryHandler<GetTimelineQuery, TimelineResponse>
{
    private static readonly TimeSpan DefaultWindow = TimeSpan.FromHours(24);

    // "Un agent est en cours si son dernier message date de moins de 2 minutes et qu'aucun
    // SubagentStop ne le clôt" — contrat figé, plans/002-timeline-agents.md.
    private static readonly TimeSpan InProgressThreshold = TimeSpan.FromMinutes(2);

    // "isActive = dernière activité < 5 min" — contrat figé, plans/003-multi-sessions.md.
    private static readonly TimeSpan ActiveThreshold = TimeSpan.FromMinutes(5);

    public async Task<Result<TimelineResponse>> Handle(GetTimelineQuery query, CancellationToken cancellationToken)
    {
        DateTime until = dateTimeProvider.UtcNow;
        DateTime since = query.Since ?? until - DefaultWindow;
        string? sessionFilter = string.IsNullOrWhiteSpace(query.SessionId) ? null : query.SessionId;

        // One bounded read per source for the whole window, whatever the number of sessions —
        // the same "pull the window into memory once" approach as GetStatsQueryHandler, to
        // avoid a per-session round-trip.
        List<EventRow> eventRows = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.SessionId != null && e.ReceivedAtUtc >= since && (sessionFilter == null || e.SessionId == sessionFilter))
            .Select(e => new EventRow(e.SessionId!, e.ReceivedAtUtc, e.EventName, e.Project, e.AgentId))
            .ToListAsync(cancellationToken);

        List<UsageRow> usageRows = await context.ModelUsages
            .AsNoTracking()
            .Where(u => u.TimestampUtc >= since && (sessionFilter == null || u.SessionId == sessionFilter))
            .Select(u => new UsageRow(
                u.Id,
                u.SessionId,
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

        HashSet<string> closedAgentIds = eventRows
            .Where(e => e.EventName == "SubagentStop" && e.AgentId != null)
            .Select(e => e.AgentId!)
            .ToHashSet();

        HashSet<string> stoppedSessionIds = eventRows
            .Where(e => e.EventName == "Stop")
            .Select(e => e.SessionId)
            .ToHashSet();

        DateTime? lastTurnStartedAt = eventRows
            .Where(e => e.EventName == "UserPromptSubmit")
            .Select(e => (DateTime?)e.ReceivedAtUtc)
            .OrderByDescending(t => t)
            .FirstOrDefault();

        ILookup<string, UsageRow> usageBySession = usageRows.ToLookup(u => u.SessionId);
        ILookup<string, EventRow> eventsBySession = eventRows.ToLookup(e => e.SessionId);

        Dictionary<string, string?> projectBySession = eventRows
            .Where(e => e.Project != null)
            .GroupBy(e => e.SessionId)
            .ToDictionary(g => g.Key, g => (string?)g.First().Project);

        HashSet<string> sessionIds = eventRows.Select(e => e.SessionId)
            .Concat(usageRows.Select(u => u.SessionId))
            .ToHashSet();

        List<SessionSummary> sessions = sessionIds
            .Select(sessionId => BuildSessionSummary(
                sessionId,
                projectBySession.GetValueOrDefault(sessionId),
                usageBySession[sessionId].ToList(),
                eventsBySession[sessionId].ToList(),
                runsByAgentId,
                closedAgentIds,
                stoppedSessionIds.Contains(sessionId),
                until))
            .OrderByDescending(s => s.LastActivityAt)
            .Select(s => s.Summary)
            .ToList();

        return Result.Success(new TimelineResponse(new TimelineWindow(since, until, lastTurnStartedAt), sessions));
    }

    private static (SessionSummary Summary, DateTime LastActivityAt) BuildSessionSummary(
        string sessionId,
        string? project,
        List<UsageRow> sessionUsage,
        List<EventRow> sessionEvents,
        Dictionary<string, AgentRunLabel> runsByAgentId,
        HashSet<string> closedAgentIds,
        bool sessionClosed,
        DateTime now)
    {
        List<UsageRow> own = sessionUsage.Where(u => u.AgentId is null).ToList();

        DateTime startedAt;
        DateTime? endedAt;
        int messages;
        long billable;
        string? model;
        DateTime? lastOwnUsageAt = own.Count == 0 ? null : own.Max(u => u.TimestampUtc);

        if (own.Count == 0)
        {
            // No own transcript usage yet (e.g. the fresh session a compaction just opened):
            // fall back to lifecycle events for started/ended, so the banner still shows
            // something rather than "now" for both bounds.
            startedAt = sessionEvents.Count == 0 ? now : sessionEvents.Min(e => e.ReceivedAtUtc);
            endedAt = sessionEvents.Count == 0 ? now : ResolveEndedAt(sessionEvents.Max(e => e.ReceivedAtUtc), now, sessionClosed);
            messages = 0;
            billable = 0;
            model = null;
        }
        else
        {
            startedAt = own.Min(u => u.TimestampUtc);
            endedAt = ResolveEndedAt(lastOwnUsageAt!.Value, now, sessionClosed);
            messages = own.Count;
            billable = own.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
            model = own.OrderByDescending(u => u.Id).First().Model;
        }

        // isActive is ModelUsage-freshness only, own or delegated — hooks don't provide a
        // reliable session-state signal, so this is the only thing that decides it.
        DateTime? lastUsageAt = sessionUsage.Count == 0 ? null : sessionUsage.Max(u => u.TimestampUtc);
        bool isActive = lastUsageAt is not null && now - lastUsageAt.Value < ActiveThreshold;

        // Sort key only: most recent activity across both sources, so a session that only has
        // lifecycle events (no usage yet) still sorts sensibly instead of falling to the bottom.
        DateTime lastActivityAt = new[] { lastUsageAt, sessionEvents.Count == 0 ? null : sessionEvents.Max(e => e.ReceivedAtUtc) }
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .DefaultIfEmpty(startedAt)
            .Max();

        List<AgentLane> lanes = BuildLanes(sessionUsage, runsByAgentId, closedAgentIds, now)
            .OrderBy(lane => lane.StartedAt)
            .ToList();

        var summary = new SessionSummary(sessionId, project, model, startedAt, endedAt, messages, billable, isActive, lanes);

        return (summary, lastActivityAt);
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

    /// <summary>Same rule for a session's own banner (closed by <c>Stop</c>) and for an agent
    /// lane (closed by <c>SubagentStop</c>): still open when the last message is recent and no
    /// closing hook fired for it.</summary>
    private static DateTime? ResolveEndedAt(DateTime lastMessageAt, DateTime now, bool closed)
    {
        bool inProgress = !closed && now - lastMessageAt < InProgressThreshold;
        return inProgress ? null : lastMessageAt;
    }

    private sealed record EventRow(string SessionId, DateTime ReceivedAtUtc, string? EventName, string? Project, string? AgentId);

    private sealed record UsageRow(
        long Id,
        string SessionId,
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
