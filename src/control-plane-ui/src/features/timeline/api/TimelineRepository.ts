import { buildQueryString, httpClient } from '@/core';
import type { AgentRunDetail, TimelineResponse } from '../timelineTypes';

export interface ITimelineRepository {
  /** `sessionId` is an optional filter (plan §"Contrat d'API") — absent, the server returns every session touching the window. */
  getTimeline(since?: string, sessionId?: string): Promise<TimelineResponse>;
  /** Fetched on demand only (detail panel), never alongside the list — brief/report run to several KB. */
  getAgentRunDetail(agentId: string): Promise<AgentRunDetail>;
}

/** HTTP-only. Throws on failure — the application layer converts to Result. */
class TimelineRepository implements ITimelineRepository {
  async getTimeline(since?: string, sessionId?: string): Promise<TimelineResponse> {
    const query = buildQueryString({ since, sessionId });
    return httpClient.get<TimelineResponse>(`/api/timeline${query}`);
  }

  async getAgentRunDetail(agentId: string): Promise<AgentRunDetail> {
    return httpClient.get<AgentRunDetail>(`/api/timeline/agents/${encodeURIComponent(agentId)}`);
  }
}

export const timelineRepository = new TimelineRepository();
