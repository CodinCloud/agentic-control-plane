import { StatusBadge } from '@/components/vloc/StatusBadge';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { EventListItem } from '../observabilityTypes';

export interface EventRowProps {
  event: EventListItem;
}

/**
 * One timeline row. Must read at a glance: which session, which agent,
 * which tool, how long, how many tokens, and whether it failed.
 */
export function EventRow({ event }: EventRowProps) {
  const failed = ObservabilityDomain.isFailure(event);
  const isMain = ObservabilityDomain.isMainSession(event.agentType);
  const billable = ObservabilityDomain.billableTokens(event);

  return (
    <div
      className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 text-sm last:border-b-0 hover:bg-card/40"
      title={event.error ?? undefined}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: ObservabilityDomain.sessionColor(event.sessionId) }}
        aria-hidden="true"
        title={event.sessionId}
      />

      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
        {ObservabilityDomain.formatTimestamp(event.receivedAt)}
      </span>

      <span
        className={
          isMain
            ? 'w-36 shrink-0 truncate font-medium text-foreground'
            : 'w-36 shrink-0 truncate text-primary'
        }
        title={ObservabilityDomain.agentLabel(event.agentType)}
      >
        {ObservabilityDomain.agentLabel(event.agentType)}
      </span>

      <span className="w-8 shrink-0 text-center" aria-hidden="true">
        {event.toolName ? ObservabilityDomain.toolEmoji(event.toolName) : ObservabilityDomain.eventEmoji(event.eventName)}
      </span>

      <span className="min-w-0 flex-1 truncate text-foreground" title={ObservabilityDomain.eventLabel(event)}>
        {ObservabilityDomain.eventLabel(event)}
      </span>

      {/* Assez large pour un nom de projet entier : à `w-20`, « learning-framework »
          se lisait « learning-fr… », ce qui ne distingue rien de ses voisins. */}
      <span className="w-44 shrink-0 truncate text-right text-muted-foreground" title={event.project ?? undefined}>
        {event.project ?? '—'}
      </span>

      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
        {ObservabilityDomain.formatDuration(event.durationMs)}
      </span>

      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
        {ObservabilityDomain.formatTokens(billable)}
      </span>

      <span className="w-16 shrink-0 text-right">
        {failed ? <StatusBadge tone="destructive">échec</StatusBadge> : null}
      </span>
    </div>
  );
}
