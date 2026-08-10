using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Timeline.GetToolCalls;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Timeline;

/// <summary>
/// GET /api/timeline/tools?sessionId=&amp;agentId=&amp;limit= — les appels d'outil d'un agent,
/// dans l'ordre, avec entrée et sortie extraites. <c>agentId</c> absent = la session elle-même.
/// </summary>
internal sealed class GetToolCalls : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/timeline/tools", async (
                string sessionId,
                string? agentId,
                int? limit,
                IQueryHandler<GetToolCallsQuery, ToolCallsResponse> handler,
                CancellationToken cancellationToken) =>
            {
                var query = new GetToolCallsQuery(sessionId, agentId, limit ?? GetToolCallsQuery.DefaultLimit);

                Result<ToolCallsResponse> result = await handler.Handle(query, cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("Timeline");
    }
}
