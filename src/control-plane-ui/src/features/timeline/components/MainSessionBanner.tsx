import { StatusBadge } from '@/components/vloc/StatusBadge';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { MainSessionSummary } from '../timelineTypes';

export interface MainSessionBannerProps {
  /** null only when the window has no session at all — a fresh database, not an error. */
  mainSession: MainSessionSummary | null;
}

/**
 * The main session is never a lane — it covers the whole duration and would
 * crush every agent lane at scale. Rendered as a reference band above the
 * lanes, with its own time scale (plan §"Hors périmètre").
 */
export function MainSessionBanner({ mainSession }: MainSessionBannerProps) {
  if (mainSession === null) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/20 p-3 text-xs text-neutral-500">
        Aucune session dans cette fenêtre — base vide.
      </div>
    );
  }

  const ongoing = mainSession.endedAt === null;
  const window = { since: mainSession.startedAt, until: mainSession.endedAt ?? new Date().toISOString() };
  const ticks = TimelineDomain.timeTicks(window, 3);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-neutral-200" title={mainSession.sessionId}>
            Session principale · {mainSession.sessionId.slice(0, 8)}
          </span>
          <span className="text-[11px] text-neutral-500">{mainSession.model}</span>
          {ongoing ? <StatusBadge tone="warning">en cours</StatusBadge> : null}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
          {mainSession.messages} messages · {TimelineDomain.formatTokens(mainSession.billableTokens)} tk
        </span>
      </div>

      <div className="relative mt-2 h-3 rounded-full bg-neutral-800">
        <div
          className={
            ongoing ? 'h-full w-full rounded-full bg-neutral-500 animate-pulse' : 'h-full w-full rounded-full bg-neutral-500'
          }
        />
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-neutral-600">
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
