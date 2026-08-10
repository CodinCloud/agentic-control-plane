using ControlPlane.Application.Abstractions.Clock;
using ControlPlane.Application.Abstractions.Data;
using ControlPlane.Application.Abstractions.Transcripts;
using ControlPlane.Domain.AgentRuns;
using ControlPlane.Domain.ModelUsages;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ControlPlane.Infrastructure.Transcripts;

/// <summary>
/// Drains the transcript ingestion queue, fed only from Stop/SubagentStop hook events
/// (see <c>RecordHookEventCommandHandler</c>). Runs entirely off the hook ingestion
/// request path: reading a transcript, however large, can never slow down or fail a
/// <c>POST /events</c>.
///
/// <para>
/// Known limitation, accepted at this stage: the same transcript is reread from the start
/// on every Stop of its session (Stop fires per assistant turn, not just at session end),
/// so this is O(transcript size) per turn rather than tracking a byte offset. What keeps
/// it correct — not fast — is that persistence is keyed on <see cref="ModelUsage.MessageId"/>:
/// only ids not already in the database are ever inserted.
/// </para>
/// </summary>
internal sealed class TranscriptIngestionBackgroundService(
    TranscriptIngestionQueue queue,
    IServiceScopeFactory scopeFactory,
    IDateTimeProvider dateTimeProvider,
    ILogger<TranscriptIngestionBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (TranscriptIngestionRequest request in queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await ProcessAsync(request, stoppingToken);
            }
            catch (Exception ex)
            {
                // A missed transcript read must never take down the loop that keeps
                // draining the queue for the rest of the session.
                logger.LogWarning(ex, "Failed to ingest transcript for session {SessionId}; skipping.", request.SessionId);
            }
        }
    }

    private async Task ProcessAsync(TranscriptIngestionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId) || string.IsNullOrWhiteSpace(request.TranscriptPath))
        {
            logger.LogDebug("Transcript ingestion request missing session id or transcript path; skipping.");
            return;
        }

        if (request.EventName == "SubagentStop")
        {
            (List<ModelUsage> usages, List<AgentRun> runs) = ReadSubagentUsagesAndRuns(request.TranscriptPath, request.SessionId);

            if (usages.Count > 0)
            {
                await PersistNewUsagesAsync(usages, cancellationToken);
            }

            if (runs.Count > 0)
            {
                await PersistAgentRunsAsync(runs, cancellationToken);
            }

            return;
        }

        List<ModelUsage> mainSessionUsages = ReadMainSessionUsages(request.TranscriptPath, request.SessionId);

        if (mainSessionUsages.Count > 0)
        {
            await PersistNewUsagesAsync(mainSessionUsages, cancellationToken);
        }
    }

    private List<ModelUsage> ReadMainSessionUsages(string transcriptPath, string sessionId)
    {
        IReadOnlyList<string> lines = TranscriptFileReader.TryReadLines(transcriptPath, logger);

        return TranscriptProjection.Project(
                lines,
                sessionId,
                agentId: null,
                agentType: null,
                taskDescription: null,
                spawnDepth: null,
                fallbackTimestampUtc: dateTimeProvider.UtcNow)
            .ToList();
    }

    /// <summary>
    /// Reads every subagent transcript once and projects it into both the per-message
    /// <see cref="ModelUsage"/> rows and the per-run <see cref="AgentRun"/> row — same lines,
    /// two projections, so the file is only read once per subagent per SubagentStop.
    /// </summary>
    private (List<ModelUsage> Usages, List<AgentRun> Runs) ReadSubagentUsagesAndRuns(string transcriptPath, string sessionId)
    {
        IReadOnlyList<SubagentTranscriptFile> subagents = SubagentTranscriptDiscovery.Discover(transcriptPath, sessionId, logger);

        var usages = new List<ModelUsage>();
        var runs = new List<AgentRun>();

        foreach (SubagentTranscriptFile subagent in subagents)
        {
            IReadOnlyList<string> lines = TranscriptFileReader.TryReadLines(subagent.Path, logger);

            usages.AddRange(TranscriptProjection.Project(
                lines,
                sessionId,
                subagent.AgentId,
                subagent.AgentType,
                subagent.TaskDescription,
                subagent.SpawnDepth,
                dateTimeProvider.UtcNow));

            AgentRun? run = AgentRunProjection.Project(
                lines,
                subagent.AgentId,
                sessionId,
                subagent.AgentType,
                subagent.TaskDescription,
                subagent.SpawnDepth);

            if (run is not null)
            {
                runs.Add(run);
            }
        }

        return (usages, runs);
    }

    private async Task PersistNewUsagesAsync(List<ModelUsage> discovered, CancellationToken cancellationToken)
    {
        using IServiceScope scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

        string[] messageIds = discovered.Select(u => u.MessageId).Distinct().ToArray();

        List<string> existingIds = await context.ModelUsages
            .Where(u => messageIds.Contains(u.MessageId))
            .Select(u => u.MessageId)
            .ToListAsync(cancellationToken);

        var seen = existingIds.ToHashSet();

        // Idempotency: a transcript is reread from the start on every Stop, so most rows
        // here already exist. HashSet.Add doubles as within-batch dedup too.
        List<ModelUsage> newUsages = discovered.Where(u => seen.Add(u.MessageId)).ToList();

        if (newUsages.Count == 0)
        {
            return;
        }

        context.ModelUsages.AddRange(newUsages);
        await context.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Upserts by <see cref="AgentRun.AgentId"/>: a transcript is reread from the start on
    /// every SubagentStop, so this must update the existing row (brief/report can only grow
    /// truer as the run progresses) rather than duplicate it.
    /// </summary>
    private async Task PersistAgentRunsAsync(List<AgentRun> discovered, CancellationToken cancellationToken)
    {
        using IServiceScope scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

        string[] agentIds = discovered.Select(r => r.AgentId).Distinct().ToArray();

        List<AgentRun> existing = await context.AgentRuns
            .Where(r => agentIds.Contains(r.AgentId))
            .ToListAsync(cancellationToken);

        Dictionary<string, AgentRun> existingByAgentId = existing.ToDictionary(r => r.AgentId);

        foreach (AgentRun run in discovered)
        {
            if (existingByAgentId.TryGetValue(run.AgentId, out AgentRun? current))
            {
                current.Refresh(
                    run.AgentType,
                    run.TaskDescription,
                    run.SpawnDepth,
                    run.Brief,
                    run.BriefTruncated,
                    run.Report,
                    run.ReportTruncated);
            }
            else
            {
                context.AgentRuns.Add(run);
            }
        }

        await context.SaveChangesAsync(cancellationToken);
    }
}
