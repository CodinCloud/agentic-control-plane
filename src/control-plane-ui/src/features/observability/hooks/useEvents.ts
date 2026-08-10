import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAppStore } from '@/store/useAppStore';
import { observabilityService } from '../application/ObservabilityService';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { EventFilters, EventListItem, EventsPage } from '../observabilityTypes';
import { useEventStream } from './useEventStream';

const EVENTS_STALE_TIME_MS = 30 * 1000;
const EVENTS_PAGE_SIZE = 200;

function matchesFilters(event: EventListItem, filters: EventFilters): boolean {
  if (filters.sessionId && event.sessionId !== filters.sessionId) return false;
  if (filters.project && event.project !== filters.project) return false;
  if (filters.eventName && event.eventName !== filters.eventName) return false;
  if (filters.toolName && event.toolName !== filters.toolName) return false;
  if (filters.agentType) {
    if (filters.agentType === ObservabilityDomain.MAIN_SESSION_FILTER) {
      if (!ObservabilityDomain.isMainSession(event.agentType)) return false;
    } else if (event.agentType !== filters.agentType) {
      return false;
    }
  }
  return true;
}

/**
 * Event timeline: keyset-paginated (`before`) TanStack Query, kept live by a
 * WebSocket subscription that prefixes matching new events to the first page.
 */
export function useEvents() {
  const filters = useAppStore((state) => state.filters);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['observability', 'events', filters] as const, [filters]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: number | undefined }) => {
      const result = await observabilityService.getEvents(filters, pageParam, EVENTS_PAGE_SIZE);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage: EventsPage) => lastPage.nextBefore ?? undefined,
    staleTime: EVENTS_STALE_TIME_MS,
  });

  const onStreamEvent = useCallback(
    (event: EventListItem) => {
      if (!matchesFilters(event, filters)) return;
      queryClient.setQueryData<InfiniteData<EventsPage, number | undefined>>(queryKey, (data) => {
        if (!data) return data;
        const [firstPage, ...rest] = data.pages;
        if (!firstPage || firstPage.items.some((item) => item.id === event.id)) return data;
        const updatedFirstPage: EventsPage = { ...firstPage, items: [event, ...firstPage.items] };
        return { ...data, pages: [updatedFirstPage, ...rest] };
      });
    },
    [filters, queryClient, queryKey],
  );

  const { status: streamStatus } = useEventStream({ onEvent: onStreamEvent });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    streamStatus,
  };
}
