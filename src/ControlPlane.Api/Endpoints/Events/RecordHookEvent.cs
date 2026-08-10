using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Events.Record;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Events;

/// <summary>
/// POST /events — the hook ingestion endpoint. Accepts any body, even malformed JSON,
/// always answers 202 once the row is written: an ingestion that fails is a measurement
/// lost forever. The body is read raw here and parsed by the handler itself, rather than
/// bound to a <c>JsonElement</c> parameter — ASP.NET's own model binder would otherwise
/// answer 400 on invalid JSON before the handler ever ran, rejecting exactly the payloads
/// this endpoint exists to never reject.
/// </summary>
internal sealed class RecordHookEvent : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("events", async (
                HttpContext httpContext,
                ICommandHandler<RecordHookEventCommand> handler,
                CancellationToken cancellationToken) =>
            {
                string rawBody;
                using (var reader = new StreamReader(httpContext.Request.Body))
                {
                    rawBody = await reader.ReadToEndAsync(cancellationToken);
                }

                Result result = await handler.Handle(new RecordHookEventCommand(rawBody), cancellationToken);

                return result.Match<IResult>(() => Results.Accepted(), CustomResults.Problem);
            })
            .WithTags("Events");
    }
}
