/**
 * Fabrique des méthodes de diffusion WebSocket — l'API sortante consommée par
 * les routes via `getWsInstance()`.
 *
 * S'appuie sur le serveur `wss` (diffusions globales) et le `ConnectionRegistry`
 * (envoi ciblé par utilisateur, agence ou canal d'agrégat). Aucune logique de
 * connexion ici : uniquement l'émission.
 */

import type { WebSocketServer, WebSocket } from "ws";
import { WebSocket as WS } from "ws";
import { SystemRole } from "@shared/types/roles";
import type { GlobalMessage } from "./message-types";
import type { ConnectionRegistry } from "./connection-registry";
import type { ExtendedWebSocket } from "./types";

/** Envoie un message sérialisé à une socket si elle est ouverte. */
function sendIfOpen(client: WebSocket, message: GlobalMessage): void {
  if (client.readyState === WS.OPEN) {
    client.send(JSON.stringify(message));
  }
}

/**
 * Construit l'objet exposant les diffusions temps réel.
 *
 * @param wss - Serveur WebSocket (diffusions globales).
 * @param registry - Registre des connexions et abonnements.
 */
export function createBroadcaster(wss: WebSocketServer, registry: ConnectionRegistry) {
  return {
    /** Diffuse à toutes les sockets connectées. */
    broadcast: (message: GlobalMessage) => {
      wss.clients.forEach((client) => sendIfOpen(client, message));
    },

    /** Envoie à toutes les sockets d'un utilisateur donné. */
    sendToUser: (userId: string, message: GlobalMessage) => {
      registry.getUserSockets(userId).forEach((client) => sendIfOpen(client, message));
    },

    /** Indique si l'utilisateur a au moins une connexion active. */
    isUserOnline: (userId: string) => registry.isOnline(userId),

    /** Diffuse aux sockets d'une agence (les admins ont une visibilité globale). */
    broadcastToAgency: (agency: string, message: GlobalMessage) => {
      wss.clients.forEach((client) => {
        const ext = client as ExtendedWebSocket;
        if (ext.agence === agency || ext.role === SystemRole.ADMIN) {
          sendIfOpen(client, message);
        }
      });
    },

    /** Diffuse aux abonnés d'un canal d'agrégat précis. */
    broadcastToAggregate: (aggregateType: string, aggregateId: string, message: GlobalMessage) => {
      registry.getSubscribers(`${aggregateType}:${aggregateId}`)?.forEach((client) =>
        sendIfOpen(client, message),
      );
    },

    /** Statistiques d'abonnement pour diagnostic et supervision. */
    getSubscriptionStats: () => registry.subscriptionStats(),

    /** Diffuse aux abonnés d'une conversation, en excluant éventuellement l'émetteur. */
    broadcastToConversation: (conversationId: string, message: GlobalMessage, excludeUserId?: string) => {
      registry.getSubscribers(`conversation:${conversationId}`)?.forEach((client) => {
        if (excludeUserId && (client as ExtendedWebSocket).userId === excludeUserId) return;
        sendIfOpen(client, message);
      });
    },
  };
}

/** Type de l'objet de diffusion (instance WebSocket exposée aux routes). */
export type Broadcaster = ReturnType<typeof createBroadcaster>;
