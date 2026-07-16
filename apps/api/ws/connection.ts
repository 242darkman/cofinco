/**
 * Gestion d'une connexion WebSocket établie : enregistrement de l'utilisateur,
 * diffusion de présence, envoi de la liste des utilisateurs en ligne, puis
 * câblage du routage des messages et du nettoyage à la fermeture.
 */

import type { WebSocketServer, WebSocket } from "ws";
import { WebSocket as WS } from "ws";
import type { IncomingMessage } from "node:http";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import type { ConnectionRegistry } from "./connection-registry";
import type { ExtendedWebSocket } from "./types";
import { handleIncomingMessage, type MessageDeps } from "./message-router";

const logger = createLogger("WebSocket:Connection");

/** Sérialise et envoie un objet à une socket ouverte. */
function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WS.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** Diffuse un changement de présence à toutes les sockets connectées. */
function broadcastPresence(wss: WebSocketServer, userId: string, status: "online" | "offline"): void {
  wss.clients.forEach((client) => sendJson(client, { type: "PRESENCE", payload: { userId, status } }));
}

/** Enregistre la nouvelle socket et diffuse la présence + la liste en ligne. */
function registerUser(deps: MessageDeps, ws: ExtendedWebSocket, userId: string): void {
  deps.registry.addClient(userId, ws);

  storage
    .updateUserConnectionStatus(userId, "CONNECTED")
    .catch((err) => logger.error({ err, userId }, "Échec mise à jour statut CONNECTED"));

  broadcastPresence(deps.wss, userId, "online");

  const onlineUserIds = deps.registry.onlineUserIdsExcept(userId);
  if (onlineUserIds.length > 0) {
    sendJson(ws, { type: "ONLINE_USERS_LIST", payload: { users: onlineUserIds } });
    logger.debug({ userId, onlineCount: onlineUserIds.length }, "Liste initiale des utilisateurs en ligne envoyée");
  }
}

/** Nettoie les abonnements et la présence à la fermeture de la socket. */
function handleClose(deps: MessageDeps, ws: ExtendedWebSocket, userId: string | undefined): void {
  deps.registry.cleanupSocketSubscriptions(ws.subscriptions, ws);

  if (!userId) return;
  const becameOffline = deps.registry.removeClient(userId, ws);
  if (!becameOffline) return;

  storage
    .updateUserConnectionStatus(userId, "DISCONNECTED")
    .catch((err) => logger.error({ err, userId }, "Échec mise à jour statut DISCONNECTED"));
  broadcastPresence(deps.wss, userId, "offline");
}

/**
 * Construit le gestionnaire de l'événement `connection` du serveur WebSocket.
 */
export function createConnectionHandler(deps: MessageDeps) {
  return (socket: WebSocket, request: IncomingMessage): void => {
    const ws = socket as ExtendedWebSocket;

    // Évite les crashs EPIPE/ECONNRESET sur la socket.
    ws.on("error", (err: NodeJS.ErrnoException) => {
      const benign = err.code === "ECONNRESET" || err.code === "EPIPE" || err.code === "ECONNREFUSED"
        || err.message?.includes("ECONNRESET") || err.message?.includes("EPIPE");
      if (benign) return;
      logger.error({ err }, "Erreur de connexion");
    });

    // Valeurs pré-authentifiées pendant la montée de protocole.
    const userId = (request as any).authenticatedUserId as string | undefined;
    const sessionId = (request as any).authenticatedSessionId as string | undefined;
    logger.info({ userId, sessionId: sessionId ? `${sessionId.slice(0, 8)}...` : undefined }, "Connexion établie");

    if (userId) {
      ws.userId = userId;
      ws.sessionId = sessionId;
      ws.agence = (request as any).userAgence as string | undefined;
      ws.role = (request as any).userRole as string | undefined;
      registerUser(deps, ws, userId);
    }

    ws.on("message", (message) => {
      void handleIncomingMessage(ws, userId ?? "", message, deps);
    });

    ws.on("close", () => handleClose(deps, ws, userId));
  };
}
