import type * as React from 'react';
import { Zap } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { AgentTokenStat, StatsTotals } from '../observabilityTypes';

export interface AgentCostBreakdownProps {
  tokensByAgent: AgentTokenStat[];
  totals: StatsTotals;
  /** Rendu dans l'en-tête de la carte — porte le sélecteur de fenêtre temporelle. */
  action?: React.ReactNode;
}

/**
 * Le seul KPI conservé — le coût réel de la délégation. Session principale vs
 * chaque type de sous-agent. C'est la question à laquelle l'outil doit répondre.
 *
 * La barre est calée sur `costShare`, pas sur `share` : comparer des tokens
 * entre agents est faux dès que les modèles diffèrent, et c'est le cas nominal
 * (Opus en session principale, Sonnet en sous-agent). L'ancienne barre en
 * tokens surestimait systématiquement la part des sous-agents — exactement
 * l'inverse de ce que l'écran cherche à montrer.
 */
export function AgentCostBreakdown({ tokensByAgent, totals, action }: AgentCostBreakdownProps) {
  const rows = [...tokensByAgent].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));

  return (
    <SectionCard
      title="Coût par agent"
      description="Coût équivalent API — session principale vs sous-agents"
      icon={<Zap className="h-4 w-4" />}
      action={action}
    >
      {rows.length === 0 ? (
        <EmptyState title="Pas encore de données" description="Aucun événement dans la fenêtre sélectionnée." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.agentType ?? 'main'} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={
                      ObservabilityDomain.isMainSession(row.agentType)
                        ? 'truncate font-medium text-foreground'
                        : 'truncate text-primary'
                    }
                    title={ObservabilityDomain.agentLabel(row.agentType)}
                  >
                    {ObservabilityDomain.agentLabel(row.agentType)}
                  </span>
                  <span className="shrink-0 text-foreground">
                    {ObservabilityDomain.formatCostUsd(row.costUsd)}
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      ObservabilityDomain.isMainSession(row.agentType) ? 'h-full bg-foreground/70' : 'h-full bg-primary'
                    }
                    style={{ width: `${Math.min(100, Math.round(row.costShare * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {ObservabilityDomain.formatTokens(row.billableTokens)} tk · {row.events} évts
                  </span>
                  <span>{ObservabilityDomain.formatPercent(row.costShare)}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-semibold text-foreground">
                {ObservabilityDomain.formatCostUsd(totals.costUsd)}
              </span>
            </div>
            {/* Le poste tourne sous abonnement forfaitaire : ce montant n'est pas
                une facture. Le dire à l'écran est une exigence de la spec 004. */}
            <p className="mt-1 text-sm text-muted-foreground">
              Équivalent API — valorisation aux tarifs publics, pas une facture.
            </p>
          </div>

          {totals.unpricedModels.length > 0 ? (
            <p className="mt-3 rounded-md border border-status-warning/30 bg-status-warning/10 p-2 text-sm text-status-warning">
              Total partiel : {totals.unpricedModels.join(', ')} hors grille tarifaire.
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
