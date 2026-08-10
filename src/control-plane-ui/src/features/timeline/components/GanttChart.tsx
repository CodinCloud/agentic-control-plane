import { useCallback, useMemo, useState } from 'react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StreamStatusIndicator } from '@/features/observability';
import { useAppStore } from '@/store/useAppStore';
import { useTimeline, type TimelineRange } from '../hooks/useTimeline';
import { useNowTick } from '../hooks/useNowTick';
import { TimelineDomain } from '../domain/TimelineDomain';
import { TIMELINE_ACTIVE_SESSIONS, TIMELINE_ALL_SESSIONS } from '../timelineTypes';
import { SessionGroup } from './SessionGroup';
import { TimelineAxis } from './TimelineAxis';
import { RangeSelector } from './RangeSelector';
import { SessionSelector } from './SessionSelector';
import { AgentDetailPanel } from './AgentDetailPanel';
import { AgentChips } from './AgentChips';
import { AgentTrack } from './AgentTrack';

const DEFAULT_RANGE: TimelineRange = 'session';
const SKELETON_ROWS = 4;

export interface GanttChartProps {
  /**
   * Session imposée — écran d'analyse. Absent : la portée est pilotée par le
   * filtre du store, c'est-à-dire la tour de contrôle.
   */
  lockedSessionId?: string;
  /** Agent dont la piste de zoom est ouverte. Porté par l'URL, pas par un état local. */
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

/**
 * Gantt du cycle de vie des agents — un groupe visuel par session, empilés, sur
 * un axe de temps commun pour que deux sessions parallèles restent comparables.
 * Lecture seule : aucun glisser-déposer, aucune édition.
 *
 * Sous chaque session, un bandeau de puces (une par instance d'agent) ; cliquer
 * une puce ouvre la piste de zoom de cet agent, avec ses appels d'outil. Le
 * Gantt lui-même n'est jamais masqué : vue d'ensemble et vue rapprochée
 * coexistent. Voir plans/005-gantt-exploitable.md.
 */
export function GanttChart({ lockedSessionId, selectedAgentId, onSelectAgent }: GanttChartProps) {
  const [range, setRange] = useState<TimelineRange>(DEFAULT_RANGE);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const storeFilter = useAppStore((state) => state.timelineSessionFilter);
  const setStoreFilter = useAppStore((state) => state.setTimelineSessionFilter);

  // Sur l'écran d'analyse la session est imposée : le filtre du store ne doit
  // ni s'appliquer ni être offert.
  const sessionFilter = lockedSessionId ?? storeFilter;
  const locked = lockedSessionId !== undefined;

  const { timeline, isLoading, isError, error, refetch, streamStatus, sessionOptions } = useTimeline(
    range,
    sessionFilter,
  );
  const now = useNowTick();

  const sessions = useMemo(
    () => TimelineDomain.applySessionFilter(timeline?.sessions ?? [], sessionFilter),
    [timeline?.sessions, sessionFilter],
  );

  const maxBillableTokens = useMemo(
    () => TimelineDomain.maxBillableTokens(sessions.flatMap((session) => session.lanes)),
    [sessions],
  );

  const hasAnyLane = useMemo(() => sessions.some((session) => session.lanes.length > 0), [sessions]);

  const effectiveWindow = useMemo(() => {
    if (!timeline) return undefined;
    return TimelineDomain.fitWindowToSessions(sessions, now) ?? TimelineDomain.extendWindowToNow(timeline.window, now);
  }, [timeline, sessions, now]);

  const handleSelectAgent = useCallback((agentId: string) => onSelectAgent(agentId), [onSelectAgent]);
  const handleClosePanel = useCallback(() => setDetailAgentId(null), []);

  const hiddenByActiveFilter =
    !locked &&
    sessionFilter === TIMELINE_ACTIVE_SESSIONS &&
    sessions.length === 0 &&
    (timeline?.sessions.length ?? 0) > 0;

  return (
    <>
      <SectionCard
        title="Chronologie des agents"
        description="Une lane par agent — largeur = durée, épaisseur = tokens"
        action={
          <div className="flex items-center gap-2">
            <StreamStatusIndicator status={streamStatus} />
            {!locked ? (
              <SessionSelector value={sessionFilter} onChange={setStoreFilter} options={sessionOptions} />
            ) : null}
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
        ) : hiddenByActiveFilter ? (
          <EmptyState
            title="Aucune session active"
            description="Rien n'a émis d'activité depuis moins de 5 minutes. Les sessions plus anciennes sont masquées par le filtre."
            action={
              <Button variant="outline" size="sm" onClick={() => setStoreFilter(TIMELINE_ALL_SESSIONS)}>
                Voir toutes les sessions
              </Button>
            }
          />
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/20 p-3 text-sm text-neutral-500">
            Aucune session dans cette fenêtre — base vide.
          </div>
        ) : (
          <div className="max-h-[72vh] overflow-y-auto">
            {hasAnyLane ? <TimelineAxis window={effectiveWindow ?? timeline.window} /> : null}

            <div className="flex flex-col gap-6">
              {sessions.map((session) => {
                // Un agentId est globalement unique : seule la session qui le
                // contient ouvre sa piste.
                const trackAgentId =
                  selectedAgentId !== null &&
                  (selectedAgentId === 'main' || session.lanes.some((lane) => lane.agentId === selectedAgentId))
                    ? selectedAgentId
                    : null;

                return (
                  <div key={session.sessionId} className="flex flex-col gap-3">
                    <SessionGroup
                      session={session}
                      window={effectiveWindow ?? timeline.window}
                      maxBillableTokens={maxBillableTokens}
                      onSelectAgent={handleSelectAgent}
                    />

                    <AgentChips
                      session={session}
                      selectedAgentId={trackAgentId}
                      onSelect={onSelectAgent}
                    />

                    {trackAgentId ? (
                      <AgentTrack session={session} agentId={trackAgentId} onOpenDetail={setDetailAgentId} />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {!hasAnyLane ? (
              <div className="mt-3">
                <EmptyState
                  title="Aucun agent dans cette plage"
                  description="Aucun sous-agent n'a tourné sur la fenêtre sélectionnée. Essayez « Session entière »."
                />
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      <AgentDetailPanel agentId={detailAgentId} onClose={handleClosePanel} />
    </>
  );
}
