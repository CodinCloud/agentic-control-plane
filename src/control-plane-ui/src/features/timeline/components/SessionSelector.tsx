import { Select } from '@/components/ui/select';
import type { TimelineSessionOption } from '../timelineTypes';

export interface SessionSelectorProps {
  /** `null` = "Toutes les sessions" (plan decision #1, the default). */
  value: string | null;
  onChange: (sessionId: string | null) => void;
  options: TimelineSessionOption[];
}

const ALL_SESSIONS_VALUE = '';

/**
 * Session filter, next to the range selector — drives the timeline
 * repository's `sessionId` query param (plan §"Ce qu'il faut faire"). Each
 * entry is a short id + project, never the full UUID, matching how sessions
 * are already labeled everywhere else on this screen (SessionBanner).
 */
export function SessionSelector({ value, onChange, options }: SessionSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-500">
      Session
      <Select
        value={value ?? ALL_SESSIONS_VALUE}
        onChange={(event) => onChange(event.target.value === ALL_SESSIONS_VALUE ? null : event.target.value)}
        aria-label="Session de la timeline"
      >
        <option value={ALL_SESSIONS_VALUE}>Toutes les sessions</option>
        {options.map((option) => (
          <option key={option.sessionId} value={option.sessionId}>
            {option.sessionId.slice(0, 8)} · {option.project ?? '—'}
          </option>
        ))}
      </Select>
    </label>
  );
}
