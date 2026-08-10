using ControlPlane.Application.Abstractions.Realtime;

namespace ControlPlane.Api.Realtime;

public static class RealtimeExtensions
{
    /// <summary>
    /// Wires the WebSocket-backed <see cref="IEventBroadcaster"/>: the connection
    /// registry, the queue-backed broadcaster, and the background service that drains
    /// the queue and fans events out to subscribers.
    /// </summary>
    public static IServiceCollection AddRealtime(this IServiceCollection services)
    {
        services.AddSingleton<EventConnectionRegistry>();
        services.AddSingleton<WebSocketEventBroadcaster>();
        services.AddSingleton<IEventBroadcaster>(provider => provider.GetRequiredService<WebSocketEventBroadcaster>());
        services.AddHostedService<EventBroadcastBackgroundService>();

        return services;
    }
}
