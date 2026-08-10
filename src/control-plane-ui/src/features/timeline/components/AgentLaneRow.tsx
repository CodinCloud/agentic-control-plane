import { cn } from '@/core';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { AgentLane, TimelineWindow } from '../timelineTypes';
import { LANE_LABEL_COLUMN_CLASS } from './laneLayout';

export interface AgentLaneRowProps {
  lane: AgentLane;
  window: TimelineWindow;
  maxBillableTokens: number;
  onSelect: (agentId: string) => void;
}

/**
 * One agent = one row. Width says duration, height says tokens (bounded
 * MIN/MAX in TimelineDomain), the numeric label always sits beside the bar.
 * Clicking a bar opens the detail panel (brief/rapport/tokens/modèle) — see
 * GanttChart and components/AgentDetailPanel.
 */
export function AgentLaneRow({ lane, window, maxBillableTokens, onSelect }: AgentLaneRowProps) {
  const ongoing = TimelineDomain.isOngoing(lane);
  const { leftPct, widthPct } = TimelineDomain.barPosition(lane, window);
  const heightPx = TimelineDomain.barHeightPx(lane.billableTokens, maxBillableTokens);
  const side = TimelineDomain.labelSide(leftPct, widthPct);
  const color = TimelineDomain.agentColor(lane.agentType);
  const durationLabel = TimelineDomain.formatDuration(TimelineDomain.effectiveDurationMs(lane));
  const tokensLabel = TimelineDomain.formatTokens(lane.billableTokens);

  return (
    <div className="flex items-center gap-3 border-b border-neutral-800/60 py-2 last:border-b-0">
      <div className={cn(LANE_LABEL_COLUMN_CLASS, 'min-w-0')}>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="truncate text-xs font-medium text-neutral-200" title={lane.agentType}>
            {lane.agentType}
          </span>
          {ongoing ? (
            <StatusBadge tone="warning" className="shrink-0">
              en cours
            </StatusBadge>
          ) : null}
        </div>
        <div className="truncate text-[11px] text-neutral-500" title={lane.taskDescription}>
          {lane.taskDescription}
        </div>
      </div>

      <div className="relative h-12 flex-1 rounded-md border border-neutral-800 bg-neutral-900/20">
        <button
          type="button"
          onClick={() => onSelect(lane.agentId)}
          title={`${lane.agentId} — ${lane.taskDescription}`}
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500',
            side === 'left' ? 'flex-row-reverse' : 'flex-row',
          )}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          <span
            className={cn('block w-full rounded-sm', ongoing && 'animate-pulse border-2 border-dashed border-white/70')}
            style={{ height: `${heightPx}px`, minWidth: '3px', backgroundColor: color }}
            aria-hidden="true"
          />
          <span
            className={cn(
              'whitespace-nowrap text-[10px] tabular-nums text-neutral-400',
              side === 'left' ? 'mr-1.5' : 'ml-1.5',
            )}
          >
            {durationLabel} · {tokensLabel} tk
          </span>
        </button>
      </div>
    </div>
  );
}
