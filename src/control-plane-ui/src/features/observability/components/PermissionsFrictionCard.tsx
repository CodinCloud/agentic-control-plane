import { ShieldAlert } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { StatCard } from '@/components/vloc/StatCard';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { PermissionsStat } from '../observabilityTypes';

export interface PermissionsFrictionCardProps {
  permissions: PermissionsStat;
}

/** KPI 4 — frottement de la boucle : permissions demandées vs refusées. */
export function PermissionsFrictionCard({ permissions }: PermissionsFrictionCardProps) {
  const denialRatio = permissions.requested > 0 ? permissions.denied / permissions.requested : 0;

  return (
    <SectionCard title="Frottement des permissions" description="Demandes vs refus" icon={<ShieldAlert className="h-4 w-4" />}>
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Demandées" value={permissions.requested} className="border-0 bg-transparent" />
        <StatCard
          label="Refusées"
          value={permissions.denied}
          tone={permissions.denied > 0 ? 'destructive' : 'default'}
          className="border-0 bg-transparent"
        />
        <StatCard
          label="Taux de refus"
          value={ObservabilityDomain.formatPercent(denialRatio)}
          tone={denialRatio > 0 ? 'warning' : 'default'}
          className="border-0 bg-transparent"
        />
      </div>
    </SectionCard>
  );
}
