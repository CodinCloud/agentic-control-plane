import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { EventTimeline } from '@/features/observability';
import { GanttChart, TIMELINE_ACTIVE_SESSIONS } from '@/features/timeline';
import { useAppStore } from '@/store/useAppStore';

interface ControlTowerSearch {
  /** Agent dont la piste de zoom est ouverte. Dans l'URL, donc partageable et résistant au rechargement. */
  agent?: string;
}

/**
 * Tour de contrôle — ce qui tourne **maintenant**. Portée forcée aux sessions
 * actives, alimentée par le WebSocket.
 *
 * Aucun montant ici : le coût est du post-mortem, il vit sur l'écran d'analyse
 * (plans/005-gantt-exploitable.md, décision #10). La tour de contrôle reste
 * strictement opérationnelle.
 */
function ControlTower() {
  const { agent } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setSessionFilter = useAppStore((state) => state.setTimelineSessionFilter);

  // L'accueil impose sa portée : entrer ici, c'est demander « qu'est-ce qui
  // tourne ». Le sélecteur reste disponible pour élargir ponctuellement.
  useEffect(() => {
    setSessionFilter(TIMELINE_ACTIVE_SESSIONS);
  }, [setSessionFilter]);

  return (
    <>
      <GanttChart
        selectedAgentId={agent ?? null}
        onSelectAgent={(agentId) =>
          void navigate({ search: { agent: agentId ?? undefined }, replace: true })
        }
      />
      <EventTimeline />
    </>
  );
}

export const Route = createFileRoute('/')({
  component: ControlTower,
  validateSearch: (search: Record<string, unknown>): ControlTowerSearch => ({
    agent: typeof search.agent === 'string' && search.agent.length > 0 ? search.agent : undefined,
  }),
});
