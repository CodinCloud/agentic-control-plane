import { HttpError, Result, type ResultError } from '@/core';
import type { IObservabilityRepository } from '../api/ObservabilityRepository';
import { observabilityRepository } from '../api/ObservabilityRepository';
import type {
  EventDetail,
  EventFilters,
  EventsPage,
  FilterOptionsResponse,
  StatsResponse,
} from '../observabilityTypes';

export interface ObservabilityError extends ResultError {}

/** Orchestrates the observability repository and returns Result — no throwing past this layer. */
class ObservabilityService {
  private readonly repository: IObservabilityRepository;

  constructor(repository: IObservabilityRepository = observabilityRepository) {
    this.repository = repository;
  }

  async getEvents(
    filters: EventFilters,
    before?: number,
    limit?: number,
  ): Promise<Result<EventsPage, ObservabilityError>> {
    try {
      const page = await this.repository.getEvents(filters, before, limit);
      return Result.success(page);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getEventById(id: number): Promise<Result<EventDetail, ObservabilityError>> {
    if (!Number.isFinite(id)) {
      return Result.failure({ code: 'INVALID_ID', message: 'Event id must be a number' });
    }
    try {
      const detail = await this.repository.getEventById(id);
      return Result.success(detail);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFilterOptions(): Promise<Result<FilterOptionsResponse, ObservabilityError>> {
    try {
      const options = await this.repository.getFilterOptions();
      return Result.success(options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getStats(since: string): Promise<Result<StatsResponse, ObservabilityError>> {
    if (!since) {
      return Result.failure({ code: 'INVALID_WINDOW', message: 'since is required' });
    }
    try {
      const stats = await this.repository.getStats(since);
      return Result.success(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): Result<never, ObservabilityError> {
    if (error instanceof HttpError) {
      return Result.failure({ code: `HTTP_${error.status}`, message: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Result.failure({ code: 'OBSERVABILITY_REQUEST_FAILED', message });
  }
}

export const observabilityService = new ObservabilityService();
