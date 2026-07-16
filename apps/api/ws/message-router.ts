/**
 * Routage des messages WebSocket entrants.
 *
 * Chaque type de message est traité par un gestionnaire dédié et court ; un
 * dispatch par table (type → handler) remplace la longue chaîne de `if`
 * d'origine, ce qui maintient une complexité cognitive faible et rend l'ajout
 * d'un type trivial (une fonction + une entrée dans la table).
 */

import type { WebSocketServer, WebSocket } from "ws";
import { WebSocket as WS } from "ws";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { isSessionValid, updateSessionActivity } from "../session-tracker";
import { checkRateLimit, RATE_LIMIT_WINDOW_MS } from "./rate-limit";
import type { ConnectionRegistry } from "./connection-registry";
import type { ExtendedWebSocket } from "./types";

const logger = createLogger("WebSocket:Router");

/** Dépendances injectées aux gestionnaires de messages. */
export interface MessageDeps {
  wss: WebSocketServer;
  registry: ConnectionRegistry;
}

/** Message applicatif entrant (structure libre validée par chaque handler). */
interface IncomingMessage {
  type?: string;
  aggregate?: unknown;
  payload?: any;
}

/** Sérialise et envoie un objet à une socket ouverte. */
function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WS.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** Garantit et retourne l'ensemble des canaux suivis par la socket. */
function socketChannels(ws: ExtendedWebSocket): Set<string> {
  if (!ws.subscriptions) ws.subscriptions = new Set<string>();
  return ws.subscriptions;
}

// ── Gestionnaires par type de message ──────────────────────────────────────

function handlePing(ws: WebSocket): void {
  sendJson(ws, { type: "PONG" });
}

async function handleSessionHeartbeat(ws: ExtendedWebSocket, userId: string): Promise<void> {
  const sessionId = ws.sessionId;
  if (!sessionId) {
    sendJson(ws, {
      type: "SESSION_HEARTBEAT_RESPONSE",
      payload: { valid: false, reason: "no_session_id", timestamp: Date.now() },
    });
    return;
  }

  // Confirme que le client répond encore.
  updateSessionActivity(sessionId).catch((err) =>
    logger.debug({ err, sessionId }, "Échec mise à jour activité session (heartbeat)"),
  );

  const validity = await isSessionValid(sessionId);
  sendJson(ws, {
    type: "SESSION_HEARTBEAT_RESPONSE",
    payload: { valid: validity.valid, reason: validity.reason, timestamp: Date.now() },
  });

  if (!validity.valid) {
    logger.info({ userId, sessionId, reason: validity.reason }, "Session invalide (WS heartbeat)");
    sendJson(ws, {
      type: "SESSION_INVALID",
      payload: {
        reason: validity.reason || "session_expired",
        message: "Votre session a expiré. Veuillez vous reconnecter.",
      },
    });
  }
}

function handleSubscribe(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { aggregate } = data;
  if (typeof aggregate !== "string" || !aggregate) return;
  deps.registry.subscribe(aggregate, ws);
  socketChannels(ws).add(aggregate);
  logger.debug({ userId, aggregate }, "Abonnement canal");
  sendJson(ws, { type: "SUBSCRIBED", aggregate });
}

function handleUnsubscribe(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { aggregate } = data;
  if (typeof aggregate !== "string" || !aggregate) return;
  deps.registry.unsubscribe(aggregate, ws);
  ws.subscriptions?.delete(aggregate);
  logger.debug({ userId, aggregate }, "Désabonnement canal");
  sendJson(ws, { type: "UNSUBSCRIBED", aggregate });
}

function handleTyping(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { receiverId, isTyping } = data.payload ?? {};
  deps.registry.getUserSockets(receiverId).forEach((client) =>
    sendJson(client, { type: "TYPING", payload: { userId, isTyping } }),
  );
}

function handleTypingV2(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { conversationId, isTyping } = data.payload ?? {};
  deps.registry.getSubscribers(`conversation:${conversationId}`)?.forEach((client) => {
    // Ne renvoie pas la saisie à l'émetteur.
    if ((client as ExtendedWebSocket).userId !== userId) {
      sendJson(client, { type: "TYPING_V2", payload: { conversationId, userId, isTyping } });
    }
  });
}

function handleSubscribeConversation(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { conversationId } = data.payload ?? {};
  if (typeof conversationId !== "string" || !conversationId) return;
  const channel = `conversation:${conversationId}`;
  deps.registry.subscribe(channel, ws);
  socketChannels(ws).add(channel);
  sendJson(ws, { type: "SUBSCRIBED_CONVERSATION", conversationId });
}

