namespace ControlPlane.Domain.AgentRuns;

/// <summary>
/// One row per subagent spawn (<c>agent-&lt;id&gt;.jsonl</c>), carrying the data that belongs to
/// the *run* rather than to any single message — see <see cref="ControlPlane.Domain.ModelUsages.ModelUsage"/>
/// for the per-message token rows. Built by <see cref="AgentRunProjection"/> from the same
/// transcript lines already read for <c>ModelUsage</c>.
/// </summary>
public sealed class AgentRun
{
    // ReSharper disable once UnusedMember.Local — required by EF Core.
    private AgentRun()
    {
    }

    public long Id { get; private set; }

    /// <summary>The idempotency key: a transcript is reread in full on every SubagentStop,
    /// so this is what keeps re-ingestion an update rather than a duplicate row.</summary>
    public string AgentId { get; private set; } = string.Empty;

    public string SessionId { get; private set; } = string.Empty;

    public string? AgentType { get; private set; }

    /// <summary>From the subagent's <c>.meta.json</c>.</summary>
    public string? TaskDescription { get; private set; }

    /// <summary>From the subagent's <c>.meta.json</c>.</summary>
    public int? SpawnDepth { get; private set; }

    /// <summary>Text of the first <c>"type": "user"</c> message in the subagent transcript —
    /// the brief it was spawned with. Truncated at 8 KB, see <see cref="BriefTruncated"/>.</summary>
    public string Brief { get; private set; } = string.Empty;

    public bool BriefTruncated { get; private set; }

    /// <summary>Text of the last <c>"type": "assistant"</c> message in the subagent transcript —
    /// its final report. Truncated at 8 KB, see <see cref="ReportTruncated"/>.</summary>
    public string Report { get; private set; } = string.Empty;

    public bool ReportTruncated { get; private set; }

    /// <summary>
    /// Builds an <see cref="AgentRun"/> from already-projected values. Called only by
    /// <see cref="AgentRunProjection"/>, which has already confirmed the transcript
    /// carries at least one user or assistant message — so, like
    /// <see cref="ControlPlane.Domain.ModelUsages.ModelUsage.Create"/>, this factory has no
    /// failure path.
    /// </summary>
    public static AgentRun Create(
        string agentId,
        string sessionId,
        string? agentType,
        string? taskDescription,
        int? spawnDepth,
        string brief,
        bool briefTruncated,
        string report,
        bool reportTruncated)
    {
        return new AgentRun
        {
            AgentId = agentId,
            SessionId = sessionId,
            AgentType = agentType,
            TaskDescription = taskDescription,
            SpawnDepth = spawnDepth,
            Brief = brief,
            BriefTruncated = briefTruncated,
            Report = report,
            ReportTruncated = reportTruncated,
        };
    }

    /// <summary>
    /// Refreshes this run from a re-read transcript. Idempotency is by <see cref="AgentId"/>:
    /// the ingestion background service calls this instead of <see cref="Create"/> when a
    /// row for the agent already exists, so a re-ingested transcript updates the row rather
    /// than duplicating it.
    /// </summary>
    public void Refresh(
        string? agentType,
        string? taskDescription,
        int? spawnDepth,
        string brief,
        bool briefTruncated,
        string report,
        bool reportTruncated)
    {
        AgentType = agentType;
        TaskDescription = taskDescription;
        SpawnDepth = spawnDepth;
        Brief = brief;
        BriefTruncated = briefTruncated;
        Report = report;
        ReportTruncated = reportTruncated;
    }
}
