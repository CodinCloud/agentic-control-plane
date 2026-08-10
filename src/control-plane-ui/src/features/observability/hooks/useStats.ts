import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { observabilityService } from '../application/ObservabilityService';
import { useEventStream } from './useEventStream';

const STATS_REFETCH_INTERVAL_MS = 30 * 1000;
const STATS_LIVE_INVALIDATE_THROTTLE_MS = 5 * 1000;

export const STATS_WINDOWS = [
  { value: '1', label: '1 heure' },
  { value: '24', label: '24 heures' },
  { value: '168', label: '7 jours' },
] as const;

export type StatsWindowHours = (typeof STATS_WINDOWS)[number]['value'];

function sinceFromHours(hours: StatsWindowHours): string {
  const ms = Number(hours) * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

/** KPI stats, refreshed on an interval and nudged live by the event stream (throttled). */
export function useStats(windowHours: StatsWindowHours) {
  const since = useMemo(() => sinceFromHours(windowHours), [windowHours]);
  const queryClient = useQueryClient();
  const lastInvalidateRef = useRef(0);

  const queryKey = ['observability', 'stats', windowHours] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await observabilityService.getStats(since);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    refetchInterval: STATS_REFETCH_INTERVAL_MS,
  });

  useEventStream({
    onEvent: () => {
      const now = Date.now();
      if (now - lastInvalidateRef.current < STATS_LIVE_INVALIDATE_THROTTLE_MS) return;
      lastInvalidateRef.current = now;
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  useEffect(() => {
    lastInvalidateRef.current = 0;
  }, [windowHours]);

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
