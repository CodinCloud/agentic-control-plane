using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Events.GetFilterOptions;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.FilterOptions;

/// <summary>GET /api/filter-options — distinct values to populate the timeline's filters.</summary>
internal sealed class GetFilterOptions : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/filter-options", async (
                IQueryHandler<GetFilterOptionsQuery, FilterOptionsResponse> handler,
                CancellationToken cancellationToken) =>
            {
                Result<FilterOptionsResponse> result = await handler.Handle(new GetFilterOptionsQuery(), cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("FilterOptions");
    }
}
