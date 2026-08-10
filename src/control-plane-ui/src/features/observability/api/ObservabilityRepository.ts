import { buildQueryString, httpClient } from '@/core';
import type {
  EventDetail,
  EventFilters,
  EventsPage,
  FilterOptionsResponse,
  StatsResponse,
} from '../observabilityTypes';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';

export const DEFAULT_PAGE_SIZE = 200;

export interface IObservabilityRepository {
  getEvents(filters: EventFilters, before?: number, limit?: number): Promise<EventsPage>;
  getEventById(id: number): Promise<EventDetail>;
  getFilterOptions(): Promise<FilterOptionsResponse>;
  getStats(since: string): Promise<StatsResponse>;
}

/** HTTP-only. Throws on failure — the application layer converts to Result. */
class ObservabilityRepository implements IObservabilityRepository {
  async getEvents(filters: EventFilters, before?: number, limit: number = DEFAULT_PAGE_SIZE): Promise<EventsPage> {
    // "Session principale" (agentType === null) has no defined server-side
    // encoding in the frozen contract — see observabilityTypes.ts. Any other
    // concrete agent type is passed straight through as a query param.
    const agentTypeParam =
      filters.agentType && filters.agentType !== ObservabilityDomain.MAIN_SESSION_FILTER ? filters.agentType : null;

    const query = buildQueryString({
      limit,
      before,
      sessionId: filters.sessionId,
      project: filters.project,
      eventName: filters.eventName,
      agentType: agentTypeParam,
      toolName: filters.toolName,
    });
    return httpClient.get<EventsPage>(`/api/events${query}`);
  }

  async getEventById(id: number): Promise<EventDetail> {
    return httpClient.get<EventDetail>(`/api/events/${id}`);
  }

  async getFilterOptions(): Promise<FilterOptionsResponse> {
    return httpClient.get<FilterOptionsResponse>('/api/filter-options');
  }

  async getStats(since: string): Promise<StatsResponse> {
    const query = buildQueryString({ since });
    return httpClient.get<StatsResponse>(`/api/stats${query}`);
  }
}

export const observabilityRepository = new ObservabilityRepository();
