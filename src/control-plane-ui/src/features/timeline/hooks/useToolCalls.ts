import { useQuery } from '@tanstack/react-query';
import { timelineService } from '../application/TimelineService';
import { MAIN_SESSION_AGENT } from '../timelineTypes';

const TOOL_CALLS_STALE_TIME_MS = 30 * 1000;

/**
 * Les appels d'outil d'un agent, pour la piste de zoom. Chargés **à la demande
 * seulement** : la requête n'est armée que lorsqu'une puce est sélectionnée,
 * puisque c'est le seul endpoint qui paie la lecture de la colonne `payload`.
 *
 * `agentId` vaut la sentinelle `main` pour la session principale — elle n'est
 * pas un agent, ses appels portent `agent_id IS NULL`.
 */
export function useToolCalls(sessionId: string | null, agentId: string | null) {
  const query = useQuery({
    queryKey: ['timeline', 'tools', sessionId, agentId] as const,
    queryFn: async () => {
      if (!sessionId || !agentId) throw new Error('sessionId et agentId sont requis');
      const result = await timelineService.getToolCalls(
        sessionId,
        agentId === MAIN_SESSION_AGENT ? undefined : agentId,
      );
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    enabled: sessionId !== null && agentId !== null,
    staleTime: TOOL_CALLS_STALE_TIME_MS,
  });

  return {
    calls: query.data?.calls,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
