import { Select } from '@/components/ui/select';
import { TIMELINE_RANGES, type TimelineRange } from '../hooks/useTimeline';

export interface RangeSelectorProps {
  value: TimelineRange;
  onChange: (range: TimelineRange) => void;
}

/**
 * Le levier de lisibilité, et depuis le plan 007 le **sélecteur de régime** :
 * `10 min` et `30 min` ouvrent une fenêtre vivante qui glisse avec l'horloge,
 * `Session entière` garde l'axe calé sur les bornes du contenu. Pas de zoom
 * continu, pas d'échelle logarithmique — hors périmètre, comme au plan 006.
 *
 * « Dernier tour » puis « Dernière heure » ont été retirées : la première ne
 * servait pas, la seconde écrasait une session de 50 s sur 1,4 % de la largeur.
 */
export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
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
