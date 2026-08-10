using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Timeline.GetAgentRunDetail;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Timeline;

/// <summary>GET /api/timeline/agents/{agentId} — the detail panel: same lane, plus brief and report.</summary>
internal sealed class GetAgentRunDetail : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/timeline/agents/{agentId}", async (
                string agentId,
                IQueryHandler<GetAgentRunDetailQuery, AgentRunDetail> handler,
                CancellationToken cancellationToken) =>
            {
                Result<AgentRunDetail> result = await handler.Handle(new GetAgentRunDetailQuery(agentId), cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("Timeline");
    }
}
