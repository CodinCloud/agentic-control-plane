import { useEffect, useState } from 'react';

/**
 * Une seconde, pas trois. C'est le battement du défilement : la fenêtre
 * vivante se recale à chaque tick et une transition CSS d'exactement la même
 * durée interpole entre deux recalages. Le mouvement perçu est continu pour un
 * seul re-render React par seconde — aucune boucle d'animation, aucun canvas
 * (plan 007, décision #3, qui amende la décision #9 du plan 006).
 */
const DEFAULT_TICK_INTERVAL_MS = 1000;

/**
 * Local clock, re-rendering consumers every `intervalMs` while mounted. The
 * only reason this exists: an ongoing bar's right edge must visibly advance
 * between data refetches, not just when new data lands (plan §"Temps réel",
 * decision #4) — see TimelineDomain.livingWindow, which consumes this.
 */
export function useNowTick(intervalMs: number = DEFAULT_TICK_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
