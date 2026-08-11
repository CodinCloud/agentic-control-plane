import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/vloc/EmptyState';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { useAgentRunDetail } from '../hooks/useAgentRunDetail';
import { TimelineDomain } from '../domain/TimelineDomain';
import { MAIN_SESSION_AGENT } from '../timelineTypes';

export interface AgentDetailPanelProps {
  /** null = closed. */
  agentId: string | null;
  onClose: () => void;
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate text-sm text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Side panel behind a click on a timeline bar — brief, report, tokens,
 * model. Brief/report are fetched on demand only (see useAgentRunDetail),
 * never with the lane list. No Sheet/Dialog primitive exists in
 * components/ui yet (no Radix dependency in this project) — a self-made
 * overlay is the smallest thing that satisfies the plan's "lecture seule"
 * scope, matching the Gantt component's own hand-rolled approach.
 *
 * La lane principale n'a ni brief ni rapport — personne ne l'a briefée,
 * `AgentRun` n'existe que pour les sous-agents (plan 006, décision #12). Ce
 * panneau le **dit** plutôt que d'interroger un endpoint qui n'a rien à
 * répondre.
 */
export function AgentDetailPanel({ agentId, onClose }: AgentDetailPanelProps) {
  const open = agentId !== null;
  const isMainSession = agentId === MAIN_SESSION_AGENT;
  const { detail, isLoading, isError, error, refetch } = useAgentRunDetail(agentId);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fermer le panneau de détail"
        className="absolute inset-0 bg-background/60"
        onClick={onClose}
      />

      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-popover shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {isMainSession ? 'Session principale' : detail?.agentType ?? 'Détail de l’agent'}
            </h2>
            <p className="truncate text-xs text-muted-foreground" title={agentId ?? undefined}>
              {agentId}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isMainSession ? (
            <EmptyState
              title="Pas de brief pour la session principale"
              description="Personne ne l'a briefée : AgentRun — brief et rapport — n'existe que pour les sous-agents qu'elle délègue. Sa piste d'outils juste au-dessus montre ce qu'elle a fait, pas ce qu'on lui a demandé."
            />
          ) : isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : isError || !detail ? (
            <EmptyState
              variant="error"
              title="Impossible de charger le détail"
              description={error instanceof Error ? error.message : 'Erreur inconnue'}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  Réessayer
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card/40 p-3">
                <MetaField label="Type d'agent" value={detail.agentType ?? '—'} />
                <MetaField label="Modèle" value={detail.model} />
                <MetaField label="Profondeur de spawn" value={detail.spawnDepth === null ? '—' : String(detail.spawnDepth)} />
                <MetaField
                  label="Statut"
                  value={TimelineDomain.isOngoing(detail) ? 'en cours' : 'terminé'}
                />
                <MetaField label="Début" value={TimelineDomain.formatDateTime(detail.startedAt)} />
                <MetaField label="Fin" value={TimelineDomain.formatDateTime(detail.endedAt)} />
                <MetaField
                  label="Durée"
                  value={TimelineDomain.formatDuration(TimelineDomain.effectiveDurationMs(detail))}
                />
                <MetaField label="Messages" value={String(detail.messages)} />
                {/* Billable tokens and cache-read tokens are two different economies — never
                    summed, see plan §3 "Panneau de détail au clic". */}
                <MetaField label="Tokens facturables" value={TimelineDomain.formatTokens(detail.billableTokens)} />
                <MetaField label="Cache lu" value={TimelineDomain.formatTokens(detail.cacheReadTokens)} />
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Description de la tâche
                  </h3>
                </div>
                <p className="rounded-md border border-border bg-card/40 p-3 text-sm text-foreground">
                  {detail.taskDescription ?? '—'}
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brief</h3>
                  {detail.briefTruncated ? <StatusBadge tone="warning">tronqué</StatusBadge> : null}
                </div>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card/60 p-3 font-mono text-xs leading-relaxed text-foreground">
                  {detail.brief}
                </pre>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rapport</h3>
                  {detail.reportTruncated ? <StatusBadge tone="warning">tronqué</StatusBadge> : null}
                </div>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card/60 p-3 font-mono text-xs leading-relaxed text-foreground">
                  {detail.report}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
