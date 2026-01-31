import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authService } from '../lib/auth';
import { formatMoney } from '../lib/format';
import { useServerHealth } from './ServerHealthContext';
import {
  balanceKeys,
  compteKeys,
  creditKeys,
  caisseKeys,
  coffreKeys,
  tontineKeys,
  dashboardKeys,
  agentKeys,
  scheduledTransferKeys,
  treasuryKeys,
  getInvalidationKeysForEntity,
} from '../lib/query-keys';

/**
 * Types de messages WebSocket unifiés
 * SOURCE UNIQUE DE VERITE - Synchronisé avec server/ws-server.ts
 */
type MessageType =
  // =============================================
  // MESSAGING
  // =============================================
  // V1 - Messages directs
  | "CHAT_MESSAGE" | "TYPING" | "READ_RECEIPT"
  // V2 - Conversations
  | "CHAT_MESSAGE_V2" | "TYPING_V2" | "READ_UPDATE"
  | "CONVERSATION_UPDATE" | "MESSAGE_REACTION" | "MESSAGE_DELETED" | "MESSAGE_EDITED"
  | "SUBSCRIBE_CONVERSATION" | "UNSUBSCRIBE_CONVERSATION"
  | "SUBSCRIBED_CONVERSATION" | "UNSUBSCRIBED_CONVERSATION"

  // =============================================
  // SYSTÈME & NOTIFICATIONS
  // =============================================
  | "NOTIFICATION" | "PRESENCE" | "PRESENCE_UPDATE" | "DASHBOARD_UPDATE"
  | "LIVE_ACTIVITY" | "REALTIME_EVENT"
  | "SUBSCRIBED" | "UNSUBSCRIBED"

  // =============================================
  // MODULES MÉTIER
  // =============================================
  | "CREDIT_UPDATE" | "CLIENT_UPDATE" | "COMPTE_UPDATE"
  | "CAISSE_UPDATE" | "TONTINE_UPDATE" | "OPERATIONS_UPDATE"
  | "EMPLOYE_UPDATE" | "AGENCE_UPDATE" | "HR_UPDATE"
  | "ACCOUNTING_UPDATE" | "LOYALTY_UPDATE"
  | "SETTINGS_UPDATE" | "RBAC_UPDATE"

  // =============================================
  // AGENT MODULES
  // =============================================
  | "AGENT_MODULES_UPDATE"

  // =============================================
  // LOCALISATION (Agents terrain)
  // =============================================
  | "LOCATION_UPDATE" | "USER_LOCATION"

  // =============================================
  // SESSIONS & SÉCURITÉ
  // =============================================
  | "SESSION_TIMEOUT" | "SESSION_FORCE_CLOSED" | "SESSION_RISK_ALERT"
  | "MAINTENANCE_UPDATE" | "FORCE_LOGOUT"
  | "SESSION_HEARTBEAT" | "SESSION_HEARTBEAT_RESPONSE" | "SESSION_INVALID"

  // =============================================
  // COFFRE-FORT
  // =============================================
  | "OPENING_REQUEST_CREATED" | "OPENING_REQUEST_VALIDATED" | "OPENING_REQUEST_REJECTED"
  | "REFUND_PENDING_CAISSE" | "REFUND_PAID"

  // =============================================
  // BALANCE & RÉCONCILIATION
  // =============================================
  | "BALANCE_UPDATED" | "TREASURY_UPDATED"
  | "BALANCE_ALERT" | "RECONCILIATION_COMPLETE" | "RECONCILIATION_ERROR"
  | "TREASURY_RECONCILIATION_ALERT" | "TREASURY_RECONCILIATION_COMPLETE"

  // =============================================
  // RAPPELS & SCHEDULES
  // =============================================
  | "SCHEDULE_UPDATED"

  // =============================================
  // VIREMENTS PROGRAMMÉS
  // =============================================
  | "SCHEDULED_TRANSFER_UPDATED" | "SCHEDULED_TRANSFER_EXECUTED"
  | "SCHEDULED_TRANSFERS_BATCH_COMPLETED"

  // =============================================
  // MONITORING FINANCIER & ALERTES
  // =============================================
  | "MONITORING_ALERT" | "MONITORING_ALERT_UPDATED" | "MONITORING_ALERT_DISMISSED"
  | "MONITORING_DASHBOARD" | "ALERT_CREATED"

  // =============================================
  // MIGRATION D'AGENCE
  // =============================================
  | "MIGRATION_PROGRESS" | "MIGRATION_STATUS";

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
  pendingMessagesCount: number;
}

