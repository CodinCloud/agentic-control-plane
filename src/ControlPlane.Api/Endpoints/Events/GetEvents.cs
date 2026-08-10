using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Events.GetEvents;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Events;

/// <summary>
/// GET /api/events — keyset-paginated event list, filterable, without <c>payload</c>.
/// </summary>
internal sealed class GetEvents : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/events", async (
                string? sessionId,
                string? project,
                string? eventName,
                string? agentType,
                string? toolName,
                long? before,
                int? limit,
                IQueryHandler<GetEventsQuery, GetEventsResponse> handler,
                CancellationToken cancellationToken) =>
            {
                var query = new GetEventsQuery(
                    sessionId,
                    project,
                    eventName,
                    agentType,
                    toolName,
                    before,
                    limit ?? GetEventsQuery.DefaultLimit);

                Result<GetEventsResponse> result = await handler.Handle(query, cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("Events");
    }
}
