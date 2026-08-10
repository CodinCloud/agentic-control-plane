import { buildQueryString, httpClient } from '@/core';
import type { AgentRunDetail, TimelineResponse } from '../timelineTypes';

export interface ITimelineRepository {
  getTimeline(since?: string): Promise<TimelineResponse>;
  /** Fetched on demand only (detail panel), never alongside the list — brief/report run to several KB. */
  getAgentRunDetail(agentId: string): Promise<AgentRunDetail>;
}

/** HTTP-only. Throws on failure — the application layer converts to Result. */
class TimelineRepository implements ITimelineRepository {
  async getTimeline(since?: string): Promise<TimelineResponse> {
    const query = buildQueryString({ since });
    return httpClient.get<TimelineResponse>(`/api/timeline${query}`);
  }

  async getAgentRunDetail(agentId: string): Promise<AgentRunDetail> {
    return httpClient.get<AgentRunDetail>(`/api/timeline/agents/${encodeURIComponent(agentId)}`);
  }
}

export const timelineRepository = new TimelineRepository();
