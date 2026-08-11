import { useMemo } from 'react';
import { cn } from '@/core';
import { useTimeline } from '../hooks/useTimeline';
import { useNowTick } from '../hooks/useNowTick';
import { TimelineDomain } from '../domain/TimelineDomain';
import { TIMELINE_ACTIVE_SESSIONS, type AgentLane, type TimelineSession } from '../timelineTypes';

/** Une lane en cours, rattachée à la session qui la porte. */
interface RunningAgent {
  token: string;
  lane: AgentLane;
  session: TimelineSession;
}

export interface RunningAgentsBarProps {
  /** Jeton `sessionId::agentId` actuellement ouvert dans le Gantt. */
  selectedAgentId: string | null;
  onSelectAgent: (token: string | null) => void;
}

/**
 * « Qu'est-ce qui tourne, là, maintenant ? » — la seule question qu'une tour de
 * contrôle doit savoir répondre sans qu'on lise quoi que ce soit.
 *
 * Ce n'est pas un bandeau de KPI et il n'en réintroduit aucun : pas un token,
 * pas un dollar, pas un compteur d'événements. Uniquement de **l'état** — qui
 * est ouvert, depuis quand, pour quoi faire. La doctrine des KPI (CONTEXT.md)
 * bannit les compteurs qu'on regarde sans savoir qu'en faire ; ici la décision
 * est immédiate : attendre, ou reprendre la main.
 *
 * Il **ne s'abonne pas** au flux : il partage la clé de requête du Gantt, donc
 * ses invalidations. Un abonnement de plus, c'est une WebSocket de plus, et
 * l'écran en ouvrait déjà deux.
 */
export function RunningAgentsBar({ selectedAgentId, onSelectAgent }: RunningAgentsBarProps) {
  const { timeline } = useTimeline('10m', TIMELINE_ACTIVE_SESSIONS, { subscribe: false });
  const now = useNowTick();

  const sessions = useMemo(
    () => TimelineDomain.applySessionFilter(timeline?.sessions ?? [], TIMELINE_ACTIVE_SESSIONS),
    [timeline?.sessions],
  );

  // Du plus récemment lancé au plus ancien : ce qui vient de partir est ce
  // qu'on cherche des yeux.
  const running = useMemo<RunningAgent[]>(
    () =>
      sessions
        .flatMap((session) =>
          session.lanes
            .filter((lane) => TimelineDomain.isOngoing(lane))
            .map((lane) => ({
              token: TimelineDomain.selectionToken(session.sessionId, lane.agentId),
              lane,
              session,
            })),
        )
        .sort((a, b) => Date.parse(b.lane.startedAt) - Date.parse(a.lane.startedAt)),
    [sessions],
  );

  const subagents = running.filter((entry) => !entry.lane.isMainSession);

  return (
    <section
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card/40 px-4 py-2.5"
      aria-label="Ce qui tourne maintenant"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          {running.length > 0 ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-good opacity-60" />
          ) : null}
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              running.length > 0 ? 'bg-status-good' : 'bg-muted-foreground',
            )}
          />
        </span>

        <div className="leading-tight">
          <div className="text-sm font-medium text-foreground">
            {running.length === 0
              ? 'Rien ne tourne'
              : `${running.length} agent${running.length > 1 ? 's' : ''} en cours`}
          </div>
          <div className="text-xs text-muted-foreground">
            {sessions.length} session{sessions.length > 1 ? 's' : ''} active
            {sessions.length > 1 ? 's' : ''}
            {subagents.length > 0
              ? ` · ${subagents.length} délégation${subagents.length > 1 ? 's' : ''} ouverte${subagents.length > 1 ? 's' : ''}`
              : ' · aucune délégation ouverte'}
          </div>
        </div>
      </div>

      {running.length > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {running.map((entry) => (
            <RunningAgentChip
              key={entry.token}
              entry={entry}
              now={now}
              selected={selectedAgentId === entry.token}
              onSelect={onSelectAgent}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucun agent ouvert sur les dix dernières minutes. Lance-en un : il apparaîtra ici tout seul.
        </p>
      )}
    </section>
  );
}

/**
 * Une puce par agent ouvert. Cliquer ouvre sa piste dans le Gantt en dessous —
 * le bandeau est un point d'entrée, pas un cul-de-sac décoratif.
 */
function RunningAgentChip({
  entry,
  now,
  selected,
  onSelect,
}: {
  entry: RunningAgent;
  now: number;
  selected: boolean;
  onSelect: (token: string | null) => void;
}) {
  const { lane, session } = entry;
  const color = TimelineDomain.laneColor(lane);
  const label = lane.isMainSession ? session.project ?? 'Session principale' : lane.agentType ?? 'Agent';
  const elapsed = TimelineDomain.formatDuration(Math.max(0, now - Date.parse(lane.startedAt)));

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : entry.token)}
      aria-pressed={selected}
      title={`${label} · ${session.sessionId}${lane.taskDescription ? ` — ${lane.taskDescription}` : ''}`}
      className={cn(
        'flex max-w-sm items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        selected
          ? 'border-muted-foreground bg-accent text-foreground'
          : 'border-border bg-background/60 hover:border-muted-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 animate-pulse rounded-full"
        style={{ backgroundColor: color }}
      />
      {/* Le sous-agent porte son type en couleur ; la session principale reste
          sobre — c'est la référence, pas une série (plan 006, §"Contrainte
          visuelle"). */}
      <span
        className={cn('shrink-0 font-medium', lane.isMainSession ? 'text-foreground' : undefined)}
        style={lane.isMainSession ? undefined : { color }}
      >
        {label}
      </span>
      {lane.taskDescription ? (
        <span className="truncate text-muted-foreground">{lane.taskDescription}</span>
      ) : null}
      <span className="shrink-0 tabular-nums text-muted-foreground">{elapsed}</span>
    </button>
  );
}
