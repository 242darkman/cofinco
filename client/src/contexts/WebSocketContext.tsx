import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authService } from '../lib/auth';
import { useServerHealth } from './ServerHealthContext';

type MessageType = "CHAT_MESSAGE" | "NOTIFICATION" | "TYPING" | "PRESENCE" | "READ_RECEIPT" | "DASHBOARD_UPDATE" | "LOCATION_UPDATE" | "USER_LOCATION" | "CREDIT_UPDATE" | "CLIENT_UPDATE" | "LIVE_ACTIVITY" | "CAISSE_UPDATE" | "HR_UPDATE" | "TONTINE_UPDATE" | "ACCOUNTING_UPDATE" | "OPERATIONS_UPDATE" | "SETTINGS_UPDATE" | "RBAC_UPDATE" | "AGENCE_UPDATE" | "EMPLOYE_UPDATE" | "LOYALTY_UPDATE" | "REALTIME_EVENT" | "SUBSCRIBED" | "UNSUBSCRIBED" | "COMPTE_UPDATE" | "MAINTENANCE_UPDATE" | "SESSION_TIMEOUT" | "SESSION_RISK_ALERT" | "FORCE_LOGOUT";

interface WebSocketMessage {
  type: MessageType;
  payload: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  socket: WebSocket | null;
  onlineUsers: Set<string>;
  typingUsers: Map<string, boolean>;
  sendMessage: (type: MessageType, payload: any) => void;
  sendTyping: (receiverId: string, isTyping: boolean) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, boolean>>(new Map());
  const { isServerReachable } = useServerHealth();
  
  const user = authService.getCurrentUser();
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const serverReachableRef = useRef(isServerReachable);
  serverReachableRef.current = isServerReachable;

