import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { parse } from "url";
import { parse as parseCookie } from "cookie";
import { unsign } from "cookie-signature";
import { sessionMiddleware } from "./auth";
import { storage } from "./storage";
import { createLogger } from "./lib/logger";
import { isSessionValid, updateSessionActivity } from "./session-tracker";
import { SystemRole } from "@shared/types/roles";

const logger = createLogger('WebSocket');

// Étend l'interface WebSocket avec l'état de session MicroFlex.
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  messageCount?: number;
  lastMessageReset?: number;
}

// Configuration de limitation du débit WebSocket.
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 100; // messages maximum par fenêtre
const RATE_LIMIT_WARNING_THRESHOLD = 80; // seuil d'avertissement

// État de limitation par utilisateur.
const rateLimiters = new Map<string, { count: number; windowStart: number; warned: boolean }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; warn: boolean } {
  const now = Date.now();
  let limiter = rateLimiters.get(userId);

  if (!limiter || now - limiter.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Démarre une nouvelle fenêtre de comptage.
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

// Nettoie périodiquement les anciennes entrées de limitation.
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
 * SOURCE UNIQUE DE VÉRITÉ - Synchronisé avec apps/web/src/contexts/WebSocketContext.tsx.
 */
export type GlobalMessage = {
  type:
    // =============================================
    // MESSAGERIE
    // =============================================
    // V1 - saisie encore utilisée pour les conversations directes.
    | "TYPING" | "READ_RECEIPT"
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
    | "ACCOUNTING_UPDATE" | "LIQUIDITY_CHANGED" | "SCORE_UPDATED"
    | "SETTINGS_UPDATE" | "RBAC_UPDATE"
    | "PRESETS_CHANGED"
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
    // DEMANDES CAISSE (file centralisée)
    // =============================================
    | "CAISSE_REQUEST_CREATED" | "CAISSE_REQUEST_COMPLETED" | "CAISSE_REQUEST_CANCELLED"

    // =============================================
    // BALANCE & RÉCONCILIATION
    // =============================================
    | "BALANCE_UPDATED"
    | "BALANCE_ALERT" | "RECONCILIATION_COMPLETE" | "RECONCILIATION_ERROR"

    // =============================================
    // GARDE GL - OUVERTURE CAISSE SÉCURISÉE
    // =============================================
    | "CAISSE_OPENING_BLOCKED"        // Ouverture bloquée pour écart GL
    | "CAISSE_OPENING_WITH_ECART"     // Ouverture autorisée avec écart (justifiée ou journalisée uniquement)

    // =============================================
    // MONITORING FINANCIER & ALERTES
    // =============================================
    | "MONITORING_ALERT" | "MONITORING_ALERT_UPDATED" | "MONITORING_ALERT_DISMISSED"
    | "MONITORING_DASHBOARD" | "ALERT_CREATED"

    // =============================================
    // RAPPELS ET PLANIFICATIONS
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
    // TRANSFERTS INTER-COFFRES
    // =============================================
    | "TRANSFERT_COFFRE_UPDATED"

    // =============================================
    // MIGRATION D'AGENCE
    // =============================================
    | "MIGRATION_PROGRESS" | "MIGRATION_STATUS"

    // =============================================
    // ÉCARTS DE CAISSE — APPROBATION
    // =============================================
    | "ECART_APPROVAL_REQUEST" | "ECART_APPROVAL_DECISION"

    // =============================================
    // RÉÉVALUATIONS CRÉDIT
    // =============================================
    | "REEVALUATION_UPDATE";

  payload: any;
};

// Associe un utilisateur à ses connexions WebSocket actives.
const clients = new Map<string, WebSocket[]>();

// Limite les journaux de localisation à une insertion DB toutes les 10 s par utilisateur.
const locationLogThrottles = new Map<string, number>();
const LOC_LOG_MIN_INTERVAL = 10_000;

// Associe un canal aux sockets abonnées aux agrégats métier.
// Canaux : client:{id}, compte:{id}, credit:{id}, tontine:{id}, session_caisse:{id}, agent:{id}
const subscriptions = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  function heartbeat(this: WebSocket) {
    (this as ExtendedWebSocket).isAlive = true;
  }

  // Intervalle de battement de présence.
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

  const SESSION_MIDDLEWARE_TIMEOUT_MS = 5000;

  server.prependListener("upgrade", (request, socket, head) => {
    // Gère les erreurs socket pour éviter les crashs EPIPE.
    socket.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED') {
        return;
      }
      logger.error({ err }, 'Socket error during upgrade');
    });

    try {
      // Analyse uniquement le chemin de l'URL, sans paramètres de requête.
      const url = parse(request.url || '', true);

      // Ne traite que le chemin /ws.
      if (!url.pathname?.startsWith('/ws')) {
        return;
      }

      logger.info({ pathname: url.pathname }, 'WS upgrade request received');

      const isProduction = process.env.NODE_ENV === 'production';

      // 1. Authentification stricte par cookie.
      const cookieHeader = request.headers.cookie;
      if (!cookieHeader) {
          logger.warn('Rejected: No cookie header');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
      }

      const cookies = parseCookie(cookieHeader);
      // Doit rester aligné avec la logique de auth.ts.
      const cookieName = isProduction ? '__Host-microflex_sess' : 'microflex_sess';
      const signedSessionId = cookies[cookieName];

      if (!signedSessionId) {
          logger.warn('Rejected: Session cookie missing');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
      }

      // 2. Vérification de signature du cookie.
      // Les cookies express-session sont préfixés par "s:".
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

      // 3. Valide la session depuis le store.
      // Le middleware hydrate l'utilisateur depuis la session Postgres.

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

      // Garde-fou de timeout : si le middleware ne répond pas, détruit la socket.
      let callbackFired = false;
      const sessionTimeout = setTimeout(() => {
        if (!callbackFired) {
          callbackFired = true;
          logger.error({ sessionId }, 'Session middleware timed out during WS upgrade');
          try {
            socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            socket.destroy();
          } catch { /* ignore volontairement */ }
        }
      }, SESSION_MIDDLEWARE_TIMEOUT_MS);

      sessionMiddleware(request, mockRes as any, (err?: Error) => {
        if (callbackFired) return; // Timeout déjà déclenché.
        callbackFired = true;
        clearTimeout(sessionTimeout);

        if (err) {
          logger.error({ err }, 'Session middleware error');
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
          return;
        }

        const session = (request as any).session;

        // Vérification finale : l'identifiant de session doit correspondre au cookie validé.
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

        // 4. Poursuit la montée de protocole WebSocket.
        try {
              // Stocke l'utilisateur et la session pour le gestionnaire de connexion.
              (request as any).authenticatedUserId = userId;
              (request as any).authenticatedSessionId = sessionId;
              (request as any).userAgence = session?.user?.agence;
              (request as any).userRole = session?.user?.role;

              logger.info({ userId }, 'WS upgrade successful');
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
              } catch (e) { /* ignore volontairement */ }
          }
      });
    } catch (unexpectedError) {
      logger.error({ err: unexpectedError }, 'Critical error in upgrade handler');
      try {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      } catch (e) { /* ignore volontairement */ }
    }
  });

  wss.on("connection", (ws, request) => {
    // Gère les erreurs WebSocket pour éviter les crashs EPIPE.
    ws.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED' ||
          err.message?.includes('ECONNRESET') || err.message?.includes('EPIPE')) {
        // Ignore les erreurs bénignes de connexion.
        return;
      }
      logger.error({ err }, 'Connection error');
    });

    // Utilise les valeurs pré-authentifiées pendant la montée de protocole.
    const userId = (request as any).authenticatedUserId as string;
    const sessionId = (request as any).authenticatedSessionId as string;
    logger.info({ userId, sessionId: sessionId?.slice(0, 8) + '...' }, 'Connection established');
    const userAgence = (request as any).userAgence as string | undefined;
    const userRole = (request as any).userRole as string | undefined;

    if (userId) {
      // Stocke les métadonnées utilisateur sur la socket.
      (ws as any).userId = userId;
      (ws as any).sessionId = sessionId;
      (ws as any).agence = userAgence;
      (ws as any).role = userRole;
      
      if (!clients.has(userId)) {
        clients.set(userId, []);
      }
      clients.get(userId)?.push(ws);
      
      // Met à jour le statut de connexion.
      storage.updateUserConnectionStatus(userId, 'CONNECTED').catch(err => {
          logger.error({ err, userId }, 'Failed to update CONNECTED status');
      });

      // Notifie la présence du nouvel utilisateur.
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "PRESENCE",
            payload: { userId, status: "online" }
          }));
        }
      });

      // Envoie la liste des utilisateurs en ligne au nouvel utilisateur connecté.
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

       // Vérification de limitation du débit.
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

         // Battement de session : valide que la session reste active côté serveur.
         if (data.type === 'SESSION_HEARTBEAT') {
           const sessionId = (ws as any).sessionId;
           if (sessionId) {
             // Met à jour l'activité de session pour confirmer que le client répond.
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

             // Si la session est invalide, notifie puis ferme la connexion.
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

         // Gère l'abonnement aux canaux d'agrégats.
         if (data.type === 'SUBSCRIBE') {
           const { aggregate } = data; // Exemple : 'client:uuid-xxx' ou 'compte:uuid-xxx'.
           if (aggregate && typeof aggregate === 'string') {
             if (!subscriptions.has(aggregate)) {
               subscriptions.set(aggregate, new Set());
             }
             subscriptions.get(aggregate)?.add(ws);
             
             // Suit les abonnements sur la socket pour le nettoyage.
             if (!(ws as any).subscriptions) {
               (ws as any).subscriptions = new Set<string>();
             }
             (ws as any).subscriptions.add(aggregate);
             
             logger.debug({ userId, aggregate }, 'User subscribed to channel');
             ws.send(JSON.stringify({ type: 'SUBSCRIBED', aggregate }));
           }
         }

         // Gère le désabonnement.
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
           // Historique : transmet l'état de saisie au destinataire en conversation directe.
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

         // V2 : saisie par conversationId, diffusée aux participants abonnés.
         if (data.type === 'TYPING_V2') {
           const { conversationId, isTyping } = data.payload;
           // Diffuse aux abonnés de la conversation.
           const channel = `conversation:${conversationId}`;
           const channelSubs = subscriptions.get(channel);
           if (channelSubs) {
             channelSubs.forEach((client) => {
               // Ne renvoie pas le message à l'émetteur.
               if (client.readyState === WebSocket.OPEN && (client as any).userId !== userId) {
                 client.send(JSON.stringify({
                   type: "TYPING_V2",
                   payload: { conversationId, userId, isTyping }
                 }));
               }
             });
           }
         }

         // V2 : abonnement à une conversation pour les mises à jour temps réel.
         if (data.type === 'SUBSCRIBE_CONVERSATION') {
           const { conversationId } = data.payload;
           if (conversationId && typeof conversationId === 'string') {
             const channel = `conversation:${conversationId}`;
             if (!subscriptions.has(channel)) {
               subscriptions.set(channel, new Set());
             }
             subscriptions.get(channel)?.add(ws);

             // Suit les abonnements sur la socket pour le nettoyage.
             if (!(ws as any).subscriptions) {
               (ws as any).subscriptions = new Set<string>();
             }
             (ws as any).subscriptions.add(channel);

             ws.send(JSON.stringify({ type: 'SUBSCRIBED_CONVERSATION', conversationId }));
           }
         }

         // V2 : désabonnement d'une conversation.
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

            // Diffuse à tous les clients connectés.
            wss.clients.forEach((client) => {
               if (client.readyState === WebSocket.OPEN) {
                 client.send(JSON.stringify({
                   type: "USER_LOCATION",
                   payload: { userId, latitude, longitude, accuracy, speed, heading }
                 }));
               }
            });

            // Persiste la dernière position sur agentsTerrain.
            try {
               storage.updateAgentLocation(userId, String(latitude), String(longitude));
            } catch (err) {
               logger.error({ err, userId }, 'Failed to persist agent location');
            }

            // Insère dans agent_location_logs avec limitation par utilisateur.
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
         // Ignore volontairement les erreurs de parsing.
       }
    });

    ws.on("close", () => {
      // Nettoie les abonnements.
      const wsSubscriptions = (ws as any).subscriptions as Set<string> | undefined;
      if (wsSubscriptions) {
        wsSubscriptions.forEach((channel) => {
          subscriptions.get(channel)?.delete(ws);
          // Supprime les ensembles d'abonnements vides.
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

          // Met à jour le statut de connexion.
          storage.updateUserConnectionStatus(userId, 'DISCONNECTED').catch(err => {
              logger.error({ err, userId }, 'Failed to update DISCONNECTED status');
          });

          // Notifie le statut hors ligne.
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
        // Envoie à la même agence ou aux administrateurs ayant une visibilité globale.
        if (clientAgence === agency || clientRole === SystemRole.ADMIN) {
          client.send(JSON.stringify(message));
        }
      });
    },
    // Diffuse à tous les abonnés d'un canal d'agrégat précis.
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
    // Retourne les statistiques d'abonnement pour diagnostic et supervision.
    getSubscriptionStats: () => {
      const stats: Record<string, number> = {};
      subscriptions.forEach((subs, channel) => {
        stats[channel] = subs.size;
      });
      return stats;
    },
    // V2 : diffuse à tous les abonnés d'une conversation.
    broadcastToConversation: (conversationId: string, message: GlobalMessage, excludeUserId?: string) => {
      const channel = `conversation:${conversationId}`;
      const channelSubs = subscriptions.get(channel);
      if (channelSubs) {
        channelSubs.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            // Exclut éventuellement un utilisateur précis, par exemple l'émetteur.
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
