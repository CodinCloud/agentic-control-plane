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

const DEFAULT_RANGE: TimelineRange = 'session';
const SKELETON_ROWS = 4;

/**
 * Read-only Gantt of the agent lifecycle across every session touching the
 * window — one visual group per session (bandeau + its own lanes), stacked,
 * sharing one time axis so parallel sessions stay comparable at a glance.
 * No drag, no edit, no dependencies. See plans/003-multi-sessions.md.
 *
 * Le filtre par défaut est « sessions actives » : ce qui tourne maintenant est
 * ce qu'on regarde. Conséquence assumée — quand rien n'a bougé depuis 5 minutes
 * l'écran est vide, d'où l'état vide dédié qui offre la bascule vers toutes les
 * sessions plutôt que de laisser croire à une base vide.
 */
export function GanttChart() {
  const [range, setRange] = useState<TimelineRange>(DEFAULT_RANGE);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const sessionFilter = useAppStore((state) => state.timelineSessionFilter);
  const setSessionFilter = useAppStore((state) => state.setTimelineSessionFilter);
  const { timeline, isLoading, isError, error, refetch, streamStatus, sessionOptions } = useTimeline(
    range,
    sessionFilter,
  );
  const now = useNowTick();

  // Tout ce qui suit se calcule sur les sessions *visibles*, jamais sur la
  // réponse brute : l'axe, l'épaisseur des barres et l'état vide doivent
  // refléter ce qui est à l'écran, pas ce que le serveur a renvoyé.
  const sessions = useMemo(
    () => TimelineDomain.applySessionFilter(timeline?.sessions ?? [], sessionFilter),
    [timeline?.sessions, sessionFilter],
  );

  const maxBillableTokens = useMemo(
    () => TimelineDomain.maxBillableTokens(sessions.flatMap((session) => session.lanes)),
    [sessions],
  );

  const hasAnyLane = useMemo(() => sessions.some((session) => session.lanes.length > 0), [sessions]);

  // The axis fits everything actually on screen — every session's own
  // bounds plus every lane across every session (TimelineDomain.fitWindowToSessions)
  // — not the server's declared window, which defaults to a 24h lookback for
  // "Session entière" and would crush a few hours of real data into a
  // sliver. Falls back to the server window (still stretched to "now" for an
  // ongoing session) only when there is nothing to fit against. Computed
  // once per render (not per session) and re-derived on every `now` tick so
  // an ongoing bar's right edge keeps tracking the local clock.
  const effectiveWindow = useMemo(() => {
    if (!timeline) return undefined;
    return TimelineDomain.fitWindowToSessions(sessions, now) ?? TimelineDomain.extendWindowToNow(timeline.window, now);
  }, [timeline, sessions, now]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleClosePanel = useCallback(() => setSelectedAgentId(null), []);

  // Rien à l'écran alors que le serveur a bien renvoyé des sessions : c'est le
  // filtre qui les masque, pas la base qui est vide. La distinction change le
  // message et l'issue proposée.
  const hiddenByActiveFilter =
    sessionFilter === TIMELINE_ACTIVE_SESSIONS && sessions.length === 0 && (timeline?.sessions.length ?? 0) > 0;

  return (
    <>
      <SectionCard
        title="Chronologie des agents"
        description="Une lane par agent — largeur = durée, épaisseur = tokens"
        action={
          <div className="flex items-center gap-2">
            <StreamStatusIndicator status={streamStatus} />
            <SessionSelector value={sessionFilter} onChange={setSessionFilter} options={sessionOptions} />
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
              <Button variant="outline" size="sm" onClick={() => setSessionFilter(TIMELINE_ALL_SESSIONS)}>
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
            <div className="flex flex-col gap-4">
              {sessions.map((session) => (
                <SessionGroup
                  key={session.sessionId}
                  session={session}
                  window={effectiveWindow ?? timeline.window}
                  maxBillableTokens={maxBillableTokens}
                  onSelectAgent={handleSelectAgent}
                />
              ))}
            </div>

            {/* Only shown once *no* session anywhere has an agent — a single
                session without one already gets its own discrete note in
                SessionGroup, this must not stack on top of it (plan
                §"Ce qu'il faut faire"). */}
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

      <AgentDetailPanel agentId={selectedAgentId} onClose={handleClosePanel} />
    </>
  );
}
