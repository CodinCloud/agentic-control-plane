import {
  TIMELINE_ACTIVE_SESSIONS,
  TIMELINE_ALL_SESSIONS,
  type AgentLane,
  type LaneDensity,
  type TimelineGrid,
  type TimelineSession,
  type TimelineSessionFilter,
  type TimelineWindow,
} from '../timelineTypes';

/**
 * Un rectangle de densité prêt à être dessiné — position déjà résolue en
 * pourcentage local à la lane (0-100 sur [lane.startedAt, lane.endedAt ?? now]),
 * opacité déjà bornée. Voir `TimelineDomain.densityCells`.
 */
export interface DensityCell {
  /** Index absolu dans la grille partagée — `firstBucket` de la lane, décalé. */
  bucketIndex: number;
  count: number;
  leftPct: number;
  widthPct: number;
  opacity: number;
  /** Bornes réelles du bucket, pour le survol (plan §"Survol"). */
  startIso: string;
  endIso: string;
}

/**
 * Pure, static business rules for the timeline (Gantt) feature. No IO, no
 * React. Self-contained: formatting helpers are duplicated from the
 * observability feature on purpose — features stay decoupled from each other.
 */
export class TimelineDomain {
  /**
   * Bar thickness bounds, in pixels. A bar must stay legible even at zero
   * tokens (MIN) and the heaviest agent must not crush the lane (MAX).
   * Tuned against a 48px lane row height, leaving room above/below for the
   * row border and hover state.
   */
  static readonly MIN_BAR_HEIGHT_PX = 6;
  static readonly MAX_BAR_HEIGHT_PX = 28;

  /**
   * Breathing room left/right of an agent's own zoomed track (see
   * `agentWindow`) — the first and last glyph must not touch the track's
   * edges.
   */
  static readonly WINDOW_FIT_MARGIN_RATIO = 0.03;

  /**
   * A lane counts as "en cours" if it has no `endedAt`. The contract already
   * encodes the 2-minute staleness rule server-side (see plan §"Contrat
   * d'API") — the client only reacts to the null/non-null distinction.
   */
  static isOngoing(lane: Pick<AgentLane, 'endedAt'>): boolean {
    return lane.endedAt === null;
  }

  /**
   * Applique le filtre de session à ce que le serveur a renvoyé. « Actives »
   * s'appuie sur `isActive` (dernière activité < 5 min, décision #2 de la spec
   * 003) — c'est le défaut : ce qui tourne maintenant est ce qu'on regarde,
   * l'historique se demande explicitement.
   *
   * Le dernier cas est défensif : quand un `sessionId` précis est choisi, le
   * serveur a déjà restreint sa réponse.
   */
  static applySessionFilter(sessions: TimelineSession[], filter: TimelineSessionFilter): TimelineSession[] {
    if (filter === TIMELINE_ALL_SESSIONS) return sessions;
    if (filter === TIMELINE_ACTIVE_SESSIONS) return sessions.filter((session) => session.isActive);
    return sessions.filter((session) => session.sessionId === filter);
  }

  /** Le `sessionId` à passer au serveur — `null` pour les deux sentinelles, qui se résolvent côté client. */
  static toServerSessionId(filter: TimelineSessionFilter): string | null {
    return filter === TIMELINE_ACTIVE_SESSIONS || filter === TIMELINE_ALL_SESSIONS ? null : filter;
  }

  static maxBillableTokens(lanes: Pick<AgentLane, 'billableTokens'>[]): number {
    return lanes.reduce((max, lane) => Math.max(max, lane.billableTokens), 0);
  }

  /** Linear interpolation between MIN/MAX bar height, bounded by the heaviest lane in view. */
  static barHeightPx(billableTokens: number, maxBillableTokens: number): number {
    if (maxBillableTokens <= 0) return TimelineDomain.MIN_BAR_HEIGHT_PX;
    const ratio = TimelineDomain.clamp(billableTokens / maxBillableTokens, 0, 1);
    return Math.round(
      TimelineDomain.MIN_BAR_HEIGHT_PX + ratio * (TimelineDomain.MAX_BAR_HEIGHT_PX - TimelineDomain.MIN_BAR_HEIGHT_PX),
    );
  }

