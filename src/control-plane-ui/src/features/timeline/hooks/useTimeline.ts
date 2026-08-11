import { useCallback, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEventStream } from '@/features/observability';
import { timelineService } from '../application/TimelineService';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { TimelineSessionFilter, TimelineSessionOption } from '../timelineTypes';

const TIMELINE_STALE_TIME_MS = 30 * 1000;

/**
 * How long to wait, after the *last* stream event, before invalidating the
 * timeline query — a `PostToolUse` fires on every tool call, so refetching
 * on each frame would hammer the API. Debounce (reset-on-each-event), not
 * throttle: we want one refresh shortly after a burst goes quiet, not one
 * every N ms during the burst. See plan §"Temps réel".
 */
const TIMELINE_REFRESH_DEBOUNCE_MS = 2000;

/**
 * Les deux premières plages sont **vivantes** : leur fenêtre glisse avec
 * l'horloge et ancre « maintenant » à un endroit fixe de l'écran. La troisième
 * garde le régime de la spec 006 — les bornes du contenu, données par le
 * serveur.
 *
 * « Dernière heure » a été retirée : à une heure d'échelle, une session de 50 s
 * occupe 1,4 % de la largeur. C'est le défaut mesuré le 2026-08-11 (un axe de
 * 18 h pour une minute de contenu), simplement moins spectaculaire — voir
 * plans/007-timeline-live.md.
 */
export const TIMELINE_RANGES = [
  { value: '10m', label: '10 min' },
  { value: '30m', label: '30 min' },
  { value: 'session', label: 'Session entière' },
] as const;

export type TimelineRange = (typeof TIMELINE_RANGES)[number]['value'];

/**
 * Portée de passé d'une plage vivante, en millisecondes. `null` = régime
 * d'analyse : pas de fenêtre glissante, on suit le contenu.
 */
export const TIMELINE_RANGE_SPAN_MS: Record<TimelineRange, number | null> = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  session: null,
};

/**
 * « Session entière » omet `since` et laisse le serveur renvoyer sa fenêtre
 * complète. Une plage vivante, elle, borne aussi la *requête* : sans quoi le
 * serveur renverrait les sessions de la veille, dont la seule présence étirait
 * l'axe — c'est la moitié de la correction, l'autre étant `livingWindow`.
 */
function sinceFromRange(range: TimelineRange): string | undefined {
  const spanMs = TIMELINE_RANGE_SPAN_MS[range];
  return spanMs === null ? undefined : new Date(Date.now() - spanMs).toISOString();
}

/**
 * Timeline (Gantt) data for the selected range and session filter, kept live
 * by a WebSocket subscription on `/stream` (debounced) — an ongoing bar's
 * own visual growth between refetches is handled client-side in
 * TimelineDomain.extendWindowToNow.
 *
 * `sessionFilter` : les deux sentinelles (actives / toutes) se résolvent côté
 * client sur `isActive` et n'atteignent jamais le serveur — d'où la même
 * requête pour les deux, et donc aucun refetch quand on bascule de l'une à
 * l'autre. Un `sessionId` réel, lui, restreint la requête.
 */
export interface UseTimelineOptions {
  /**
   * `false` = lire le cache sans ouvrir de WebSocket. Réservé aux consommateurs
   * secondaires du même écran (le bandeau « ce qui tourne » partage la clé de
   * requête du Gantt, donc ses invalidations) : sans cela, chaque consommateur
   * ouvrirait sa propre connexion.
   */
  subscribe?: boolean;
}

export function useTimeline(
  range: TimelineRange,
  sessionFilter: TimelineSessionFilter,
  { subscribe = true }: UseTimelineOptions = {},
) {
  const queryClient = useQueryClient();
  const [sessionOptions, setSessionOptions] = useState<TimelineSessionOption[]>([]);

  const sessionId = TimelineDomain.toServerSessionId(sessionFilter);

  // La clé identifie *ce qui* est demandé au serveur (la plage et la session
  // effectivement filtrée), jamais un horodatage calculé : `since` est le
  // *comment* et se recalcule dans `queryFn` à l'appel, pour qu'une
  // invalidation déclenchée par le flux refetch avec un lookback à jour au
  // lieu de créer une nouvelle entrée de cache — et un état de chargement —
  // à chaque événement WebSocket. C'est la régression contre laquelle le plan
  // met en garde (§"Piège à éviter").
  const queryKey = ['timeline', 'list', range, sessionId] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await timelineService.getTimeline(sinceFromRange(range), sessionId ?? undefined);
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    staleTime: TIMELINE_STALE_TIME_MS,
    // Keep the previous range's data on screen while the new range loads,
    // instead of dropping straight to skeletons — see plan bug #1.
    placeholderData: keepPreviousData,
  });

  // The session selector needs the *full* list of sessions to offer, but a
  // filtered fetch only ever returns the one selected session (plan §"Contrat
  // d'API", decision #3) — narrowing would otherwise collapse the dropdown to
  // a single entry the moment a filter is applied. An unfiltered fetch is
  // authoritative and replaces the list outright; a filtered fetch only ever
  // merges its one session in, never dropping what was already known.
  useEffect(() => {
    const sessions = query.data?.sessions;
    if (!sessions) return;
    if (sessionId === null) {
      setSessionOptions(sessions.map((session) => ({ sessionId: session.sessionId, project: session.project })));
      return;
    }
    const [onlySession] = sessions;
    if (!onlySession) return;
    setSessionOptions((current) =>
      current.some((option) => option.sessionId === onlySession.sessionId)
        ? current
        : [...current, { sessionId: onlySession.sessionId, project: onlySession.project }],
    );
  }, [query.data, sessionId]);

  const debounceTimeoutRef = useRef<number | undefined>(undefined);

  const handleStreamEvent = useCallback(() => {
    if (debounceTimeoutRef.current !== undefined) window.clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['timeline', 'list'] });
    }, TIMELINE_REFRESH_DEBOUNCE_MS);
  }, [queryClient]);

  // Un tour vient de commiter son usage : contrairement à `PostToolUse`, ce
  // signal arrive une fois par tour, pas une fois par outil — aucun débounce
  // ne se justifie (plan 006, décision #6/#Temps réel). C'est la correction du
  // bug mesuré : le serveur diffusait `Stop` avant le commit de l'ingestion,
  // et le débounce de 2s expirait souvent avant, laissant l'écran périmé
  // jusqu'au tour suivant.
  const handleUsageIngested = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['timeline', 'list'] });
  }, [queryClient]);

  useEffect(
    () => () => {
      if (debounceTimeoutRef.current !== undefined) window.clearTimeout(debounceTimeoutRef.current);
    },
    [],
  );

  const { status: streamStatus } = useEventStream({
    onEvent: handleStreamEvent,
    onUsageIngested: handleUsageIngested,
    enabled: subscribe,
  });

  return {
    timeline: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    streamStatus,
    sessionOptions,
  };
}
