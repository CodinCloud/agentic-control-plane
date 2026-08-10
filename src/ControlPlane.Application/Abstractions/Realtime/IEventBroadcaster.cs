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
}
