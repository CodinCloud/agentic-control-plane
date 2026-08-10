using System.Threading.Channels;
using ControlPlane.Application.Abstractions.Transcripts;

namespace ControlPlane.Infrastructure.Transcripts;

/// <summary>
/// <see cref="ITranscriptIngestionQueue"/> implementation backed by an in-memory
/// <see cref="Channel{T}"/> — same decoupling mechanism as the WebSocket event
/// broadcaster. <see cref="Enqueue"/> only writes to the channel — it never touches the
/// filesystem or the database and never blocks — so the hook ingestion request that calls
/// it can never be slowed down or failed by a slow disk or a large transcript. The actual
/// file read and persistence happen on <see cref="TranscriptIngestionBackgroundService"/>,
/// which drains <see cref="Reader"/>.
/// </summary>
internal sealed class TranscriptIngestionQueue : ITranscriptIngestionQueue
{
    private readonly Channel<TranscriptIngestionRequest> _channel = Channel.CreateUnbounded<TranscriptIngestionRequest>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });

    public ChannelReader<TranscriptIngestionRequest> Reader => _channel.Reader;

    public void Enqueue(TranscriptIngestionRequest request) => _channel.Writer.TryWrite(request);
}
