/**
 * Serveur WebSocket MicroFlex — orchestrateur.
 *
 * Ce fichier assemble le sous-système temps réel, dont les responsabilités sont
 * modularisées dans `./ws/*` :
 * - `ws/message-types`   : catalogue des messages (`GlobalMessage`) ;
 * - `ws/rate-limit`      : limitation de débit par utilisateur ;
 * - `ws/connection-registry` : état des sockets et abonnements ;
 * - `ws/broadcaster`     : API de diffusion exposée aux routes ;
 * - `ws/upgrade`         : montée de protocole et authentification ;
 * - `ws/connection`      : cycle de vie d'une connexion ;
 * - `ws/message-router`  : routage des messages entrants.
 *
 * L'API publique historique (`setupWebSocket`, `getWsInstance`,
 * `setWsInstance`, type `GlobalMessage`) est préservée : les imports existants
 * restent valides.
 */

import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { createLogger } from "./lib/logger";
import { ConnectionRegistry } from "./ws/connection-registry";
import { createBroadcaster } from "./ws/broadcaster";
import { createUpgradeHandler } from "./ws/upgrade";
import { createConnectionHandler } from "./ws/connection";
import type { ExtendedWebSocket } from "./ws/types";

export type { GlobalMessage } from "./ws/message-types";

const logger = createLogger("WebSocket");

/** Intervalle du battement de présence (ms). */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Callback `pong` : marque la socket comme vivante (scope module). */
function heartbeat(this: WebSocket): void {
  (this as ExtendedWebSocket).isAlive = true;
}

/**
 * Initialise le serveur WebSocket sur le serveur HTTP fourni et retourne
 * l'objet de diffusion (à enregistrer via `setWsInstance`).
 */
export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  const registry = new ConnectionRegistry();
  const deps = { wss, registry };

  // Battement de présence : termine les connexions n'ayant pas répondu au ping.
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (extWs.isAlive === false) {
        logger.debug("Fermeture d'une connexion inactive");
        ws.terminate();
        return;
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(interval));

  // Authentification à la montée de protocole, puis cycle de vie de connexion.
  server.prependListener("upgrade", createUpgradeHandler(wss, heartbeat));
  wss.on("connection", createConnectionHandler(deps));

  return createBroadcaster(wss, registry);
}

let wsInstance: ReturnType<typeof setupWebSocket> | null = null;

export function setWsInstance(instance: ReturnType<typeof setupWebSocket>) {
  wsInstance = instance;
}

export function getWsInstance() {
  return wsInstance;
}
