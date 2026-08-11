using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Abstractions.Pricing;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.Pricing;
using ControlPlane.Domain.Timeline;
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

/// <summary>
/// <c>Since</c>/<c>Until</c> are the requested window, same for every session — that shared
/// axis is what makes two parallel sessions comparable at a glance, so it is never narrowed
/// per session. <c>ContentSince</c>/<c>ContentUntil</c> are the <b>real</b> bounds of what was
/// found in that window (plans/006-gantt-vivant.md décision #7) — the client no longer has to
/// fit its own axis to the content, the server already knows it while it bucketizes.
/// <c>Grid</c> is shared by every lane of every session in this response: a bucket must mean
/// the same clock duration everywhere for two densities to be comparable.
/// </summary>
public sealed record TimelineWindow(
    DateTime Since,
    DateTime Until,
    DateTime ContentSince,
    DateTime ContentUntil,
    Grid Grid,
    DateTime? LastTurnStartedAt);

/// <summary>
/// One session's banner, plus its own lanes — the first of which is always the main session
/// itself (décision #4/#5). <c>IsActive</c> is purely the freshness of the session's last
/// <see cref="ControlPlane.Domain.HookEvents.HookEvent"/> (own or delegated) — hooks arrive
/// continuously, <c>ModelUsage</c> only per turn, so vivacity can never be built on the latter
/// (décision #1). A session with no agent at all still appears... except it can't: a session
/// always has at least one, itself (décision #4), so the old "Aucun agent" case is now
/// unrepresentable by construction.
/// </summary>
/// <param name="BillableTokens">Tokens de la session <b>elle-même</b> (hors sous-agents) —
/// inchangé.</param>
/// <param name="CostUsd">Coût équivalent API de la session, sous-agents <b>compris</b>. La
/// portée diffère volontairement de <paramref name="BillableTokens"/> : le bandeau surplombe
/// les lanes de ses propres agents, et un coût qui les exclurait donnerait à croire qu'une
/// session ayant délégué tout son travail n'a rien coûté. Déléguer reste une dépense engagée
/// par la session. Null si aucune ligne n'est tarifable.</param>
public sealed record SessionSummary(
    string SessionId,
    string? Project,
    string? Model,
    DateTime StartedAt,
    DateTime? EndedAt,
    int Messages,
    long BillableTokens,
    decimal? CostUsd,
    bool IsActive,
    IReadOnlyList<AgentLane> Lanes);

/// <summary>One agent's bar. <c>EndedAt</c> null = still in progress, see <see cref="GetTimelineQueryHandler"/>.
/// <para><c>IsMainSession</c> is redundant with <c>AgentId == "main"</c> on purpose (décision #4) :
/// a client shouldn't have to know the sentinel to know what it's rendering.</para>
/// <para><c>EventCount</c> is every hook event this lane produced (⚡) ; <c>ToolCallCount</c>
/// only <c>PostToolUse</c>/<c>PostToolUseFailure</c> among them (🔧, décision #8) — counting
/// <c>UserPromptSubmit</c>/<c>Notification</c> in the latter would dilute the signal the
/// texture is trying to show. <c>Density</c> buckets that same tool-call-only stream against
/// the response-wide <see cref="TimelineWindow.Grid"/>.</para>
/// <para><c>CostUsd</c> est le coût équivalent API de ce seul run — c'est lui qui permet à
/// l'écran d'analyse de ventiler le coût par agent sans requête supplémentaire.</para></summary>
public sealed record AgentLane(
    string AgentId,
    string? AgentType,
    bool IsMainSession,
    string? TaskDescription,
    DateTime StartedAt,
    DateTime? EndedAt,
    long DurationMs,
    int Messages,
    long BillableTokens,
    long CacheReadTokens,
    decimal? CostUsd,
    string? Model,
    int? SpawnDepth,
    int EventCount,
    int ToolCallCount,
    long? AvgGapMs,
    LaneDensity Density);

