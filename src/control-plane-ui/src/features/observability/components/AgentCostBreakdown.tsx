import { Zap } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { AgentTokenStat } from '../observabilityTypes';

export interface AgentCostBreakdownProps {
  tokensByAgent: AgentTokenStat[];
}

/**
 * KPI 1 — le coût réel de la délégation. Session principale vs chaque type
 * de sous-agent. C'est la question à laquelle l'outil doit répondre.
 */
export function AgentCostBreakdown({ tokensByAgent }: AgentCostBreakdownProps) {
  const rows = [...tokensByAgent].sort((a, b) => b.billableTokens - a.billableTokens);

  return (
    <SectionCard title="Coût par agent" description="Tokens facturables, session principale vs sous-agents" icon={<Zap className="h-4 w-4" />}>
      {rows.length === 0 ? (
        <EmptyState title="Pas encore de données" description="Aucun événement dans la fenêtre sélectionnée." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.agentType ?? 'main'} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    ObservabilityDomain.isMainSession(row.agentType)
                      ? 'font-medium text-neutral-100'
                      : 'text-sky-400'
                  }
                >
                  {ObservabilityDomain.agentLabel(row.agentType)}
                </span>
                <span className="tabular-nums text-neutral-400">
                  {ObservabilityDomain.formatTokens(row.billableTokens)} · {row.events} évts ·{' '}
                  {ObservabilityDomain.formatPercent(row.share)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={
                    ObservabilityDomain.isMainSession(row.agentType) ? 'h-full bg-neutral-200' : 'h-full bg-sky-500'
                  }
                  style={{ width: `${Math.min(100, Math.round(row.share * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
