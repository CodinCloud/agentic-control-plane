/**
 * Types mirroring the frozen API contract (plans/001-observability-baseline.md).
 *
 * Deviation: `id` and `receivedAt` are not spelled out in the plan's column
 * table (which only lists payload-projected columns), but are required by
 * the contract itself — `nextBefore: number | null` is a keyset cursor over
 * `id`, and the timeline needs a receipt timestamp to order/display events.
 * Both are standard immutable-event columns implied by `HookEvent`.
 */
export interface EventListItem {
  id: number;
  receivedAt: string;
  eventName: string;
  sessionId: string;
  promptId: string | null;
  cwd: string | null;
  project: string | null;
  agentId: string | null;
  /** null = main session. This is the central distinction of the tool. */
  agentType: string | null;
  toolName: string | null;
  toolUseId: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
  stopReason: string | null;
  error: string | null;
  permissionMode: string | null;
  effort: string | null;
  source: string | null;
}

export interface EventDetail extends EventListItem {
  payload: unknown;
  payloadTruncated: boolean;
}

export interface EventsPage {
  items: EventListItem[];
  nextBefore: number | null;
}

export interface SessionOption {
  id: string;
  project: string | null;
  startedAt: string;
  eventCount: number;
}

export interface FilterOptionsResponse {
  projects: string[];
  sessions: SessionOption[];
  eventNames: string[];
  agentTypes: string[];
  toolNames: string[];
}

/**
 * Event-list filters. `agentType` uses a client-only sentinel for "main
 * session" (see domain/ObservabilityDomain.MAIN_SESSION_FILTER) because the
 * plan's query contract (`&agentType=`) does not specify how to encode a
 * null filter over HTTP; concrete agent type values are passed straight
 * through to the server.
 */
export interface EventFilters {
  sessionId: string | null;
  project: string | null;
  eventName: string | null;
  agentType: string | null;
  toolName: string | null;
}

export interface StatsWindow {
  since: string;
  until: string;
}

export interface StatsTotals {
  events: number;
  sessions: number;
  billableTokens: number;
  cacheReadTokens: number;
  cacheHitRatio: number;
  /**
   * Coût **équivalent API** de la fenêtre, en USD : la valorisation du travail
   * aux tarifs publics, pas une facture — le poste tourne sous abonnement
   * forfaitaire. Null quand aucune ligne n'est tarifable.
   */
  costUsd: number | null;
  /** Modèles rencontrés mais absents de la grille : le total est alors partiel. */
  unpricedModels: string[];
}

export interface AgentTokenStat {
  agentType: string | null;
  events: number;
  billableTokens: number;
  /** Part en tokens — conservée, mais trompeuse dès que les modèles diffèrent. */
  share: number;
  costUsd: number | null;
  /** Part en dollars — c'est elle que la barre affiche. */
  costShare: number;
}

export interface ToolReliabilityStat {
  toolName: string;
  calls: number;
  failures: number;
  failureRate: number;
  p50DurationMs: number;
  p95DurationMs: number;
}

export interface ContextPressureStat {
  autoCompactions: number;
  manualCompactions: number;
  sessionsAffected: number;
}

export interface PermissionsStat {
  requested: number;
  denied: number;
}

export interface StatsResponse {
  window: StatsWindow;
  totals: StatsTotals;
  tokensByAgent: AgentTokenStat[];
  toolReliability: ToolReliabilityStat[];
  contextPressure: ContextPressureStat;
  permissions: PermissionsStat;
}

export interface ObservabilityStreamMessage {
  type: 'event';
  data: EventListItem;
}
