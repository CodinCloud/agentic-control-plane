import { cn } from '@/core';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineWindow } from '../timelineTypes';
import { LANE_LABEL_COLUMN_CLASS, TIMELINE_GLIDE_CLASS } from './laneLayout';

export interface TimelineAxisProps {
  window: Pick<TimelineWindow, 'since' | 'until'>;
  /** Position du repère « maintenant », en pourcentage — `null` hors fenêtre. */
  nowPct?: number | null;
  /**
   * Colle l'axe en haut de son conteneur de défilement. Le Gantt scrolle
   * verticalement dès trois sessions ; un axe qui part avec les lanes laisse un
   * dessin sans échelle (plan 007, §"défauts secondaires").
   */
  sticky?: boolean;
}

/**
 * Shared tick row above the agent lanes — the window's own time scale, honest
 * and linear. Les graduations tombent sur des instants ronds et **glissent**
 * avec la fenêtre : leur clé est l'instant lui-même, si bien que React les
 * déplace au lieu de les remplacer, et la transition CSS fait le reste.
 */
export function TimelineAxis({ window, nowPct = null, sticky = false }: TimelineAxisProps) {
  const ticks = TimelineDomain.axisTicks(window);

  return (
    <div
      className={cn(
        'flex items-end gap-3 pb-1.5 text-xs text-muted-foreground',
        sticky && 'sticky top-0 z-20 -mt-1 bg-card pt-1',
      )}
    >
      <div className={LANE_LABEL_COLUMN_CLASS} aria-hidden="true" />
      <div className="relative h-4 flex-1 overflow-hidden">
        {ticks.map((tick) => (
          <span
            key={tick.key}
            className={cn(
              'absolute bottom-0 -translate-x-1/2 tabular-nums whitespace-nowrap',
              TIMELINE_GLIDE_CLASS,
            )}
            style={{ left: `${tick.pct}%` }}
          >
            {tick.label}
          </span>
        ))}

        {nowPct !== null ? (
          <span
            className={cn(
              'absolute bottom-0 -translate-x-1/2 rounded-sm bg-primary px-1 font-medium text-primary-foreground',
              TIMELINE_GLIDE_CLASS,
            )}
            style={{ left: `${nowPct}%` }}
          >
            maintenant
          </span>
        ) : null}
      </div>
    </div>
  );
}
