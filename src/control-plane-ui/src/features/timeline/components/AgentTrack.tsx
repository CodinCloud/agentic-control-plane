import { useMemo, useState } from 'react';
import { Info, Wrench } from 'lucide-react';
import { cn } from '@/core';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/vloc/EmptyState';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { ObservabilityDomain } from '@/features/observability';
import { useToolCalls } from '../hooks/useToolCalls';
import { useNowTick } from '../hooks/useNowTick';
import { TimelineDomain } from '../domain/TimelineDomain';
import { TimelineAxis } from './TimelineAxis';
import { MAIN_SESSION_AGENT, type AgentLane, type TimelineSession, type ToolCall } from '../timelineTypes';

export interface AgentTrackProps {
  session: TimelineSession;
  /** Sentinelle `main`, ou l'identifiant d'une instance d'agent. */
  agentId: string;
  /** Ouvre le panneau brief/rapport. Absent pour la session principale, qui n'a pas d'AgentRun. */
  onOpenDetail?: (agentId: string) => void;
}

/**
 * La piste de zoom : le Gantt reste intact au-dessus, cette piste s'ouvre en
 * dessous avec **son propre axe**, recalé sur les bornes du seul agent
 * sélectionné. Vue d'ensemble et vue rapprochée coexistent — perdre le
 * parallélisme de vue serait perdre l'argument central du Gantt.
 *
 * Les glyphes sont les appels d'outil, positionnés à leur instant réel. Les
 * répétitions consécutives d'un même outil arrivent déjà groupées du serveur
 * (`repeatCount`), ce qui divise la densité par deux à trois en pratique et fait
 * de la répétition elle-même une information lisible.
 */
export function AgentTrack({ session, agentId, onOpenDetail }: AgentTrackProps) {
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const { calls, isLoading, isError, error, refetch } = useToolCalls(session.sessionId, agentId);
  const now = useNowTick();

  const isMain = agentId === MAIN_SESSION_AGENT;
  const lane: AgentLane | undefined = session.lanes.find((candidate) => candidate.agentId === agentId);

  // La piste se recale sur les bornes de l'agent — ou, pour la session
  // principale, sur celles de la session elle-même.
  const window = useMemo(
    () =>
      TimelineDomain.agentWindow(
        lane ?? { startedAt: session.startedAt, endedAt: session.endedAt },
        now,
      ),
    [lane, session.startedAt, session.endedAt, now],
  );

  const selectedCall = calls?.find((call) => call.id === selectedCallId) ?? null;
  const label = isMain ? 'Session principale' : (lane?.agentType ?? 'Agent');

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Wrench className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-neutral-200">{label}</span>
          {!isMain ? <span className="font-mono text-xs text-neutral-500">{agentId.slice(0, 8)}</span> : null}
          {calls ? (
            <span className="text-xs text-neutral-500">
              {calls.length} glyphe(s) · {calls.reduce((total, call) => total + call.repeatCount, 0)} appel(s)
            </span>
          ) : null}
        </div>

        {!isMain && onOpenDetail ? (
          <Button variant="outline" size="sm" onClick={() => onOpenDetail(agentId)}>
            Brief et rapport
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Impossible de charger les outils"
          description={error instanceof Error ? error.message : 'Erreur inconnue'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : !calls || calls.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-800 p-3 text-sm text-neutral-500">
          Aucun appel d'outil enregistré pour cet agent. Les hooks n'étaient peut-être pas branchés à ce
          moment-là — les lanes viennent des transcripts, les outils viennent des hooks.
        </div>
      ) : (
        <>
          <TimelineAxis window={{ ...window, lastTurnStartedAt: null }} />

          <div className="relative h-10">
            {calls.map((call) => {
              const leftPct = TimelineDomain.pointPositionPct(call.at, window);
              const selected = call.id === selectedCallId;

              return (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => setSelectedCallId(selected ? null : call.id)}
                  aria-pressed={selected}
                  title={`${call.toolName}${call.repeatCount > 1 ? ` ×${call.repeatCount}` : ''}${
                    call.summary ? ` — ${call.summary}` : ''
                  }`}
                  style={{ left: `${leftPct}%` }}
                  className={cn(
                    'absolute top-1 -translate-x-1/2 rounded-md border px-1.5 py-1 text-sm leading-none transition-colors',
                    call.failed
                      ? 'border-red-800 bg-red-950/50'
                      : 'border-neutral-700 bg-neutral-800/80 hover:border-neutral-500',
                    selected && 'border-sky-500 bg-sky-950/60',
                  )}
                >
                  <span aria-hidden="true">{ObservabilityDomain.toolEmoji(call.toolName)}</span>
                  {call.repeatCount > 1 ? (
                    <span className="ml-0.5 text-xs tabular-nums text-neutral-400">×{call.repeatCount}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selectedCall ? <ToolCallDetail call={selectedCall} /> : null}
        </>
      )}
    </div>
  );
}

/**
 * L'in/out d'un appel. Extrait typé uniquement — jamais le payload brut : la
 * sortie d'un `Edit` ou d'un `Write` contient le fichier entier, ce qui pousse
 * les payloads vers la troncature à 32 Ko.
 *
 * Un outil sans règle d'extraction le **dit** au lieu d'afficher un blanc : une
 * absence silencieuse se lirait comme un bug.
 */
function ToolCallDetail({ call }: { call: ToolCall }) {
  return (
    <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span aria-hidden="true">{ObservabilityDomain.toolEmoji(call.toolName)}</span>
        <span className="text-sm font-medium text-neutral-200">{call.toolName}</span>
        {call.repeatCount > 1 ? (
          <StatusBadge tone="neutral">{call.repeatCount} appels consécutifs</StatusBadge>
        ) : null}
        {call.failed ? <StatusBadge tone="destructive">échec</StatusBadge> : null}
        <span className="text-xs tabular-nums text-neutral-500">
          {ObservabilityDomain.formatTimestamp(call.at)} · {ObservabilityDomain.formatDuration(call.durationMs)}
        </span>
      </div>

      {call.extractable ? (
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Entrée</dt>
            <dd className="break-words font-mono text-xs text-neutral-300">{call.summary ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Sortie</dt>
            <dd className={cn('break-words font-mono text-xs', call.failed ? 'text-red-400' : 'text-neutral-300')}>
              {call.result ?? '—'}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="flex items-start gap-2 text-sm text-neutral-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Aucun extrait pour cet outil — aucune règle de lecture ne le connaît encore.
        </p>
      )}

      {call.repeatCount > 1 ? (
        <p className="mt-2 text-xs text-neutral-600">
          Extrait du premier des {call.repeatCount} appels consécutifs.
        </p>
      ) : null}
    </div>
  );
}
