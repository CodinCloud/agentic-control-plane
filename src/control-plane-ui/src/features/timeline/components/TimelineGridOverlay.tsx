import { cn } from '@/core';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineWindow } from '../timelineTypes';
import { LANE_TRACK_OFFSET, TIMELINE_GLIDE_CLASS } from './laneLayout';

export interface TimelineGridOverlayProps {
  window: Pick<TimelineWindow, 'since' | 'until'>;
  /** Position du repère « maintenant », en pourcentage — `null` hors fenêtre. */
  nowPct: number | null;
}

/**
 * Grille verticale et repère « maintenant », en **une seule surcouche** au-dessus
 * de toutes les lanes plutôt qu'un rendu par lane (plan 007, décision #5) : une
 * ligne de grille est un instant, pas une propriété de rangée, et la dessiner N
 * fois briserait sa continuité au moindre écart d'arrondi.
 *
 * Purement décorative — `pointer-events-none`, cachée aux lecteurs d'écran :
 * elle ne porte que ce que l'axe dit déjà en toutes lettres.
 */
export function TimelineGridOverlay({ window, nowPct }: TimelineGridOverlayProps) {
  const ticks = TimelineDomain.axisTicks(window);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 z-10 overflow-hidden"
      style={{ left: LANE_TRACK_OFFSET }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.key}
          className={cn('absolute inset-y-0 w-px bg-border/70', TIMELINE_GLIDE_CLASS)}
          style={{ left: `${tick.pct}%` }}
        />
      ))}

      {nowPct !== null ? (
        <>
          {/* Le futur, hachuré : ces pourcents-là ne peuvent rien contenir, et
              le dire évite de lire un blanc comme une absence d'activité. */}
          <span
            className={cn('absolute inset-y-0 right-0 bg-background/40', TIMELINE_GLIDE_CLASS)}
            style={{ left: `${nowPct}%` }}
          />
          <span
            className={cn('absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary/80', TIMELINE_GLIDE_CLASS)}
            style={{ left: `${nowPct}%` }}
          />
        </>
      ) : null}
    </div>
  );
}
