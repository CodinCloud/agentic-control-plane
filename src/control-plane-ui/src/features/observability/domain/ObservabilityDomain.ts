import type { EventListItem } from '../observabilityTypes';

const TOOL_EMOJI: Record<string, string> = {
  Bash: '💻',
  Read: '📖',
  Write: '✍️',
  Edit: '✏️',
  MultiEdit: '📝',
  NotebookEdit: '📓',
  Grep: '🔍',
  Glob: '📂',
  WebFetch: '🌐',
  WebSearch: '🔎',
  Task: '🤖',
  TodoWrite: '☑️',
  KillShell: '🛑',
  BashOutput: '📤',
};

const EVENT_EMOJI: Record<string, string> = {
  PreToolUse: '➡️',
  PostToolUse: '⬅️',
  Notification: '🔔',
  Stop: '🏁',
  SubagentStop: '🤖',
  PreCompact: '🗜️',
  UserPromptSubmit: '💬',
  SessionStart: '🟢',
  SessionEnd: '🔴',
};

const DEFAULT_TOOL_EMOJI = '🔧';
const DEFAULT_EVENT_EMOJI = '•';

const SESSION_COLOR_SATURATION = 65;
const SESSION_COLOR_LIGHTNESS = 62; // tuned for legibility on a dark background

/**
 * Pure, static business rules for the observability feature. No IO, no React.
 */
export class ObservabilityDomain {
  /**
   * Client-only sentinel for "session principale" in the agentType filter.
   * Not sent to the server as-is — see api/ObservabilityRepository.
   */
  static readonly MAIN_SESSION_FILTER = '__main__';
  static readonly MAIN_SESSION_LABEL = 'Session principale';

  /** agentType === null ⇒ main session. This is the central distinction of the tool. */
  static isMainSession(agentType: string | null): boolean {
    return agentType === null;
  }

  static agentLabel(agentType: string | null): string {
    return ObservabilityDomain.isMainSession(agentType) ? ObservabilityDomain.MAIN_SESSION_LABEL : (agentType as string);
  }

  /**
   * Stable, visually distinct color per session, derived from a hash of the
   * sessionId. Two sessions must stay distinguishable at a glance.
   */
  static sessionColor(sessionId: string): string {
    const hue = ObservabilityDomain.hashToHue(sessionId);
    return `hsl(${hue} ${SESSION_COLOR_SATURATION}% ${SESSION_COLOR_LIGHTNESS}%)`;
  }

  private static hashToHue(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    // Golden-angle spread avoids adjacent hashes landing on similar hues.
    return Math.round((hash * 137.508) % 360);
  }

  static toolEmoji(toolName: string | null): string {
    if (!toolName) return DEFAULT_EVENT_EMOJI;
    return TOOL_EMOJI[toolName] ?? DEFAULT_TOOL_EMOJI;
  }

  static eventEmoji(eventName: string): string {
    return EVENT_EMOJI[eventName] ?? DEFAULT_EVENT_EMOJI;
  }

  /** Human-readable one-line label for a timeline row. */
  static eventLabel(event: Pick<EventListItem, 'eventName' | 'toolName'>): string {
    return event.toolName ? `${event.eventName} · ${event.toolName}` : event.eventName;
  }

  static isFailure(event: Pick<EventListItem, 'error'>): boolean {
    return Boolean(event.error);
  }

  /** Mirrors the backend's billableTokens definition: input + output + cache_creation. */
  static billableTokens(
    event: Pick<EventListItem, 'inputTokens' | 'outputTokens' | 'cacheCreationTokens'>,
  ): number {
    return (event.inputTokens ?? 0) + (event.outputTokens ?? 0) + (event.cacheCreationTokens ?? 0);
  }

  /** Compact token formatting: 950 → "950", 12400 → "12.4k", 1200000 → "1.2M". */
  static formatTokens(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(value);
    if (abs < 1000) return String(value);
    if (abs < 1_000_000) return `${ObservabilityDomain.trimZero(value / 1000)}k`;
    return `${ObservabilityDomain.trimZero(value / 1_000_000)}M`;
  }

  private static trimZero(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
  }

  static formatDuration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${ObservabilityDomain.trimZero(ms / 1000)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  static formatTimestamp(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString(undefined, { hour12: false });
  }

  static formatPercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }
}
