using ControlPlane.Api.Extensions;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Application.Timeline.GetTimeline;
using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Endpoints.Timeline;

/// <summary>
/// GET /api/timeline?sessionId=&amp;since=&lt;ISO&gt; — one lane per agent, plus the main-session
/// banner. <c>sessionId</c> is an optional filter: when omitted, the handler falls back to the
/// most recently active session of the window.
/// </summary>
internal sealed class GetTimeline : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/timeline", async (
                string? sessionId,
                DateTime? since,
                IQueryHandler<GetTimelineQuery, TimelineResponse> handler,
                CancellationToken cancellationToken) =>
            {
                Result<TimelineResponse> result = await handler.Handle(new GetTimelineQuery(sessionId, since), cancellationToken);

                return result.Match(Results.Ok, CustomResults.Problem);
            })
            .WithTags("Timeline");
    }
}
