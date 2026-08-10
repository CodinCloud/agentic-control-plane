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
  /** Coût équivalent API de ce seul run — permet de ventiler le coût par agent sans requête de plus. */
  costUsd: number | null;
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
  /** Tokens de la session elle-même, hors sous-agents. */
  billableTokens: number;
  /**
   * Coût équivalent API de la session, sous-agents **compris** — portée
   * volontairement plus large que `billableTokens` : le bandeau surplombe les
   * lanes de ses propres agents, un coût qui les exclurait laisserait croire
   * qu'une session ayant tout délégué n'a rien coûté. Null si rien n'est tarifable.
   */
  costUsd: number | null;
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

/**
 * Sentinelles du filtre de session, purement client : le serveur ne connaît que
 * « toutes les sessions » (paramètre `sessionId` absent) ou « celle-ci ». Le tri
 * actives/toutes se fait donc côté client sur `isActive`, sans toucher au
 * contrat figé de la spec 003.
 *
 * Aucune collision possible avec un vrai `sessionId` : ce sont des UUID.
 */
export const TIMELINE_ACTIVE_SESSIONS = '__active__';
export const TIMELINE_ALL_SESSIONS = '__all__';

/** L'une des deux sentinelles ci-dessus, ou un `sessionId` réel. */
export type TimelineSessionFilter = string;

/**
 * La session principale n'est pas un agent : ses appels d'outil portent
 * `agent_id IS NULL`. Cette sentinelle la désigne dans une chaîne de requête et
 * dans le search param `?agent=` — même convention que côté serveur.
 */
export const MAIN_SESSION_AGENT = 'main';

/**
 * Un appel d'outil, entrée et sortie réduites à l'essentiel côté serveur.
 *
 * Jamais le payload brut : la sortie d'un `Edit` ou d'un `Write` contient le
 * fichier entier. Voir plans/005-gantt-exploitable.md, décision #8.
 */
export interface ToolCall {
  id: number;
  at: string;
  toolName: string;
  /** Nombre d'appels consécutifs du même outil réunis sous ce glyphe. 1 = isolé. */
  repeatCount: number;
  durationMs: number | null;
  failed: boolean;
  /** Extrait de l'entrée : la commande, le chemin, le motif. */
  summary: string | null;
  /** Extrait de la sortie, ou le message d'erreur en cas d'échec. */
  result: string | null;
  /** False = aucune règle ne connaît cet outil ; l'UI doit le dire plutôt qu'afficher un blanc. */
  extractable: boolean;
}

/** Ordonné par temps croissant — c'est une chronologie, pas un flux. */
export interface ToolCallsResponse {
  calls: ToolCall[];
}
