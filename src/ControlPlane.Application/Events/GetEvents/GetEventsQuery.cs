using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.HookEvents;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Events.GetEvents;

/// <summary>
/// Lists hook events, newest first, without <see cref="EventListItem.Payload"/> — it can
/// weigh up to 32 KB per row and this is a list view. Paginated with a **keyset** cursor on
/// <see cref="HookEvent.Id"/> (<see cref="Before"/>), not an offset: the feed is continuous
/// and an offset would drift as new events keep arriving.
/// </summary>
/// <param name="AgentType">Le <b>gabarit</b> (backend-dev…), pas une identité : un même type
/// est instancié à neuf à chaque spawn.</param>
/// <param name="AgentId">L'<b>instance</b>. C'est ce qu'il faut pour isoler un run précis —
/// filtrer par type mélangerait des exécutions sans rapport, y compris concurrentes.</param>
public sealed record GetEventsQuery(
    string? SessionId,
    string? Project,
    string? EventName,
    string? AgentType,
    string? AgentId,
    string? ToolName,
    long? Before,
    int Limit) : IQuery<GetEventsResponse>
{
    public const int DefaultLimit = 200;
    public const int MaxLimit = 1000;

    /// <summary>Une chaîne de requête ne sait pas transporter un null : cette sentinelle vaut
    /// « sans agent », c'est-à-dire la session principale. Déjà en vigueur pour
    /// <see cref="AgentType"/>, réutilisée telle quelle pour <see cref="AgentId"/>.</summary>
    public const string MainSessionSentinel = "main";
}

public sealed record GetEventsResponse(IReadOnlyList<EventListItem> Items, long? NextBefore);

public sealed record EventListItem(
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
    string? Source);

internal sealed class GetEventsQueryHandler(IApplicationDbContext context) : IQueryHandler<GetEventsQuery, GetEventsResponse>
{
    public async Task<Result<GetEventsResponse>> Handle(GetEventsQuery query, CancellationToken cancellationToken)
    {
        IQueryable<HookEvent> events = context.HookEvents.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.SessionId))
        {
            events = events.Where(e => e.SessionId == query.SessionId);
        }

        if (!string.IsNullOrWhiteSpace(query.Project))
        {
            events = events.Where(e => e.Project == query.Project);
        }

        if (!string.IsNullOrWhiteSpace(query.EventName))
        {
            events = events.Where(e => e.EventName == query.EventName);
        }

        if (!string.IsNullOrWhiteSpace(query.ToolName))
        {
            events = events.Where(e => e.ToolName == query.ToolName);
        }

        // "agentType=main" is a reserved sentinel meaning agent_type IS NULL — the main
        // session never carries an agent_type, so there's no other way to ask for it
        // through a query string. Any other value filters by strict equality.
        if (!string.IsNullOrWhiteSpace(query.AgentType))
        {
            events = query.AgentType == GetEventsQuery.MainSessionSentinel
                ? events.Where(e => e.AgentType == null)
                : events.Where(e => e.AgentType == query.AgentType);
        }

        // Filtre par instance, pas par gabarit — voir la doc de GetEventsQuery.AgentId.
        if (!string.IsNullOrWhiteSpace(query.AgentId))
        {
            events = query.AgentId == GetEventsQuery.MainSessionSentinel
                ? events.Where(e => e.AgentId == null)
                : events.Where(e => e.AgentId == query.AgentId);
        }

        if (query.Before is { } before)
        {
            events = events.Where(e => e.Id < before);
        }

        int limit = Math.Clamp(
            query.Limit <= 0 ? GetEventsQuery.DefaultLimit : query.Limit,
            1,
            GetEventsQuery.MaxLimit);

        // Fetch one extra row to know whether there's a next page, without a second
        // round-trip or a COUNT query.
        List<EventListItem> page = await events
            .OrderByDescending(e => e.Id)
            .Take(limit + 1)
            .Select(e => new EventListItem(
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
                e.Source))
            .ToListAsync(cancellationToken);

        bool hasMore = page.Count > limit;
        List<EventListItem> items = hasMore ? page[..limit] : page;
        long? nextBefore = hasMore ? items[^1].Id : null;

        return Result.Success(new GetEventsResponse(items, nextBefore));
    }
}
