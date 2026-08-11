import { cn } from '@/core';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineSession } from '../timelineTypes';

export interface AgentChipsProps {
  session: TimelineSession;
  /** `null` = aucune puce sélectionnée, donc aucune piste de zoom ouverte. */
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
}

/**
 * Bandeau de puces sous le Gantt — **une puce par instance d'agent**, jamais par
 * type, la session principale comprise (plan 006, décision #4). Elle est
 * fournie par le serveur comme n'importe quelle autre lane : plus de cas
 * particulier synthétisé côté client, `AgentChips` mappe `session.lanes` tel
 * quel.
 *
 * Ce n'est pas une préférence d'affichage pour les sous-agents non plus :
 * mesuré sur les données du poste, `backend-dev` a été invoqué 10 fois avec 10
 * identités distinctes, dont deux en parallèle. `agentType` est un gabarit de
 * configuration, pas une identité — une puce « backend-dev » fusionnerait dix
 * exécutions sans rapport. Voir plans/005-gantt-exploitable.md §"Ce que la
 * mesure a établi".
 *
 * Ce bandeau **est** la légende (plan §"Contrainte visuelle") : pastille de
 * couleur + libellé, jamais l'identité seule sur la couleur.
 */
export function AgentChips({ session, selectedAgentId, onSelect }: AgentChipsProps) {
  const chips = session.lanes.map((lane) => ({
    id: lane.agentId,
    isMain: lane.isMainSession,
    label: lane.isMainSession ? 'Session principale' : lane.agentType ?? 'Agent',
    brief: lane.taskDescription,
    meta: `${lane.messages} msg · ${TimelineDomain.formatTokens(lane.billableTokens)} tk`,
    color: TimelineDomain.laneColor(lane),
    ongoing: TimelineDomain.isOngoing(lane),
  }));

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-1" role="group" aria-label="Agents de la session">
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
            // Le brief plutôt que l'UUID : un sous-agent s'identifie par ce
            // qu'on lui a demandé (plan 007, décision #7).
            title={chip.isMain ? 'Session principale' : `${chip.id}${chip.brief ? ` — ${chip.brief}` : ''}`}
            className={cn(
              'flex max-w-xs items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              selected
                ? 'border-muted-foreground bg-accent text-foreground'
                : 'border-border bg-card/40 text-muted-foreground hover:border-muted-foreground hover:text-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 shrink-0 rounded-full', chip.ongoing && 'animate-pulse')}
              style={{ backgroundColor: chip.color }}
            />
            <span className={cn('shrink-0 font-medium', !chip.isMain && 'text-foreground')}>{chip.label}</span>
            {!chip.isMain && chip.brief ? (
              <span className="truncate text-muted-foreground">{chip.brief}</span>
            ) : null}
            <span className="shrink-0 tabular-nums text-muted-foreground">{chip.meta}</span>
          </button>
        );
      })}
    </div>
  );
}
