import { buildQueryString, httpClient } from '@/core';
import type { AgentRunDetail, TimelineResponse, ToolCallsResponse } from '../timelineTypes';

export interface ITimelineRepository {
  /** `sessionId` is an optional filter (plan §"Contrat d'API") — absent, the server returns every session touching the window. */
  getTimeline(since?: string, sessionId?: string): Promise<TimelineResponse>;
  /** Fetched on demand only (detail panel), never alongside the list — brief/report run to several KB. */
  getAgentRunDetail(agentId: string): Promise<AgentRunDetail>;
  /** `agentId` absent (ou la sentinelle `main`) = les appels d'outil de la session elle-même. */
  getToolCalls(sessionId: string, agentId?: string): Promise<ToolCallsResponse>;
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

  async getToolCalls(sessionId: string, agentId?: string): Promise<ToolCallsResponse> {
    const query = buildQueryString({ sessionId, agentId });
    return httpClient.get<ToolCallsResponse>(`/api/timeline/tools${query}`);
  }
}

export const timelineRepository = new TimelineRepository();
