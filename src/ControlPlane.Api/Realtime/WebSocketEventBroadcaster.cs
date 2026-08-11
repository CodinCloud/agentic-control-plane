using System.Threading.Channels;
using ControlPlane.Application.Abstractions.Realtime;
using ControlPlane.Domain.HookEvents;

namespace ControlPlane.Api.Realtime;

/// <summary>
/// <see cref="IEventBroadcaster"/> implementation backed by an in-memory
/// <see cref="Channel{T}"/>. <see cref="Publish"/> only enqueues — it never touches a
/// socket and never blocks — so the ingestion request that calls it can never be slowed
/// down or failed by a slow/dead WebSocket subscriber. The actual fan-out to connections
/// happens on <see cref="EventBroadcastBackgroundService"/>, which drains <see cref="Reader"/>.
/// </summary>
internal sealed class WebSocketEventBroadcaster : IEventBroadcaster
{
    private readonly Channel<HookEvent> _channel = Channel.CreateUnbounded<HookEvent>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });

    // Separate channel: a "usage-ingested" notification isn't a HookEvent and comes from a
    // different producer (TranscriptIngestionBackgroundService, in Infrastructure) — merging
    // it into the HookEvent channel would force that producer to fabricate a fake one.
    private readonly Channel<string> _usageIngestedChannel = Channel.CreateUnbounded<string>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });

    public ChannelReader<HookEvent> Reader => _channel.Reader;

    public ChannelReader<string> UsageIngestedReader => _usageIngestedChannel.Reader;

    public void Publish(HookEvent hookEvent) => _channel.Writer.TryWrite(hookEvent);

    public void PublishUsageIngested(string sessionId) => _usageIngestedChannel.Writer.TryWrite(sessionId);
}