// Offline message buffer - persists important messages when disconnected
interface BufferedMessage {
  id: string;
  type: MessageType;
  payload: any;
  timestamp: number;
  retries: number;
}

const BUFFER_STORAGE_KEY = 'cofin_ws_buffer';
const MAX_BUFFER_SIZE = 100;
const MAX_RETRIES = 3;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

// Idempotence: Track processed eventIds to ignore duplicates
const PROCESSED_EVENTS_MAX_SIZE = 1000;
const processedEventIds = new Set<string>();

// Messages that should be buffered when offline
const BUFFERABLE_TYPES: MessageType[] = [
  'CHAT_MESSAGE',
  'TYPING',
  'TYPING_V2',
  'LOCATION_UPDATE',
];

function loadBuffer(): BufferedMessage[] {
  try {
    const stored = localStorage.getItem(BUFFER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveBuffer(buffer: BufferedMessage[]) {
  try {
    localStorage.setItem(BUFFER_STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_BUFFER_SIZE)));
  } catch {
    // Ignore storage errors
  }
}

function clearBuffer() {
  try {
    localStorage.removeItem(BUFFER_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, boolean>>(new Map());
  const [messageBuffer, setMessageBuffer] = useState<BufferedMessage[]>(loadBuffer);
  const { isServerReachable } = useServerHealth();

  const user = authService.getCurrentUser();
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const serverReachableRef = useRef(isServerReachable);
  serverReachableRef.current = isServerReachable;

  // Reconnection state for exponential backoff
  const reconnectAttemptsRef = useRef(0);

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

      // Reset reconnect counter on successful connection
      reconnectAttemptsRef.current = 0;

      // Flush buffered messages
      const buffer = loadBuffer();
      if (buffer.length > 0) {
        console.log(`[WS] Flushing ${buffer.length} buffered messages`);
        buffer.forEach((msg) => {
          if (msg.retries < MAX_RETRIES) {
            try {
              ws.send(JSON.stringify({ type: msg.type, payload: msg.payload }));
            } catch {
              // Will be retried on next reconnect
            }
          }
        });
        clearBuffer();
        setMessageBuffer([]);
      }
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

      // Reconnect with exponential backoff if user is still logged in
      if (user && serverReachableRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
            MAX_RECONNECT_DELAY
          );
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
      } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.warn('[WS] Max reconnect attempts reached. Please refresh the page.');
          toast.error('Connexion temps réel perdue. Veuillez rafraîchir la page.', {
            duration: Infinity,
            action: {
              label: 'Rafraîchir',
              onClick: () => window.location.reload()
            }
          });
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

  const debounceInvalidate = useCallback((queryKey: readonly (string | undefined)[], delay = 1000) => {
     // Filter out undefined values and convert to mutable array for React Query
     const cleanKey = queryKey.filter((k): k is string => k !== undefined);
     const keyStr = JSON.stringify(cleanKey);
     if (invalidationTimeoutRef.current.has(keyStr)) {
       clearTimeout(invalidationTimeoutRef.current.get(keyStr));
     }

     const timeout = setTimeout(() => {
       queryClient.invalidateQueries({ queryKey: cleanKey });
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
      case "CHAT_MESSAGE_V2": {
        const v2Msg = message.payload;
        queryClient.invalidateQueries({ queryKey: ["v2", "conversations"] });
        if (v2Msg.conversationId) {
          queryClient.invalidateQueries({ queryKey: ["v2", "conversations", v2Msg.conversationId, "messages"] });
        }
        if (v2Msg.message?.senderId !== user?.id) {
          toast.info(`Nouveau message reçu`);
        }
        break;
      }

      case "MESSAGE_EDITED":
      case "MESSAGE_DELETED": {
        const editPayload = message.payload;
        if (editPayload.conversationId) {
          queryClient.invalidateQueries({ queryKey: ["v2", "conversations", editPayload.conversationId, "messages"] });
        }
        queryClient.invalidateQueries({ queryKey: ["v2", "conversations"] });
        break;
      }

      case "MESSAGE_REACTION": {
        const reactPayload = message.payload;
        if (reactPayload.conversationId) {
          queryClient.invalidateQueries({ queryKey: ["v2", "conversations", reactPayload.conversationId, "messages"] });
        }
        break;
      }

      case "CONVERSATION_UPDATE": {
        queryClient.invalidateQueries({ queryKey: ["v2", "conversations"] });
        break;
      }

      case "READ_UPDATE": {
        queryClient.invalidateQueries({ queryKey: ["v2", "conversations"] });
        break;
      }

      // Legacy V1 handler (backward compat for any remaining V1 code)
      case "CHAT_MESSAGE": {
        const newMessage = message.payload;
        queryClient.invalidateQueries({ queryKey: ["v2", "conversations"] });
        if (newMessage.senderId !== user?.id) {
          toast.info(`Nouveau message reçu`);
        }
        break;
      }

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

      case "READ_RECEIPT": {
         queryClient.invalidateQueries({ queryKey: ["v2", "conversations"] });
         break;
      }

      case "CREDIT_UPDATE":
         // NOTE: Les mises à jour de solde crédit sont gérées par BALANCE_UPDATED
         // Ce handler reste pour les notifications non-financières (création, suppression, etc.)
         debounceInvalidate(creditKeys.all);
         // dashboard-stats est invalidé par BALANCE_UPDATED, pas besoin de le faire ici
         window.dispatchEvent(new CustomEvent('credit-update', { detail: message.payload }));

         // Handle refund-related credit updates for sidebar badge
         if (message.payload?.type === 'refund_created' || message.payload?.type === 'refund_approved') {
           window.dispatchEvent(new CustomEvent('refund-update', { detail: message.payload }));
           debounceInvalidate(["/api/credit-refunds"]);
         }
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
         // Fallback pour forcer un refresh du dashboard
         // BALANCE_UPDATED gère déjà les mises à jour financières, mais ce signal
         // peut être utile pour les mises à jour non-financières (agents, clients, etc.)
         debounceInvalidate(dashboardKeys.stats());
         break;

      case "CAISSE_UPDATE":
         // Invalidation des queries caisse (sessions, opérations, supervision)
         debounceInvalidate(caisseKeys.sessions());
         debounceInvalidate(caisseKeys.sessionActive());
         debounceInvalidate(caisseKeys.operations());
         debounceInvalidate(caisseKeys.operationsToday());
         debounceInvalidate(caisseKeys.supervision());
         debounceInvalidate(caisseKeys.all);
         // Filet de sécurité: rafraîchir aussi le dashboard principal
         // BALANCE_UPDATED le fait déjà pour les opérations financières, mais certaines
         // actions caisse (ouverture, annulation) peuvent ne pas émettre BALANCE_UPDATED
         debounceInvalidate(dashboardKeys.stats());
         window.dispatchEvent(new CustomEvent('caisse-update', { detail: message.payload }));
         break;

      case "HR_UPDATE":
         // Invalidate generic HR keys
         queryClient.invalidateQueries({ queryKey: ["/api/hr"] });

         // Dispatch custom event for useHrRealtime hook
         window.dispatchEvent(new CustomEvent('hr-update', { detail: message.payload }));

         // Invalidate specific keys based on entity
         const hrEntity = message.payload?.entity;
         if (hrEntity) {
           switch (hrEntity) {
             case 'conge':
               debounceInvalidate(["/api/hr/conges"]);
               debounceInvalidate(["/api/hr/conges/balance"]);
               break;
             case 'paie':
             case 'bulletin':
               debounceInvalidate(["/api/hr/bulletins"]);
               debounceInvalidate(["/api/hr/paie/my"]);
               break;
             case 'formation':
               debounceInvalidate(["/api/hr/formations"]);
               break;
             case 'sanction':
               debounceInvalidate(["/api/hr/sanctions"]);
               break;
             case 'presence':
               debounceInvalidate(["/api/hr/presence/today"]);
               break;
             case 'candidature':
               debounceInvalidate(["/api/hr/candidatures"]);
               break;
             case 'avantage':
               debounceInvalidate(["/api/hr/avantages"]);
               break;
             case 'organigramme':
               debounceInvalidate(["/api/hr/organigramme"]);
               break;
           }
         }
         break;

      case "TONTINE_UPDATE":
         // NOTE: Les mises à jour de solde tontine sont gérées par BALANCE_UPDATED
         // Ce handler reste pour les notifications non-financières (création, ajout membre, etc.)
         debounceInvalidate(tontineKeys.all);
         break;

      case "SCHEDULE_UPDATED":
         // Invalidate credit and tontine schedules when reminder schedules change
         debounceInvalidate(creditKeys.all);
         debounceInvalidate(tontineKeys.all);
         break;

      case "ACCOUNTING_UPDATE":
         debounceInvalidate(["/api/comptabilite"]);
         debounceInvalidate(["/api/factures"]);
         window.dispatchEvent(new CustomEvent('accounting-update', { detail: message.payload }));
         break;

      case "OPERATIONS_UPDATE":
         queryClient.invalidateQueries({ queryKey: ["/api/agents-terrain"] });
         queryClient.invalidateQueries({ queryKey: ["/api/prospections"] });
         queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
         queryClient.invalidateQueries({ queryKey: ["/api/objectifs-mensuels"] });
         queryClient.invalidateQueries({ queryKey: ["/api/paiements-terrain"] });
         break;

      case "AGENT_MODULES_UPDATE": {
         // Invalidate all agent module queries
         const agentEntity = message.payload?.entity;
         if (agentEntity) {
           debounceInvalidate([`/api/agent-${agentEntity}s`]);
         } else {
           // Full invalidation of all agent module queries
           debounceInvalidate(["/api/agent-commissions"]);
           debounceInvalidate(["/api/agent-objectifs"]);
           debounceInvalidate(["/api/agent-planning"]);
           debounceInvalidate(["/api/agent-rapports"]);
           debounceInvalidate(["/api/agent-incidents"]);
           debounceInvalidate(["/api/agent-materiel"]);
           debounceInvalidate(["/api/agent-communications"]);
           debounceInvalidate(["/api/agent-formations"]);
         }
         window.dispatchEvent(new CustomEvent('agent-modules-update', { detail: message.payload }));
         break;
      }

      case "SETTINGS_UPDATE":
         queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
         break;

      case "RBAC_UPDATE":
         // Invalidate all RBAC-related queries
         queryClient.invalidateQueries({ queryKey: ["/api/permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/role-permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/user-permissions"] });
         queryClient.invalidateQueries({ queryKey: ["/api/rbac"] });

         // Dispatch new format event (rbac:update with RbacUpdatePayload)
         // This is the primary event for the new RBAC system
         window.dispatchEvent(new CustomEvent('rbac:update', { detail: message.payload }));

         // Also dispatch legacy event for backwards compatibility
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
         const { aggregateType, aggregateId, eventType, data } = message.payload;

         // Dispatch balance-updated for balance-related events to sync with useBalance hooks
         if (['SOLDE_COMPTE_CHANGE', 'CREDIT_SOLDE_CHANGE', 'SESSION_CAISSE_CHANGE'].includes(eventType)) {
           const balanceUpdatePayload = {
             entityType: aggregateType as 'compte' | 'credit' | 'session_caisse',
             entityId: aggregateId,
             newBalance: Number(data?.nouveauSolde || data?.nouveauSoldeTheorique || 0),
             previousBalance: 0, // Not always available from outbox
             delta: 0,
             mouvementRef: data?.mouvementId || '',
             sourceModule: 'REALTIME_EVENT',
             timestamp: new Date().toISOString(),
           };
           window.dispatchEvent(new CustomEvent('balance-updated', { detail: balanceUpdatePayload }));
         }
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
           // Invalidation spécifique pour une session donnée
           debounceInvalidate(['session', aggregateId]);
           debounceInvalidate(['operations', aggregateId]);
           // Invalidation globale du module caisse
           debounceInvalidate(['session-caisse']);
           debounceInvalidate(['session-caisse', 'active']);
           debounceInvalidate(['operations-caisse']);
           debounceInvalidate(['operations-caisse', 'today']);
           debounceInvalidate(['supervision-sessions']);
           // Dispatch custom event pour les listeners
           window.dispatchEvent(new CustomEvent('caisse-update', { detail: message.payload }));
         } else if (aggregateType === 'coffre') {
           debounceInvalidate(['transferts-coffre', aggregateId]);
           debounceInvalidate(['coffre-stats', aggregateId]);
           debounceInvalidate(['coffre-mouvements', aggregateId]);
         } else if (aggregateType === 'operation_terrain') {
           // Dispatch operation-update event for badge and list real-time updates
           window.dispatchEvent(new CustomEvent('operation-update', {
             detail: { type: eventType, id: aggregateId, ...data }
           }));
           // Invalidate operations queries
           debounceInvalidate(['/api/caisse-agent/operations-terrain']);
         }
         break;

      case "COMPTE_UPDATE":
         // NOTE: Les mises à jour de solde compte sont gérées par BALANCE_UPDATED
         // Ce handler reste pour les notifications non-financières
         debounceInvalidate(compteKeys.epargne());
         debounceInvalidate(compteKeys.lists());
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

      case "SESSION_INVALID":
         // Session invalidated server-side via WebSocket heartbeat - immediate logout
         toast.error("SESSION EXPIRÉE", {
             description: message.payload.message || "Votre session a expiré. Veuillez vous reconnecter.",
             duration: 5000
         });
         setTimeout(() => {
             authService.logout();
             window.location.href = '/login';
         }, 1000);
         break;

      case "SESSION_HEARTBEAT_RESPONSE":
         // WebSocket heartbeat response - logout if invalid
         if (!message.payload.valid) {
           toast.error("SESSION EXPIRÉE", {
               description: "Votre session n'est plus valide.",
               duration: 5000
           });
           setTimeout(() => {
               authService.logout();
               window.location.href = '/login';
           }, 1000);
         }
         break;

      case "BALANCE_UPDATED":
         // Unified balance update handler - invalidates relevant queries based on entityType
         const { eventId, entityType, entityId, newBalance } = message.payload;

         // Idempotence check: ignore duplicate events
         if (eventId && processedEventIds.has(eventId)) {
           console.log(`[WS] Ignoring duplicate BALANCE_UPDATED event: ${eventId}`);
           break;
         }

         // Track this eventId to prevent processing duplicates
         if (eventId) {
           processedEventIds.add(eventId);
           // Clean up old eventIds to prevent memory leak
           if (processedEventIds.size > PROCESSED_EVENTS_MAX_SIZE) {
             const idsToRemove = Array.from(processedEventIds).slice(0, 100);
             idsToRemove.forEach(id => processedEventIds.delete(id));
           }
         }

         // Dispatch custom event for components that need direct updates
         window.dispatchEvent(new CustomEvent('balance-updated', { detail: message.payload }));

         // Real-time feedback toast for significant operations
         const { delta, sourceModule, typePaiement: balanceTypePaiement } = message.payload;
         if (delta && (entityType === 'coffre' || entityType === 'caisse')) {
           const label = entityType === 'coffre' ? 'Coffre-fort' : 'Caisse';
           const direction = delta > 0 ? '+' : '';
           toast.info(`${label} mis à jour : ${direction}${formatMoney(delta)}`, { duration: 3000 });
         }

         // Invalidate relevant queries using centralized query keys
         // SOURCE UNIQUE: Toutes les invalidations financières passent par ici
         switch (entityType) {
           case 'compte':
             debounceInvalidate(balanceKeys.compte(entityId));
             debounceInvalidate(compteKeys.epargne());
             debounceInvalidate(compteKeys.lists());
             debounceInvalidate(dashboardKeys.stats());
             break;
           case 'caisse':
           case 'session_caisse':
             debounceInvalidate(caisseKeys.sessions());
             debounceInvalidate(caisseKeys.sessionActive());
             debounceInvalidate(caisseKeys.operations());
             debounceInvalidate(dashboardKeys.stats());
             // Invalider aussi l'encaisse Treasury v2 (Single Source of Truth)
             debounceInvalidate(treasuryKeys.all);
             break;
           case 'credit':
             debounceInvalidate(creditKeys.all);
             debounceInvalidate(creditKeys.detail(entityId));
             debounceInvalidate(dashboardKeys.stats());
             break;
           case 'tontine':
             debounceInvalidate(tontineKeys.all);
             debounceInvalidate(tontineKeys.detail(entityId));
             break;
           case 'coffre':
             debounceInvalidate(coffreKeys.all);
             debounceInvalidate(coffreKeys.stats());
             debounceInvalidate(coffreKeys.transferts());
             debounceInvalidate(dashboardKeys.stats());
             // Invalider aussi l'encaisse Treasury v2 (Single Source of Truth)
             debounceInvalidate(treasuryKeys.all);
             break;
           case 'caisse_agent':
             debounceInvalidate(agentKeys.caisseAgent(entityId));
             break;
         }
         break;

      // ============================================
      // TREASURY v2 (Encaisse canonique depuis GL)
      // ============================================

      case "TREASURY_UPDATED":
         // L'encaisse a changé suite à un posting GL confirmé
         debounceInvalidate(treasuryKeys.all);
         debounceInvalidate(dashboardKeys.stats());
         // Dispatch custom event pour composants écoutant directement
         window.dispatchEvent(new CustomEvent('treasury-updated', { detail: message.payload }));

         // Log si écart de réconciliation détecté
         if (message.payload?.reconciliation?.status && message.payload.reconciliation.status !== 'OK') {
           console.warn('[WS] Écart de réconciliation Treasury:', message.payload.reconciliation);
         }
         break;

      case "TREASURY_RECONCILIATION_ALERT": {
         // Invalider les queries de réconciliation
         debounceInvalidate(treasuryKeys.all);

         // Dispatch custom event pour le panneau d'alertes (le message custom contrôle sa partie toast)
         window.dispatchEvent(new CustomEvent('treasury-reconciliation-alert', { detail: message.payload }));
         break;
      }

      case "TREASURY_RECONCILIATION_COMPLETE": {
         // Réconciliation terminée - rafraîchir les données
         const { summary, globalStatus } = message.payload || {};
         debounceInvalidate(treasuryKeys.all);

         // Dispatch custom event
         window.dispatchEvent(new CustomEvent('treasury-reconciliation-complete', { detail: message.payload }));
         break;
      }

      // ============================================
      // VIREMENTS PROGRAMMÉS (Scheduled Transfers)
      // ============================================

      case "SCHEDULED_TRANSFER_UPDATED":
         // Un virement programmé a été modifié (pause, reprise, modification)
         debounceInvalidate(scheduledTransferKeys.all);
         debounceInvalidate(scheduledTransferKeys.stats());
         if (message.payload?.transferId) {
           debounceInvalidate(scheduledTransferKeys.detail(message.payload.transferId));
         }
         window.dispatchEvent(new CustomEvent('scheduled-transfer-updated', { detail: message.payload }));
         break;

      case "SCHEDULED_TRANSFER_EXECUTED":
         // Un virement programmé a été exécuté (succès ou échec)
         debounceInvalidate(scheduledTransferKeys.all);
         debounceInvalidate(scheduledTransferKeys.stats());
         if (message.payload?.transferId) {
           debounceInvalidate(scheduledTransferKeys.detail(message.payload.transferId));
           debounceInvalidate(scheduledTransferKeys.history(message.payload.transferId));
         }
         // Invalider aussi les comptes source/dest car leurs soldes ont changé
         if (message.payload?.compteSourceId) {
           debounceInvalidate(balanceKeys.compte(message.payload.compteSourceId));
         }
         if (message.payload?.compteDestId) {
           debounceInvalidate(balanceKeys.compte(message.payload.compteDestId));
         }
         debounceInvalidate(compteKeys.epargne());
         window.dispatchEvent(new CustomEvent('scheduled-transfer-executed', { detail: message.payload }));

         // Toast notification si succès ou échec
         if (message.payload?.success) {
           toast.success('Virement programmé exécuté avec succès');
         } else if (message.payload?.error) {
           toast.error(`Échec virement programmé: ${message.payload.error}`);
         }
         break;

      case "SCHEDULED_TRANSFERS_BATCH_COMPLETED":
         // Batch de virements programmés terminé (cron 02h30)
         debounceInvalidate(scheduledTransferKeys.all);
         debounceInvalidate(scheduledTransferKeys.stats());
         debounceInvalidate(scheduledTransferKeys.health());
         debounceInvalidate(compteKeys.epargne());
         debounceInvalidate(dashboardKeys.stats());
         window.dispatchEvent(new CustomEvent('scheduled-transfers-batch-completed', { detail: message.payload }));

         // Toast récapitulatif pour les admins
         const { success, skipped, failed } = message.payload || {};
         if (typeof success === 'number' || typeof failed === 'number') {
           if (failed > 0) {
             toast.warning(`Virements programmés: ${success || 0} succès, ${failed} échecs, ${skipped || 0} ignorés`);
           } else {
             toast.success(`Virements programmés: ${success || 0} exécutés avec succès`);
           }
         }
         break;

      // ============================================
      // RESTITUTION FRAIS (Credit Refunds)
      // ============================================

      case "REFUND_PENDING_CAISSE":
      case "REFUND_PAID":
         // Dispatch refund-update event for sidebar badge real-time update
         window.dispatchEvent(new CustomEvent('refund-update', { detail: message.payload }));
         // Invalidate refund queries
         debounceInvalidate(["/api/credit-refunds"]);
         debounceInvalidate(creditKeys.all);
         break;
    }
  };

  const sendMessage = useCallback((type: MessageType, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else if (BUFFERABLE_TYPES.includes(type)) {
      // Buffer message if we're offline and it's a bufferable type
      const bufferedMsg: BufferedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        payload,
        timestamp: Date.now(),
        retries: 0,
      };
      setMessageBuffer((prev) => {
        const newBuffer = [...prev, bufferedMsg].slice(-MAX_BUFFER_SIZE);
        saveBuffer(newBuffer);
        return newBuffer;
      });
      console.log(`[WS] Message buffered (offline): ${type}`);
    }
  }, []);

  const sendTyping = useCallback((receiverId: string, isTyping: boolean) => {
    sendMessage("TYPING", { receiverId, isTyping });
  }, [sendMessage]);

  const pendingMessagesCount = messageBuffer.length;

  return (
    <WebSocketContext.Provider value={{ isConnected, socket, onlineUsers, typingUsers, sendMessage, sendTyping, pendingMessagesCount }}>
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
