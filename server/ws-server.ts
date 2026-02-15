import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { parse } from "url";
import { parse as parseCookie } from "cookie";
import { unsign } from "cookie-signature";
import { sessionMiddleware } from "./auth";
import { storage } from "./storage";
import { createLogger } from "./lib/logger";
import { isSessionValid, updateSessionActivity } from "./session-tracker";
import { isAdminRole } from "@shared/types/roles";

const logger = createLogger('WebSocket');

// Extend WebSocket interface
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  messageCount?: number;
  lastMessageReset?: number;
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 100; // max messages per window
const RATE_LIMIT_WARNING_THRESHOLD = 80; // warn at 80 messages

// Rate limiter state per user
const rateLimiters = new Map<string, { count: number; windowStart: number; warned: boolean }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; warn: boolean } {
  const now = Date.now();
  let limiter = rateLimiters.get(userId);

  if (!limiter || now - limiter.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Start new window
    limiter = { count: 0, windowStart: now, warned: false };
    rateLimiters.set(userId, limiter);
  }

  limiter.count++;

  const remaining = RATE_LIMIT_MAX_MESSAGES - limiter.count;
  const warn = limiter.count >= RATE_LIMIT_WARNING_THRESHOLD && !limiter.warned;

  if (warn) {
    limiter.warned = true;
  }

  return {
    allowed: limiter.count <= RATE_LIMIT_MAX_MESSAGES,
    remaining: Math.max(0, remaining),
    warn,
  };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  rateLimiters.forEach((limiter, userId) => {
    if (now - limiter.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimiters.delete(userId);
    }
  });
}, RATE_LIMIT_WINDOW_MS);

/**
 * Types de messages WebSocket unifiés
 * SOURCE UNIQUE DE VERITE - Synchronisé avec client/src/contexts/WebSocketContext.tsx
 */
