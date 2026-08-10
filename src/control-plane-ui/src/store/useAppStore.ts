import { create } from 'zustand';
import type { EventFilters } from '@/features/observability';
import { TIMELINE_ACTIVE_SESSIONS, type TimelineSessionFilter } from '@/features/timeline';

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
  /**
   * Filtre de session du Gantt. Défaut : les sessions **actives** — ce qui
   * tourne maintenant est ce qu'on regarde, l'historique se demande
   * explicitement. Les deux sentinelles se résolvent côté client ; un
   * `sessionId` réel alimente le paramètre de requête du repository.
   */
  timelineSessionFilter: TimelineSessionFilter;
  setTimelineSessionFilter: (filter: TimelineSessionFilter) => void;
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
  timelineSessionFilter: TIMELINE_ACTIVE_SESSIONS,
  setTimelineSessionFilter: (filter) => set({ timelineSessionFilter: filter }),
}));
