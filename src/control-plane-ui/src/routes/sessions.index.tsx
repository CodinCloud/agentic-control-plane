import { Link, createFileRoute } from '@tanstack/react-router';
import { Layers } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ObservabilityDomain } from '@/features/observability';
import { TimelineDomain, useTimeline, TIMELINE_ALL_SESSIONS } from '@/features/timeline';

/**
 * Point d'entrée de l'analyse : une ligne par session, avec son coût équivalent
 * API et ses tokens. Portée volontairement large — c'est ici qu'on retrouve une
 * session terminée, pas dans la tour de contrôle.
 */
function SessionList() {
  const { timeline, isLoading, isError, error, refetch } = useTimeline('session', TIMELINE_ALL_SESSIONS);

  const sessions = timeline?.sessions ?? [];

  return (
    <SectionCard
      title="Sessions"
      description="Coût équivalent API et tokens par session — cliquez pour analyser"
      icon={<Layers className="h-4 w-4" />}
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Impossible de charger les sessions"
          description={error instanceof Error ? error.message : 'Le serveur est-il lancé sur le port 4317 ?'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState title="Aucune session" description="La base ne contient encore aucune session." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Projet</TableHead>
              <TableHead>Modèle</TableHead>
              <TableHead>Début</TableHead>
              <TableHead className="text-right">Agents</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Coût</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.sessionId}>
                <TableCell className="font-mono text-xs text-neutral-300">
                  {session.sessionId.slice(0, 8)}
                  {session.isActive ? (
                    <StatusBadge tone="success" className="ml-2">
                      active
                    </StatusBadge>
                  ) : null}
                </TableCell>
                <TableCell className="text-neutral-300">{session.project ?? '—'}</TableCell>
                <TableCell className="text-neutral-400">{session.model ?? '—'}</TableCell>
                <TableCell className="text-neutral-400">{TimelineDomain.formatDateTime(session.startedAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{session.lanes.length}</TableCell>
                <TableCell className="text-right tabular-nums">{session.messages}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {TimelineDomain.formatTokens(session.billableTokens)}
                </TableCell>
                {/* Sous-agents compris, contrairement aux tokens de la colonne
                    précédente — voir TimelineSession.costUsd. */}
                <TableCell className="text-right tabular-nums text-neutral-200">
                  {ObservabilityDomain.formatCostUsd(session.costUsd)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: session.sessionId }}
                    className="text-sm text-sky-400 hover:text-sky-300"
                  >
                    Analyser
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

export const Route = createFileRoute('/sessions/')({ component: SessionList });
