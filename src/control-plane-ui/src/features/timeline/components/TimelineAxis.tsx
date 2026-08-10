import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineWindow } from '../timelineTypes';
import { LANE_LABEL_COLUMN_CLASS } from './laneLayout';

export interface TimelineAxisProps {
  window: TimelineWindow;
}

/** Shared tick row above the agent lanes — the window's own time scale, honest and linear. */
export function TimelineAxis({ window }: TimelineAxisProps) {
  const ticks = TimelineDomain.timeTicks(window);

  return (
    <div className="flex items-center gap-3 pb-1 text-xs text-neutral-600">
      <div className={LANE_LABEL_COLUMN_CLASS} aria-hidden="true" />
      <div className="relative h-4 flex-1">
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
