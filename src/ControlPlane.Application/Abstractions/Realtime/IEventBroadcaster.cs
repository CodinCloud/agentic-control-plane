using ControlPlane.Domain.HookEvents;

namespace ControlPlane.Application.Abstractions.Realtime;

/// <summary>
/// Publishes a just-ingested <see cref="HookEvent"/> to whatever real-time transport is
/// listening. Application only declares the need; it has no idea this is a WebSocket
/// underneath — see the implementation in ControlPlane.Api/Realtime.
/// </summary>
public interface IEventBroadcaster
{
    /// <summary>
    /// Queues <paramref name="hookEvent"/> for broadcast. Must return immediately and
    /// never throw: broadcasting a live event is best-effort observability, never a
    /// condition for the ingestion that already persisted it.
    /// </summary>
    void Publish(HookEvent hookEvent);

    /// <summary>
    /// Queues a <c>{ "type": "usage-ingested", "sessionId": … }</c> notification — the signal
    /// that the transcript-ingestion queue just committed new <c>ModelUsage</c> rows for
    /// <paramref name="sessionId"/>, per plans/006-gantt-vivant.md décision #6. Must only be
    /// called <b>after</b> the commit that triggered it: a client invalidating its cache on
    /// this event must always see the fresh rows, never the state from before they landed —
    /// exactly the ordering bug this event exists to fix (<c>Stop</c> used to broadcast
    /// before its own ingestion committed). Same contract as <see cref="Publish"/> otherwise:
    /// returns immediately, never throws.
    /// </summary>
    void PublishUsageIngested(string sessionId);
}
