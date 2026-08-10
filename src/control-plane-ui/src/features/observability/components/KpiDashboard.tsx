import { useState } from 'react';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useStats, type StatsWindowHours } from '../hooks/useStats';
import { StatsOverview } from './StatsOverview';
import { AgentCostBreakdown } from './AgentCostBreakdown';
import { ToolReliabilityTable } from './ToolReliabilityTable';
import { ContextPressureCard } from './ContextPressureCard';
import { PermissionsFrictionCard } from './PermissionsFrictionCard';

const DEFAULT_WINDOW_HOURS: StatsWindowHours = '24';

/** The 4 baseline KPI tiles + session principale vs sous-agents breakdown — Slice 6. */
export function KpiDashboard() {
  const [windowHours, setWindowHours] = useState<StatsWindowHours>(DEFAULT_WINDOW_HOURS);
  const { stats, isLoading, isError, error, refetch } = useStats(windowHours);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <EmptyState
        variant="error"
        title="Impossible de charger les statistiques"
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
    <div className="flex flex-col gap-4">
      <StatsOverview totals={stats.totals} windowHours={windowHours} onWindowChange={setWindowHours} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <AgentCostBreakdown tokensByAgent={stats.tokensByAgent} />
        <ToolReliabilityTable toolReliability={stats.toolReliability} />
        <ContextPressureCard contextPressure={stats.contextPressure} />
        <PermissionsFrictionCard permissions={stats.permissions} />
      </div>
    </div>
  );
}
