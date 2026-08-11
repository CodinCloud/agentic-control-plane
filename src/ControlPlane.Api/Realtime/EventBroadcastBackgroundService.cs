using System.Text.Json;
using ControlPlane.Domain.HookEvents;

namespace ControlPlane.Api.Realtime;

/// <summary>
/// Drains the broadcast queue and fans each event out to every registered <c>/stream</c>
/// connection. Runs entirely off the ingestion request path: nothing here can slow down
/// or fail a <c>POST /events</c>. A slow, dead, or misbehaving connection is logged and
/// dropped from the registry — it never stalls the others or this loop.
/// </summary>
internal sealed class EventBroadcastBackgroundService(
    WebSocketEventBroadcaster broadcaster,
    EventConnectionRegistry registry,
    ILogger<EventBroadcastBackgroundService> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Two independent producers, two independent drain loops — a slow/backed-up hook
        // event stream must never delay a "usage-ingested" notification (or vice versa).
        await Task.WhenAll(
            DrainEventsAsync(stoppingToken),
            DrainUsageIngestedAsync(stoppingToken));
    }

    private async Task DrainEventsAsync(CancellationToken stoppingToken)
    {
        await foreach (HookEvent hookEvent in broadcaster.Reader.ReadAllAsync(stoppingToken))
        {
            await BroadcastAsync(hookEvent, stoppingToken);
        }
    }

    private async Task DrainUsageIngestedAsync(CancellationToken stoppingToken)
    {
        await foreach (string sessionId in broadcaster.UsageIngestedReader.ReadAllAsync(stoppingToken))
        {
            await BroadcastUsageIngestedAsync(sessionId, stoppingToken);
        }
    }

    private async Task BroadcastUsageIngestedAsync(string sessionId, CancellationToken cancellationToken)
    {
        IReadOnlyCollection<EventConnection> connections = registry.Connections;

        if (connections.Count == 0)
        {
            return;
        }

        byte[] payload;
        try
        {
            payload = JsonSerializer.SerializeToUtf8Bytes(UsageIngestedMessage.For(sessionId), SerializerOptions);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to serialize usage-ingested notification for session {SessionId}; dropping.", sessionId);
            return;
        }

        await Task.WhenAll(connections.Select(connection => SendSafelyAsync(connection, payload, cancellationToken)));
    }

    private async Task BroadcastAsync(HookEvent hookEvent, CancellationToken cancellationToken)
    {
        IReadOnlyCollection<EventConnection> connections = registry.Connections;

        if (connections.Count == 0)
        {
            return;
        }

        byte[] payload;
        try
        {
            EventStreamMessage message = EventStreamMessage.ForEvent(EventStreamItem.FromHookEvent(hookEvent));
            payload = JsonSerializer.SerializeToUtf8Bytes(message, SerializerOptions);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to serialize hook event {HookEventId} for broadcast; dropping.", hookEvent.Id);
            return;
        }

        await Task.WhenAll(connections.Select(connection => SendSafelyAsync(connection, payload, cancellationToken)));
    }

    private async Task SendSafelyAsync(EventConnection connection, byte[] payload, CancellationToken cancellationToken)
    {
        try
        {
            await connection.SendAsync(payload, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Dropping unresponsive /stream connection {ConnectionId}.", connection.Id);
            registry.Unregister(connection.Id);
        }
    }
}
