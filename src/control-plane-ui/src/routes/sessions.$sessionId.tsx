import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Zap } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { StatCard } from '@/components/vloc/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { ObservabilityDomain } from '@/features/observability';
import { GanttChart, TimelineDomain, useTimeline, type TimelineSession } from '@/features/timeline';

interface SessionAnalysisSearch {
  agent?: string;
}

/**
 * Analyse d'une session — REST, pas de temps réel. C'est ici que vit le coût :
 * la ventilation par agent est du post-mortem (plans/005, décision #10).
 *
 * Le coût par agent se déduit des lanes, sans requête supplémentaire — chaque
 * lane porte désormais son propre `costUsd`.
 */
function SessionAnalysis() {
  const { sessionId } = Route.useParams();
  const { agent } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { timeline, isLoading, isError } = useTimeline('session', sessionId);

  const session = timeline?.sessions.find((candidate) => candidate.sessionId === sessionId);

  return (
    <>
      <SectionCard
        title={`Session ${sessionId.slice(0, 8)}`}
        description={session?.project ?? 'Analyse de session'}
        icon={<Zap className="h-4 w-4" />}
      >
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !session ? (
          <EmptyState
            title="Session introuvable"
            description="Cette session n'est pas dans la fenêtre courante, ou n'existe pas."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Sous-agents compris — voir TimelineSession.costUsd. */}
              <StatCard
                label="Coût équivalent API"
                value={ObservabilityDomain.formatCostUsd(session.costUsd)}
                hint="sous-agents compris"
              />
              <StatCard
                label="Tokens de la session"
                value={TimelineDomain.formatTokens(session.billableTokens)}
                hint="hors sous-agents"
              />
              <StatCard label="Messages" value={session.messages} />
              <StatCard label="Agents" value={session.lanes.length} />
            </div>

            <AgentCostTable session={session} />
          </div>
        )}
      </SectionCard>

      <GanttChart
        lockedSessionId={sessionId}
        selectedAgentId={agent ?? null}
        onSelectAgent={(agentId) =>
          void navigate({ search: { agent: agentId ?? undefined }, replace: true })
        }
      />
    </>
  );
}

/** Ventilation du coût par instance d'agent, triée du plus cher au moins cher. */
function AgentCostTable({ session }: { session: TimelineSession }) {
  const rows = [...session.lanes].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-800 p-3 text-sm text-neutral-500">
        Aucun sous-agent sur cette session — tout le travail a été fait dans la session principale.
      </div>
    );
  }

  const total = rows.reduce((sum, lane) => sum + (lane.costUsd ?? 0), 0);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((lane) => {
        const share = total > 0 ? (lane.costUsd ?? 0) / total : 0;

        return (
          <li key={lane.agentId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-sky-400" title={lane.agentId}>
                {lane.agentType} <span className="font-mono text-xs text-neutral-500">{lane.agentId.slice(0, 6)}</span>
              </span>
              <span className="shrink-0 tabular-nums text-neutral-200">
                {ObservabilityDomain.formatCostUsd(lane.costUsd)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm text-neutral-500">
              <span className="tabular-nums">
                {TimelineDomain.formatTokens(lane.billableTokens)} tk ·{' '}
                {TimelineDomain.formatDuration(lane.durationMs)}
              </span>
              <span className="tabular-nums">{ObservabilityDomain.formatPercent(share)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionAnalysis,
  validateSearch: (search: Record<string, unknown>): SessionAnalysisSearch => ({
    agent: typeof search.agent === 'string' && search.agent.length > 0 ? search.agent : undefined,
  }),
});
