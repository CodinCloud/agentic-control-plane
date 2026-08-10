namespace ControlPlane.Domain.HookEvents;

/// <summary>
/// A single Claude Code hook lifecycle event. Immutable once ingested: the raw
/// <see cref="Payload"/> is the source of truth, the typed columns are only a
/// convenience index derived from it by <see cref="EventProjection"/>.
/// </summary>
public sealed class HookEvent
{
    // ReSharper disable once UnusedMember.Local — required by EF Core.
    private HookEvent()
    {
    }

    public long Id { get; private set; }

    /// <summary>
    /// When the server ingested the event. Fixed at ingestion time by the handler (via
    /// <c>IDateTimeProvider</c>), never read from the payload: hooks don't timestamp
    /// themselves, and a client clock isn't a source of truth.
    /// </summary>
    public DateTime ReceivedAtUtc { get; private set; }

    public string? EventName { get; private set; }

    public string? SessionId { get; private set; }

    public string? PromptId { get; private set; }

    public string? Cwd { get; private set; }

    public string? Project { get; private set; }

    public string? AgentId { get; private set; }

    public string? AgentType { get; private set; }

    public string? ToolName { get; private set; }

    public string? ToolUseId { get; private set; }

    public int? DurationMs { get; private set; }

    public int? InputTokens { get; private set; }

    public int? OutputTokens { get; private set; }

    public int? CacheCreationTokens { get; private set; }

    public int? CacheReadTokens { get; private set; }

    public string? StopReason { get; private set; }

    public string? Error { get; private set; }

    public string? PermissionMode { get; private set; }

    public string? Effort { get; private set; }

    public string? Source { get; private set; }

    public string Payload { get; private set; } = string.Empty;

    public bool PayloadTruncated { get; private set; }

    /// <summary>
    /// Builds a <see cref="HookEvent"/> from already-projected values. Ingestion never
    /// rejects a payload, so this factory has no failure path: every field is optional
    /// and a missing/mistyped one simply lands as null.
    /// </summary>
    public static HookEvent Create(
        DateTime receivedAtUtc,
        string? eventName,
        string? sessionId,
        string? promptId,
        string? cwd,
        string? project,
        string? agentId,
        string? agentType,
        string? toolName,
        string? toolUseId,
        int? durationMs,
        int? inputTokens,
        int? outputTokens,
        int? cacheCreationTokens,
        int? cacheReadTokens,
        string? stopReason,
        string? error,
        string? permissionMode,
        string? effort,
        string? source,
        string payload,
        bool payloadTruncated)
    {
        return new HookEvent
        {
            ReceivedAtUtc = receivedAtUtc,
            EventName = eventName,
            SessionId = sessionId,
            PromptId = promptId,
            Cwd = cwd,
            Project = project,
            AgentId = agentId,
            AgentType = agentType,
            ToolName = toolName,
            ToolUseId = toolUseId,
            DurationMs = durationMs,
            InputTokens = inputTokens,
            OutputTokens = outputTokens,
            CacheCreationTokens = cacheCreationTokens,
            CacheReadTokens = cacheReadTokens,
            StopReason = stopReason,
            Error = error,
            PermissionMode = permissionMode,
            Effort = effort,
            Source = source,
            Payload = payload,
            PayloadTruncated = payloadTruncated,
        };
    }
}
