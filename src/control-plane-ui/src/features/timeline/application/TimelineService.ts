import { HttpError, Result, type ResultError } from '@/core';
import type { ITimelineRepository } from '../api/TimelineRepository';
import { timelineRepository } from '../api/TimelineRepository';
import type { AgentRunDetail, TimelineResponse, ToolCallsResponse } from '../timelineTypes';

export interface TimelineError extends ResultError {}

/** Orchestrates the timeline repository and returns Result — no throwing past this layer. */
class TimelineService {
  private readonly repository: ITimelineRepository;

  constructor(repository: ITimelineRepository = timelineRepository) {
    this.repository = repository;
  }

  async getTimeline(since?: string, sessionId?: string): Promise<Result<TimelineResponse, TimelineError>> {
    try {
      const timeline = await this.repository.getTimeline(since, sessionId);
      return Result.success(timeline);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAgentRunDetail(agentId: string): Promise<Result<AgentRunDetail, TimelineError>> {
    if (!agentId?.trim()) {
      return Result.failure({ code: 'INVALID_AGENT_ID', message: 'agentId is required' });
    }
    try {
      const detail = await this.repository.getAgentRunDetail(agentId);
      return Result.success(detail);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getToolCalls(sessionId: string, agentId?: string): Promise<Result<ToolCallsResponse, TimelineError>> {
    if (!sessionId?.trim()) {
      return Result.failure({ code: 'INVALID_SESSION_ID', message: 'sessionId is required' });
    }
    try {
      const calls = await this.repository.getToolCalls(sessionId, agentId);
      return Result.success(calls);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): Result<never, TimelineError> {
    if (error instanceof HttpError) {
      return Result.failure({ code: `HTTP_${error.status}`, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Result.failure({ code: 'TIMELINE_REQUEST_FAILED', message });
  }
}

export const timelineService = new TimelineService();
