/**
 * WebSocket Hook for Real-Time Caisse Updates
 */

import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface CaisseStatusChangedEvent {
  caisseId: string;
  status: 'Ouverte' | 'Fermée';
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
  onCaisseStatusChanged?: (event: CaisseStatusChangedEvent) => void;
  onSessionForceClosed?: (event: SessionForceClosedEvent) => void;
  enabled?: boolean;
}

export function useCaisseWebSocket({
  onCaisseStatusChanged,
  onSessionForceClosed,
  enabled = true,
}: UseCaisseWebSocketOptions) {
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
          if (onCaisseStatusChanged) {
            onCaisseStatusChanged(data.payload);
          }
          
          // Show toast notification
          if (data.payload.forceClosed) {
            toast.error(`⚠️ Session fermée de force: ${data.payload.caisseId}`, {
              duration: 5000,
            });
          }
          break;
          
        case 'SESSION_FORCE_CLOSED':
          if (onSessionForceClosed) {
            onSessionForceClosed(data.payload);
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
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [onCaisseStatusChanged, onSessionForceClosed]);

  useEffect(() => {
    if (!enabled) return;

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.addEventListener('open', () => {
      console.log('WebSocket connected for caisse updates');
      
      // Subscribe to caisse events
      ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        channels: ['CAISSE_UPDATES', 'SESSION_UPDATES'],
      }));
    });

    ws.addEventListener('message', handleMessage);

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.addEventListener('close', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      ws.close();
    };
  }, [enabled, handleMessage]);
}
