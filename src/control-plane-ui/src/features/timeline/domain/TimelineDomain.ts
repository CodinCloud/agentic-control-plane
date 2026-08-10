import type { AgentLane, TimelineSession, TimelineWindow } from '../timelineTypes';

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
   * Breathing room left/right of the tightest bounds when fitting the axis
   * to content (see `fitWindowToSessions`) — the extreme bars must not touch
   * the track's edges.
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
   * Bar position as a percentage of the window's [since, until] span — the
   * only honest way to keep overlaps and proportions true (linear scale,
   * decision #3 of the plan). An ongoing lane (`endedAt === null`) is
   * stretched to the right edge of the window, since it is still growing.
   */
  static barPosition(
    lane: Pick<AgentLane, 'startedAt' | 'endedAt'>,
    window: Pick<TimelineWindow, 'since' | 'until'>,
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
      : untilMs;

    const leftPct = ((startedMs - sinceMs) / span) * 100;
    const widthPct = Math.max(0, ((endedMs - startedMs) / span) * 100);
    return { leftPct, widthPct: Math.min(widthPct, 100 - leftPct) };
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
   * The axis must track what is actually on screen, not the server's
   * declared window (which defaults to a 24h lookback for "Session
   * entière" and crushes every bar into a sliver at the right edge when the
   * real data only spans a few hours). Bounds span every session's own
   * [startedAt, endedAt] *and* every one of their lanes — a session with no
   * agent must still hold its place on the shared axis (plan decision #3),
   * so its own bandeau bounds count even when its `lanes` array is empty.
   * Padded by `WINDOW_FIT_MARGIN_RATIO` on each side. Returns `null` when
   * there are no sessions to fit against — the caller falls back to the
   * server's window. The axis stays one and the same across every session
   * group (plan decision #4): this is computed once, over the whole
   * `sessions[]` array, never per group.
   */
  static fitWindowToSessions(
    sessions: Pick<TimelineSession, 'startedAt' | 'endedAt' | 'lanes'>[],
    nowMs: number,
  ): TimelineWindow | null {
    if (sessions.length === 0) return null;

    let minStartMs = Infinity;
    let maxEndMs = -Infinity;
    const considerSpan = (startedAt: string, endedAt: string | null) => {
      minStartMs = Math.min(minStartMs, new Date(startedAt).getTime());
      maxEndMs = Math.max(maxEndMs, endedAt ? new Date(endedAt).getTime() : nowMs);
    };

    for (const session of sessions) {
      considerSpan(session.startedAt, session.endedAt);
      for (const lane of session.lanes) considerSpan(lane.startedAt, lane.endedAt);
    }

    const span = Math.max(maxEndMs - minStartMs, 1);
    const margin = span * TimelineDomain.WINDOW_FIT_MARGIN_RATIO;
    return {
      since: new Date(minStartMs - margin).toISOString(),
      until: new Date(maxEndMs + margin).toISOString(),
      // Not the server's turn boundary — this window is a display-only fit,
      // never fed back into `useTimeline`'s `since` calculation.
      lastTurnStartedAt: null,
    };
  }

  /** Evenly spaced tick marks for the shared time axis, `count` points across [since, until]. */
  static timeTicks(window: Pick<TimelineWindow, 'since' | 'until'>, count = 5): { pct: number; label: string }[] {
    const sinceMs = new Date(window.since).getTime();
    const untilMs = new Date(window.until).getTime();
    if (!(untilMs > sinceMs) || count < 2) return [];
    const span = untilMs - sinceMs;
    return Array.from({ length: count }, (_, index) => {
      const pct = (index / (count - 1)) * 100;
      const ms = sinceMs + (pct / 100) * span;
      return { pct, label: TimelineDomain.formatClock(new Date(ms).toISOString()) };
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

  /** Stable, visually distinct color per agent type, so lanes of the same type read as a family. */
  static agentColor(agentType: string): string {
    const hue = TimelineDomain.hashToHue(agentType);
    return `hsl(${hue} 70% 58%)`;
  }

  private static hashToHue(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return Math.round((hash * 137.508) % 360);
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
