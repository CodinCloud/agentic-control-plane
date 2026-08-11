import { StatusBadge } from '@/components/vloc/StatusBadge';
import { ObservabilityDomain } from '@/features/observability';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineSession } from '../timelineTypes';

export interface SessionBannerProps {
  session: TimelineSession;
  now: number;
}

/**
 * En-tête de groupe : projet · modèle · délégation · durée · coût. Ne dessine
 * pas de barre pleine largeur (plan 006, §"Ce qui disparaît") — la lane 0
 * (`AgentLaneRow` sur `agentId: "main"`) est la barre elle-même, texturée par
 * sa densité d'appels d'outil.
 *
 * Le compte de sous-agents et le pic de parallélisme sont ici et pas ailleurs
 * (plan 007, décision #7) : c'est la conclusion que le Gantt sert à faire voir,
 * et la donner en toutes lettres dispense d'aller la reconstituer à l'œil sur
 * la géométrie.
 */
export function SessionBanner({ session, now }: SessionBannerProps) {
  const subagents = TimelineDomain.subagentLanes(session.lanes);
  const peak = TimelineDomain.peakParallelism(session.lanes, now);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground" title={session.sessionId}>
          {session.project ?? 'Session'} · {session.sessionId.slice(0, 8)}
        </span>
        <span className="text-xs text-muted-foreground">{session.model}</span>
        {session.isActive ? (
          <StatusBadge tone="success">active</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">archivée</StatusBadge>
        )}

        {subagents.length > 0 ? (
          <span
            className="text-xs text-muted-foreground"
            title="Instances de sous-agents lancées par cette session, et nombre maximal ouvertes au même instant"
          >
            <span className="font-medium text-foreground">{subagents.length}</span> sous-agent
            {subagents.length > 1 ? 's' : ''}
            {peak > 1 ? (
              <>
                {' · '}
                <span className="font-medium text-foreground">{peak}</span> en parallèle au pic
              </>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" title="Aucune délégation : tout s'est fait dans la session principale">
            aucune délégation
          </span>
        )}
      </div>

      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {TimelineDomain.formatDuration(TimelineDomain.sessionDurationMs(session))} ·{' '}
        {TimelineDomain.formatTokens(session.billableTokens)} tk ·{' '}
        {/* Sous-agents compris, contrairement aux tokens juste à gauche — voir
            timelineTypes.TimelineSession.costUsd. */}
        <span className="text-foreground" title="Coût équivalent API, sous-agents compris">
          {ObservabilityDomain.formatCostUsd(session.costUsd)}
        </span>
      </span>
    </div>
  );
}