export type GlobalMessage = {
  type:
    // =============================================
    // MESSAGING
    // =============================================
    // V1 - Messages directs (toujours utilisé dans routes/messages.ts)
    | "CHAT_MESSAGE" | "TYPING" | "READ_RECEIPT"
    // V2 - Conversations (routes/conversations.ts)
    | "CHAT_MESSAGE_V2" | "TYPING_V2" | "READ_UPDATE"
    | "CONVERSATION_UPDATE" | "MESSAGE_REACTION" | "MESSAGE_DELETED" | "MESSAGE_EDITED"
    | "SUBSCRIBE_CONVERSATION" | "UNSUBSCRIBE_CONVERSATION"
    | "SUBSCRIBED_CONVERSATION" | "UNSUBSCRIBED_CONVERSATION"

    // =============================================
    // SYSTÈME & NOTIFICATIONS
    // =============================================
    | "NOTIFICATION" | "PRESENCE" | "PRESENCE_UPDATE" | "ONLINE_USERS_LIST" | "DASHBOARD_UPDATE"
    | "LIVE_ACTIVITY" | "REALTIME_EVENT"
    | "SUBSCRIBED" | "UNSUBSCRIBED"

    // =============================================
    // MODULES MÉTIER
    // =============================================
    | "CREDIT_UPDATE" | "CLIENT_UPDATE" | "COMPTE_UPDATE"
    | "CAISSE_UPDATE" | "TONTINE_UPDATE" | "OPERATIONS_UPDATE"
    | "EMPLOYE_UPDATE" | "AGENCE_UPDATE" | "HR_UPDATE"
    | "ACCOUNTING_UPDATE" | "LIQUIDITY_CHANGED" | "LOYALTY_UPDATE"
    | "SETTINGS_UPDATE" | "RBAC_UPDATE"
    | "AGENT_MODULES_UPDATE"
    | "SESSION_AGENT_UPDATE"

    // =============================================
    // LOCALISATION (Agents terrain)
    // =============================================
    | "LOCATION_UPDATE" | "USER_LOCATION"

    // =============================================
    // SESSIONS & SÉCURITÉ
    // =============================================
    | "SESSION_TIMEOUT" | "SESSION_FORCE_CLOSED" | "SESSION_RISK_ALERT"
    | "SESSION_INVALID" | "MAINTENANCE_UPDATE" | "FORCE_LOGOUT"

    // =============================================
    // COFFRE-FORT
    // =============================================
    | "OPENING_REQUEST_CREATED" | "OPENING_REQUEST_VALIDATED" | "OPENING_REQUEST_REJECTED"
    | "REFUND_PENDING_CAISSE" | "REFUND_PAID"

    // =============================================
    // CAISSE PAYMENT REQUESTS (Queue centralisée)
    // =============================================
    | "CAISSE_REQUEST_CREATED" | "CAISSE_REQUEST_COMPLETED" | "CAISSE_REQUEST_CANCELLED"

    // =============================================
    // BALANCE & RÉCONCILIATION
    // =============================================
    | "BALANCE_UPDATED"
    | "BALANCE_ALERT" | "RECONCILIATION_COMPLETE" | "RECONCILIATION_ERROR"

    // =============================================
    // GL GUARD - OUVERTURE CAISSE SECURISEE
    // =============================================
    | "CAISSE_OPENING_BLOCKED"        // Ouverture bloquée pour écart GL
    | "CAISSE_OPENING_WITH_ECART"     // Ouverture autorisée avec écart (justifiée ou log only)

    // =============================================
    // MONITORING FINANCIER & ALERTES
    // =============================================
    | "MONITORING_ALERT" | "MONITORING_ALERT_UPDATED" | "MONITORING_ALERT_DISMISSED"
    | "MONITORING_DASHBOARD" | "ALERT_CREATED"

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
    // CRÉDITS & REMBOURSEMENTS
    // =============================================
    | "CREDIT_REPAYMENT_CREATED" | "CREDIT_SCHEDULE_UPDATED" | "CREDIT_BALANCE_UPDATED"
    | "REPAYMENT_ALLOCATED" | "REPAYMENT_REVERSED"

    // =============================================
    // TRÉSORERIE — RÉCONCILIATION
    // =============================================
    | "TREASURY_RECONCILIATION_ALERT" | "TREASURY_RECONCILIATION_COMPLETE"

    // =============================================
    // AUDIT & INTÉGRITÉ
    // =============================================
    | "INTEGRITY_AUDIT_ALERT"

    // =============================================
    // MIGRATION D'AGENCE
    // =============================================
    | "MIGRATION_PROGRESS" | "MIGRATION_STATUS";

  payload: any;
};

// Map userId -> WebSocket[] (user can have multiple tabs open)
const clients = new Map<string, WebSocket[]>();

// Location log throttle: max 1 DB insert per 10s per user
const locationLogThrottles = new Map<string, number>();
const LOC_LOG_MIN_INTERVAL = 10_000;