  /**
   * Où tombe le repère « maintenant » dans une fenêtre vivante, en pourcentage
   * de sa largeur. Volontairement pas 50 % : il n'existe aucune donnée dans le
   * futur, et centrer le repère condamnerait la moitié droite de l'écran à
   * rester vide — or la largeur *est* du temps (plan 007, décision #2). Les
   * 15 % restants ne sont qu'une marge de respiration devant la barre en cours.
   */
  static readonly NOW_MARKER_PCT = 85;

  /**
   * La fenêtre du régime vivant : `span` de passé occupant `NOW_MARKER_PCT` de
   * la largeur, plus la marge qui complète les 100 %. Elle se recalcule à
   * chaque tick d'horloge, ce qui *est* le défilement — les barres gardent
   * leurs instants absolus, c'est l'axe qui glisse sous elles.
   *
   * Remplace `contentWindow` sur la tour de contrôle uniquement. L'écran
   * d'analyse garde les bornes du contenu : une session terminée veut être vue
   * en entier (plan 007, décision #1).
   */
  static livingWindow(nowMs: number, spanMs: number): Pick<TimelineWindow, 'since' | 'until'> {
    const span = Math.max(spanMs, 1);
    const leadMs = (span * (100 - TimelineDomain.NOW_MARKER_PCT)) / TimelineDomain.NOW_MARKER_PCT;
    return {
      since: new Date(nowMs - span).toISOString(),
      until: new Date(nowMs + leadMs).toISOString(),
    };
  }

  /**
   * Position du repère « maintenant » dans une fenêtre quelconque, ou `null`
   * s'il tombe en dehors. En régime vivant il vaut toujours `NOW_MARKER_PCT`
   * par construction ; sur l'écran d'analyse d'une session terminée, il n'a
   * simplement pas lieu d'être dessiné.
   */
  static nowMarkerPct(window: Pick<TimelineWindow, 'since' | 'until'>, nowMs: number): number | null {
    const sinceMs = new Date(window.since).getTime();
    const untilMs = new Date(window.until).getTime();
    const span = untilMs - sinceMs;
    if (!(span > 0) || nowMs < sinceMs || nowMs > untilMs) return null;
    return ((nowMs - sinceMs) / span) * 100;
  }

  /**
   * Bar position as a percentage of the window's [since, until] span — the
   * only honest way to keep overlaps and proportions true (linear scale,
   * decision #3 of the plan). An ongoing lane (`endedAt === null`) stops at
   * `nowMs` — au repère, jamais au bord droit de la fenêtre, dont les derniers
   * pourcents sont du futur (plan 007, décision #2).
   */
  static barPosition(
    lane: Pick<AgentLane, 'startedAt' | 'endedAt'>,
    window: Pick<TimelineWindow, 'since' | 'until'>,
    nowMs?: number,
  ): {
    leftPct: number;
    widthPct: number;
  } {
    const sinceMs = new Date(window.since).getTime();
    const untilMs = new Date(window.until).getTime();
    const span = untilMs - sinceMs;
    if (!(span > 0)) return { leftPct: 0, widthPct: 0 };

    const startedMs = TimelineDomain.clamp(new Date(lane.startedAt).getTime(), sinceMs, untilMs);
    const endedMs = lane.endedAt
      ? TimelineDomain.clamp(new Date(lane.endedAt).getTime(), sinceMs, untilMs)
      : TimelineDomain.clamp(nowMs ?? untilMs, sinceMs, untilMs);

    const leftPct = ((startedMs - sinceMs) / span) * 100;
    const widthPct = Math.max(0, ((endedMs - startedMs) / span) * 100);
    return { leftPct, widthPct: Math.min(widthPct, 100 - leftPct) };
  }

  /**
   * Position d'un instant ponctuel — un appel d'outil — en pourcentage de la
   * fenêtre. Contrairement à `barPosition`, il n'y a pas de largeur : un glyphe
   * marque un moment, pas une durée. Borné à [0, 100] pour qu'un événement
   * légèrement hors fenêtre reste visible à son bord plutôt que de disparaître.
   */
  static pointPositionPct(at: string, window: Pick<TimelineWindow, 'since' | 'until'>): number {
    const sinceMs = new Date(window.since).getTime();
    const untilMs = new Date(window.until).getTime();
    const span = untilMs - sinceMs;
    if (!(span > 0)) return 0;

    return TimelineDomain.clamp(((new Date(at).getTime() - sinceMs) / span) * 100, 0, 100);
  }