  // Ref pour maintenir l'instance WebSocket active sans déclencher de re-renders infinis
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!user || !serverReachableRef.current) return;

    // Si une connexion est déjà active ou en cours sur cette ref, on ne fait rien
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?userId=${user.id}`;

    const ws = new WebSocket(wsUrl);

    // Mettre à jour la ref immédiatement
    wsRef.current = ws;

    // Track if this connection was intentionally closed (cleanup)
    let intentionallyClosed = false;

    ws.onopen = () => {
      // Don't update state if socket was already closed (StrictMode cleanup race)
      if (wsRef.current !== ws || intentionallyClosed) return;
      console.log("WebSocket Connected");
      setIsConnected(true);
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      if (intentionallyClosed) return;
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      // Don't log or reconnect if this was an intentional close (StrictMode cleanup)
      if (intentionallyClosed) return;

      if (isConnected) {
         console.log("WebSocket Disconnected");
      }
      setIsConnected(false);
      setSocket(null);
      setOnlineUsers(new Set());
      wsRef.current = null;

      // Reconnect after 3s only if user is still logged in
      if (user && serverReachableRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
      }
    };

    ws.onerror = () => {
      // Silently ignore errors - they're usually followed by onclose
      // This prevents noise in console during StrictMode double-mount
      if (!intentionallyClosed && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    };

    // Return cleanup function to mark intentional close
    return () => {
      intentionallyClosed = true;
    };
  }, [user]);

  useEffect(() => {
    let markIntentionalClose: (() => void) | undefined;

    if (user && isServerReachable) {
      markIntentionalClose = connect();
    }

    return () => {
      // Mark as intentional close BEFORE closing to prevent warnings
      markIntentionalClose?.();

      // Cleanup effect: Close socket and clear timeout
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user, isServerReachable, connect]);

  // Debounce Map for query invalidations
  const invalidationTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const debounceInvalidate = useCallback((queryKey: string[], delay = 1000) => {
     const keyStr = JSON.stringify(queryKey);
     if (invalidationTimeoutRef.current.has(keyStr)) {
       clearTimeout(invalidationTimeoutRef.current.get(keyStr));
     }
     
     const timeout = setTimeout(() => {
       queryClient.invalidateQueries({ queryKey });
       invalidationTimeoutRef.current.delete(keyStr);
     }, delay);
     
     invalidationTimeoutRef.current.set(keyStr, timeout);
  }, [queryClient]);

  useEffect(() => {
    if (!isServerReachable) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Clear all pending invalidations
      invalidationTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      invalidationTimeoutRef.current.clear();

      setIsConnected(false);
      setSocket(null);
      setOnlineUsers(new Set());
      setTypingUsers(new Map());
    }
  }, [isServerReachable]);

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case "CHAT_MESSAGE":
        const newMessage = message.payload;
        queryClient.invalidateQueries({ queryKey: ["/api/messages", newMessage.senderId] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages", newMessage.receiverId] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
        
        if (newMessage.senderId !== user?.id) {
           toast.info(`Nouveau message reçu`);
        }
        break;

      case "NOTIFICATION":
        // Handle forced logout from admin
        if (message.payload.type === 'FORCE_LOGOUT' || message.payload.forceLogout) {
          toast.error('Votre session a été terminée par un administrateur. Vous allez être déconnecté.');
          // Wait a moment for toast to be visible, then logout
          setTimeout(() => {
            authService.logout();
            window.location.href = '/login';
          }, 2000);
          return;
        }

        if (message.payload.targetRole) {
           const userRole = (user as any)?.role || (user as any)?.fonction || "user";
           if (userRole.toLowerCase() !== message.payload.targetRole.toLowerCase()) {
               return;
           }
        }
        toast(message.payload.message);
        break;

      case "PRESENCE":
        const { userId, status } = message.payload;
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          if (status === "online") newSet.add(userId);
          else newSet.delete(userId);
          return newSet;
        });
        break;

      case "TYPING":
        const { userId: typerId, isTyping } = message.payload;
        setTypingUsers(prev => {
          const newMap = new Map(prev);
          if (isTyping) {
            newMap.set(typerId, true);
            if (typingTimeoutRef.current.has(typerId)) {
                clearTimeout(typingTimeoutRef.current.get(typerId));
            }
            const timeout = setTimeout(() => {
                setTypingUsers(p => {
                    const m = new Map(p);
                    m.delete(typerId);
                    return m;
                });
            }, 3000);
            typingTimeoutRef.current.set(typerId, timeout);

          } else {
            newMap.delete(typerId);
            if (typingTimeoutRef.current.has(typerId)) {
                clearTimeout(typingTimeoutRef.current.get(typerId));
                typingTimeoutRef.current.delete(typerId);
            }
          }
          return newMap;
        });
        break;

      case "READ_RECEIPT":
         const { readerId } = message.payload;
         queryClient.invalidateQueries({ queryKey: ["/api/messages", readerId] }); 
         break;

      case "CREDIT_UPDATE":
         debounceInvalidate(["credits"]);
         debounceInvalidate(["dashboard-stats"]);
         window.dispatchEvent(new CustomEvent('credit-update', { detail: message.payload }));
         break;

      case "CLIENT_UPDATE":
         debounceInvalidate(["clients"]);
         debounceInvalidate(["dashboard-stats"]);
         window.dispatchEvent(new CustomEvent('client-update', { detail: message.payload }));
         break;

      case "LIVE_ACTIVITY":
         window.dispatchEvent(new CustomEvent('live-activity', { detail: message.payload }));
         break;

      case "DASHBOARD_UPDATE":
         debounceInvalidate(["dashboard-stats"]);
         break;

      case "CAISSE_UPDATE":
         debounceInvalidate(["caisses"]);
         window.dispatchEvent(new CustomEvent('caisse-update', { detail: message.payload }));
         break;

      case "HR_UPDATE":
         // Invalidate generic HR keys
         queryClient.invalidateQueries({ queryKey: ["/api/hr"] });
         // Specific keys can be refined if needed (e.g., ["/api/hr/conges"])
         break;

      case "TONTINE_UPDATE":
         debounceInvalidate(["/api/tontines"]);
         break;

      case "ACCOUNTING_UPDATE":
         debounceInvalidate(["/api/comptabilite"]);
         debounceInvalidate(["/api/factures"]);
         break;

      case "OPERATIONS_UPDATE":
         queryClient.invalidateQueries({ queryKey: ["/api/agents-terrain"] });
         queryClient.invalidateQueries({ queryKey: ["/api/prospections"] });
         queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
         queryClient.invalidateQueries({ queryKey: ["/api/objectifs-mensuels"] });
         queryClient.invalidateQueries({ queryKey: ["/api/paiements-terrain"] });
         break;

      case "SETTINGS_UPDATE":
         queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
         break;

      case "RBAC_UPDATE":
         queryClient.invalidateQueries({ queryKey: ["/api/permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/role-permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/user-permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/rbac"] });
         queryClient.invalidateQueries({ queryKey: ["/api/rbac"] });
         window.dispatchEvent(new CustomEvent('rbac-update', { detail: message.payload }));
         break;

      case "AGENCE_UPDATE":
         debounceInvalidate(["/api/agences"]);
         debounceInvalidate(["/api/me/agences"]);
         break;

      case "EMPLOYE_UPDATE":
         debounceInvalidate(["/api/employes"]);
         break;

      case "LOYALTY_UPDATE":
         debounceInvalidate(["/api/loyalty"]);
         break;

      case "REALTIME_EVENT":
         // Ledger events from outbox worker - dispatch as custom event
         // Individual components subscribe via useRealTimeSubscription hook
         window.dispatchEvent(new CustomEvent('realtime-event', { detail: message.payload }));
         
         // Auto-invalidate relevant queries based on aggregate type
         const { aggregateType, aggregateId } = message.payload;
         if (aggregateType === 'compte') {
           debounceInvalidate(['compte', aggregateId]);
           debounceInvalidate(['transactions', aggregateId]);
         } else if (aggregateType === 'credit') {
           debounceInvalidate(['credit', aggregateId]);
           debounceInvalidate(['remboursements', aggregateId]);
         } else if (aggregateType === 'client') {
           debounceInvalidate(['client', aggregateId]);
           debounceInvalidate(['client-portfolio', aggregateId]);
         } else if (aggregateType === 'session_caisse') {
           debounceInvalidate(['session', aggregateId]);
           debounceInvalidate(['operations', aggregateId]);
         }
         break;

      case "COMPTE_UPDATE":
         debounceInvalidate(["comptes-epargne"]);
         window.dispatchEvent(new CustomEvent('compte-update', { detail: message.payload }));
         break;

      case "SUBSCRIBED":
      case "UNSUBSCRIBED":
         // Acknowledgment messages - can be logged for debugging
         console.log(`[WS] ${message.type}:`, message.payload?.aggregate || message);
         break;

      case "MAINTENANCE_UPDATE":
         window.dispatchEvent(new CustomEvent('maintenance-update', { detail: message.payload }));
         break;

      case "SESSION_TIMEOUT":
         // Check if this timeout applies to current user
         if (message.payload.caissierId === user?.id || message.payload.userId === user?.id || message.payload.sessionId === (user as any)?.sessionId) {
            toast.error("Votre session a expiré suite à une période d'inactivité.", {
              duration: Infinity, // Require manual dismissal or it stays until redirect
              action: {
                label: "Se reconnecter",
                onClick: () => window.location.reload()
              }
            });
            // Delay slightly to let user see toast, then logout
            setTimeout(() => {
                authService.logout();
                window.location.reload();
            }, 2000);
         }
         break;

      case "SESSION_RISK_ALERT":
         // Check if applies to current user
         if (message.payload.caissierId === user?.id) {
            toast.warning(`Attention : Votre session caisse est inactive depuis ${message.payload.hoursInactive}h.`, {
               description: "Elle sera fermée automatiquement après 12h d'inactivité.",
               duration: 8000,
            });
         }
         break;

      case "FORCE_LOGOUT":
         if (message.payload.userId === user?.id) {
             toast.error("DÉCONNEXION FORCÉE", {
                 description: message.payload.reason || "Un administrateur a terminé votre session.",
                 duration: 5000
             });
             setTimeout(() => {
                 authService.logout();
                 window.location.reload();
             }, 1500);
         }
         break;
    }
  };

  const sendMessage = (type: MessageType, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  };

  const sendTyping = (receiverId: string, isTyping: boolean) => {
    sendMessage("TYPING", { receiverId, isTyping });
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, socket, onlineUsers, typingUsers, sendMessage, sendTyping }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
