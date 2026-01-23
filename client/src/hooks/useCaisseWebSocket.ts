
/**
 * WebSocket Hook for Real-Time Caisse Updates
 */

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

import { StatutCaisseType } from '@shared/enum/status-constants';

interface CaisseStatusChangedEvent {
  caisseId: string;
  status: StatutCaisseType;
  forceClosed?: boolean;
  sessionId?: string;
}

interface SessionForceClosedEvent {
  sessionId: string;
  caisseId: string;
  caissierId: string;
  closedBy: string;
  motif: string;
  keepFunds: boolean;
  soldeTheorique: string;
  timestamp: string;
}

interface CaisseUpdateEvent {
  caisseId: string;
  type: 'SESSION_OPENED' | 'FUNDS_DISPATCHED' | 'FUNDS_REJECTED' | 'BALANCE_UPDATED';
  sessionId?: string;
  newBalance?: number;
  montant?: number;
  reason?: string;
  openingType?: string;
}

interface UseCaisseWebSocketOptions {
  caisseId?: string;
  sessionId?: string;
  onCaisseStatusChanged?: (event: CaisseStatusChangedEvent) => void;
  onSessionForceClosed?: (event: SessionForceClosedEvent) => void;
  onSessionUpdated?: (data: any) => void;
  onCaisseUpdate?: (event: CaisseUpdateEvent) => void;
  enabled?: boolean;
}

export function useCaisseWebSocket({
  caisseId,
  sessionId,
  onCaisseStatusChanged,
  onSessionForceClosed,
  onSessionUpdated,
  onCaisseUpdate,
  enabled = true,
}: UseCaisseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);

  // Use refs for callbacks to avoid re-connecting when they change
  const onCaisseStatusChangedRef = useRef(onCaisseStatusChanged);
  const onSessionForceClosedRef = useRef(onSessionForceClosed);
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  const onCaisseUpdateRef = useRef(onCaisseUpdate);

  // Update refs on every render
  useEffect(() => {
    onCaisseStatusChangedRef.current = onCaisseStatusChanged;
    onSessionForceClosedRef.current = onSessionForceClosed;
    onSessionUpdatedRef.current = onSessionUpdated;
    onCaisseUpdateRef.current = onCaisseUpdate;
  });

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      let data = message;

      // Unpack REALTIME_EVENT if wrapped by outbox-worker
      if (message.type === 'REALTIME_EVENT' && message.payload) {
        data = {
          type: message.payload.eventType,
          payload: message.payload.data
        };
      }
      
      switch (data.type) {
        case 'CAISSE_STATUS_CHANGED':
          if (onCaisseStatusChangedRef.current) {
            onCaisseStatusChangedRef.current(data.payload);
          }
          
          // Show toast notification
          if (data.payload.forceClosed) {
            toast.error(`⚠️ Session fermée de force: ${data.payload.caisseId}`, {
              duration: 5000,
            });
          }
          break;
          
        case 'SESSION_FORCE_CLOSED':
          if (onSessionForceClosedRef.current) {
            onSessionForceClosedRef.current(data.payload);
          }
          
          // Show detailed toast
          toast.error(
            `Session fermée de force - Motif: ${data.payload.motif}`,
            {
              duration: 8000,
              description: `Caisse: ${data.payload.caisseId}`,
            }
          );
          break;

        case 'MOUVEMENT_CREE':
        case 'SESSION_CAISSE_CHANGE':
            // Trigger refresh
            if (onSessionUpdatedRef.current) {
                onSessionUpdatedRef.current(data.payload);
            }
            break;

        case 'CAISSE_UPDATE':
            // Handle real-time caisse updates (session opened, funds dispatched, etc.)
            if (onCaisseUpdateRef.current) {
                onCaisseUpdateRef.current(data.payload);
            }

            // Also trigger session update for refresh
            if (onSessionUpdatedRef.current) {
                onSessionUpdatedRef.current(data.payload);
            }

            // Show toast notification based on update type
            const updateType = data.payload?.type;
            if (updateType === 'SESSION_OPENED') {
                toast.success('✓ Session ouverte avec succès', {
                    duration: 3000,
                    description: `Solde: ${Number(data.payload.newBalance || 0).toLocaleString()} FCFA`,
                });
            } else if (updateType === 'FUNDS_DISPATCHED') {
                toast.success('💰 Fonds prêts à être récupérés', {
                    duration: 5000,
                    description: `Montant: ${Number(data.payload.montant || 0).toLocaleString()} FCFA`,
                });
            } else if (updateType === 'FUNDS_REJECTED') {
                toast.error('❌ Demande de fonds rejetée', {
                    duration: 5000,
                    description: data.payload.reason || 'Raison non spécifiée',
                });
            } else if (updateType === 'BALANCE_UPDATED') {
                // Silent update, just refresh
            }
            break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, []); // Constant dependency array

  useEffect(() => {
    if (!enabled) return;

    console.log('[useCaisseWebSocket] Effect triggered. Dependencies:', { enabled, caisseId, sessionId });

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    let pingInterval: NodeJS.Timeout;

    ws.addEventListener('open', () => {
      console.log('WebSocket connected for caisse updates');
      
      // Start Heartbeat
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 20000); // 20 seconds
      
      // Subscribe to specific aggregates
      const subscriptions = [];
      if (caisseId) subscriptions.push(`caisse:${caisseId}`);
      if (sessionId) subscriptions.push(`session_caisse:${sessionId}`);

      subscriptions.forEach(aggregate => {
          ws.send(JSON.stringify({
            type: 'SUBSCRIBE',
            aggregate,
          }));
          console.log(`[WS] Subscribing to ${aggregate}`);
      });
    });

    ws.addEventListener('message', handleMessage);

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.addEventListener('close', () => {
      console.log('WebSocket disconnected');
      if (pingInterval) clearInterval(pingInterval);
    });

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      ws.close();
    };
  }, [enabled, caisseId, sessionId, handleMessage]);
}
