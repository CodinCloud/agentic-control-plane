import { Select } from '@/components/ui/select';
import {
  TIMELINE_ACTIVE_SESSIONS,
  TIMELINE_ALL_SESSIONS,
  type TimelineSessionFilter,
  type TimelineSessionOption,
} from '../timelineTypes';

export interface SessionSelectorProps {
  /** Sentinelle (actives / toutes) ou `sessionId`. Défaut : les sessions actives. */
  value: TimelineSessionFilter;
  onChange: (filter: TimelineSessionFilter) => void;
  options: TimelineSessionOption[];
}

/**
 * Filtre de session, à côté du sélecteur de plage. Trois états : les sessions
 * actives (défaut), toutes, ou une seule. Seul le troisième atteint le serveur
 * via le paramètre `sessionId` ; les deux premiers se résolvent côté client sur
 * `isActive`.
 *
 * Chaque entrée est un id court + projet, jamais l'UUID complet — cohérent avec
 * la façon dont les sessions sont libellées partout ailleurs (SessionBanner).
 */
export function SessionSelector({ value, onChange, options }: SessionSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-500">
      Session
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Session de la timeline"
      >
        <option value={TIMELINE_ACTIVE_SESSIONS}>Sessions actives</option>
        <option value={TIMELINE_ALL_SESSIONS}>Toutes les sessions</option>
        {options.map((option) => (
          <option key={option.sessionId} value={option.sessionId}>
            {option.sessionId.slice(0, 8)} · {option.project ?? '—'}
          </option>
        ))}
      </Select>
    </label>
  );
}
