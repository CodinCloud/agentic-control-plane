import { useCallback, useMemo, useState } from 'react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StreamStatusIndicator } from '@/features/observability';
import { useTimeline, type TimelineRange } from '../hooks/useTimeline';
import { useNowTick } from '../hooks/useNowTick';
import { TimelineDomain } from '../domain/TimelineDomain';
import { MainSessionBanner } from './MainSessionBanner';
import { TimelineAxis } from './TimelineAxis';
import { AgentLaneRow } from './AgentLaneRow';
import { RangeSelector } from './RangeSelector';
import { AgentDetailPanel } from './AgentDetailPanel';

const DEFAULT_RANGE: TimelineRange = 'session';
const SKELETON_ROWS = 4;

/**
 * Read-only Gantt of the agent lifecycle — one lane per agent instance, a
 * bandeau above for the main session. No drag, no edit, no dependencies.
 * See plans/002-timeline-agents.md.
 */
export function GanttChart() {
  const [range, setRange] = useState<TimelineRange>(DEFAULT_RANGE);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const { timeline, isLoading, isError, error, refetch, streamStatus } = useTimeline(range);
  const now = useNowTick();

  const maxBillableTokens = useMemo(
    () => TimelineDomain.maxBillableTokens(timeline?.lanes ?? []),
    [timeline?.lanes],
  );

  // An ongoing bar's right edge tracks the local clock, not just the last
  // fetch — see TimelineDomain.extendWindowToNow. Computed once per render
  // (not per lane) and re-derived on every `now` tick.
  const effectiveWindow = useMemo(
    () => (timeline ? TimelineDomain.extendWindowToNow(timeline.window, now) : undefined),
    [timeline, now],
  );

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleClosePanel = useCallback(() => setSelectedAgentId(null), []);

  return (
    <>
      <SectionCard
        title="Chronologie des agents"
        description="Une lane par agent — largeur = durée, épaisseur = tokens"
        action={
          <div className="flex items-center gap-2">
            <StreamStatusIndicator status={streamStatus} />
            <RangeSelector value={range} onChange={setRange} />
          </div>
        }
      >
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : isError || !timeline ? (
          <EmptyState
            variant="error"
            title="Impossible de charger la chronologie"
            description={error instanceof Error ? error.message : 'Le serveur est-il lancé sur le port 4317 ?'}
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Réessayer
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <MainSessionBanner mainSession={timeline.mainSession} />

            {timeline.lanes.length === 0 ? (
              <EmptyState
                title="Aucun agent dans cette plage"
                description="Aucun sous-agent n'a tourné sur la fenêtre sélectionnée. Essayez « Session entière »."
              />
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <TimelineAxis window={effectiveWindow ?? timeline.window} />
                <div className="rounded-md border border-neutral-800">
                  {timeline.lanes.map((lane) => (
                    <AgentLaneRow
                      key={lane.agentId}
                      lane={lane}
                      window={effectiveWindow ?? timeline.window}
                      maxBillableTokens={maxBillableTokens}
                      onSelect={handleSelectAgent}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <AgentDetailPanel agentId={selectedAgentId} onClose={handleClosePanel} />
    </>
  );
}