  /**
   * Fenêtre propre à un agent, sur laquelle sa piste de zoom se recale. Un agent
   * encore en cours s'étend jusqu'à maintenant. Une marge évite que le premier et
   * le dernier glyphe ne collent aux bords.
   */
  static agentWindow(
    lane: Pick<AgentLane, 'startedAt' | 'endedAt'>,
    nowMs: number,
  ): Pick<TimelineWindow, 'since' | 'until'> {
    const startMs = new Date(lane.startedAt).getTime();
    const endMs = lane.endedAt ? new Date(lane.endedAt).getTime() : nowMs;
    const span = Math.max(endMs - startMs, 1);
    const margin = span * TimelineDomain.WINDOW_FIT_MARGIN_RATIO;

    return {
      since: new Date(startMs - margin).toISOString(),
      until: new Date(endMs + margin).toISOString(),
    };
  }

  /** Fresher than the server's `durationMs` for an ongoing lane, which may lag behind "now". */
  static effectiveDurationMs(lane: Pick<AgentLane, 'startedAt' | 'endedAt' | 'durationMs'>): number {
    if (!TimelineDomain.isOngoing(lane)) return lane.durationMs;
    return Math.max(0, Date.now() - new Date(lane.startedAt).getTime());
  }

  /**
   * Stretches the window's right edge to `nowMs` when the local clock has
   * moved past the server's `until` — the visible mechanism behind an
   * ongoing bar's width growing between data refreshes (plan §"Temps réel",
   * decision #4). Never shrinks the window, and closed bars are unaffected:
   * `barPosition` clamps their real `endedAt` inside [since, until] either way.
   */
  static extendWindowToNow(window: TimelineWindow, nowMs: number): TimelineWindow {
    const untilMs = new Date(window.until).getTime();
    if (!(nowMs > untilMs)) return window;
    return { ...window, until: new Date(nowMs).toISOString() };
  }

  /**
   * The axis the whole Gantt renders against — the server's own
   * `contentSince`/`contentUntil` (plan 006, décision #7), never a
   * client-side fit. `fitWindowToSessions` existed only because the server's
   * declared `since`/`until` was a useless 24h default; the server now
   * returns the real content bounds directly, computed on the same data it
   * already uses to bucketize the density grid — one less piece of logic to
   * test on the client.
   */
  static contentWindow(window: TimelineWindow): TimelineWindow {
    return { ...window, since: window.contentSince, until: window.contentUntil };
  }

  /**
   * Échelle de pas « ronds » où `axisTicks` choisit sa graduation. Fixe et
   * ordonnée : on prend le premier pas assez large, jamais un pas calculé —
   * un axe dont la graduation change de nature d'une seconde à l'autre est
   * illisible.
   */
  private static readonly NICE_TICK_STEPS_MS = [
    1_000, 5_000, 10_000, 15_000, 30_000,
    60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
    3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000,
  ];

