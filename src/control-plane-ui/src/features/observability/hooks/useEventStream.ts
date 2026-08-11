import { useEffect, useRef, useState } from 'react';
import type { EventListItem, ObservabilityStreamMessage } from '../observabilityTypes';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 15000;

export interface UseEventStreamOptions {
  onEvent: (event: EventListItem) => void;
  /**
   * Émis après le commit de l'ingestion d'un tour (plans/006-gantt-vivant.md,
   * décision #6) — une fois par tour, jamais une fois par outil. Absent : le
   * consommateur ne s'intéresse qu'au flux d'événements bruts.
   */
  onUsageIngested?: (sessionId: string) => void;
  /**
   * `false` = ne pas ouvrir de socket du tout. Chaque appel de ce hook en ouvre
   * une : deux consommateurs sur le même écran, ce sont deux connexions, et
   * autant de reconnexions à chaque redémarrage du serveur. Un consommateur qui
   * ne fait que lire un cache déjà tenu à jour par un autre passe `false`.
   */
  enabled?: boolean;
}

export interface UseEventStreamResult {
  status: StreamStatus;
}

/**
 * WebSocket subscription on /stream, with automatic reconnection (exponential
 * backoff, capped). The backend is expected to be killed and restarted often
 * during development — this must never require a manual page reload.
 */
export function useEventStream({
  onEvent,
  onUsageIngested,
  enabled = true,
}: UseEventStreamOptions): UseEventStreamResult {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onUsageIngestedRef = useRef(onUsageIngested);
  onUsageIngestedRef.current = onUsageIngested;

  useEffect(() => {
    if (!enabled) return;

    let attempts = 0;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | undefined;
    let cancelled = false;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/stream`);

      socket.onopen = () => {
        attempts = 0;
        setStatus('open');
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as ObservabilityStreamMessage;
          if (message.type === 'event' && message.data) {
            onEventRef.current(message.data);
          } else if (message.type === 'usage-ingested' && message.sessionId) {
            onUsageIngestedRef.current?.(message.sessionId);
          }
        } catch {
          // Malformed frame — never let the stream crash the UI.
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setStatus('reconnecting');
        const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** attempts, MAX_RECONNECT_DELAY_MS);
        attempts += 1;
        reconnectTimeout = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, [enabled]);

  return { status };
}
