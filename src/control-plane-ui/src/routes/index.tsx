import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { EventTimeline } from '@/features/observability';
import { GanttChart, RunningAgentsBar, TIMELINE_ACTIVE_SESSIONS } from '@/features/timeline';
import { useAppStore } from '@/store/useAppStore';

interface ControlTowerSearch {
  /**
   * Jeton `sessionId::agentId` de la piste ouverte. Dans l'URL, donc
   * partageable et résistant au rechargement. Qualifié par la session depuis le
   * plan 007 : « main » désigne la principale de *chaque* session, et un
   * identifiant nu ouvrait la piste dans toutes à la fois.
   */
  agent?: string;
}

/**
 * Tour de contrôle — ce qui tourne **maintenant**. Portée forcée aux sessions
 * actives, alimentée par le WebSocket.
 *
 * Trois strates, de la réponse immédiate au diagnostic : le bandeau dit *qui*
 * tourne, le Gantt dit *quand et en parallèle de quoi*, le flux d'événements
 * dit *ce qui s'est exactement passé*. On descend d'une strate seulement quand
 * la précédente ne suffit plus.
 *
 * La place suit cette hiérarchie : **la chronologie prend la moitié du
 * viewport**, le flux d'événements se contente du reste. Il sert au diagnostic
 * ponctuel, pas à la surveillance continue — lui donner autant de surface
 * qu'au Gantt revenait à dire le contraire. Chaque bloc défile chez lui ; la
 * page, elle, ne défile plus.
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

  const selectAgent = (token: string | null) =>
    void navigate({ search: { agent: token ?? undefined }, replace: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <RunningAgentsBar selectedAgentId={agent ?? null} onSelectAgent={selectAgent} />
      </div>

      {/* `basis-1/2` et non `flex-1` : la moitié est une part revendiquée, pas
          un reste. Le flux d'événements prend ce qui demeure. */}
      <GanttChart
        className="min-h-0 basis-1/2"
        fill
        selectedAgentId={agent ?? null}
        onSelectAgent={selectAgent}
      />

      <EventTimeline className="min-h-0 flex-1" fill />
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: ControlTower,
  validateSearch: (search: Record<string, unknown>): ControlTowerSearch => ({
    agent: typeof search.agent === 'string' && search.agent.length > 0 ? search.agent : undefined,
  }),
});