  /**
   * Graduations tombant sur des **instants ronds**, pas à pourcentage fixe.
   *
   * `timeTicks` répartissait N ticks à 0/25/50/75/100 % : en régime glissant,
   * cela donne des traits immobiles portant des libellés qui défilent — soit
   * exactement l'inverse du mouvement qu'on veut donner à voir. Ici les ticks
   * sont des instants, donc ils glissent avec la donnée, et leur `key` est
   * l'instant lui-même : c'est ce qui permet à React de les faire *bouger*
   * plutôt que de les remplacer (plan 007, décisions #3/#4).
   *
   * Les multiples se comptent depuis l'epoch UTC : correct pour tout fuseau à
   * décalage horaire entier, ce qui couvre l'Europe (risque assumé, plan 007).
   */
  static axisTicks(
    window: Pick<TimelineWindow, 'since' | 'until'>,
    targetCount = 6,
  ): { key: number; pct: number; label: string }[] {
    const sinceMs = new Date(window.since).getTime();
    const untilMs = new Date(window.until).getTime();
    const span = untilMs - sinceMs;
    if (!(span > 0) || targetCount < 2) return [];

    const ideal = span / targetCount;
    const steps = TimelineDomain.NICE_TICK_STEPS_MS;
    const stepMs = steps.find((candidate) => candidate >= ideal) ?? steps[steps.length - 1];
    // Un pas fin sur une portée très large produirait des milliers de traits :
    // borne dure, indépendante de l'échelle choisie.
    const maxTicks = 40;

    const ticks: { key: number; pct: number; label: string }[] = [];
    for (let at = Math.ceil(sinceMs / stepMs) * stepMs; at <= untilMs && ticks.length < maxTicks; at += stepMs) {
      ticks.push({
        key: at,
        pct: ((at - sinceMs) / span) * 100,
        label: TimelineDomain.formatTick(at, stepMs),
      });
    }
    return ticks;
  }

