using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Stats.GetStats;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Stats;

/// <summary>GET /api/stats?since=&lt;ISO&gt; — the observability baseline KPIs.</summary>
internal sealed class GetStats : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/stats", async (
                DateTime? since,
                IQueryHandler<GetStatsQuery, StatsResponse> handler,
                CancellationToken cancellationToken) =>
            {
                Result<StatsResponse> result = await handler.Handle(new GetStatsQuery(since), cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("Stats");
    }
}
