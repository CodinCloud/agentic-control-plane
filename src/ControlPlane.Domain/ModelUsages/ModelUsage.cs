namespace ControlPlane.Domain.ModelUsages;

/// <summary>
/// Per-message token usage read from a Claude Code transcript JSONL. A separate source
/// from <see cref="ControlPlane.Domain.HookEvents.HookEvent"/> on purpose: no hook payload
/// actually carries <c>tokens_used</c> in practice, despite the docs, so this is
/// reconstructed from the transcript files instead. Mixing the two sources on one entity
/// would double-count tokens and make every total wrong — see <see cref="TranscriptProjection"/>.
/// </summary>
public sealed class ModelUsage
{
    // ReSharper disable once UnusedMember.Local — required by EF Core.
    private ModelUsage()
    {
    }

    public long Id { get; private set; }

    /// <summary>The assistant message id (<c>message.id</c>) — the idempotency key. A
    /// transcript is reread in full on every Stop, so this is what keeps re-ingestion a
    /// no-op instead of double-counting.</summary>
    public string MessageId { get; private set; } = string.Empty;

    public string SessionId { get; private set; } = string.Empty;

    /// <summary>Null for the main session's own transcript.</summary>
    public string? AgentId { get; private set; }

    public string? AgentType { get; private set; }

    /// <summary>The subagent's task description, from its <c>.meta.json</c>. Null for the main session.</summary>
    public string? TaskDescription { get; private set; }

    public string? Model { get; private set; }

    public DateTime TimestampUtc { get; private set; }

    public int InputTokens { get; private set; }

    public int OutputTokens { get; private set; }

    public int CacheCreationTokens { get; private set; }

    public int CacheReadTokens { get; private set; }

    public string? StopReason { get; private set; }

    /// <summary>From the subagent's <c>.meta.json</c>. Null for the main session.</summary>
    public int? SpawnDepth { get; private set; }

    /// <summary>
    /// Builds a <see cref="ModelUsage"/> from already-validated values. Called only by
    /// <see cref="TranscriptProjection"/>, which has already confirmed the line is an
    /// assistant message carrying a message id and a usage block — so, like
    /// <see cref="ControlPlane.Domain.HookEvents.HookEvent.Create"/>, this factory has no
    /// failure path.
    /// </summary>
    public static ModelUsage Create(
        string messageId,
        string sessionId,
        string? agentId,
        string? agentType,
        string? taskDescription,
        string? model,
        DateTime timestampUtc,
        int inputTokens,
        int outputTokens,
        int cacheCreationTokens,
        int cacheReadTokens,
        string? stopReason,
        int? spawnDepth)
    {
        return new ModelUsage
        {
            MessageId = messageId,
            SessionId = sessionId,
            AgentId = agentId,
            AgentType = agentType,
            TaskDescription = taskDescription,
            Model = model,
            TimestampUtc = timestampUtc,
            InputTokens = inputTokens,
            OutputTokens = outputTokens,
            CacheCreationTokens = cacheCreationTokens,
            CacheReadTokens = cacheReadTokens,
            StopReason = stopReason,
            SpawnDepth = spawnDepth,
        };
    }
}
