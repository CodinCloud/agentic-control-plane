import { Select } from '@/components/ui/select';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  allLabel?: string;
  disabled?: boolean;
}

const ALL_VALUE = '';

/** Labeled dropdown filter, backed by the native ui/Select. Empty value = "all". */
export function FilterSelect({ label, value, onChange, options, allLabel = 'Tous', disabled }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      <Select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        <option value={ALL_VALUE}>{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
