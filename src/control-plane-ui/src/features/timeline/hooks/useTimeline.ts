import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventStream } from '@/features/observability';
import { timelineService } from '../application/TimelineService';

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
 * Timeline (Gantt) data for the selected range, kept live by a WebSocket
 * subscription on `/stream` (debounced) — an ongoing bar's own visual growth
 * between refetches is handled client-side in TimelineDomain.extendWindowToNow.
 */
export function useTimeline(range: TimelineRange) {
  const queryClient = useQueryClient();
  const [lastTurnStartedAt, setLastTurnStartedAt] = useState<string | null>(null);
  const since = useMemo(() => sinceFromRange(range, lastTurnStartedAt), [range, lastTurnStartedAt]);

  const queryKey = useMemo(() => ['timeline', 'list', range, since ?? null] as const, [range, since]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await timelineService.getTimeline(since);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    staleTime: TIMELINE_STALE_TIME_MS,
  });

  // `lastTurnStartedAt` is session-wide (independent of `since`), so any
  // successful fetch — whichever range triggered it — can refine the exact
  // "dernier tour" boundary for the next `turn` query.
  useEffect(() => {
    const fetched = query.data?.window.lastTurnStartedAt ?? null;
    setLastTurnStartedAt((current) => (current === fetched ? current : fetched));
  }, [query.data?.window.lastTurnStartedAt]);

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
  };
}
