using System.Text.Json;
using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Events.Record;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Events;

/// <summary>
/// POST /events — the hook ingestion endpoint. Accepts any JSON body, always answers
/// 202 with an empty body once the row is written: an ingestion that fails is a
/// measurement lost forever.
/// </summary>
internal sealed class RecordHookEvent : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("events", async (
                JsonElement payload,
                ICommandHandler<RecordHookEventCommand> handler,
                CancellationToken cancellationToken) =>
            {
                Result result = await handler.Handle(new RecordHookEventCommand(payload), cancellationToken);

                return result.Match<IResult>(() => Results.Accepted(), CustomResults.Problem);
            })
            .WithTags("Events");
    }
}
