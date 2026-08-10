using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Events.GetEventById;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Events;

/// <summary>GET /api/events/{id} — a single event with its full raw payload.</summary>
internal sealed class GetEventById : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/events/{id:long}", async (
                long id,
                IQueryHandler<GetEventByIdQuery, EventDetail> handler,
                CancellationToken cancellationToken) =>
            {
                Result<EventDetail> result = await handler.Handle(new GetEventByIdQuery(id), cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("Events");
    }
}
