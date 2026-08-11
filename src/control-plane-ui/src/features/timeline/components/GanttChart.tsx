import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/core';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StreamStatusIndicator } from '@/features/observability';
import { useAppStore } from '@/store/useAppStore';
import { useTimeline, TIMELINE_RANGE_SPAN_MS, type TimelineRange } from '../hooks/useTimeline';
import { useNowTick } from '../hooks/useNowTick';
import { TimelineDomain } from '../domain/TimelineDomain';
import { TIMELINE_ACTIVE_SESSIONS, TIMELINE_ALL_SESSIONS } from '../timelineTypes';
import { SessionGroup } from './SessionGroup';
import { TimelineAxis } from './TimelineAxis';
import { TimelineGridOverlay } from './TimelineGridOverlay';
import { RangeSelector } from './RangeSelector';
import { SessionSelector } from './SessionSelector';
import { AgentDetailPanel } from './AgentDetailPanel';
import { AgentChips } from './AgentChips';
import { AgentTrack } from './AgentTrack';

const SKELETON_ROWS = 4;

export interface GanttChartProps {
  /**
   * Session imposée — écran d'analyse. Absent : la portée est pilotée par le
   * filtre du store, c'est-à-dire la tour de contrôle.
   */
  lockedSessionId?: string;
  /**
   * Jeton `sessionId::agentId` de la piste de zoom ouverte. Porté par l'URL,
   * pas par un état local — et **qualifié par la session** : « main » désigne
   * la session principale de chacune, si bien qu'un `agentId` nu ouvrait la
   * piste dans toutes les sessions à la fois (plan 007, décision #6).
   */
  selectedAgentId: string | null;
  onSelectAgent: (token: string | null) => void;
  /**
   * Plage par défaut. La tour de contrôle démarre sur une fenêtre vivante de
   * 10 min ; l'écran d'analyse veut la session entière.
   */
  defaultRange?: TimelineRange;
  className?: string;
  /**
   * La carte occupe la hauteur que lui laisse son parent flex et les lanes
   * défilent à l'intérieur. C'est ce qui donne à la chronologie une part
   * revendiquée de l'écran — la moitié sur la tour de contrôle — au lieu d'un
   * plafond `max-h` qui la laisse rétrécir avec son contenu.
   */
  fill?: boolean;
}

/**
 * Gantt du cycle de vie des agents — un groupe visuel par session, empilés, sur
 * un axe de temps commun pour que deux sessions parallèles restent comparables.
 * Lecture seule : aucun glisser-déposer, aucune édition.
 *
 * Deux régimes de fenêtre (plan 007, décision #1) : **vivant**, où l'axe glisse
 * sous les barres et ancre « maintenant » à 85 % de la largeur ; et **analyse**,
 * où l'axe épouse les bornes du contenu données par le serveur. Le second était
 * seul en place et produisait, sur la tour de contrôle, 18 h d'échelle pour une
 * minute de contenu.
 *
 * Sous chaque session, un bandeau de puces (une par instance d'agent) ; cliquer
 * une puce ouvre la piste de zoom de cet agent, avec ses appels d'outil. Le
 * Gantt lui-même n'est jamais masqué : vue d'ensemble et vue rapprochée
 * coexistent. Voir plans/005-gantt-exploitable.md.
 */
export function GanttChart({
  lockedSessionId,
  selectedAgentId,
  onSelectAgent,
  defaultRange = '10m',
  className,
  fill = false,
}: GanttChartProps) {
  const [range, setRange] = useState<TimelineRange>(defaultRange);
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

  // Jamais par lane : un agent tranquille ne doit pas paraître aussi dense
  // que la session principale (plan 006, décision #10).
  const maxDensityCount = useMemo(
    () => TimelineDomain.maxDensityCount(sessions.flatMap((session) => session.lanes)),
    [sessions],
  );

  /**
   * Le cœur de la correction. En régime vivant la fenêtre se déduit de
   * l'horloge seule — donc elle glisse à chaque tick, ce qui *est* le
   * défilement. En régime d'analyse elle reste ce que le serveur dit du
   * contenu (`contentSince`/`contentUntil`, plan 006 décision #7).
   */
  const spanMs = TIMELINE_RANGE_SPAN_MS[range];
  const effectiveWindow = useMemo(() => {
    if (!timeline) return undefined;
    if (spanMs === null) return TimelineDomain.contentWindow(timeline.window);
    return { ...timeline.window, ...TimelineDomain.livingWindow(now, spanMs) };
  }, [timeline, spanMs, now]);

  const nowPct = effectiveWindow ? TimelineDomain.nowMarkerPct(effectiveWindow, now) : null;

  const handleClosePanel = useCallback(() => setDetailAgentId(null), []);

  const hiddenByActiveFilter =
    !locked &&
    sessionFilter === TIMELINE_ACTIVE_SESSIONS &&
    sessions.length === 0 &&
    (timeline?.sessions.length ?? 0) > 0;

  return (
    <>
      <SectionCard
        className={className}
        fill={fill}
        title="Chronologie des agents"
        description={
          spanMs === null
            ? 'Une lane par agent — largeur = durée, épaisseur = tokens'
            : 'Fenêtre glissante — « maintenant » est fixe, le temps défile dessous'
        }
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
          <EmptyState
            title="Rien dans cette fenêtre"
            description={
              spanMs === null
                ? 'Aucune session en base.'
                : "Aucune activité sur la plage choisie. Élargis-la, ou lance un agent — la fenêtre est vivante, il apparaîtra tout seul."
            }
          />
        ) : (
          <div className={cn('relative overflow-y-auto', fill ? 'min-h-0 flex-1' : 'max-h-[72vh]')}>
            <TimelineAxis window={effectiveWindow ?? timeline.window} nowPct={nowPct} sticky />

            {/* Une seule surcouche pour toute la pile de sessions — la grille
                est faite d'instants, pas de propriétés de rangée. */}
            <div className="relative">
              <TimelineGridOverlay window={effectiveWindow ?? timeline.window} nowPct={nowPct} />

              <div className="relative flex flex-col gap-5">
                {sessions.map((session) => {
                  // Le jeton est qualifié : sélectionner « main » dans une
                  // session n'ouvre plus la piste dans toutes les autres.
                  const trackAgentId = TimelineDomain.agentIdFromToken(selectedAgentId, session.sessionId);
                  const known = trackAgentId !== null && session.lanes.some((lane) => lane.agentId === trackAgentId);

                  return (
                    <div key={session.sessionId} className="flex flex-col gap-2">
                      <SessionGroup
                        session={session}
                        window={effectiveWindow ?? timeline.window}
                        maxBillableTokens={maxBillableTokens}
                        maxDensityCount={maxDensityCount}
                        now={now}
                        selectedAgentId={known ? trackAgentId : null}
                        onSelectAgent={(agentId) =>
                          onSelectAgent(
                            known && trackAgentId === agentId
                              ? null
                              : TimelineDomain.selectionToken(session.sessionId, agentId),
                          )
                        }
                      />

                      <AgentChips
                        session={session}
                        selectedAgentId={known ? trackAgentId : null}
                        onSelect={(agentId) =>
                          onSelectAgent(
                            agentId === null ? null : TimelineDomain.selectionToken(session.sessionId, agentId),
                          )
                        }
                      />

                      {known ? (
                        <AgentTrack session={session} agentId={trackAgentId} onOpenDetail={setDetailAgentId} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <AgentDetailPanel agentId={detailAgentId} onClose={handleClosePanel} />
    </>
  );
}
