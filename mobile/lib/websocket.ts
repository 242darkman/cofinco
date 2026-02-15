import { API_URL } from './api-client';
import { queryClient } from './query-client';
import { queryKeys } from '@/constants/query-keys';

const WS_URL = API_URL.replace(/^http/, 'ws');

type MessageHandler = (type: string, payload: unknown) => void;

class MobileWebSocket {
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private handlers: MessageHandler[] = [];
  private isConnecting = false;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'PONG') return;

          // Auto-invalidate relevant queries
          this.handleCacheInvalidation(msg.type);

          // Notify all handlers
          for (const handler of this.handlers) {
            handler(msg.type, msg.payload);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        this.ws?.close();
      };
    } catch {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    this.ws?.close();
    this.ws = null;
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
      }
    }, 30_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private handleCacheInvalidation(type: string) {
    switch (type) {
      case 'COMPTE_UPDATE':
      case 'BALANCE_UPDATED':
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
        break;
      case 'DASHBOARD_UPDATE':
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
        break;
      case 'NOTIFICATION':
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        break;
      case 'CREDIT_UPDATE':
        queryClient.invalidateQueries({ queryKey: queryKeys.credits.all });
        break;
      case 'OPERATIONS_UPDATE':
        queryClient.invalidateQueries({ queryKey: ['agent', 'operations'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'prospections'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'caisse'] });
        break;
      case 'AGENT_MODULES_UPDATE':
        queryClient.invalidateQueries({ queryKey: ['agent', 'commissions'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'objectifs'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'planning'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'incidents'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'communications'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'leaderboard'] });
        break;
      case 'SESSION_AGENT_UPDATE':
        queryClient.invalidateQueries({ queryKey: ['agent', 'session'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'caisse'] });
        queryClient.invalidateQueries({ queryKey: ['agent', 'operations'] });
        break;
      case 'SESSION_FORCE_CLOSED':
      case 'FORCE_LOGOUT':
        // Auth store handles this via onUnauthorized callback
        break;
    }
  }
}

export const mobileWs = new MobileWebSocket();
