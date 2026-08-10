/**
 * Types mirroring the frozen API contract (plans/003-multi-sessions.md,
 * "Contrat d'API (figé)"). `mainSession` is gone: the server now resolves
 * *every* session touching the requested window, not just the most recently
 * active one — see plan §"Pourquoi" (a `/compact` opens a new session and
 * silently orphans the previous one's agents on screen).
 */
export interface TimelineWindow {
  since: string;
  until: string;
  /**
   * Exact start of the resolved session's most recent `UserPromptSubmit` —
   * the real "dernier tour" boundary, independent of `since`/`until`. Null
   * when no turn fired in the session yet (e.g. fresh database); the client
   * falls back to a lookback approximation only in that case, see
   * hooks/useTimeline.ts.
   */
  lastTurnStartedAt: string | null;
}

/** One lane = one agent instance, never one agent type. */
export interface AgentLane {
  agentId: string;
  agentType: string;
  taskDescription: string;
  startedAt: string;
  /** null = agent still running. */
  endedAt: string | null;
  durationMs: number;
  messages: number;
  billableTokens: number;
  cacheReadTokens: number;
  model: string;
  spawnDepth: number;
}

/**
 * One session's bandeau + its own lanes. Rendered as a self-contained visual
 * group (see components/SessionGroup.tsx) — the session no longer implies a
 * single elected timeline, several can be live at once (two Claude Code
 * windows, a `/compact` mid-session, etc).
 */
export interface TimelineSession {
  sessionId: string;
  project: string | null;
  model: string;
  startedAt: string;
  /** null = session in progress. */
  endedAt: string | null;
  messages: number;
  billableTokens: number;
  /** True when the session's last activity is under 5 minutes old (plan decision #2). */
  isActive: boolean;
  /** Sorted by `startedAt` ascending, per contract. */
  lanes: AgentLane[];
}

export interface TimelineResponse {
  window: TimelineWindow;
  /** Sorted by most recent activity first, per contract. Empty array = no session in the window (empty database), not an error. */
  sessions: TimelineSession[];
}

/** The detail panel behind a click on a bar — same lane, plus brief and report. Fetched on demand only, see hooks/useAgentRunDetail.ts. */
export interface AgentRunDetail extends AgentLane {
  brief: string;
  report: string;
  briefTruncated: boolean;
  reportTruncated: boolean;
}

/** Short identity (id + project) used by the session selector — see hooks/useTimeline.ts for how this stays populated across a session filter. */
export interface TimelineSessionOption {
  sessionId: string;
  project: string | null;
}
