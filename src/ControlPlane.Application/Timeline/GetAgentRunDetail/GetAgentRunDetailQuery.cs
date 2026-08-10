using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Messaging;
using ControlPlane.Domain.Abstractions;
using ControlPlane.Domain.AgentRuns;
using Microsoft.EntityFrameworkCore;

namespace ControlPlane.Application.Timeline.GetAgentRunDetail;

/// <summary>The detail panel behind a click on a timeline bar — same lane, plus brief and report.</summary>
public sealed record GetAgentRunDetailQuery(string AgentId) : IQuery<AgentRunDetail>;

public sealed record AgentRunDetail(
    string AgentId,
    string? AgentType,
    string? TaskDescription,
    DateTime StartedAt,
    DateTime? EndedAt,
    long DurationMs,
    int Messages,
    long BillableTokens,
    long CacheReadTokens,
    string? Model,
    int? SpawnDepth,
    string Brief,
    string Report,
    bool BriefTruncated,
    bool ReportTruncated);

/// <summary>
/// Tokens and model come from <c>ModelUsage</c>, brief/report/task description/spawn depth
/// from <see cref="AgentRun"/>, closure (open vs. closed bar) from <c>HookEvent</c> — same
/// three-source split as <c>GetTimelineQueryHandler</c>, just for one agent.
/// </summary>
internal sealed class GetAgentRunDetailQueryHandler(IApplicationDbContext context, IDateTimeProvider dateTimeProvider)
    : IQueryHandler<GetAgentRunDetailQuery, AgentRunDetail>
{
    private static readonly TimeSpan InProgressThreshold = TimeSpan.FromMinutes(2);

    public async Task<Result<AgentRunDetail>> Handle(GetAgentRunDetailQuery query, CancellationToken cancellationToken)
    {
        AgentRun? run = await context.AgentRuns
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.AgentId == query.AgentId, cancellationToken);

        if (run is null)
        {
            return Result.Failure<AgentRunDetail>(AgentRunErrors.NotFound(query.AgentId));
        }

        List<UsageRow> usageRows = await context.ModelUsages
            .AsNoTracking()
            .Where(u => u.AgentId == query.AgentId)
            .Select(u => new UsageRow(
                u.Id,
                u.AgentType,
                u.Model,
                u.TimestampUtc,
                u.InputTokens,
                u.OutputTokens,
                u.CacheCreationTokens,
                u.CacheReadTokens))
            .ToListAsync(cancellationToken);

        DateTime now = dateTimeProvider.UtcNow;

        if (usageRows.Count == 0)
        {
            // The agent run row exists (its .meta.json / brief were captured) but no
            // assistant message has landed in ModelUsage yet — a lane with no bar width.
            return Result.Success(new AgentRunDetail(
                run.AgentId,
                run.AgentType,
                run.TaskDescription,
                now,
                now,
                0,
                0,
                0,
                0,
                null,
                run.SpawnDepth,
                run.Brief,
                run.Report,
                run.BriefTruncated,
                run.ReportTruncated));
        }

        bool closed = await context.HookEvents
            .AsNoTracking()
            .AnyAsync(e => e.EventName == "SubagentStop" && e.AgentId == query.AgentId, cancellationToken);

        DateTime startedAt = usageRows.Min(u => u.TimestampUtc);
        DateTime lastMessageAt = usageRows.Max(u => u.TimestampUtc);
        DateTime? endedAt = ResolveEndedAt(lastMessageAt, now, closed);
        long durationMs = (long)((endedAt ?? now) - startedAt).TotalMilliseconds;
        long billable = usageRows.Sum(u => (long)u.InputTokens + u.OutputTokens + u.CacheCreationTokens);
        long cacheRead = usageRows.Sum(u => (long)u.CacheReadTokens);
        UsageRow last = usageRows.OrderByDescending(u => u.Id).First();

        var detail = new AgentRunDetail(
            run.AgentId,
            last.AgentType ?? run.AgentType,
            run.TaskDescription,
            startedAt,
            endedAt,
            durationMs,
            usageRows.Count,
            billable,
            cacheRead,
            last.Model,
            run.SpawnDepth,
            run.Brief,
            run.Report,
            run.BriefTruncated,
            run.ReportTruncated);

        return Result.Success(detail);
    }

    private static DateTime? ResolveEndedAt(DateTime lastMessageAt, DateTime now, bool closed)
    {
        bool inProgress = !closed && now - lastMessageAt < InProgressThreshold;
        return inProgress ? null : lastMessageAt;
    }

    private sealed record UsageRow(
        long Id,
        string? AgentType,
        string? Model,
        DateTime TimestampUtc,
        int InputTokens,
        int OutputTokens,
        int CacheCreationTokens,
        int CacheReadTokens);
}
