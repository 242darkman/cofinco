import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

/**
 * Aggregate channel types for real-time subscriptions
 * These correspond to: client:{id}, compte:{id}, credit:{id}, etc.
 */
export type AggregateType = 'client' | 'compte' | 'credit' | 'tontine' | 'session_caisse' | 'agent';

/**
 * Event types emitted by the outbox worker
 */
export type EventType =
  | 'MOUVEMENT_CREE'
  | 'MOUVEMENT_STATUT_CHANGE'
  | 'SOLDE_COMPTE_CHANGE'
  | 'CREDIT_SOLDE_CHANGE'
  | 'SESSION_CAISSE_CHANGE'
  | 'TRANSFERT_CAISSE_CHANGE'
  | 'COMPTE_CREE'
  | 'COMPTE_BLOQUE'
  | 'COMPTE_DEBLOQUE'
  | 'COMPTE_TRANSFERE_AGENCE';

interface RealTimeEvent {
  type: 'REALTIME_EVENT';
  payload: {
    channel: string;
    eventType: EventType;
    aggregateType: AggregateType;
    aggregateId: string;
    data: any;
    timestamp: string;
  };
}

interface UseRealTimeSubscriptionOptions {
  /** Callback fired when an event is received for this subscription */
  onEvent?: (event: RealTimeEvent['payload']) => void;
  /** React Query keys to invalidate when an event is received */
  invalidateKeys?: string[][];
  /** Whether to refetch data automatically on event */
  autoRefetch?: boolean;
}

/**
 * Hook to subscribe to real-time ledger events from the outbox worker.
 * 
 * @example
 * // Subscribe to a client's portfolio updates
 * useRealTimeSubscription('client', clientId, {
 *   onEvent: (event) => console.log('Client event:', event),
 *   invalidateKeys: [['client-portfolio', clientId]]
 * });
 * 
 * @example
 * // Subscribe to a savings account updates
 * useRealTimeSubscription('compte', compteId, {
 *   invalidateKeys: [['compte', compteId], ['transactions', compteId]]
 * });
 */
