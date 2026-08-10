/**
 * Types mirroring the frozen API contract (plans/002-timeline-agents.md,
 * "Contrat d'API (figé)"), updated for the backend as delivered (see
 * GetTimelineQuery.cs / GetAgentRunDetailQuery.cs): `mainSession` is
 * nullable (empty database is a valid state) and the window carries
 * `lastTurnStartedAt`, the exact "dernier tour" boundary.
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

/** Bandeau de référence — covers the whole session, never rendered as a lane. */
export interface MainSessionSummary {
  sessionId: string;
  model: string;
  startedAt: string;
  /** null = session in progress. */
  endedAt: string | null;
  messages: number;
  billableTokens: number;
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

export interface TimelineResponse {
  window: TimelineWindow;
  /** null only when the resolved window has no session at all (empty database) — mainSession and lanes are null/empty together. */
  mainSession: MainSessionSummary | null;
  /** Sorted by `startedAt` ascending, per contract. */
  lanes: AgentLane[];
}

/** The detail panel behind a click on a bar — same lane, plus brief and report. Fetched on demand only, see hooks/useAgentRunDetail.ts. */
export interface AgentRunDetail extends AgentLane {
  brief: string;
  report: string;
  briefTruncated: boolean;
  reportTruncated: boolean;
}
