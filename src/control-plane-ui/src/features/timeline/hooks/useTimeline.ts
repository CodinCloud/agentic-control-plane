import { useCallback, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventStream } from '@/features/observability';
import { timelineService } from '../application/TimelineService';
import type { TimelineSessionOption } from '../timelineTypes';

const TIMELINE_STALE_TIME_MS = 30 * 1000;

/**
 * How long to wait, after the *last* stream event, before invalidating the
 * timeline query — a `PostToolUse` fires on every tool call, so refetching
 * on each frame would hammer the API. Debounce (reset-on-each-event), not
 * throttle: we want one refresh shortly after a burst goes quiet, not one
 * every N ms during the burst. See plan §"Temps réel".
 */
const TIMELINE_REFRESH_DEBOUNCE_MS = 2000;

export const TIMELINE_RANGES = [
  { value: 'session', label: 'Session entière' },
  { value: 'hour', label: 'Dernière heure' },
  { value: 'turn', label: 'Dernier tour' },
] as const;

export type TimelineRange = (typeof TIMELINE_RANGES)[number]['value'];

/**
 * Fallback lookback for "dernier tour" when the server reports no
 * `lastTurnStartedAt` (no `UserPromptSubmit` fired in the resolved session
 * yet — e.g. fresh database). Not the nominal path: once a real turn
 * boundary is known, `since` is that exact timestamp, not an approximation.
 */
const TURN_FALLBACK_LOOKBACK_MS = 15 * 60 * 1000;
const HOUR_LOOKBACK_MS = 60 * 60 * 1000;

/**
 * `since` values for the "dernière heure" / "dernier tour" range options.
 * "Session entière" omits `since` so the server returns its full window.
 * "Dernier tour" uses the server's own turn boundary (`lastTurnStartedAt`,
 * carried over from the most recent successful fetch of any range) once
 * known; before that — or if the session has no turn yet — it falls back
 * to a lookback.
 */
function sinceFromRange(range: TimelineRange, lastTurnStartedAt: string | null): string | undefined {
  if (range === 'session') return undefined;
  if (range === 'hour') return new Date(Date.now() - HOUR_LOOKBACK_MS).toISOString();
  return lastTurnStartedAt ?? new Date(Date.now() - TURN_FALLBACK_LOOKBACK_MS).toISOString();
}

/**
 * Timeline (Gantt) data for the selected range and session filter, kept live
 * by a WebSocket subscription on `/stream` (debounced) — an ongoing bar's
 * own visual growth between refetches is handled client-side in
 * TimelineDomain.extendWindowToNow.
 *
 * `sessionId`: `null` = "Toutes les sessions" (plan decision #1); a value
 * narrows the request to that one session (plan §"Contrat d'API").
 */
export function useTimeline(range: TimelineRange, sessionId: string | null) {
  const queryClient = useQueryClient();
  const [lastTurnStartedAt, setLastTurnStartedAt] = useState<string | null>(null);
  const [sessionOptions, setSessionOptions] = useState<TimelineSessionOption[]>([]);

  // `lastTurnStartedAt` only refines the "dernier tour" boundary — it must
  // never enter the query key. The key identifies *what* is being fetched
  // (the range and the session filter); `since` is *how* to fetch it right
  // now, and is computed fresh inside `queryFn` at call time so a
  // stream-driven invalidation always refetches with an up-to-date lookback
  // instead of minting a new cache entry (and a fresh loading state) on
  // every WebSocket event. This is the exact regression the plan warns
  // against (§"Piège à éviter") — no computed timestamp belongs in the key.
  const queryKey = ['timeline', 'list', range, sessionId] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const since = sinceFromRange(range, lastTurnStartedAt);
      const result = await timelineService.getTimeline(since, sessionId ?? undefined);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    staleTime: TIMELINE_STALE_TIME_MS,
    // Keep the previous range's data on screen while the new range loads,
    // instead of dropping straight to skeletons — see plan bug #1.
    placeholderData: keepPreviousData,
  });

  // `lastTurnStartedAt` is session-wide (independent of `since`), so any
  // successful fetch — whichever range triggered it — can refine the exact
  // "dernier tour" boundary for the next `turn` query.
  useEffect(() => {
    const fetched = query.data?.window.lastTurnStartedAt ?? null;
    setLastTurnStartedAt((current) => (current === fetched ? current : fetched));
  }, [query.data?.window.lastTurnStartedAt]);

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