/// <summary>
/// Tout ce qui compte des tokens ou nomme un modèle vient de <c>ModelUsage</c> — jamais de
/// HookEvent, voir GetStatsQueryHandler. <c>Project</c> vient de <c>HookEvent</c> (un événement
/// de cycle de vie) ; les deux sources ne sont jamais additionnées.
///
/// <para><b>Le « quand » vient des événements, le « combien » de l'usage</b> — bornes, durée
/// et vivacité de chaque lane et de chaque session dérivent désormais de
/// <c>HookEvent.ReceivedAtUtc</c>, en union avec <c>ModelUsage.TimestampUtc</c> quand il existe
/// (plans/006-gantt-vivant.md décisions #1 et #3, portées par <see cref="LaneAssembly"/>).
/// Une session n'est close que par <c>SessionEnd</c> — <c>Stop</c> ferme un tour, pas une
/// session (décision #2). Les lanes de sous-agent restent closes par <c>SubagentStop</c>,
/// inchangé.</para>
/// </summary>
internal sealed class GetTimelineQueryHandler(
    IApplicationDbContext context,
    IDateTimeProvider dateTimeProvider,
    IModelPricingProvider pricingProvider)
    : IQueryHandler<GetTimelineQuery, TimelineResponse>
{
    private static readonly TimeSpan DefaultWindow = TimeSpan.FromHours(24);

    // "Un agent est en cours si son dernier message date de moins de 2 minutes et qu'aucun
    // SubagentStop ne le clôt" — contrat figé, plans/002-timeline-agents.md.
    private static readonly TimeSpan InProgressThreshold = TimeSpan.FromMinutes(2);

    // "isActive = dernière activité < 5 min" — contrat figé, plans/003-multi-sessions.md.
    // Depuis la spec 006, cette activité se lit sur les événements, pas sur ModelUsage.
    private static readonly TimeSpan ActiveThreshold = TimeSpan.FromMinutes(5);

    public async Task<Result<TimelineResponse>> Handle(GetTimelineQuery query, CancellationToken cancellationToken)
    {
        DateTime now = dateTimeProvider.UtcNow;
        DateTime since = query.Since ?? now - DefaultWindow;
        string? sessionFilter = string.IsNullOrWhiteSpace(query.SessionId) ? null : query.SessionId;

        // One bounded read per source for the whole window, whatever the number of sessions —
        // the same "pull the window into memory once" approach as GetStatsQueryHandler, to
        // avoid a per-session round-trip.
        List<EventRow> eventRows = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.SessionId != null && e.ReceivedAtUtc >= since && (sessionFilter == null || e.SessionId == sessionFilter))
            .Select(e => new EventRow(e.SessionId!, e.ReceivedAtUtc, e.EventName, e.Project, e.AgentId, e.AgentType))
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
                u.CacheCreation5mTokens,
                u.CacheCreation1hTokens,
                u.CacheReadTokens))
            .ToListAsync(cancellationToken);

        string[] agentIds = usageRows.Where(u => u.AgentId != null).Select(u => u.AgentId!).Distinct().ToArray();

        Dictionary<string, AgentRunLabel> runsByAgentId = await context.AgentRuns
            .AsNoTracking()
            .Where(r => agentIds.Contains(r.AgentId))
            .Select(r => new AgentRunLabel(r.AgentId, r.TaskDescription, r.SpawnDepth))
            .ToDictionaryAsync(r => r.AgentId, cancellationToken);

        // SubagentStop is unchanged — décision #2 only moves the *session*'s closing signal
        // from Stop to SessionEnd, a subagent lane still closes exactly as before.
        HashSet<string> closedAgentIds = eventRows
            .Where(e => e.EventName == LaneAssembly.SubagentStopEventName && e.AgentId != null)
            .Select(e => e.AgentId!)
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

        PricingTable pricing = pricingProvider.Current;

        // The grid is computed once, on the union of every timestamp in scope — never per
        // session or per lane, or two densities in the same response wouldn't be comparable
        // (décision #7, DoD critère 6).
        (DateTime contentSince, DateTime contentUntil) = ResolveContentWindow(eventRows, usageRows, since);
        Grid grid = DensityGrid.BuildGrid(contentSince, contentUntil);

        List<SessionSummary> sessions = sessionIds
            .Select(sessionId => BuildSessionSummary(
                sessionId,
                projectBySession.GetValueOrDefault(sessionId),
                usageBySession[sessionId].ToList(),
                eventsBySession[sessionId].ToList(),
                runsByAgentId,
                closedAgentIds,
                now,
                pricing,
                contentSince,
                grid))
            .OrderByDescending(s => s.LastActivityAt)
            .Select(s => s.Summary)
            .ToList();

        var window = new TimelineWindow(since, now, contentSince, contentUntil, grid, lastTurnStartedAt);

        return Result.Success(new TimelineResponse(window, sessions));
    }

    /// <summary>Union of every event/usage timestamp actually loaded for this query — the real
    /// bounds of the content, not the requested window (décision #7). Falls back to
    /// <c>since</c> both ways when nothing was found at all, then <see cref="DensityGrid.FloorWindow"/>
    /// guards against a degenerate span either way.</summary>
    private static (DateTime ContentSince, DateTime ContentUntil) ResolveContentWindow(
        List<EventRow> eventRows,
        List<UsageRow> usageRows,
        DateTime since)
    {
        DateTime? firstEvent = eventRows.Count == 0 ? null : eventRows.Min(e => e.ReceivedAtUtc);
        DateTime? lastEvent = eventRows.Count == 0 ? null : eventRows.Max(e => e.ReceivedAtUtc);
        DateTime? firstUsage = usageRows.Count == 0 ? null : usageRows.Min(u => u.TimestampUtc);
        DateTime? lastUsage = usageRows.Count == 0 ? null : usageRows.Max(u => u.TimestampUtc);

        // ResolveBounds' fallback only fires when literally nothing was found at all (e.g. an
        // empty database) — falling back to "since" both ways, then FloorWindow below widens
        // that into a non-degenerate window.
        (DateTime rawSince, DateTime rawUntil) = LaneAssembly.ResolveBounds(firstEvent, lastEvent, firstUsage, lastUsage, since);

        return DensityGrid.FloorWindow(rawSince, rawUntil);
    }

    private static (SessionSummary Summary, DateTime LastActivityAt) BuildSessionSummary(
        string sessionId,
        string? project,
        List<UsageRow> sessionUsage,
        List<EventRow> sessionEvents,
        Dictionary<string, AgentRunLabel> runsByAgentId,
        HashSet<string> closedAgentIds,
        DateTime now,
        PricingTable pricing,
        DateTime contentSince,
        Grid grid)
    {
        List<UsageRow> ownUsage = sessionUsage.Where(u => u.AgentId is null).ToList();
        List<EventRow> ownEvents = sessionEvents.Where(e => e.AgentId is null).ToList();

        DateTime? firstOwnEvent = ownEvents.Count == 0 ? null : ownEvents.Min(e => e.ReceivedAtUtc);
        DateTime? lastOwnEvent = ownEvents.Count == 0 ? null : ownEvents.Max(e => e.ReceivedAtUtc);
        DateTime? firstOwnUsage = ownUsage.Count == 0 ? null : ownUsage.Min(u => u.TimestampUtc);
        DateTime? lastOwnUsage = ownUsage.Count == 0 ? null : ownUsage.Max(u => u.TimestampUtc);

        // Union of the two sources (décision #3) — neither alone can starve the main lane
        // (and hence the session banner, décision #4) of its true extent.
        (DateTime startedAt, DateTime lastOwnActivityAt) =
            LaneAssembly.ResolveBounds(firstOwnEvent, lastOwnEvent, firstOwnUsage, lastOwnUsage, now);

        // SessionEnd, not Stop — fait #2 / décision #2. Checked across every event in the
        // session (subagents included): SessionEnd itself never carries an agent id.
        bool sessionClosed = LaneAssembly.HasClosingEvent(sessionEvents.Select(e => e.EventName), LaneAssembly.SessionEndEventName);
        DateTime? endedAt = LaneAssembly.ResolveEndedAt(lastOwnActivityAt, now, sessionClosed, InProgressThreshold);

        int messages = ownUsage.Count;
        long billable = ownUsage.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
        string? model = ownUsage.Count == 0 ? null : ownUsage.OrderByDescending(u => u.Id).First().Model;

        // Vivacity is event-freshness only, across every agent in the session (own or
        // delegated) — décision #1. A subagent still hammering tools keeps the session alive
        // even if the main agent's own last event is older.
        DateTime? lastAnyEventAt = sessionEvents.Count == 0 ? null : sessionEvents.Max(e => e.ReceivedAtUtc);
        bool isActive = LaneAssembly.IsActive(lastAnyEventAt, now, ActiveThreshold);

        // Sort key only: most recent activity across every source and every agent, so a
        // session that only has lifecycle events (no usage yet) still sorts sensibly instead
        // of falling to the bottom.
        DateTime? lastAnyUsageAt = sessionUsage.Count == 0 ? null : sessionUsage.Max(u => u.TimestampUtc);
        DateTime lastActivityAt = LaneAssembly.ResolveBounds(null, lastAnyEventAt, null, lastAnyUsageAt, startedAt).End;

        AgentLane mainLane = BuildMainLane(startedAt, endedAt, ownEvents, ownUsage, billable, messages, model, now, pricing, contentSince, grid);
        List<AgentLane> subagentLanes = BuildSubagentLanes(
            sessionEvents, sessionUsage, runsByAgentId, closedAgentIds, now, pricing, contentSince, grid);

        IReadOnlyList<AgentLane> lanes = LaneAssembly.OrderLanes(
            subagentLanes.Append(mainLane),
            lane => lane.AgentId,
            lane => lane.StartedAt);

        // Sur toute la session, sous-agents compris — voir la doc de SessionSummary.CostUsd.
        decimal? cost = SumCost(sessionUsage, pricing);

        var summary = new SessionSummary(sessionId, project, model, startedAt, endedAt, messages, billable, cost, isActive, lanes);

        return (summary, lastActivityAt);
    }

    /// <summary>The main session, as its own lane 0 (décision #4). Its scope is exactly
    /// <c>AgentId is null</c> — the session's own events and usage, never a subagent's —
    /// which is also exactly what feeds <see cref="SessionSummary.BillableTokens"/>: the lane
    /// and the banner describe the same facet by construction.</summary>
    private static AgentLane BuildMainLane(
        DateTime startedAt,
        DateTime? endedAt,
        List<EventRow> ownEvents,
        List<UsageRow> ownUsage,
        long billable,
        int messages,
        string? model,
        DateTime now,
        PricingTable pricing,
        DateTime contentSince,
        Grid grid)
    {
        long cacheRead = ownUsage.Sum(u => (long)u.CacheReadTokens);
        long durationMs = (long)((endedAt ?? now) - startedAt).TotalMilliseconds;

        List<DateTime> toolCallTimestamps = ownEvents
            .Where(e => LaneAssembly.IsToolCallEvent(e.EventName))
            .Select(e => e.ReceivedAtUtc)
            .ToList();

        LaneDensity density = DensityGrid.BuildLaneDensity(startedAt, endedAt ?? now, contentSince, grid.BucketMs, toolCallTimestamps);

        return new AgentLane(
            LaneAssembly.MainAgentId,
            null,
            true,
            null, // Pas de brief : AgentRun n'existe que pour les sous-agents (décision #12).
            startedAt,
            endedAt,
            durationMs,
            messages,
            billable,
            cacheRead,
            SumCost(ownUsage, pricing),
            model,
            null,
            ownEvents.Count,
            toolCallTimestamps.Count,
            LaneAssembly.AverageGapMs(ownEvents.Select(e => e.ReceivedAtUtc).ToList()),
            density);
    }

    private static List<AgentLane> BuildSubagentLanes(
        List<EventRow> sessionEvents,
        List<UsageRow> sessionUsage,
        Dictionary<string, AgentRunLabel> runsByAgentId,
        HashSet<string> closedAgentIds,
        DateTime now,
        PricingTable pricing,
        DateTime contentSince,
        Grid grid)
    {
        // A subagent's lane is discovered from either source — its hook events (SubagentStart
        // onward) or its usage (ingested only on SubagentStop) — so it can appear and grow
        // while still in flight, before any transcript has ever been read for it.
        IReadOnlyList<string> agentIds = LaneAssembly.CollectAgentIds(
            sessionEvents.Select(e => e.AgentId),
            sessionUsage.Select(u => u.AgentId));

        return agentIds
            .Where(id => id != LaneAssembly.MainAgentId)
            .Select(agentId => BuildSubagentLane(agentId, sessionEvents, sessionUsage, runsByAgentId, closedAgentIds, now, pricing, contentSince, grid))
            .ToList();
    }

    private static AgentLane BuildSubagentLane(
        string agentId,
        List<EventRow> sessionEvents,
        List<UsageRow> sessionUsage,
        Dictionary<string, AgentRunLabel> runsByAgentId,
        HashSet<string> closedAgentIds,
        DateTime now,
        PricingTable pricing,
        DateTime contentSince,
        Grid grid)
    {
        List<EventRow> agentEvents = sessionEvents.Where(e => e.AgentId == agentId).ToList();
        List<UsageRow> agentUsage = sessionUsage.Where(u => u.AgentId == agentId).ToList();

        DateTime? firstEvent = agentEvents.Count == 0 ? null : agentEvents.Min(e => e.ReceivedAtUtc);
        DateTime? lastEvent = agentEvents.Count == 0 ? null : agentEvents.Max(e => e.ReceivedAtUtc);
        DateTime? firstUsage = agentUsage.Count == 0 ? null : agentUsage.Min(u => u.TimestampUtc);
        DateTime? lastUsage = agentUsage.Count == 0 ? null : agentUsage.Max(u => u.TimestampUtc);

        (DateTime startedAt, DateTime lastActivityAt) =
            LaneAssembly.ResolveBounds(firstEvent, lastEvent, firstUsage, lastUsage, now);

        bool closed = closedAgentIds.Contains(agentId);
        DateTime? endedAt = LaneAssembly.ResolveEndedAt(lastActivityAt, now, closed, InProgressThreshold);
        long durationMs = (long)((endedAt ?? now) - startedAt).TotalMilliseconds;

        long billable = agentUsage.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
        long cacheRead = agentUsage.Sum(u => (long)u.CacheReadTokens);
        UsageRow? lastUsageRow = agentUsage.Count == 0 ? null : agentUsage.OrderByDescending(u => u.Id).First();

        // Le type d'agent peut être connu avant même toute usage ingérée : les hooks le
        // portent aussi (SubagentStart, PostToolUse...).
        string? agentType = lastUsageRow?.AgentType
            ?? agentEvents.Select(e => e.AgentType).FirstOrDefault(t => t is not null);

        AgentRunLabel? label = runsByAgentId.GetValueOrDefault(agentId);

        List<DateTime> toolCallTimestamps = agentEvents
            .Where(e => LaneAssembly.IsToolCallEvent(e.EventName))
            .Select(e => e.ReceivedAtUtc)
            .ToList();

        LaneDensity density = DensityGrid.BuildLaneDensity(startedAt, endedAt ?? now, contentSince, grid.BucketMs, toolCallTimestamps);

        return new AgentLane(
            agentId,
            agentType,
            false,
            label?.TaskDescription,
            startedAt,
            endedAt,
            durationMs,
            agentUsage.Count,
            billable,
            cacheRead,
            SumCost(agentUsage, pricing),
            lastUsageRow?.Model,
            label?.SpawnDepth,
            agentEvents.Count,
            toolCallTimestamps.Count,
            LaneAssembly.AverageGapMs(agentEvents.Select(e => e.ReceivedAtUtc).ToList()),
            density);
    }

    /// <summary>
    /// Somme des coûts tarifables, ou <c>null</c> si aucune ligne ne l'est. Même règle que dans
    /// GetStatsQueryHandler : une ligne hors grille est ignorée, jamais comptée zéro — la
    /// compter zéro minorerait le total sans le signaler.
    /// </summary>
    private static decimal? SumCost(IEnumerable<UsageRow> usageRows, PricingTable pricing)
    {
        decimal total = 0;
        bool anyPriced = false;

        foreach (UsageRow usage in usageRows)
        {
            decimal? cost = CostCalculator.Compute(
                pricing,
                usage.Model,
                new TokenUsage(
                    usage.InputTokens,
                    usage.OutputTokens,
                    usage.CacheCreation5mTokens,
                    usage.CacheCreation1hTokens,
                    usage.CacheCreationTokens,
                    usage.CacheReadTokens));

            if (cost.HasValue)
            {
                total += cost.Value;
                anyPriced = true;
            }
        }

        return anyPriced ? total : null;
    }

    private sealed record EventRow(string SessionId, DateTime ReceivedAtUtc, string? EventName, string? Project, string? AgentId, string? AgentType);

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
        int CacheCreation5mTokens,
        int CacheCreation1hTokens,
        int CacheReadTokens);

    private sealed record AgentRunLabel(string AgentId, string? TaskDescription, int? SpawnDepth);
}
