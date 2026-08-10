using System.Collections.Concurrent;

namespace ControlPlane.Api.Realtime;

/// <summary>
/// Thread-safe registry of live <c>/stream</c> subscribers. Registration and
/// deregistration happen from the WebSocket accept loop; broadcasting reads a snapshot
/// from the background service — both sides only ever touch a <see cref="ConcurrentDictionary{TKey,TValue}"/>.
/// </summary>
internal sealed class EventConnectionRegistry
{
    private readonly ConcurrentDictionary<Guid, EventConnection> _connections = new();

    public IReadOnlyCollection<EventConnection> Connections => _connections.Values.ToArray();

    public void Register(EventConnection connection) => _connections[connection.Id] = connection;

    public void Unregister(Guid connectionId) => _connections.TryRemove(connectionId, out _);
}
