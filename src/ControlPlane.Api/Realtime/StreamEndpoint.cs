using System.Net.WebSockets;
using ControlPlane.Api.Endpoints;

namespace ControlPlane.Api.Realtime;

/// <summary>
/// WS /stream — accepts a WebSocket subscription and holds it open until the client
/// closes it. The connection sends nothing itself; it only registers so
/// <see cref="EventBroadcastBackgroundService"/> can push <c>{ "type": "event", ... }"</c>
/// messages to it as ingestion happens. Reconnection is a client concern.
/// </summary>
internal sealed class StreamEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.Map("/stream", async (
                HttpContext context,
                EventConnectionRegistry registry,
                ILogger<StreamEndpoint> logger,
                CancellationToken cancellationToken) =>
            {
                if (!context.WebSockets.IsWebSocketRequest)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    return;
                }

                using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
                var connection = new EventConnection(socket);
                registry.Register(connection);

                try
                {
                    var buffer = new byte[4096];

                    while (socket.State == WebSocketState.Open)
                    {
                        WebSocketReceiveResult result =
                            await socket.ReceiveAsync(buffer, cancellationToken);

                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                            break;
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    // Server shutting down or the client vanished — nothing to do.
                }
                catch (WebSocketException ex)
                {
                    logger.LogDebug(ex, "/stream connection {ConnectionId} dropped abruptly.", connection.Id);
                }
                finally
                {
                    registry.Unregister(connection.Id);
                }
            });
    }
}