export function useRealTimeSubscription(
  aggregateType: AggregateType,
  aggregateId: string | undefined,
  options: UseRealTimeSubscriptionOptions = {}
) {
  const { socket, isConnected } = useWebSocket();
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<string | null>(null);
  const { onEvent, invalidateKeys, autoRefetch = true } = options;

  // Subscribe to channel when connected and id is available
  const subscribe = useCallback(() => {
    if (!socket || !isConnected || !aggregateId) return;

    const channel = `${aggregateType}:${aggregateId}`;
    
    // Don't resubscribe if already subscribed to same channel
    if (subscriptionRef.current === channel) return;

    socket.send(JSON.stringify({ 
      type: 'SUBSCRIBE', 
      aggregate: channel 
    }));
    
    subscriptionRef.current = channel;
    if (import.meta.env.DEV) console.log(`[RealTime] Subscribed to ${channel}`);
  }, [socket, isConnected, aggregateType, aggregateId]);

  // Unsubscribe from channel
  const unsubscribe = useCallback(() => {
    if (!socket || !subscriptionRef.current) return;

    const channel = subscriptionRef.current;
    socket.send(JSON.stringify({ 
      type: 'UNSUBSCRIBE', 
      aggregate: channel 
    }));
    
    if (import.meta.env.DEV) console.log(`[RealTime] Unsubscribed from ${channel}`);
    subscriptionRef.current = null;
  }, [socket]);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      
      if (message.type === 'REALTIME_EVENT') {
        const eventPayload = message.payload as RealTimeEvent['payload'];
        
        // Check if this event is for our subscription
        if (eventPayload.aggregateType === aggregateType && 
            eventPayload.aggregateId === aggregateId) {
          
          // Call user callback
          onEvent?.(eventPayload);
          
          // Invalidate specified query keys
          if (autoRefetch && invalidateKeys) {
            invalidateKeys.forEach(key => {
              queryClient.invalidateQueries({ queryKey: key });
            });
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [aggregateType, aggregateId, onEvent, invalidateKeys, autoRefetch, queryClient]);

  // Subscribe on mount, unsubscribe on unmount
  useEffect(() => {
    subscribe();
    
    return () => {
      unsubscribe();
    };
  }, [subscribe, unsubscribe]);

  // Listen for messages
  useEffect(() => {
    if (!socket) return;

    socket.addEventListener('message', handleMessage);
    
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, handleMessage]);

  // Re-subscribe when connection is restored
  useEffect(() => {
    if (isConnected && aggregateId && !subscriptionRef.current) {
      subscribe();
    }
  }, [isConnected, aggregateId, subscribe]);

  return {
    isSubscribed: !!subscriptionRef.current,
    subscribe,
    unsubscribe,
  };
}

/**
 * Hook to subscribe to multiple aggregates at once
 */
export function useMultipleSubscriptions(
  subscriptions: Array<{ type: AggregateType; id: string | undefined }>,
  options: UseRealTimeSubscriptionOptions = {}
) {
  const { socket, isConnected } = useWebSocket();
  const queryClient = useQueryClient();
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const { onEvent, invalidateKeys, autoRefetch = true } = options;

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Subscribe to new channels
    subscriptions.forEach(({ type, id }) => {
      if (!id) return;
      const channel = `${type}:${id}`;
      
      if (!subscriptionsRef.current.has(channel)) {
        socket.send(JSON.stringify({ type: 'SUBSCRIBE', aggregate: channel }));
        subscriptionsRef.current.add(channel);
      }
    });

    return () => {
      // Unsubscribe from all channels on unmount
      subscriptionsRef.current.forEach(channel => {
        socket.send(JSON.stringify({ type: 'UNSUBSCRIBE', aggregate: channel }));
      });
      subscriptionsRef.current.clear();
    };
  }, [socket, isConnected, subscriptions]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'REALTIME_EVENT') {
          const eventPayload = message.payload as RealTimeEvent['payload'];
          const channel = `${eventPayload.aggregateType}:${eventPayload.aggregateId}`;
          
          if (subscriptionsRef.current.has(channel)) {
            onEvent?.(eventPayload);
            
            if (autoRefetch && invalidateKeys) {
              invalidateKeys.forEach(key => {
                queryClient.invalidateQueries({ queryKey: key });
              });
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, onEvent, invalidateKeys, autoRefetch, queryClient]);

  return {
    subscribedCount: subscriptionsRef.current.size,
  };
}

// ============================================================================
// SPECIALIZED HOOKS FOR MICROFINANCE
// ============================================================================

/**
 * Hook to subscribe to a compte (savings account) updates
 * Automatically invalidates compte and transaction queries
 *
 * @example
 * const { isSubscribed } = useCompteSubscription(compteId, {
 *   onBalanceChange: (newBalance) => console.log('New balance:', newBalance),
 *   onBlocked: () => showNotification('Account blocked'),
 *   onUnblocked: () => showNotification('Account unblocked'),
 * });
 */
export function useCompteSubscription(
  compteId: string | undefined,
  options: {
    onBalanceChange?: (newBalance: string, eventData: any) => void;
    onBlocked?: (eventData: any) => void;
    onUnblocked?: (eventData: any) => void;
    onTransfert?: (eventData: any) => void;
    onMouvement?: (eventData: any) => void;
  } = {}
) {
  const queryClient = useQueryClient();

  return useRealTimeSubscription('compte', compteId, {
    onEvent: (event) => {
      const { eventType, data } = event;

      switch (eventType) {
        case 'SOLDE_COMPTE_CHANGE':
          options.onBalanceChange?.(data.nouveauSolde, data);
          break;
        case 'COMPTE_BLOQUE':
          options.onBlocked?.(data);
          break;
        case 'COMPTE_DEBLOQUE':
          options.onUnblocked?.(data);
          break;
        case 'COMPTE_TRANSFERE_AGENCE':
          options.onTransfert?.(data);
          break;
        case 'MOUVEMENT_CREE':
          options.onMouvement?.(data);
          break;
      }
    },
    invalidateKeys: compteId
      ? [
          ['compte', compteId],
          ['comptes'],
          ['transactions', compteId],
          ['mouvements', compteId],
        ]
      : [],
    autoRefetch: true,
  });
}

/**
 * Hook to subscribe to a client's portfolio updates
 * Receives events for all accounts, credits, and tontines
 *
 * @example
 * const { isSubscribed } = useClientPortfolioSubscription(clientId, {
 *   onAccountUpdate: (data) => console.log('Account updated:', data),
 *   onCreditUpdate: (data) => console.log('Credit updated:', data),
 * });
 */
export function useClientPortfolioSubscription(
  clientId: string | undefined,
  options: {
    onAccountUpdate?: (eventData: any) => void;
    onCreditUpdate?: (eventData: any) => void;
    onTontineUpdate?: (eventData: any) => void;
    onMouvement?: (eventData: any) => void;
  } = {}
) {
  const queryClient = useQueryClient();

  return useRealTimeSubscription('client', clientId, {
    onEvent: (event) => {
      const { eventType, data } = event;

      // Route to appropriate handler based on event type
      if (
        eventType === 'SOLDE_COMPTE_CHANGE' ||
        eventType === 'COMPTE_CREE' ||
        eventType === 'COMPTE_BLOQUE' ||
        eventType === 'COMPTE_DEBLOQUE'
      ) {
        options.onAccountUpdate?.(data);
      } else if (eventType === 'CREDIT_SOLDE_CHANGE') {
        options.onCreditUpdate?.(data);
      } else if (eventType === 'MOUVEMENT_CREE') {
        options.onMouvement?.(data);
      }
    },
    invalidateKeys: clientId
      ? [
          ['client', clientId],
          ['client-portfolio', clientId],
          ['comptes', clientId],
          ['credits', clientId],
        ]
      : [],
    autoRefetch: true,
  });
}

/**
 * Hook to subscribe to a credit's updates
 *
 * @example
 * useCreditsSubscription(creditId, {
 *   onPayment: (data) => console.log('Payment received:', data.montant),
 *   onBalanceChange: (newBalance) => updateUI(newBalance),
 * });
 */
export function useCreditSubscription(
  creditId: string | undefined,
  options: {
    onPayment?: (eventData: any) => void;
    onBalanceChange?: (newBalance: string, eventData: any) => void;
  } = {}
) {
  return useRealTimeSubscription('credit', creditId, {
    onEvent: (event) => {
      const { eventType, data } = event;

      if (eventType === 'MOUVEMENT_CREE') {
        options.onPayment?.(data);
      } else if (eventType === 'CREDIT_SOLDE_CHANGE') {
        options.onBalanceChange?.(data.nouveauSolde, data);
      }
    },
    invalidateKeys: creditId
      ? [
          ['credit', creditId],
          ['remboursements', creditId],
          ['mouvements', creditId],
        ]
      : [],
    autoRefetch: true,
  });
}

/**
 * Hook to subscribe to a caisse session updates
 *
 * @example
 * useSessionCaisseSubscription(sessionId, {
 *   onBalanceChange: (newBalance) => updateDisplay(newBalance),
 *   onOperation: (op) => addToList(op),
 * });
 */
export function useSessionCaisseSubscription(
  sessionId: string | undefined,
  options: {
    onBalanceChange?: (newBalance: string, eventData: any) => void;
    onOperation?: (eventData: any) => void;
  } = {}
) {
  return useRealTimeSubscription('session_caisse', sessionId, {
    onEvent: (event) => {
      const { eventType, data } = event;

      if (eventType === 'SESSION_CAISSE_CHANGE') {
        options.onBalanceChange?.(data.nouveauSoldeTheorique, data);
      } else if (eventType === 'MOUVEMENT_CREE') {
        options.onOperation?.(data);
      }
    },
    invalidateKeys: sessionId
      ? [
          ['session-caisse', sessionId],
          ['operations-caisse', sessionId],
        ]
      : [],
    autoRefetch: true,
  });
}
