import { useCallback, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventStream } from '@/features/observability';
import { timelineService } from '../application/TimelineService';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineSessionFilter, TimelineSessionOption } from '../timelineTypes';

const TIMELINE_STALE_TIME_MS = 30 * 1000;

/**
 * How long to wait, after the *last* stream event, before invalidating the
 * timeline query — a `PostToolUse` fires on every tool call, so refetching
 * on each frame would hammer the API. Debounce (reset-on-each-event), not
 * throttle: we want one refresh shortly after a burst goes quiet, not one
 * every N ms during the burst. See plan §"Temps réel".
 */
const TIMELINE_REFRESH_DEBOUNCE_MS = 2000;

/**
 * Deux plages, pas trois : « dernier tour » a été retiré, il ne servait pas.
 * Sa disparition emporte tout le mécanisme qui l'alimentait — l'état
 * `lastTurnStartedAt` et son repli par approximation. Le champ reste dans le
 * contrat d'API (`TimelineWindow.lastTurnStartedAt`), simplement plus lu ici.
 */
export const TIMELINE_RANGES = [
  { value: 'session', label: 'Session entière' },
  { value: 'hour', label: 'Dernière heure' },
] as const;

export type TimelineRange = (typeof TIMELINE_RANGES)[number]['value'];

const HOUR_LOOKBACK_MS = 60 * 60 * 1000;

/** « Session entière » omet `since` et laisse le serveur renvoyer sa fenêtre complète. */
function sinceFromRange(range: TimelineRange): string | undefined {
  return range === 'session' ? undefined : new Date(Date.now() - HOUR_LOOKBACK_MS).toISOString();
}

/**
 * Timeline (Gantt) data for the selected range and session filter, kept live
 * by a WebSocket subscription on `/stream` (debounced) — an ongoing bar's
 * own visual growth between refetches is handled client-side in
 * TimelineDomain.extendWindowToNow.
 *
 * `sessionFilter` : les deux sentinelles (actives / toutes) se résolvent côté
 * client sur `isActive` et n'atteignent jamais le serveur — d'où la même
 * requête pour les deux, et donc aucun refetch quand on bascule de l'une à
 * l'autre. Un `sessionId` réel, lui, restreint la requête.
 */
export function useTimeline(range: TimelineRange, sessionFilter: TimelineSessionFilter) {
  const queryClient = useQueryClient();
  const [sessionOptions, setSessionOptions] = useState<TimelineSessionOption[]>([]);

  const sessionId = TimelineDomain.toServerSessionId(sessionFilter);

  // La clé identifie *ce qui* est demandé au serveur (la plage et la session
  // effectivement filtrée), jamais un horodatage calculé : `since` est le
  // *comment* et se recalcule dans `queryFn` à l'appel, pour qu'une
  // invalidation déclenchée par le flux refetch avec un lookback à jour au
  // lieu de créer une nouvelle entrée de cache — et un état de chargement —
  // à chaque événement WebSocket. C'est la régression contre laquelle le plan
  // met en garde (§"Piège à éviter").
  const queryKey = ['timeline', 'list', range, sessionId] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await timelineService.getTimeline(sinceFromRange(range), sessionId ?? undefined);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    staleTime: TIMELINE_STALE_TIME_MS,
    // Keep the previous range's data on screen while the new range loads,
    // instead of dropping straight to skeletons — see plan bug #1.
    placeholderData: keepPreviousData,
  });

  // The session selector needs the *full* list of sessions to offer, but a
  // filtered fetch only ever returns the one selected session (plan §"Contrat
  // d'API", decision #3) — narrowing would otherwise collapse the dropdown to
  // a single entry the moment a filter is applied. An unfiltered fetch is
  // authoritative and replaces the list outright; a filtered fetch only ever
  // merges its one session in, never dropping what was already known.
  useEffect(() => {
    const sessions = query.data?.sessions;
    if (!sessions) return;
    if (sessionId === null) {
      setSessionOptions(sessions.map((session) => ({ sessionId: session.sessionId, project: session.project })));
      return;
    }
    const [onlySession] = sessions;
    if (!onlySession) return;
    setSessionOptions((current) =>
      current.some((option) => option.sessionId === onlySession.sessionId)
        ? current
        : [...current, { sessionId: onlySession.sessionId, project: onlySession.project }],
    );
  }, [query.data, sessionId]);

  const debounceTimeoutRef = useRef<number | undefined>(undefined);

  const handleStreamEvent = useCallback(() => {
    if (debounceTimeoutRef.current !== undefined) window.clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['timeline', 'list'] });
    }, TIMELINE_REFRESH_DEBOUNCE_MS);
  }, [queryClient]);

  useEffect(
    () => () => {
      if (debounceTimeoutRef.current !== undefined) window.clearTimeout(debounceTimeoutRef.current);
    },
    [],
  );

  const { status: streamStatus } = useEventStream({ onEvent: handleStreamEvent });

  return {
    timeline: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    streamStatus,
    sessionOptions,
  };
}
