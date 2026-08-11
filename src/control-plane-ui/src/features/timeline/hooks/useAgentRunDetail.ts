import { useQuery } from '@tanstack/react-query';
import { timelineService } from '../application/TimelineService';
import { MAIN_SESSION_AGENT } from '../timelineTypes';

const AGENT_RUN_DETAIL_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Brief + report for one agent, behind the detail panel — fetched on demand
 * only (`enabled` gated on a non-null `agentId`), never alongside the
 * timeline list: these texts run to several KB and most bars are never
 * clicked. Deliberately not wired to the `/stream` refresh in useTimeline —
 * the panel shows a snapshot from the moment it was opened.
 *
 * La sentinelle `main` n'atteint jamais le serveur : `AgentRun` n'existe que
 * pour les sous-agents (plan 006, décision #12) — `AgentDetailPanel` gère ce
 * cas en amont, avant même que ce hook ne soit armé.
 */
export function useAgentRunDetail(agentId: string | null) {
  const query = useQuery({
    queryKey: ['timeline', 'detail', agentId] as const,
    queryFn: async () => {
      if (!agentId) throw new Error('agentId is required');
      const result = await timelineService.getAgentRunDetail(agentId);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    enabled: agentId !== null && agentId !== MAIN_SESSION_AGENT,
    staleTime: AGENT_RUN_DETAIL_STALE_TIME_MS,
  });

  return {
    detail: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
