import { cn } from '@/core';
import { TimelineDomain } from '../domain/TimelineDomain';
import { MAIN_SESSION_AGENT, type TimelineSession } from '../timelineTypes';

export interface AgentChipsProps {
  session: TimelineSession;
  /** `null` = aucune puce sélectionnée, donc aucune piste de zoom ouverte. */
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
}

/**
 * Bandeau de puces sous le Gantt — **une puce par instance d'agent**, jamais par
 * type.
 *
 * Ce n'est pas une préférence d'affichage : mesuré sur les données du poste,
 * `backend-dev` a été invoqué 10 fois avec 10 identités distinctes, dont deux
 * en parallèle. `agentType` est un gabarit de configuration, pas une identité —
 * une puce « backend-dev » fusionnerait dix exécutions sans rapport. Voir
 * plans/005-gantt-exploitable.md §"Ce que la mesure a établi".
 *
 * La session principale y figure comme une puce parmi les autres : elle appelle
 * des outils elle aussi, et c'est à elle qu'on compare les sous-agents.
 */
export function AgentChips({ session, selectedAgentId, onSelect }: AgentChipsProps) {
  const chips = [
    {
      id: MAIN_SESSION_AGENT,
      label: 'Session principale',
      meta: `${session.messages} msg · ${TimelineDomain.formatTokens(session.billableTokens)} tk`,
      color: null as string | null,
      ongoing: session.endedAt === null,
    },
    ...session.lanes.map((lane) => ({
      id: lane.agentId,
      label: lane.agentType,
      meta: `${lane.messages} msg · ${TimelineDomain.formatTokens(lane.billableTokens)} tk`,
      color: TimelineDomain.agentColor(lane.agentType),
      ongoing: TimelineDomain.isOngoing(lane),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Agents de la session">
      {chips.map((chip) => {
        const selected = selectedAgentId === chip.id;

        return (
          <button
            key={chip.id}
            type="button"
            // Recliquer la puce sélectionnée referme la piste : la sélection est
            // une bascule, pas un cul-de-sac.
            onClick={() => onSelect(selected ? null : chip.id)}
            aria-pressed={selected}
            title={chip.id === MAIN_SESSION_AGENT ? 'Session principale' : chip.id}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              selected
                ? 'border-neutral-500 bg-neutral-800 text-neutral-100'
                : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 shrink-0 rounded-full', chip.ongoing && 'animate-pulse')}
              style={{ backgroundColor: chip.color ?? '#e5e5e5' }}
            />
            <span className="font-medium">{chip.label}</span>
            {chip.id !== MAIN_SESSION_AGENT ? (
              <span className="font-mono text-xs text-neutral-500">{chip.id.slice(0, 6)}</span>
            ) : null}
            <span className="tabular-nums text-xs text-neutral-500">{chip.meta}</span>
          </button>
        );
      })}
    </div>
  );
}
