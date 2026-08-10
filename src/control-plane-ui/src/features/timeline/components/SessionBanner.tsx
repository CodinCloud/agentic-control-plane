import { cn } from '@/core';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineSession } from '../timelineTypes';

export interface SessionBannerProps {
  session: TimelineSession;
}

/**
 * One session's reference band — it covers the whole session duration and
 * would crush every agent lane at scale, so it never renders as a lane
 * itself. `isActive` (last activity < 5 min, plan decision #2) drives the
 * live/archived distinction here the same way `TimelineDomain.isOngoing`
 * drives it on an agent bar (see AgentLaneRow) — a session that is technically
 * still open (`endedAt === null`) but idle for a while reads as archived, not
 * live, which is the whole point of the field.
 */
export function SessionBanner({ session }: SessionBannerProps) {
  const window = { since: session.startedAt, until: session.endedAt ?? new Date().toISOString() };
  const ticks = TimelineDomain.timeTicks(window, 3);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-neutral-200" title={session.sessionId}>
            {session.project ?? 'Session'} · {session.sessionId.slice(0, 8)}
          </span>
          <span className="text-xs text-neutral-500">{session.model}</span>
          {session.isActive ? (
            <StatusBadge tone="success">active</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">archivée</StatusBadge>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
          {session.messages} messages · {TimelineDomain.formatTokens(session.billableTokens)} tk
        </span>
      </div>

      <div className="relative mt-2 h-3 rounded-full bg-neutral-800">
        <div className={cn('h-full w-full rounded-full bg-neutral-500', session.isActive && 'animate-pulse')} />
      </div>
      <div className="relative mt-1 h-4 text-xs text-neutral-600">
        {ticks.map((tick) => (
          <span
            key={tick.pct}
            className="absolute -translate-x-1/2 tabular-nums first:translate-x-0 last:-translate-x-full"
            style={{ left: `${tick.pct}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
