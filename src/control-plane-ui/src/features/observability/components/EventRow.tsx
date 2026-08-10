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
      className="flex items-center gap-3 border-b border-neutral-800/60 px-3 py-2.5 text-sm last:border-b-0 hover:bg-neutral-900/40"
      title={event.error ?? undefined}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: ObservabilityDomain.sessionColor(event.sessionId) }}
        aria-hidden="true"
        title={event.sessionId}
      />

      <span className="w-20 shrink-0 tabular-nums text-neutral-500">
        {ObservabilityDomain.formatTimestamp(event.receivedAt)}
      </span>

      <span
        className={
          isMain
            ? 'w-36 shrink-0 truncate font-medium text-neutral-200'
            : 'w-36 shrink-0 truncate text-sky-400'
        }
        title={ObservabilityDomain.agentLabel(event.agentType)}
      >
        {ObservabilityDomain.agentLabel(event.agentType)}
      </span>

      <span className="w-8 shrink-0 text-center" aria-hidden="true">
        {event.toolName ? ObservabilityDomain.toolEmoji(event.toolName) : ObservabilityDomain.eventEmoji(event.eventName)}
      </span>

      <span className="min-w-0 flex-1 truncate text-neutral-300" title={ObservabilityDomain.eventLabel(event)}>
        {ObservabilityDomain.eventLabel(event)}
      </span>

      <span className="w-20 shrink-0 truncate text-right text-neutral-500" title={event.project ?? undefined}>
        {event.project ?? '—'}
      </span>

      <span className="w-20 shrink-0 text-right tabular-nums text-neutral-500">
        {ObservabilityDomain.formatDuration(event.durationMs)}
      </span>

      <span className="w-20 shrink-0 text-right tabular-nums text-neutral-500">
        {ObservabilityDomain.formatTokens(billable)}
      </span>

      <span className="w-16 shrink-0 text-right">
        {failed ? <StatusBadge tone="destructive">échec</StatusBadge> : null}
      </span>
    </div>
  );
}
