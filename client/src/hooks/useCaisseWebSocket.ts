
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

interface UseCaisseWebSocketOptions {
  caisseId?: string;
  sessionId?: string;
  onCaisseStatusChanged?: (event: CaisseStatusChangedEvent) => void;
  onSessionForceClosed?: (event: SessionForceClosedEvent) => void;
  onSessionUpdated?: (data: any) => void;
  enabled?: boolean;
}

export function useCaisseWebSocket({
  caisseId,
  sessionId,
  onCaisseStatusChanged,
  onSessionForceClosed,
  onSessionUpdated,
  enabled = true,
}: UseCaisseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);

  // Use refs for callbacks to avoid re-connecting when they change
  const onCaisseStatusChangedRef = useRef(onCaisseStatusChanged);
  const onSessionForceClosedRef = useRef(onSessionForceClosed);
  const onSessionUpdatedRef = useRef(onSessionUpdated);

  // Update refs on every render
  useEffect(() => {
    onCaisseStatusChangedRef.current = onCaisseStatusChanged;
    onSessionForceClosedRef.current = onSessionForceClosed;
    onSessionUpdatedRef.current = onSessionUpdated;
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
