/**
 * Hook pour s'abonner aux mises à jour de solde client en temps réel
 *
 * Utilise le WebSocket pour recevoir les notifications BALANCE_UPDATED
 * et invalide automatiquement les queries React Query concernées
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { useWebSocket } from './useWebSocket';

interface BalanceUpdatePayload {
  clientId: string;
  compteId?: string;
  newBalance?: number;
  oldBalance?: number;
  operationType?: string;
  timestamp?: string;
}

interface UseClientBalanceSubscriptionOptions {
  clientId?: string;
  compteId?: string;
  onBalanceUpdate?: (payload: BalanceUpdatePayload) => void;
}

export function useClientBalanceSubscription(options: UseClientBalanceSubscriptionOptions = {}) {
  const { clientId, compteId, onBalanceUpdate } = options;
  const queryClient = useQueryClient();
  const { lastMessage, isConnected } = useWebSocketContext();

  const handleBalanceUpdate = useCallback((payload: BalanceUpdatePayload) => {
    // Invalider les queries liées au solde
    if (payload.clientId) {
      queryClient.invalidateQueries({ queryKey: ['client', payload.clientId] });
      queryClient.invalidateQueries({ queryKey: ['clientBalance', payload.clientId] });
      queryClient.invalidateQueries({ queryKey: ['comptes', { clientId: payload.clientId }] });
    }

    if (payload.compteId) {
      queryClient.invalidateQueries({ queryKey: ['compte', payload.compteId] });
      queryClient.invalidateQueries({ queryKey: ['compteBalance', payload.compteId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', payload.compteId] });
    }

    // Callback personnalisé
    onBalanceUpdate?.(payload);
  }, [queryClient, onBalanceUpdate]);

  useEffect(() => {
    if (!lastMessage) return;

    // Vérifier si c'est un message de mise à jour de solde
    if (lastMessage.type === 'BALANCE_UPDATED') {
      const payload = lastMessage.payload as BalanceUpdatePayload;

      // Filtrer si un clientId ou compteId spécifique est demandé
      if (clientId && payload.clientId !== clientId) return;
      if (compteId && payload.compteId !== compteId) return;

      handleBalanceUpdate(payload);
    }
  }, [lastMessage, clientId, compteId, handleBalanceUpdate]);

  return {
    isConnected,
  };
}

/**
 * Hook simplifié pour invalider automatiquement les queries de solde
 * lors d'une mise à jour WebSocket
 */
export function useAutoBalanceRefresh() {
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket();

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'BALANCE_UPDATED') {
      const payload = lastMessage.payload as BalanceUpdatePayload;

      // Invalider toutes les queries potentiellement affectées
      queryClient.invalidateQueries({ queryKey: ['client', payload.clientId] });
      queryClient.invalidateQueries({ queryKey: ['comptes'] });
      queryClient.invalidateQueries({ queryKey: ['solde'] });
      queryClient.invalidateQueries({ queryKey: ['caisse'] });
    }
  }, [lastMessage, queryClient]);
}

export default useClientBalanceSubscription;
