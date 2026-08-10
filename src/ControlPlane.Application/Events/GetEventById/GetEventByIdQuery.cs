using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.HookEvents;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Events.GetEventById;

/// <summary>Fetches a single hook event, with its full raw <see cref="EventDetail.Payload"/>.</summary>
public sealed record GetEventByIdQuery(long Id) : IQuery<EventDetail>;

public sealed record EventDetail(
    long Id,
    DateTime ReceivedAt,
    string? EventName,
    string? SessionId,
    string? PromptId,
    string? Cwd,
    string? Project,
    string? AgentId,
    string? AgentType,
    string? ToolName,
    string? ToolUseId,
    int? DurationMs,
    int? InputTokens,
    int? OutputTokens,
    int? CacheCreationTokens,
    int? CacheReadTokens,
    string? StopReason,
    string? Error,
    string? PermissionMode,
    string? Effort,
    string? Source,
    string Payload,
    bool PayloadTruncated);

internal sealed class GetEventByIdQueryHandler(IApplicationDbContext context) : IQueryHandler<GetEventByIdQuery, EventDetail>
{
    public async Task<Result<EventDetail>> Handle(GetEventByIdQuery query, CancellationToken cancellationToken)
    {
        EventDetail? detail = await context.HookEvents
            .AsNoTracking()
            .Where(e => e.Id == query.Id)
            .Select(e => new EventDetail(
                e.Id,
                e.ReceivedAtUtc,
                e.EventName,
                e.SessionId,
                e.PromptId,
                e.Cwd,
                e.Project,
                e.AgentId,
                e.AgentType,
                e.ToolName,
                e.ToolUseId,
                e.DurationMs,
                e.InputTokens,
                e.OutputTokens,
                e.CacheCreationTokens,
                e.CacheReadTokens,
                e.StopReason,
                e.Error,
                e.PermissionMode,
                e.Effort,
                e.Source,
                e.Payload,
                e.PayloadTruncated))
            .FirstOrDefaultAsync(cancellationToken);

        return detail is not null
            ? Result.Success(detail)
            : Result.Failure<EventDetail>(HookEventErrors.NotFound(query.Id));
    }
}