  /** Secondes visibles seulement quand le pas descend sous la minute — sinon c'est du bruit. */
  private static formatTick(atMs: number, stepMs: number): string {
    return new Date(atMs).toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      ...(stepMs < 60_000 ? { second: '2-digit' as const } : {}),
    });
  }

  /**
   * Which side of the bar the "215 416 tk · 12m 50s" label renders on. A bar
   * ending past this threshold is close enough to the track's right edge
   * that a trailing label would spill out of the card — flip it to the left
   * of the bar instead. The label must never render inside the bar itself
   * (plan decision #2).
   */
  static labelSide(leftPct: number, widthPct: number): 'left' | 'right' {
    return leftPct + widthPct > 70 ? 'left' : 'right';
  }

  /**
   * La lane principale ne consomme pas de slot catégoriel : elle porte
   * `--primary`, la référence à laquelle les sous-agents se comparent — pas
   * une série parmi d'autres. Volontairement pas grise : le gris dit
   * « désactivé », l'inverse du message (plan §"Contrainte visuelle").
   */
  static readonly MAIN_LANE_COLOR = 'var(--primary)';

  /** Huit slots fixes, ordre fixe, jamais générés — validés contre `--card` (plan §"Contrainte visuelle"). */
  static readonly CATEGORICAL_SLOT_COUNT = 8;

  /**
   * Types d'agent connus → slot fixe. Les deux slots restants (7, 8) sont
   * réservés au repli par hachage ci-dessous, pour qu'un type inconnu ne
   * puisse jamais retomber sur la couleur d'un type connu.
   */
  private static readonly KNOWN_AGENT_TYPE_SLOT: Record<string, number> = {
    'backend-dev': 1,
    'frontend-dev': 2,
    'devops-deployer': 3,
    'general-purpose': 4,
    Explore: 5,
    Plan: 6,
  };

  private static readonly UNKNOWN_AGENT_TYPE_SLOTS = [7, 8];

  /**
   * Slot catégoriel d'un sous-agent — jamais une teinte calculée
   * (`TimelineDomain.agentColor` générait `hsl(hash, 70%, 58%)`, sans
   * garantie de contraste ni de séparation CVD ; remplacé par le plan 006).
   * Repli par hachage stable vers un des deux slots restants pour un type
   * inconnu : la couleur suit l'entité, jamais son rang — filtrer les
   * sessions ne doit repeindre aucune lane survivante.
   */
  static agentColorVar(agentType: string): string {
    const knownSlot = TimelineDomain.KNOWN_AGENT_TYPE_SLOT[agentType];
    const slot = knownSlot ?? TimelineDomain.hashToUnknownSlot(agentType);
    return `var(--chart-${slot})`;
  }

  private static hashToUnknownSlot(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    const slots = TimelineDomain.UNKNOWN_AGENT_TYPE_SLOTS;
    return slots[hash % slots.length];
  }

  /** Couleur d'une lane, principale ou sous-agent — jamais devinée par le composant appelant. */
  static laneColor(lane: Pick<AgentLane, 'isMainSession' | 'agentType'>): string {
    if (lane.isMainSession || lane.agentType === null) return TimelineDomain.MAIN_LANE_COLOR;
    return TimelineDomain.agentColorVar(lane.agentType);
  }

  /**
   * Plancher d'opacité d'un bucket recouvert (`count > 0`) — un appel isolé
   * doit rester visible plutôt que de s'évanouir dans le fond (plan §"Contrainte
   * visuelle").
   */
  static readonly DENSITY_OPACITY_FLOOR = 0.25;

  /**
   * Maximum de comptes de buckets sur l'ensemble des lanes affichées — jamais
   * par lane, sans quoi un agent tranquille paraîtrait aussi dense que la
   * session principale (plan décision #10, risque #3).
   */
  static maxDensityCount(lanes: Pick<AgentLane, 'density'>[]): number {
    let max = 0;
    for (const lane of lanes) {
      for (const count of lane.density.buckets) max = Math.max(max, count);
    }
    return max;
  }

  /**
   * Rectangles de densité prêts à dessiner, positionnés en pourcentage local à
   * la **portion visible** de la lane — pas sur l'axe entier du Gantt, pour que
   * la texture reste exactement bornée par la barre qui la porte quel que soit
   * l'arrondi de `barPosition`. `firstBucket` ancre chaque bucket sur la grille
   * partagée (`window.grid`), en absolu depuis `contentSince` : c'est ce qui
   * rend le survol honnête (plan §"Survol") et l'opacité comparable entre lanes.
   *
   * « Portion visible » et non « lane entière » : c'est la correction qu'impose
   * la fenêtre glissante du plan 007. La base locale doit être exactement celle
   * que `barPosition` a retenue pour dessiner la barre — sinon une lane
   * commencée avant la fenêtre verrait sa densité comprimée dans le morceau qui
   * reste, et la texture désignerait de mauvaises heures. Avec un axe calé sur
   * l'union du contenu, une lane n'était presque jamais coupée et le défaut
   * restait invisible ; à dix minutes de portée, la lane principale l'est
   * systématiquement.
   */
  static densityCells(
    lane: Pick<AgentLane, 'density' | 'startedAt' | 'endedAt'>,
    window: Pick<TimelineWindow, 'since' | 'until'>,
    grid: Pick<TimelineGrid, 'bucketMs'>,
    contentSince: string,
    maxCount: number,
    nowMs: number,
  ): DensityCell[] {
    const density: LaneDensity = lane.density;
    if (density.buckets.length === 0) return [];

    const contentSinceMs = new Date(contentSince).getTime();
    const sinceMs = new Date(window.since).getTime();
    const untilMs = new Date(window.until).getTime();

    // Mêmes bornes que `barPosition`, à la ligne près : une lane en cours
    // s'arrête au repère « maintenant », jamais au bord droit de la fenêtre.
    const visibleStartMs = TimelineDomain.clamp(new Date(lane.startedAt).getTime(), sinceMs, untilMs);
    const visibleEndMs = TimelineDomain.clamp(
      lane.endedAt ? new Date(lane.endedAt).getTime() : nowMs,
      sinceMs,
      untilMs,
    );
    const visibleSpan = Math.max(visibleEndMs - visibleStartMs, 1);

    return density.buckets.map((count, offset) => {
      const bucketIndex = density.firstBucket + offset;
      const startMs = contentSinceMs + bucketIndex * grid.bucketMs;
      const endMs = startMs + grid.bucketMs;
      const leftPct = TimelineDomain.clamp(((startMs - visibleStartMs) / visibleSpan) * 100, 0, 100);
      const rightPct = TimelineDomain.clamp(((endMs - visibleStartMs) / visibleSpan) * 100, 0, 100);
      const opacity = count > 0 && maxCount > 0 ? Math.max(TimelineDomain.DENSITY_OPACITY_FLOOR, count / maxCount) : 0;

      return {
        bucketIndex,
        count,
        leftPct,
        widthPct: Math.max(0, rightPct - leftPct),
        opacity,
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
      };
    });
  }

  /**
   * Séparateur du jeton de sélection `sessionId::agentId`. Un `agentId` seul ne
   * suffit pas : « main » désigne la session principale de *chaque* session, si
   * bien qu'une sélection non qualifiée ouvrait la piste de zoom dans toutes
   * les sessions à la fois (plan 007, décision #6). Ni un UUID ni « main » ne
   * contiennent `::`.
   */
  private static readonly SELECTION_SEPARATOR = '::';

  static selectionToken(sessionId: string, agentId: string): string {
    return `${sessionId}${TimelineDomain.SELECTION_SEPARATOR}${agentId}`;
  }

  /** L'`agentId` que ce jeton désigne dans cette session, ou `null` s'il vise une autre session. */
  static agentIdFromToken(token: string | null, sessionId: string): string | null {
    if (token === null) return null;
    const prefix = `${sessionId}${TimelineDomain.SELECTION_SEPARATOR}`;
    return token.startsWith(prefix) ? token.slice(prefix.length) : null;
  }

  /**
   * Retrait d'une lane, en crans. La principale reste à zéro — c'est la racine,
   * pas un enfant. Un sous-agent descend d'un cran par niveau de `spawnDepth`,
   * ce qui rend la filiation lisible sans cliquer (plan 007, décision #7).
   *
   * `spawnDepth` vaut 1 pour un sous-agent lancé directement par la session ;
   * le repli à 1 couvre un serveur qui ne le renseignerait pas.
   */
  static laneIndentDepth(lane: Pick<AgentLane, 'isMainSession' | 'spawnDepth'>): number {
    if (lane.isMainSession) return 0;
    return Math.max(1, Math.min(lane.spawnDepth ?? 1, 3));
  }

  static subagentLanes(lanes: AgentLane[]): AgentLane[] {
    return lanes.filter((lane) => !lane.isMainSession);
  }

  /**
   * Nombre maximal de sous-agents ouverts au même instant — la mesure du
   * parallélisme réel de la session. C'est la conclusion que le Gantt sert à
   * faire voir ; la chiffrer dans le bandeau la donne avant même d'avoir lu la
   * géométrie (plan 007, décision #7).
   *
   * Balayage par événements ouverture/fermeture : une fermeture est traitée
   * avant une ouverture au même instant, sans quoi deux agents qui se relaient
   * exactement compteraient comme parallèles.
   */
  static peakParallelism(lanes: AgentLane[], nowMs: number): number {
    const marks: { at: number; delta: number }[] = [];
    for (const lane of TimelineDomain.subagentLanes(lanes)) {
      const start = new Date(lane.startedAt).getTime();
      const end = lane.endedAt ? new Date(lane.endedAt).getTime() : nowMs;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      marks.push({ at: start, delta: 1 });
      marks.push({ at: Math.max(end, start), delta: -1 });
    }

    marks.sort((a, b) => (a.at === b.at ? a.delta - b.delta : a.at - b.at));

    let open = 0;
    let peak = 0;
    for (const mark of marks) {
      open += mark.delta;
      peak = Math.max(peak, open);
    }
    return peak;
  }

  /** Durée d'une session — pas de `durationMs` propre côté serveur, contrairement à une lane. */
  static sessionDurationMs(session: Pick<TimelineSession, 'startedAt' | 'endedAt'>): number {
    const startMs = new Date(session.startedAt).getTime();
    const endMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    return Math.max(0, endMs - startMs);
  }

  /** Format court d'un modèle pour le bandeau de badges : `claude-opus-5` → `opus-5`. */
  static shortModelLabel(model: string | null | undefined): string {
    if (!model) return '—';
    return model.startsWith('claude-') ? model.slice('claude-'.length) : model;
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  static formatClock(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString(undefined, { hour12: false });
  }

  /** Full local date + time, for the detail panel where the bar's own time axis isn't in view. */
  static formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { hour12: false });
  }

  private static trimZero(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
  }

  /** Compact token formatting: 950 → "950", 12400 → "12,4k", 1200000 → "1,2M". */
  static formatTokens(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(value);
    if (abs < 1000) return String(value);
    if (abs < 1_000_000) return `${TimelineDomain.trimZero(value / 1000)}k`;
    return `${TimelineDomain.trimZero(value / 1_000_000)}M`;
  }

  static formatDuration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${TimelineDomain.trimZero(ms / 1000)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
