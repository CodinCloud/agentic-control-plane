using System.Text.Json;
using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Abstractions.Realtime;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.HookEvents;
using Microsoft.Extensions.Logging;

namespace ControlPlane.Application.Events.Record;

public sealed record RecordHookEventCommand(JsonElement Payload) : ICommand;

/// <summary>
/// Ingests a raw hook payload. Never fails: an event that can't be shaped into typed
/// columns is still stored, with the offending columns left null — a rejected payload
/// is a measurement lost forever.
/// </summary>
internal sealed class RecordHookEventCommandHandler(
    IApplicationDbContext context,
    IDateTimeProvider dateTimeProvider,
    IEventBroadcaster broadcaster,
    ILogger<RecordHookEventCommandHandler> logger)
    : ICommandHandler<RecordHookEventCommand>
{
    public async Task<Result> Handle(RecordHookEventCommand command, CancellationToken cancellationToken)
    {
        string rawJson = command.Payload.ValueKind == JsonValueKind.Undefined
            ? "null"
            : command.Payload.GetRawText();

        HookEvent hookEvent = EventProjection.Project(command.Payload, rawJson, dateTimeProvider.UtcNow);

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

        return Result.Success();
    }
}
