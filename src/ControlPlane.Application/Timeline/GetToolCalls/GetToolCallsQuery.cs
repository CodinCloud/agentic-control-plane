using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.ToolCalls;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Timeline.GetToolCalls;

/// <summary>
/// Les appels d'outil d'un agent, dans l'ordre chronologique, entrée et sortie extraites.
///
/// <para><c>AgentId</c> absent (ou la sentinelle <c>main</c>, cohérente avec celle déjà en
/// vigueur sur <c>agentType</c>) désigne la session elle-même : ses appels d'outil portent
/// <c>agent_id IS NULL</c>, puisque la session principale n'est pas un agent.</para>
/// </summary>
public sealed record GetToolCallsQuery(string SessionId, string? AgentId, int Limit) : IQuery<ToolCallsResponse>
{
    public const int DefaultLimit = 500;
    public const int MaxLimit = 2000;

    /// <summary>Même sentinelle que <c>GetEventsQuery.AgentType</c> : une chaîne de requête ne
    /// sait pas transporter un null.</summary>
    public const string MainSessionSentinel = "main";
}

/// <summary>Ordonné par temps <b>croissant</b> — c'est une chronologie, pas un flux.</summary>
public sealed record ToolCallsResponse(IReadOnlyList<ToolCall> Calls);

/// <summary>
/// Un endpoint dédié plutôt qu'un drapeau sur <c>GET /api/events</c> : la liste d'événements
/// omet délibérément <c>Payload</c>, une colonne de 32 Ko, et reconstituer l'in/out par
/// <c>GET /api/events/{id}</c> imposerait un N+1. L'extrait typé, lui, est petit — c'est donc
/// ici, et seulement ici, qu'on paie la lecture du payload.
/// </summary>
internal sealed class GetToolCallsQueryHandler(IApplicationDbContext context)
    : IQueryHandler<GetToolCallsQuery, ToolCallsResponse>
{
    public async Task<Result<ToolCallsResponse>> Handle(GetToolCallsQuery query, CancellationToken cancellationToken)
    {
        bool mainSession = string.IsNullOrWhiteSpace(query.AgentId) ||
                           query.AgentId == GetToolCallsQuery.MainSessionSentinel;

        int limit = Math.Clamp(
            query.Limit <= 0 ? GetToolCallsQuery.DefaultLimit : query.Limit,
            1,
            GetToolCallsQuery.MaxLimit);

        IQueryable<Domain.HookEvents.HookEvent> events = context.HookEvents
            .AsNoTracking()
            .Where(e => e.SessionId == query.SessionId)
            .Where(e => e.ToolName != null)
            .Where(e => e.EventName == "PostToolUse" || e.EventName == "PostToolUseFailure");

        events = mainSession
            ? events.Where(e => e.AgentId == null)
            : events.Where(e => e.AgentId == query.AgentId);

        List<ToolCallSource> sources = await events
            .OrderBy(e => e.ReceivedAtUtc)
            .ThenBy(e => e.Id)
            .Take(limit)
            .Select(e => new ToolCallSource(e.Id, e.ReceivedAtUtc, e.ToolName, e.EventName, e.DurationMs, e.Payload))
            .ToListAsync(cancellationToken);

        List<ToolCall> calls = sources.Select(ToolCallProjection.Project).ToList();

        return Result.Success(new ToolCallsResponse(ToolCallProjection.GroupConsecutiveRepeats(calls)));
    }
}
