/**
 * Hook hybride pour synchroniser l'état de la session d'ouverture en attente
 *
 * Stratégie intelligente:
 * - WebSocket en priorité pour notifications temps réel
 * - Polling réduit comme backup (30s au lieu de 10s)
 * - Polling augmente à 10s si WebSocket déconnecté
 * - Refetch immédiat sur événement WebSocket
 */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWebSocket } from '../useWebSocket';
import { sessionCaisseApi } from '../../lib/api-client';
import type { SessionCaisse } from '../../types/finance';

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

  // Query avec polling adaptatif
  const {
    data: pendingSession,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['session-caisse', 'pending'],
    queryFn: async () => {
      const data = await sessionCaisseApi.getPending();
      return data as SessionCaisse | null;
    },
    enabled,
    // Polling adaptatif selon état WebSocket
    refetchInterval: isConnected ? 30000 : 10000, // 30s si WS actif, 10s sinon
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
            console.log('[WS] FUNDS_DISPATCHED received, refetching session...');
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
            console.log('[WS] FUNDS_REJECTED received');
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
          console.log('[WS] OPENING_REQUEST_VALIDATED received');
          lastWebSocketUpdateRef.current = Date.now();
          refetch();
        }

        else if (data.type === 'OPENING_REQUEST_REJECTED') {
          console.log('[WS] OPENING_REQUEST_REJECTED received');
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

    const currentStatus = pendingSession.statut;
    const prevStatus = prevStatusRef.current;

    if (prevStatus && prevStatus !== currentStatus) {
      // Ne pas déclencher si WS vient de notifier (< 2 secondes)
      const timeSinceWsUpdate = Date.now() - lastWebSocketUpdateRef.current;
      const wasRecentlyNotifiedByWs = timeSinceWsUpdate < 2000;

      console.log(
        `[Session Status] ${prevStatus} → ${currentStatus}`,
        wasRecentlyNotifiedByWs ? '(via WebSocket)' : '(via polling)'
      );

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
