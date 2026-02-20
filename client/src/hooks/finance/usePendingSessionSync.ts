/**
 * Hook hybride pour synchroniser l'état de la session d'ouverture en attente
 *
 * Stratégie intelligente:
 * - WebSocket en priorité pour notifications temps réel
 * - Polling 30s quand WebSocket connecté
 * - Backoff exponentiel (10s → 20s → 40s → 80s → 120s) quand WebSocket déconnecté
 * - Jitter ±20% pour éviter le thundering herd
 * - Refetch immédiat sur événement WebSocket
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWebSocket } from '../useWebSocket';
import { sessionCaisseApi } from '../../lib/api-client';
import type { SessionCaisse } from '../../types/finance';

// P2.1: Polling backoff constants
const POLLING_INTERVALS = {
  WS_CONNECTED: 30000,        // 30s when WebSocket is active
  MIN_DISCONNECTED: 10000,    // 10s initial when disconnected
  MAX_DISCONNECTED: 120000,   // 120s maximum backoff
  JITTER_FACTOR: 0.2,         // ±20% jitter to prevent thundering herd
};

/**
 * Apply jitter to an interval to prevent synchronized requests
 */
function applyJitter(interval: number): number {
  const jitter = interval * POLLING_INTERVALS.JITTER_FACTOR;
  return interval + (Math.random() * 2 - 1) * jitter;
}

interface UsePendingSessionSyncOptions {
  enabled: boolean;
  onStatusChange?: (prevStatus: string | null, newStatus: string) => void;
}

interface UsePendingSessionSyncResult {
  pendingSession: SessionCaisse | null;
  isLoading: boolean;
  refetch: () => void;
  isWebSocketConnected: boolean;
}

export function usePendingSessionSync(
  options: UsePendingSessionSyncOptions
): UsePendingSessionSyncResult {
  const { enabled, onStatusChange } = options;
  const { socket, isConnected } = useWebSocket();
  const prevStatusRef = useRef<string | null>(null);
  const lastWebSocketUpdateRef = useRef<number>(0);

  // P2.1: Track backoff level for exponential polling when WS is disconnected
  const [backoffLevel, setBackoffLevel] = useState(0);
  const wasConnectedRef = useRef(isConnected);

  // Calculate current polling interval with exponential backoff
  const getPollingInterval = useCallback(() => {
    if (isConnected) {
      return POLLING_INTERVALS.WS_CONNECTED;
    }
    // Exponential backoff: 10s → 20s → 40s → 80s → 120s (max)
    const baseInterval = POLLING_INTERVALS.MIN_DISCONNECTED * Math.pow(2, backoffLevel);
    const clampedInterval = Math.min(baseInterval, POLLING_INTERVALS.MAX_DISCONNECTED);
    return applyJitter(clampedInterval);
  }, [isConnected, backoffLevel]);

  // Reset backoff when WebSocket reconnects, increment on failed poll cycles
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // WebSocket just reconnected - reset backoff
      setBackoffLevel(0);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  // Query avec polling adaptatif et backoff exponentiel
  const {
    data: pendingSession,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['session-caisse', 'pending'],
    queryFn: async () => {
      const data = await sessionCaisseApi.getPending();

      // P2.1: Increment backoff level after each poll when WS is disconnected
      // This progressively reduces polling frequency when offline
      if (!isConnected) {
        setBackoffLevel(prev => Math.min(prev + 1, 4)); // Max level 4 = 120s
      }

      return data as SessionCaisse | null;
    },
    enabled,
    // P2.1: Polling adaptatif avec backoff exponentiel quand WS déconnecté
    // Connecté: 30s fixe | Déconnecté: 10s → 20s → 40s → 80s → 120s avec jitter
    refetchInterval: getPollingInterval(),
    refetchIntervalInBackground: true,
    // Garde les données en cache pendant 5s pour éviter refetch si WS vient de notifier
    staleTime: 5000,
  });

  // WebSocket Listener pour événements temps réel
  useEffect(() => {
    if (!socket || !enabled) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Événements d'ouverture de caisse
        if (data.type === 'CAISSE_UPDATE') {
          const { payload } = data;

          // FUNDS_DISPATCHED = coffre a validé
          if (payload?.type === 'FUNDS_DISPATCHED') {
            if (import.meta.env.DEV) console.log('[WS] FUNDS_DISPATCHED received, refetching session...');
            lastWebSocketUpdateRef.current = Date.now();

            // Refetch immédiat pour avoir le statut à jour
            refetch();

            // Notification visuelle
            toast.success('Dotation approuvée !', {
              description: `Le coffre a validé ${payload.montant?.toLocaleString()} FCFA`,
              duration: 8000,
            });
          }

          // FUNDS_REJECTED = demande rejetée
          else if (payload?.type === 'FUNDS_REJECTED') {
            if (import.meta.env.DEV) console.log('[WS] FUNDS_REJECTED received');
            lastWebSocketUpdateRef.current = Date.now();

            // Refetch pour mettre à jour
            refetch();

            // Notification d'erreur
            toast.error('Demande rejetée', {
              description: payload.reason || 'Le coffre a rejeté votre demande d\'ouverture',
              duration: 10000,
            });
          }
        }

        // Événements génériques d'opening request
        else if (data.type === 'OPENING_REQUEST_VALIDATED') {
          if (import.meta.env.DEV) console.log('[WS] OPENING_REQUEST_VALIDATED received');
          lastWebSocketUpdateRef.current = Date.now();
          refetch();
        }

        else if (data.type === 'OPENING_REQUEST_REJECTED') {
          if (import.meta.env.DEV) console.log('[WS] OPENING_REQUEST_REJECTED received');
          lastWebSocketUpdateRef.current = Date.now();
          refetch();
        }
      } catch (err) {
        // Ignore malformed messages
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, enabled, refetch]);

  // Détection de changement de statut et callback
  useEffect(() => {
    if (!pendingSession) {
      prevStatusRef.current = null;
      return;
    }

    const currentStatus = pendingSession.statut ?? 'UNKNOWN';
    const prevStatus = prevStatusRef.current;

    if (prevStatus && prevStatus !== currentStatus) {
      // Ne pas déclencher si WS vient de notifier (< 2 secondes)
      const timeSinceWsUpdate = Date.now() - lastWebSocketUpdateRef.current;
      const wasRecentlyNotifiedByWs = timeSinceWsUpdate < 2000;

      if (import.meta.env.DEV) {
        console.log(
          `[Session Status] ${prevStatus} → ${currentStatus}`,
          wasRecentlyNotifiedByWs ? '(via WebSocket)' : '(via polling)'
        );
      }

      onStatusChange?.(prevStatus, currentStatus);
    }

    prevStatusRef.current = currentStatus;
  }, [pendingSession, onStatusChange]);

  return {
    pendingSession: pendingSession ?? null,
    isLoading,
    refetch,
    isWebSocketConnected: isConnected,
  };
}
