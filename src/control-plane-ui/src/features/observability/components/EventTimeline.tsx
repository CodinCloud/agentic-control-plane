import { ChevronsDown } from 'lucide-react';
import { SectionCard } from '@/components/vloc/SectionCard';
import { EmptyState } from '@/components/vloc/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useEvents } from '../hooks/useEvents';
import { EventRow } from './EventRow';
import { EventFiltersBar } from './EventFiltersBar';
import { StreamStatusIndicator } from './StreamStatusIndicator';

const SKELETON_ROWS = 8;

/** Filterable, live-updating event timeline — Slice 5. */
export function EventTimeline() {
  const { items, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, streamStatus } =
    useEvents();

  return (
    <SectionCard
      title="Timeline"
      description="Événements reçus par le hook pipeline, du plus récent au plus ancien"
      action={<StreamStatusIndicator status={streamStatus} />}
    >
      <div className="flex flex-col gap-3">
        <EventFiltersBar />

        <div className="overflow-hidden rounded-lg border border-neutral-800">
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
              <div className="max-h-[60vh] overflow-y-auto">
                {items.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
              {hasNextPage ? (
                <div className="flex justify-center border-t border-neutral-800 p-2">
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
