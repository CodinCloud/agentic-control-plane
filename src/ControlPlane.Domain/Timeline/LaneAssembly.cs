namespace ControlPlane.Domain.Timeline;

/// <summary>
/// Pure geometry and lifecycle rules shared by the main-session lane and every subagent
/// lane in a <c>GET /api/timeline</c> response — see plans/006-gantt-vivant.md.
///
/// <para><b>The "quand" comes from events, the "combien" from usage</b> (décision #1) : every
/// bounds/activity computation here reads <c>HookEvent</c> timestamps and/or the union with
/// <c>ModelUsage</c> timestamps (décision #3) ; none of it reads tokens, cost, or model — that
/// stays on <c>ModelUsage</c>, computed by the caller.</para>
/// </summary>
public static class LaneAssembly
{
    /// <summary>The sentinel already in force on <c>GET /api/events</c> (spec 005) : the main
    /// session is a lane like any other, and this is its id (décision #4).</summary>
    public const string MainAgentId = "main";

    /// <summary><c>Stop</c> fires at the end of every turn, not at the end of a session —
    /// using it as a closing signal marks a session "terminée" after its very first turn
    /// (fait #2). Only <c>SessionEnd</c> closes the main session (décision #2).</summary>
    public const string SessionEndEventName = "SessionEnd";

    public const string SubagentStopEventName = "SubagentStop";

    private const string ToolCallEventName = "PostToolUse";
    private const string ToolCallFailureEventName = "PostToolUseFailure";

    /// <summary>The texture counts appearances of a method, not every notification — counting
    /// <c>UserPromptSubmit</c>/<c>Notification</c> in it would dilute the signal (décision #8,
    /// DoD critère 9).</summary>
    public static bool IsToolCallEvent(string? eventName) => eventName is ToolCallEventName or ToolCallFailureEventName;

    public static bool HasClosingEvent(IEnumerable<string?> eventNames, string closingEventName) =>
        eventNames.Any(name => name == closingEventName);

    /// <summary>
    /// Union of the two sources (décision #3) : the earliest of whichever bound is present,
    /// the latest of whichever bound is present. Neither source alone can starve a lane of
    /// its true extent — a subagent with no tool call yet keeps its usage bounds, a session
    /// with no usage ingested yet keeps its event bounds. <paramref name="fallback"/> is used
    /// only when both sources are entirely absent (e.g. an empty database).
    /// </summary>
    public static (DateTime Start, DateTime End) ResolveBounds(
        DateTime? firstEvent,
        DateTime? lastEvent,
        DateTime? firstUsage,
        DateTime? lastUsage,
        DateTime fallback)
    {
        DateTime start = EarliestOrFallback(firstEvent, firstUsage, fallback);
        DateTime end = LatestOrFallback(lastEvent, lastUsage, fallback);

        return (start, end);
    }

    /// <summary>Same rule for the session's own banner and for an agent lane : still open
    /// (null) when the last activity is recent and no closing hook fired for it.</summary>
    public static DateTime? ResolveEndedAt(DateTime lastActivityAt, DateTime now, bool closed, TimeSpan inProgressThreshold)
    {
        bool inProgress = !closed && now - lastActivityAt < inProgressThreshold;
        return inProgress ? null : lastActivityAt;
    }

    /// <summary>Vivacity is event-freshness only (décision #1) : a fresh hook event is enough
    /// to call a session active even with no <c>ModelUsage</c> ingested yet (DoD critère 4).</summary>
    public static bool IsActive(DateTime? lastEventAt, DateTime now, TimeSpan activeThreshold) =>
        lastEventAt is not null && now - lastEventAt.Value < activeThreshold;

    /// <summary>
    /// Every agent id a session's lanes should be built for : always <see cref="MainAgentId"/>
    /// (a session always contains at least one agent — itself, décision #4), plus every
    /// distinct non-null agent id observed on either source. A session with no subagent at
    /// all therefore yields exactly one id (DoD critère 1).
    /// </summary>
    public static IReadOnlyList<string> CollectAgentIds(IEnumerable<string?> eventAgentIds, IEnumerable<string?> usageAgentIds)
    {
        var ids = new HashSet<string> { MainAgentId };

        foreach (string? id in eventAgentIds.Concat(usageAgentIds))
        {
            if (!string.IsNullOrWhiteSpace(id))
            {
                ids.Add(id);
            }
        }

        return ids.ToList();
    }

    /// <summary>
    /// Orders lanes with the main session always first (décision #5) — it is the reference
    /// every subagent is compared against, regardless of when it started relative to them —
    /// then every other lane by <paramref name="startedAtSelector"/>.
    /// </summary>
    public static IReadOnlyList<T> OrderLanes<T>(
        IEnumerable<T> lanes,
        Func<T, string> agentIdSelector,
        Func<T, DateTime> startedAtSelector)
    {
        return lanes
            .OrderBy(lane => agentIdSelector(lane) == MainAgentId ? 0 : 1)
            .ThenBy(startedAtSelector)
            .ToList();
    }

    /// <summary>Mean gap between consecutive events, in ms — the 🕐 badge. Null with fewer
    /// than two events : a gap needs two points.</summary>
    public static long? AverageGapMs(IReadOnlyList<DateTime> timestamps)
    {
        if (timestamps.Count < 2)
        {
            return null;
        }

        List<DateTime> ordered = timestamps.OrderBy(t => t).ToList();
        long totalGapMs = 0;

        for (int i = 1; i < ordered.Count; i++)
        {
            totalGapMs += (long)(ordered[i] - ordered[i - 1]).TotalMilliseconds;
        }

        return totalGapMs / (ordered.Count - 1);
    }

    private static DateTime EarliestOrFallback(DateTime? a, DateTime? b, DateTime fallback)
    {
        DateTime?[] values = [a, b];
        return values.Where(v => v.HasValue).Select(v => v!.Value).DefaultIfEmpty(fallback).Min();
    }

    private static DateTime LatestOrFallback(DateTime? a, DateTime? b, DateTime fallback)
    {
        DateTime?[] values = [a, b];
        return values.Where(v => v.HasValue).Select(v => v!.Value).DefaultIfEmpty(fallback).Max();
    }
}
