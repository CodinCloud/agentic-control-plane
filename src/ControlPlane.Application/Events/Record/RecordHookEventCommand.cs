using System.Text.Json;
using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Abstractions.Realtime;
using ControlPlane.Application.Abstractions.Transcripts;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.HookEvents;
using Microsoft.Extensions.Logging;

namespace ControlPlane.Application.Events.Record;

/// <summary>The raw JSON body of a hook payload, exactly as received off the wire — not yet
/// known to even be valid JSON. See <see cref="RecordHookEventCommandHandler"/>.</summary>
public sealed record RecordHookEventCommand(string RawBody) : ICommand;

/// <summary>
/// Ingests a raw hook payload. Never fails, and never rejects even a malformed body: an
/// event that can't be shaped into typed columns is still stored with the offending columns
/// left null, and a body that isn't even valid JSON is stored as an <c>"Unmarshalable"</c>
/// event with every typed column null and the raw body kept (truncated) as
/// <see cref="HookEvent.Payload"/> — a rejected payload is a measurement lost forever. This
/// is also why the endpoint hands over the raw body instead of a bound <c>JsonElement</c>:
/// ASP.NET's own model binder would 400 on invalid JSON before this handler ever runs.
/// </summary>
internal sealed class RecordHookEventCommandHandler(
    IApplicationDbContext context,
    IDateTimeProvider dateTimeProvider,
    IEventBroadcaster broadcaster,
    ITranscriptIngestionQueue transcriptQueue,
    ILogger<RecordHookEventCommandHandler> logger)
    : ICommandHandler<RecordHookEventCommand>
{
    public async Task<Result> Handle(RecordHookEventCommand command, CancellationToken cancellationToken)
    {
        // An empty body isn't malformed, it's just absent — normalized to the JSON literal
        // "null" so it parses cleanly and projects to an all-null event, same as before.
        string rawJson = string.IsNullOrWhiteSpace(command.RawBody) ? "null" : command.RawBody;

        HookEvent hookEvent = TryParse(rawJson, out JsonElement payload)
            ? EventProjection.Project(payload, rawJson, dateTimeProvider.UtcNow)
            : BuildUnmarshalable(command.RawBody, dateTimeProvider.UtcNow);

        context.HookEvents.Add(hookEvent);
        await context.SaveChangesAsync(cancellationToken);

        // Broadcast only after the write succeeds — a subscriber must never see an event
        // that isn't durably persisted yet. This is best-effort real-time observability:
        // it must never turn ingestion into a failure, so it's isolated behind its own
        // try/catch even though Publish itself is not expected to throw.
        try
        {
            broadcaster.Publish(hookEvent);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to queue hook event {HookEventId} for real-time broadcast.", hookEvent.Id);
        }

        // Token usage isn't on any hook payload in practice — it's reconstructed from the
        // transcript JSONL, but only on Stop/SubagentStop: reading a transcript on every
        // tool call would be ruinous. Same isolation as the broadcast above: queuing must
        // never turn ingestion into a failure. An unparsable body never projects to
        // EventName "Stop"/"SubagentStop" (there's no typed column to read it from), so this
        // branch naturally never fires for it — payload is only read here when parsing above
        // already succeeded.
        if (hookEvent.EventName is "Stop" or "SubagentStop")
        {
            try
            {
                string? transcriptPath = EventProjection.ExtractTranscriptPath(payload);
                transcriptQueue.Enqueue(new TranscriptIngestionRequest(hookEvent.EventName, hookEvent.SessionId, transcriptPath));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to queue transcript ingestion for session {SessionId}.", hookEvent.SessionId);
            }
        }

        return Result.Success();
    }

    private static bool TryParse(string rawJson, out JsonElement payload)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(rawJson);

            // Clone so the element survives past the JsonDocument's disposal below —
            // otherwise it would point at a returned-to-the-pool buffer once this method exits.
            payload = document.RootElement.Clone();
            return true;
        }
        catch (JsonException)
        {
            payload = default;
            return false;
        }
    }

    private static HookEvent BuildUnmarshalable(string rawBody, DateTime receivedAtUtc)
    {
        (string payload, bool truncated) = EventProjection.TruncatePayload(rawBody);

        return HookEvent.Create(
            receivedAtUtc: receivedAtUtc,
            eventName: "Unmarshalable",
            sessionId: null,
            promptId: null,
            cwd: null,
            project: null,
            agentId: null,
            agentType: null,
            toolName: null,
            toolUseId: null,
            durationMs: null,
            inputTokens: null,
            outputTokens: null,
            cacheCreationTokens: null,
            cacheReadTokens: null,
            stopReason: null,
            error: null,
            permissionMode: null,
            effort: null,
            source: null,
            payload: payload,
            payloadTruncated: truncated);
    }
}
