using ControlPlane.Domain.HookEvents;

namespace ControlPlane.Api.Realtime;

/// <summary>
/// Wire shape broadcast over <c>/stream</c> — the same typed columns as the
/// <c>GET /api/events</c> list item, minus <c>payload</c>. Serialized camelCase.
/// </summary>
internal sealed record EventStreamItem(
    long Id,
    DateTime ReceivedAt,
    string? EventName,
    string? SessionId,
    string? PromptId,
    string? Cwd,
    string? Project,
    string? AgentId,
    string? AgentType,
    string? ToolName,
    string? ToolUseId,
    int? DurationMs,
    int? InputTokens,
    int? OutputTokens,
    int? CacheCreationTokens,
    int? CacheReadTokens,
    string? StopReason,
    string? Error,
    string? PermissionMode,
    string? Effort,
    string? Source)
{
    public static EventStreamItem FromHookEvent(HookEvent hookEvent) => new(
        hookEvent.Id,
        hookEvent.ReceivedAtUtc,
        hookEvent.EventName,
        hookEvent.SessionId,
        hookEvent.PromptId,
        hookEvent.Cwd,
        hookEvent.Project,
        hookEvent.AgentId,
        hookEvent.AgentType,
        hookEvent.ToolName,
        hookEvent.ToolUseId,
        hookEvent.DurationMs,
        hookEvent.InputTokens,
        hookEvent.OutputTokens,
        hookEvent.CacheCreationTokens,
        hookEvent.CacheReadTokens,
        hookEvent.StopReason,
        hookEvent.Error,
        hookEvent.PermissionMode,
        hookEvent.Effort,
        hookEvent.Source);
}

/// <summary>The envelope every <c>/stream</c> message is wrapped in.</summary>
internal sealed record EventStreamMessage(string Type, EventStreamItem Data)
{
    public static EventStreamMessage ForEvent(EventStreamItem item) => new("event", item);
}

/// <summary>
/// Broadcast after a transcript ingestion commits new <c>ModelUsage</c> rows — the signal
/// that was missing for a client to invalidate its timeline right after the ingestion a
/// <c>Stop</c>/<c>SubagentStop</c> triggered, instead of racing it (plans/006-gantt-vivant.md
/// décision #6). Deliberately flat, no nested <c>data</c>: this isn't a hook event, so it
/// doesn't share <see cref="EventStreamMessage"/>'s shape.
/// </summary>
internal sealed record UsageIngestedMessage(string Type, string SessionId)
{
    public static UsageIngestedMessage For(string sessionId) => new("usage-ingested", sessionId);
}
