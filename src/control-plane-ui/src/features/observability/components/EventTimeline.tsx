import { ChevronsDown } from 'lucide-react';
import { cn } from '@/core';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useEvents } from '../hooks/useEvents';
import { EventRow } from './EventRow';
import { EventFiltersBar } from './EventFiltersBar';
import { StreamStatusIndicator } from './StreamStatusIndicator';

const SKELETON_ROWS = 8;

export interface EventTimelineProps {
  className?: string;
  /** Occupe la hauteur laissée par le parent flex, le tableau devenant la zone de défilement. */
  fill?: boolean;
}

/** Filterable, live-updating event timeline — Slice 5. */
export function EventTimeline({ className, fill = false }: EventTimelineProps) {
  const { items, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, streamStatus } =
    useEvents();

  return (
    <SectionCard
      title="Event Streaming"
      description="Événements reçus par le hook pipeline, du plus récent au plus ancien"
      action={<StreamStatusIndicator status={streamStatus} />}
      className={className}
      fill={fill}
    >
      <div className={cn('flex flex-col gap-3', fill && 'min-h-0 flex-1')}>
        <EventFiltersBar />

        <div className={cn('overflow-hidden rounded-lg border border-border', fill && 'flex min-h-0 flex-1 flex-col')}>
          {isLoading ? (
            <div className="flex flex-col gap-1 p-3">
              {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-3">
              <EmptyState
                variant="error"
                title="Impossible de charger les événements"
                description={error instanceof Error ? error.message : 'Erreur inconnue'}
                action={
                  <Button variant="outline" size="sm" onClick={() => void refetch()}>
                    Réessayer
                  </Button>
                }
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-3">
              <EmptyState
                title="Aucun événement"
                description="Le serveur est-il lancé ? Vérifiez que le Control Plane tourne sur le port 4317 et que les hooks Claude Code sont câblés."
              />
            </div>
          ) : (
            <>
              <div className={cn('overflow-y-auto', fill ? 'min-h-0 flex-1' : 'max-h-[60vh]')}>
                {items.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
              {hasNextPage ? (
                <div className="flex shrink-0 justify-center border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    <ChevronsDown className="h-3.5 w-3.5" />
                    {isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
