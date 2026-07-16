/**
 * Montée de protocole WebSocket (`upgrade`) : authentification stricte par
 * cookie de session, puis remise de la socket au serveur `ws`.
 *
 * Découpé en étapes courtes (rejet, extraction de session, finalisation) pour
 * garder une complexité faible et une piste d'audit lisible des refus.
 */

import type { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { parse } from "node:url";
import { parse as parseCookie } from "cookie";
import { unsign } from "cookie-signature";
import { sessionMiddleware } from "../auth";
import { createLogger } from "../lib/logger";
import type { ExtendedWebSocket } from "./types";

const logger = createLogger("WebSocket:Upgrade");

const SESSION_MIDDLEWARE_TIMEOUT_MS = 5000;

/** Écrit une réponse HTTP d'échec puis détruit la socket (best-effort). */
function rejectSocket(socket: Duplex, statusLine: string, reason: string): void {
  logger.warn({ reason }, "Montée WebSocket refusée");
  try {
    socket.write(`HTTP/1.1 ${statusLine}\r\n\r\n`);
    socket.destroy();
  } catch (err) {
    logger.debug({ err }, "Échec fermeture socket après refus");
  }
}

/**
 * Extrait et valide l'identifiant de session depuis le cookie signé.
 * Renvoie `null` (et journalise la raison) si l'authentification échoue.
 */
function extractValidatedSessionId(request: IncomingMessage, isProduction: boolean): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = parseCookie(cookieHeader);
  // Doit rester aligné avec la logique de auth.ts.
  const cookieName = isProduction ? "__Host-microflex_sess" : "microflex_sess";
  const signedSessionId = cookies[cookieName];

  // Les cookies express-session sont préfixés par "s:".
  if (!signedSessionId || !signedSessionId.startsWith("s:")) return null;

  const sessionSecret = process.env.SESSION_SECRET || "dev-only-secret-do-not-use-in-prod";
  const sessionId = unsign(signedSessionId.slice(2), sessionSecret);
  return sessionId || null;
}

/** Finalise la montée : marque la socket vivante, câble le pong, émet `connection`. */
function finalizeUpgrade(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  onPong: (this: WebSocket) => void,
): void {
  wss.handleUpgrade(request, socket, head, (ws) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;
    extWs.on("pong", onPong);
    try {
      wss.emit("connection", ws, request);
    } catch (err) {
      logger.error({ err }, "Erreur lors de l'émission de l'événement connection");
    }
  });
}

/**
 * Construit le gestionnaire d'`upgrade` à brancher sur le serveur HTTP.
 *
 * @param wss - Serveur WebSocket (mode `noServer`).
 * @param onPong - Callback de battement à câbler sur chaque nouvelle socket.
 */
export function createUpgradeHandler(
  wss: WebSocketServer,
  onPong: (this: WebSocket) => void,
) {
  return (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // Évite les crashs EPIPE/ECONNRESET sur la socket brute.
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET" || err.code === "EPIPE" || err.code === "ECONNREFUSED") return;
      logger.error({ err }, "Erreur socket pendant l'upgrade");
    });

    try {
      // Ne traite que le chemin /ws (sans les paramètres de requête).
      const url = parse(request.url || "", true);
      if (!url.pathname?.startsWith("/ws")) return;

      const isProduction = process.env.NODE_ENV === "production";

      // 1-2. Authentification et validation de signature du cookie.
      const sessionId = extractValidatedSessionId(request, isProduction);
      if (!sessionId) {
        rejectSocket(socket, "401 Unauthorized", "cookie de session absent ou invalide");
        return;
      }

      if (!sessionMiddleware) {
        logger.error("Middleware de session indisponible");
        socket.destroy();
        return;
      }

      // 3. Hydrate l'utilisateur depuis le store de session (Postgres).
      const mockRes = { on() {}, writeHead() {}, end() {}, setHeader() {} };

      let callbackFired = false;
      const sessionTimeout = setTimeout(() => {
        if (callbackFired) return;
        callbackFired = true;
        logger.error({ sessionId }, "Timeout du middleware de session pendant l'upgrade");
        rejectSocket(socket, "503 Service Unavailable", "timeout middleware de session");
      }, SESSION_MIDDLEWARE_TIMEOUT_MS);

      sessionMiddleware(request as any, mockRes as any, (err?: Error) => {
        if (callbackFired) return; // Timeout déjà déclenché.
        callbackFired = true;
        clearTimeout(sessionTimeout);

        if (err) {
          logger.error({ err }, "Erreur du middleware de session");
          rejectSocket(socket, "500 Internal Server Error", "erreur middleware de session");
          return;
        }

        const session = (request as any).session;
        if (session?.id !== sessionId) {
          logger.warn({ sessionId, middlewareId: session?.id }, "Session ID divergent (middleware vs cookie)");
        }

        const userId = session?.userId;
        if (!userId) {
          rejectSocket(socket, "401 Unauthorized", "aucun userId en session (expirée/invalide)");
          return;
        }

        // 4. Stocke les données authentifiées puis poursuit la montée de protocole.
        (request as any).authenticatedUserId = userId;
        (request as any).authenticatedSessionId = sessionId;
        (request as any).userAgence = session?.user?.agence;
        (request as any).userRole = session?.user?.role;

        logger.info({ userId }, "Upgrade WebSocket réussi");
        try {
          finalizeUpgrade(wss, request, socket, head, onPong);
        } catch (err) {
          logger.error({ err }, "Erreur pendant la finalisation de l'upgrade");
          try {
            socket.destroy();
          } catch (destroyErr) {
            logger.debug({ err: destroyErr }, "Échec destruction socket");
          }
        }
      });
    } catch (err) {
      logger.error({ err }, "Erreur critique dans le gestionnaire d'upgrade");
      rejectSocket(socket, "500 Internal Server Error", "erreur critique upgrade");
    }
  };
}