// Map channel -> Set<WebSocket> for aggregate subscriptions
// Channels: client:{id}, compte:{id}, credit:{id}, tontine:{id}, session_caisse:{id}, agent:{id}
const subscriptions = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  function heartbeat(this: WebSocket) {
    (this as ExtendedWebSocket).isAlive = true;
  }

  // Heartbeat Interval
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (extWs.isAlive === false) {
          logger.debug('Terminating inactive connection');
          return ws.terminate();
      }

      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  server.prependListener("upgrade", (request, socket, head) => {
    // Handle socket errors to prevent EPIPE crashes
    socket.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED') {
        return;
      }
      logger.error({ err }, 'Socket error during upgrade');
    });

    try {
      // Parse URL for path only (no query params)
      const url = parse(request.url || '', true);
      
      // Only handle /ws path
      if (!url.pathname?.startsWith('/ws')) {
        return;
      }
      
      logger.debug({ pathname: url.pathname }, 'Upgrade request received');
      
      const isProduction = process.env.NODE_ENV === 'production';

      // 1. Strict Cookie Authentication
      const cookieHeader = request.headers.cookie;
      if (!cookieHeader) {
          logger.warn('Rejected: No cookie header');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
      }

      const cookies = parseCookie(cookieHeader);
      // Need to match the logic in auth.ts
      const cookieName = isProduction ? '__Host-cofin_sess' : 'cofin_sess';
      const signedSessionId = cookies[cookieName];

      if (!signedSessionId) {
          logger.warn('Rejected: Session cookie missing');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
      }

      // 2. Unsign Cookie
      // express-session cookies are prefixed with "s:"
      if (!signedSessionId.startsWith('s:')) {
           logger.warn('Rejected: Invalid cookie format');
           socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
           socket.destroy();
           return;
      }

      const sessionSecret = process.env.SESSION_SECRET || 'dev-only-secret-do-not-use-in-prod';
      const sessionId = unsign(signedSessionId.slice(2), sessionSecret);

      if (!sessionId) {
          logger.warn('Rejected: Cookie signature invalid');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
      }

      // 3. Validate Session from Store (via Middleware access or direct DB check)
      // Since we need to hydrate the user, running the session middleware is the standard way.
      // It will fetch the session from DB (PostgresStore) and populate req.session.

      if (!sessionMiddleware) {
         logger.error('Session middleware not available');
         socket.destroy();
         return;
      }

      const mockRes = {
        on: () => {},
        writeHead: () => {},
        end: () => {},
        setHeader: () => {}
      };

      sessionMiddleware(request, mockRes as any, (err?: Error) => {
        if (err) {
          logger.error({ err }, 'Session middleware error');
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
          return;
        }
        
        const session = (request as any).session;
        
        // Final sanity check: session ID must match what we unsigned
        // (Middleware usually handles this, but good to be sure)
        if (session.id !== sessionId) {
             logger.warn({ sessionId, middlewareId: session.id }, 'Session ID mismatch (middleware vs cookie)');
        }

        const userId = session?.userId;
        
        if (!userId) {
          logger.warn('Rejected: No userId in session (expired or invalid)');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        
        // 4. Proceed with Upgrade
        try {
              // Store userId and sessionId in request for connection handler
              (request as any).authenticatedUserId = userId;
              (request as any).authenticatedSessionId = sessionId;
              (request as any).userAgence = session?.user?.agence;
              (request as any).userRole = session?.user?.role;

              logger.debug({ userId }, 'Connection established (upgrade handler)');
              wss.handleUpgrade(request, socket, head, (ws) => {
                const extWs = ws as ExtendedWebSocket;
                extWs.isAlive = true;
                extWs.on("pong", heartbeat);

                try {
                    wss.emit("connection", ws, request);
                } catch (emitError) {
                    logger.error({ err: emitError }, 'Error emitting connection event');
                }
              });
          } catch (error) {
              logger.error({ err: error }, 'Error inside upgrading');
              try {
                  socket.destroy();
              } catch (e) { /* ignore */ }
          }
      });
    } catch (unexpectedError) {
      logger.error({ err: unexpectedError }, 'Critical error in upgrade handler');
      try {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      } catch (e) { /* ignore */ }
    }
  });

  wss.on("connection", (ws, request) => {
    // Handle WebSocket errors to prevent EPIPE crashes
    ws.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED' ||
          err.message?.includes('ECONNRESET') || err.message?.includes('EPIPE')) {
        // Ignore benign connection errors
        return;
      }
      logger.error({ err }, 'Connection error');
    });

    // Use pre-authenticated values from upgrade handler
    const userId = (request as any).authenticatedUserId as string;
    const sessionId = (request as any).authenticatedSessionId as string;
    logger.info({ userId, sessionId: sessionId?.slice(0, 8) + '...' }, 'Connection established');
    const userAgence = (request as any).userAgence as string | undefined;
    const userRole = (request as any).userRole as string | undefined;

    if (userId) {
      // Store user metadata in WebSocket (including sessionId for heartbeat validation)
      (ws as any).userId = userId;
      (ws as any).sessionId = sessionId;
      (ws as any).agence = userAgence;
      (ws as any).role = userRole;
      
      if (!clients.has(userId)) {
        clients.set(userId, []);
      }
      clients.get(userId)?.push(ws);
      
      // Update Connection Status (Dead Man Switch)
      storage.updateUserConnectionStatus(userId, 'CONNECTED').catch(err => {
          logger.error({ err, userId }, 'Failed to update CONNECTED status');
      });

      // Notify everyone of new user presence
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "PRESENCE",
            payload: { userId, status: "online" }
          }));
        }
      });

      // Send the list of currently online users to the newly connected user
      // This ensures they have accurate presence info from the start
      const onlineUserIds: string[] = [];
      clients.forEach((sockets, onlineUserId) => {
        if (sockets.length > 0 && onlineUserId !== userId) {
          onlineUserIds.push(onlineUserId);
        }
      });

      if (onlineUserIds.length > 0) {
        ws.send(JSON.stringify({
          type: "ONLINE_USERS_LIST",
          payload: { users: onlineUserIds }
        }));
        logger.debug({ userId, onlineCount: onlineUserIds.length }, 'Sent initial online users list');
      }
    }

    ws.on("message", async (message) => {
       (ws as ExtendedWebSocket).isAlive = true;

       // Rate limiting check
       if (userId) {
         const { allowed, remaining, warn } = checkRateLimit(userId);

         if (!allowed) {
           logger.warn({ userId }, 'Rate limit exceeded');
           ws.send(JSON.stringify({
             type: 'RATE_LIMITED',
             payload: {
               message: 'Too many messages. Please slow down.',
               retryAfter: RATE_LIMIT_WINDOW_MS / 1000,
             }
           }));
           return;
         }

         if (warn) {
           ws.send(JSON.stringify({
             type: 'RATE_LIMIT_WARNING',
             payload: {
               message: `Approaching rate limit. ${remaining} messages remaining in window.`,
               remaining,
             }
           }));
         }
       }

       try {
         const data = JSON.parse(message.toString());

         if (data.type === 'PING') {
             ws.send(JSON.stringify({ type: 'PONG' }));
         }

         // Session heartbeat - validates session is still active server-side
         if (data.type === 'SESSION_HEARTBEAT') {
           const sessionId = (ws as any).sessionId;
           if (sessionId) {
             // Update session activity - proves client is responsive
             updateSessionActivity(sessionId).catch(() => {});

             const validity = await isSessionValid(sessionId);
             ws.send(JSON.stringify({
               type: 'SESSION_HEARTBEAT_RESPONSE',
               payload: {
                 valid: validity.valid,
                 reason: validity.reason,
                 timestamp: Date.now(),
               }
             }));

             // If session is invalid, notify and close
             if (!validity.valid) {
               logger.info({ userId, sessionId, reason: validity.reason }, 'Session invalid during WS heartbeat');
               ws.send(JSON.stringify({
                 type: 'SESSION_INVALID',
                 payload: {
                   reason: validity.reason || 'session_expired',
                   message: 'Votre session a expiré. Veuillez vous reconnecter.',
                 }
               }));
             }
           } else {
             ws.send(JSON.stringify({
               type: 'SESSION_HEARTBEAT_RESPONSE',
               payload: { valid: false, reason: 'no_session_id', timestamp: Date.now() }
             }));
           }
         }

         // Handle subscription to aggregate channels
         if (data.type === 'SUBSCRIBE') {
           const { aggregate } = data; // e.g., 'client:uuid-xxx' or 'compte:uuid-xxx'
           if (aggregate && typeof aggregate === 'string') {
             if (!subscriptions.has(aggregate)) {
               subscriptions.set(aggregate, new Set());
             }
             subscriptions.get(aggregate)?.add(ws);
             
             // Track subscriptions on the WebSocket for cleanup
             if (!(ws as any).subscriptions) {
               (ws as any).subscriptions = new Set<string>();
             }
             (ws as any).subscriptions.add(aggregate);
             
             logger.debug({ userId, aggregate }, 'User subscribed to channel');
             ws.send(JSON.stringify({ type: 'SUBSCRIBED', aggregate }));
           }
         }

         // Handle unsubscription
         if (data.type === 'UNSUBSCRIBE') {
           const { aggregate } = data;
           if (aggregate && typeof aggregate === 'string') {
             subscriptions.get(aggregate)?.delete(ws);
             (ws as any).subscriptions?.delete(aggregate);
             logger.debug({ userId, aggregate }, 'User unsubscribed from channel');
             ws.send(JSON.stringify({ type: 'UNSUBSCRIBED', aggregate }));
           }
         }
         
         if (data.type === 'TYPING') {
           // Legacy: Forward typing status to receiver (DM only)
           const { receiverId, isTyping } = data.payload;
           const userSockets = clients.get(receiverId);
           if (userSockets) {
             userSockets.forEach(client => {
               if (client.readyState === WebSocket.OPEN) {
                 client.send(JSON.stringify({
                   type: "TYPING",
                   payload: { userId, isTyping }
                 }));
               }
             });
           }
         }

         // V2: Typing by conversationId (broadcast to all participants via subscription)
         if (data.type === 'TYPING_V2') {
           const { conversationId, isTyping } = data.payload;
           // Broadcast to conversation subscribers
           const channel = `conversation:${conversationId}`;
           const channelSubs = subscriptions.get(channel);
           if (channelSubs) {
             channelSubs.forEach((client) => {
               // Don't send back to the sender
               if (client.readyState === WebSocket.OPEN && (client as any).userId !== userId) {
                 client.send(JSON.stringify({
                   type: "TYPING_V2",
                   payload: { conversationId, userId, isTyping }
                 }));
               }
             });
           }
         }

         // V2: Subscribe to a conversation (for real-time updates)
         if (data.type === 'SUBSCRIBE_CONVERSATION') {
           const { conversationId } = data.payload;
           if (conversationId && typeof conversationId === 'string') {
             const channel = `conversation:${conversationId}`;
             if (!subscriptions.has(channel)) {
               subscriptions.set(channel, new Set());
             }
             subscriptions.get(channel)?.add(ws);

             // Track subscriptions on the WebSocket for cleanup
             if (!(ws as any).subscriptions) {
               (ws as any).subscriptions = new Set<string>();
             }
             (ws as any).subscriptions.add(channel);

             ws.send(JSON.stringify({ type: 'SUBSCRIBED_CONVERSATION', conversationId }));
           }
         }

         // V2: Unsubscribe from a conversation
         if (data.type === 'UNSUBSCRIBE_CONVERSATION') {
           const { conversationId } = data.payload;
           if (conversationId && typeof conversationId === 'string') {
             const channel = `conversation:${conversationId}`;
             subscriptions.get(channel)?.delete(ws);
             (ws as any).subscriptions?.delete(channel);
             ws.send(JSON.stringify({ type: 'UNSUBSCRIBED_CONVERSATION', conversationId }));
           }
         }

          if (data.type === 'LOCATION_UPDATE') {
            const { latitude, longitude, accuracy, altitude, speed, heading, batteryLevel } = data.payload;

            // Broadcast to all connected clients
            wss.clients.forEach((client) => {
               if (client.readyState === WebSocket.OPEN) {
                 client.send(JSON.stringify({
                   type: "USER_LOCATION",
                   payload: { userId, latitude, longitude, accuracy, speed, heading }
                 }));
               }
            });

            // Persist last position to agentsTerrain
            try {
               storage.updateAgentLocation(userId, String(latitude), String(longitude));
            } catch (err) {
               logger.error({ err, userId }, 'Failed to persist agent location');
            }

            // Insert into agent_location_logs (throttled: max 1 insert per 10s per user)
            const now = Date.now();
            const lastInsert = locationLogThrottles.get(userId) || 0;
            if (now - lastInsert >= LOC_LOG_MIN_INTERVAL) {
              locationLogThrottles.set(userId, now);
              storage.insertAgentLocationLog({
                agentId: userId,
                latitude: String(latitude),
                longitude: String(longitude),
                accuracy: accuracy != null ? String(accuracy) : undefined,
                altitude: altitude != null ? String(altitude) : undefined,
                speed: speed != null ? String(speed) : undefined,
                heading: heading != null ? String(heading) : undefined,
                batteryLevel: batteryLevel != null ? Number(batteryLevel) : undefined,
                source: 'gps',
              }).catch(err => logger.error({ err, userId }, 'Failed to insert location log'));
            }
          }
       } catch (e) {
         // ignore
       }
    });

    ws.on("close", () => {
      // Clean up subscriptions
      const wsSubscriptions = (ws as any).subscriptions as Set<string> | undefined;
      if (wsSubscriptions) {
        wsSubscriptions.forEach((channel) => {
          subscriptions.get(channel)?.delete(ws);
          // Clean up empty subscription sets
          if (subscriptions.get(channel)?.size === 0) {
            subscriptions.delete(channel);
          }
        });
      }

      if (userId && clients.has(userId)) {
        const userSockets = clients.get(userId) || [];
        const index = userSockets.indexOf(ws);
        if (index > -1) {
          userSockets.splice(index, 1);
        }
        if (userSockets.length === 0) {
          clients.delete(userId);

          // Update Connection Status (Dead Man Switch)
          storage.updateUserConnectionStatus(userId, 'DISCONNECTED').catch(err => {
              logger.error({ err, userId }, 'Failed to update DISCONNECTED status');
          });

          // Notify everyone of offline status
          wss.clients.forEach((client) => {
             if (client.readyState === WebSocket.OPEN) {
               client.send(JSON.stringify({
                 type: "PRESENCE",
                 payload: { userId, status: "offline" }
               }));
             }
          });
        }
      }
    });
  });

  return {
    broadcast: (message: GlobalMessage) => {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    },
    sendToUser: (userId: string, message: GlobalMessage) => {
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    },
    isUserOnline: (userId: string) => {
      return clients.has(userId) && (clients.get(userId)?.length || 0) > 0;
    },
    broadcastToAgency: (agency: string, message: GlobalMessage) => {
      wss.clients.forEach((client) => {
        if (client.readyState !== WebSocket.OPEN) return;
        const clientAgence = (client as any).agence;
        const clientRole = (client as any).role;
        // Send to same agency OR admin users (who need visibility across all agencies)
        if (clientAgence === agency || isAdminRole(clientRole)) {
          client.send(JSON.stringify(message));
        }
      });
    },
    // Broadcast to all subscribers of a specific aggregate channel
    broadcastToAggregate: (aggregateType: string, aggregateId: string, message: GlobalMessage) => {
      const channel = `${aggregateType}:${aggregateId}`;
      const channelSubs = subscriptions.get(channel);
      if (channelSubs) {
        channelSubs.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    },
    // Get subscription stats (for debugging/monitoring)
    getSubscriptionStats: () => {
      const stats: Record<string, number> = {};
      subscriptions.forEach((subs, channel) => {
        stats[channel] = subs.size;
      });
      return stats;
    },
    // V2: Broadcast to all subscribers of a conversation
    broadcastToConversation: (conversationId: string, message: GlobalMessage, excludeUserId?: string) => {
      const channel = `conversation:${conversationId}`;
      const channelSubs = subscriptions.get(channel);
      if (channelSubs) {
        channelSubs.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            // Optionally exclude a specific user (e.g., the sender)
            if (excludeUserId && (client as any).userId === excludeUserId) {
              return;
            }
            client.send(JSON.stringify(message));
          }
        });
      }
    }
  };
}

let wsInstance: ReturnType<typeof setupWebSocket> | null = null;

export function setWsInstance(instance: ReturnType<typeof setupWebSocket>) {
  wsInstance = instance;
}

export function getWsInstance() {
  return wsInstance;
}
