import { useState } from 'react';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useStats, STATS_WINDOWS, type StatsWindowHours } from '../hooks/useStats';
import { AgentCostBreakdown } from './AgentCostBreakdown';

const DEFAULT_WINDOW_HOURS: StatsWindowHours = '24';

/**
 * Le seul KPI de l'écran : le coût par agent. Les compteurs d'ensemble, la
 * fiabilité des outils, la pression sur le contexte et le frottement des
 * permissions ont été retirés — ils restent calculés par `GET /api/stats`,
 * seul leur affichage disparaît. Voir CONTEXT.md §"Doctrine des KPI".
 *
 * Le sélecteur de fenêtre vivait dans le bandeau d'ensemble supprimé ; il est
 * remonté ici, sans quoi la fenêtre ne serait plus réglable.
 */
export function KpiDashboard() {
  const [windowHours, setWindowHours] = useState<StatsWindowHours>(DEFAULT_WINDOW_HOURS);
  const { stats, isLoading, isError, error, refetch } = useStats(windowHours);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError || !stats) {
    return (
      <EmptyState
        variant="error"
        title="Impossible de charger le coût par agent"
        description={error instanceof Error ? error.message : 'Le serveur est-il lancé sur le port 4317 ?'}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Réessayer
          </Button>
        }
      />
    );
  }

  return (
    <AgentCostBreakdown
      tokensByAgent={stats.tokensByAgent}
      totals={stats.totals}
      action={
        <Select
          value={windowHours}
          onChange={(event) => setWindowHours(event.target.value as StatsWindowHours)}
          aria-label="Fenêtre temporelle du coût par agent"
        >
          {STATS_WINDOWS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      }
    />
  );
}
