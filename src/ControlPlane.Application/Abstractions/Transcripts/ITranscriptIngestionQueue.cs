namespace ControlPlane.Application.Abstractions.Transcripts;

/// <summary>
/// Queues a transcript for asynchronous token-usage ingestion. Fired only from
/// <c>Stop</c> and <c>SubagentStop</c> hook events — never per tool call, that would be
/// ruinous. Application only declares the need; the actual file read and
/// <c>ModelUsage</c> persistence happen off the ingestion request path in Infrastructure,
/// exactly like <see cref="ControlPlane.Application.Abstractions.Realtime.IEventBroadcaster"/>
/// decouples real-time broadcast from ingestion.
/// </summary>
public interface ITranscriptIngestionQueue
{
    /// <summary>
    /// Queues <paramref name="request"/> for background processing. Must return
    /// immediately and never throw: a missed transcript read must never degrade the hook
    /// ingestion that triggered it.
    /// </summary>
    void Enqueue(TranscriptIngestionRequest request);
}

/// <summary>
/// <paramref name="EventName"/> is <c>"Stop"</c> (read the main session transcript at
/// <paramref name="TranscriptPath"/>) or <c>"SubagentStop"</c> (read every subagent
/// transcript found under the <c>&lt;session_id&gt;/subagents/</c> folder deduced from
/// it). Either field can be null/missing — an unusable request is simply dropped by the
/// consumer, never thrown for.
/// </summary>
public sealed record TranscriptIngestionRequest(string? EventName, string? SessionId, string? TranscriptPath);
