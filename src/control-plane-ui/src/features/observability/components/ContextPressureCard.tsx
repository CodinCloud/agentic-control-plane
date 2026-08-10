import { Activity } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { StatCard } from '@/components/vloc/StatCard';
import type { ContextPressureStat } from '../observabilityTypes';

export interface ContextPressureCardProps {
  contextPressure: ContextPressureStat;
}

/** KPI 3 — saturation du contexte. */
export function ContextPressureCard({ contextPressure }: ContextPressureCardProps) {
  return (
    <SectionCard title="Pression sur le contexte" description="Compactions automatiques vs manuelles" icon={<Activity className="h-4 w-4" />}>
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Auto"
          value={contextPressure.autoCompactions}
          tone={contextPressure.autoCompactions > 0 ? 'warning' : 'default'}
          className="border-0 bg-transparent"
        />
        <StatCard label="Manuelles" value={contextPressure.manualCompactions} className="border-0 bg-transparent" />
        <StatCard label="Sessions touchées" value={contextPressure.sessionsAffected} className="border-0 bg-transparent" />
      </div>
    </SectionCard>
  );
}
