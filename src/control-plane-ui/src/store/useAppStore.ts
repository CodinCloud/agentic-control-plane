import { create } from 'zustand';
import type { EventFilters } from '@/features/observability';

/**
 * Single global Zustand store. Holds client/UI state only — filters for the
 * observability timeline. Server state (events, stats, filter options)
 * stays in React Query.
 */
export interface AppState {
  filters: EventFilters;
  setFilter: <K extends keyof EventFilters>(key: K, value: EventFilters[K]) => void;
  resetFilters: () => void;
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
}));
