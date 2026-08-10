import { create } from 'zustand';
import type { EventFilters } from '@/features/observability';

/**
 * Single global Zustand store. Holds client/UI state only: the observability
 * feature's event-list filters, and the multi-session Gantt timeline's
 * selected session filter (kept separate from `filters` on purpose — a
 * different resource, a different feature, see plans/003-multi-sessions.md).
 * Server state (events, stats, timeline data) stays in React Query.
 */
export interface AppState {
  filters: EventFilters;
  setFilter: <K extends keyof EventFilters>(key: K, value: EventFilters[K]) => void;
  resetFilters: () => void;
  /** `null` = "Toutes les sessions" (plan decision #1, the default). Drives the timeline repository's `sessionId` query param. */
  timelineSessionId: string | null;
  setTimelineSessionId: (sessionId: string | null) => void;
}

const EMPTY_FILTERS: EventFilters = {
  sessionId: null,
  project: null,
  eventName: null,
  agentType: null,
  toolName: null,
};

export const useAppStore = create<AppState>()((set) => ({
  filters: EMPTY_FILTERS,
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  timelineSessionId: null,
  setTimelineSessionId: (sessionId) => set({ timelineSessionId: sessionId }),
}));
