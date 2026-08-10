import { Gauge } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { ToolReliabilityStat } from '../observabilityTypes';

export interface ToolReliabilityTableProps {
  toolReliability: ToolReliabilityStat[];
}

const HIGH_FAILURE_RATE_THRESHOLD = 0.1;

/** KPI 2 — success must be earned. Failure rate and latency per tool. */
export function ToolReliabilityTable({ toolReliability }: ToolReliabilityTableProps) {
  const rows = [...toolReliability].sort((a, b) => b.failureRate - a.failureRate);

  return (
    <SectionCard title="Fiabilité des outils" description="Taux d'échec et latence (p50 / p95)" icon={<Gauge className="h-4 w-4" />}>
      {rows.length === 0 ? (
        <EmptyState title="Pas encore de données" description="Aucun appel d'outil dans la fenêtre sélectionnée." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Outil</TableHead>
              <TableHead className="text-right">Appels</TableHead>
              <TableHead className="text-right">Échecs</TableHead>
              <TableHead className="text-right">Taux</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p95</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.toolName}>
                <TableCell className="text-neutral-200">
                  <span aria-hidden="true">{ObservabilityDomain.toolEmoji(row.toolName)}</span> {row.toolName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.calls}</TableCell>
                <TableCell className="text-right tabular-nums">{row.failures}</TableCell>
                <TableCell className="text-right">
                  {row.failureRate >= HIGH_FAILURE_RATE_THRESHOLD ? (
                    <StatusBadge tone="destructive">{ObservabilityDomain.formatPercent(row.failureRate)}</StatusBadge>
                  ) : (
                    <span className="tabular-nums text-neutral-400">{ObservabilityDomain.formatPercent(row.failureRate)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{ObservabilityDomain.formatDuration(row.p50DurationMs)}</TableCell>
                <TableCell className="text-right tabular-nums">{ObservabilityDomain.formatDuration(row.p95DurationMs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
