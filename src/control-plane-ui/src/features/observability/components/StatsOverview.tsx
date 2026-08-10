import { StatCard } from '@/components/vloc/StatCard';
import { Select } from '@/components/ui/select';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import { STATS_WINDOWS, type StatsWindowHours } from '../hooks/useStats';
import type { StatsTotals } from '../observabilityTypes';

export interface StatsOverviewProps {
  totals: StatsTotals;
  windowHours: StatsWindowHours;
  onWindowChange: (hours: StatsWindowHours) => void;
}

export function StatsOverview({ totals, windowHours, onWindowChange }: StatsOverviewProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-100">Vue d'ensemble</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          Fenêtre
          <Select
            value={windowHours}
            onChange={(event) => onWindowChange(event.target.value as StatsWindowHours)}
            aria-label="Fenêtre temporelle des statistiques"
          >
            {STATS_WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Événements" value={totals.events} />
        <StatCard label="Sessions" value={totals.sessions} />
        <StatCard label="Tokens facturables" value={ObservabilityDomain.formatTokens(totals.billableTokens)} />
        <StatCard label="Tokens cache lus" value={ObservabilityDomain.formatTokens(totals.cacheReadTokens)} />
        <StatCard label="Taux de cache" value={ObservabilityDomain.formatPercent(totals.cacheHitRatio)} />
      </div>
    </div>
  );
}
