/**
 * Shared layout constant: the fixed-width label column (agent type + task
 * description) that every row — axis, lanes — aligns against, so the track
 * area to its right shares one honest, common time scale.
 */
export const LANE_LABEL_COLUMN_CLASS = 'w-64 shrink-0';

/**
 * Décalage de la surcouche (grille verticale + repère « maintenant ») pour
 * qu'elle commence exactement où commencent les pistes : largeur de la colonne
 * de libellés (`w-64` = 16rem) plus la gouttière (`gap-3` = 0.75rem). Une
 * surcouche unique au-dessus de toutes les lanes, jamais un rendu par lane
 * (plan 007, décision #5) — d'où la nécessité de reproduire ce décalage ici.
 */
export const LANE_TRACK_OFFSET = 'calc(16rem + 0.75rem)';

/**
 * Le glissement lui-même. `useNowTick` recale la fenêtre chaque seconde et le
 * GPU interpole exactement cette seconde, en linéaire : le temps ne ralentit
 * pas en fin de course, donc pas d'`ease`. Porté par tout ce qui est positionné
 * sur l'axe — barres, graduations, grille, repère.
 */
export const TIMELINE_GLIDE_CLASS = 'transition-[left,width] duration-1000 ease-linear motion-reduce:transition-none';
