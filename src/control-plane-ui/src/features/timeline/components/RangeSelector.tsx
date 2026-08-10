import { Select } from '@/components/ui/select';
import { TIMELINE_RANGES, type TimelineRange } from '../hooks/useTimeline';

export interface RangeSelectorProps {
  value: TimelineRange;
  onChange: (range: TimelineRange) => void;
}

/**
 * The plan's readability lever: session entière · dernière heure · dernier
 * tour. No continuous zoom, no log scale — see plan decisions #3 and §"Hors
 * périmètre".
 */
export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500">
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