function handleUnsubscribeConversation(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { conversationId } = data.payload ?? {};
  if (typeof conversationId !== "string" || !conversationId) return;
  const channel = `conversation:${conversationId}`;
  deps.registry.unsubscribe(channel, ws);
  ws.subscriptions?.delete(channel);
  sendJson(ws, { type: "UNSUBSCRIBED_CONVERSATION", conversationId });
}

function handleLocationUpdate(ws: ExtendedWebSocket, userId: string, data: IncomingMessage, deps: MessageDeps): void {
  const { latitude, longitude, accuracy, altitude, speed, heading, batteryLevel } = data.payload ?? {};

  // Diffuse la position à tous les clients connectés.
  deps.wss.clients.forEach((client) =>
    sendJson(client, {
      type: "USER_LOCATION",
      payload: { userId, latitude, longitude, accuracy, speed, heading },
    }),
  );

  // Persiste la dernière position connue (best-effort).
  Promise.resolve(storage.updateAgentLocation(userId, String(latitude), String(longitude))).catch((err) =>
    logger.error({ err, userId }, "Échec persistance position agent"),
  );

  // Journalise la trace GPS avec anti-rebond par utilisateur.
  if (deps.registry.shouldLogLocation(userId)) {
    storage
      .insertAgentLocationLog({
        agentId: userId,
        latitude: String(latitude),
        longitude: String(longitude),
        accuracy: accuracy != null ? String(accuracy) : undefined,
        altitude: altitude != null ? String(altitude) : undefined,
        speed: speed != null ? String(speed) : undefined,
        heading: heading != null ? String(heading) : undefined,
        batteryLevel: batteryLevel != null ? Number(batteryLevel) : undefined,
        source: "gps",
      })
      .catch((err) => logger.error({ err, userId }, "Échec insertion journal de localisation"));
  }
}

// ── Table de dispatch ───────────────────────────────────────────────────────

type MessageHandler = (
  ws: ExtendedWebSocket,
  userId: string,
  data: IncomingMessage,
  deps: MessageDeps,
) => void | Promise<void>;

const HANDLERS: Record<string, MessageHandler> = {
  PING: (ws) => handlePing(ws),
  SESSION_HEARTBEAT: (ws, userId) => handleSessionHeartbeat(ws, userId),
  SUBSCRIBE: handleSubscribe,
  UNSUBSCRIBE: handleUnsubscribe,
  TYPING: handleTyping,
  TYPING_V2: handleTypingV2,
  SUBSCRIBE_CONVERSATION: handleSubscribeConversation,
  UNSUBSCRIBE_CONVERSATION: handleUnsubscribeConversation,
  LOCATION_UPDATE: handleLocationUpdate,
};

/** Applique la limitation de débit ; renvoie `false` si le message est rejeté. */
function passesRateLimit(ws: ExtendedWebSocket, userId: string | undefined): boolean {
  if (!userId) return true;
  const { allowed, remaining, warn } = checkRateLimit(userId);
  if (!allowed) {
    logger.warn({ userId }, "Limite de débit dépassée");
    sendJson(ws, {
      type: "RATE_LIMITED",
      payload: { message: "Too many messages. Please slow down.", retryAfter: RATE_LIMIT_WINDOW_MS / 1000 },
    });
    return false;
  }
  if (warn) {
    sendJson(ws, {
      type: "RATE_LIMIT_WARNING",
      payload: { message: `Approaching rate limit. ${remaining} messages remaining in window.`, remaining },
    });
  }
  return true;
}

/**
 * Point d'entrée du routage d'un message brut reçu sur une socket :
 * marque la vivacité, applique la limitation de débit, désérialise puis
 * délègue au gestionnaire correspondant. Les messages inconnus sont ignorés.
 */
export async function handleIncomingMessage(
  ws: ExtendedWebSocket,
  userId: string,
  rawMessage: unknown,
  deps: MessageDeps,
): Promise<void> {
  ws.isAlive = true;

  if (!passesRateLimit(ws, userId)) return;

  let data: IncomingMessage;
  try {
    data = JSON.parse(String(rawMessage));
  } catch (err) {
    logger.debug({ err }, "Message WebSocket JSON invalide, ignoré");
    return;
  }

  const handler = data.type ? HANDLERS[data.type] : undefined;
  if (!handler) return;

  try {
    await handler(ws, userId, data, deps);
  } catch (err) {
    logger.error({ err, type: data.type, userId }, "Erreur de traitement d'un message WebSocket");
  }
}
