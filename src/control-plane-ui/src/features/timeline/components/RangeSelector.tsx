import { Select } from '@/components/ui/select';
import { TIMELINE_RANGES, type TimelineRange } from '../hooks/useTimeline';

export interface RangeSelectorProps {
  value: TimelineRange;
  onChange: (range: TimelineRange) => void;
}

/**
 * Le levier de lisibilité du plan : session entière · dernière heure. Pas de
 * zoom continu, pas d'échelle logarithmique — décision #3 et §"Hors périmètre".
 *
 * « Dernier tour » a été retiré : il ne servait pas.
 */
export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-500">
      Plage
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value as TimelineRange)}
        aria-label="Plage de la timeline"
      >
        {TIMELINE_RANGES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
