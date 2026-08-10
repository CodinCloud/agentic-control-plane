using System.Net.WebSockets;

namespace ControlPlane.Api.Realtime;

/// <summary>
/// A single <c>/stream</c> subscriber. Wraps the raw <see cref="WebSocket"/> with a
/// per-connection <see cref="SemaphoreSlim"/> so concurrent broadcasts never call
/// <see cref="WebSocket.SendAsync(ArraySegment{byte}, WebSocketMessageType, bool, CancellationToken)"/>
/// re-entrantly on the same socket — that corrupts the frame.
/// </summary>
internal sealed class EventConnection(WebSocket socket)
{
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    public Guid Id { get; } = Guid.NewGuid();

    public WebSocket Socket { get; } = socket;

    public async Task SendAsync(byte[] payload, CancellationToken cancellationToken)
    {
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            if (Socket.State != WebSocketState.Open)
            {
                throw new InvalidOperationException($"WebSocket connection '{Id}' is not open.");
            }

            await Socket.SendAsync(payload, WebSocketMessageType.Text, endOfMessage: true, cancellationToken);
        }
        finally
        {
            _sendLock.Release();
        }
    }
}
