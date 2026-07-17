/**
 * Types partagés du sous-système WebSocket.
 *
 * `ExtendedWebSocket` porte l'état de session MicroFlex attaché à chaque
 * socket, évitant les `(ws as any)` disséminés dans le code d'orchestration.
 */

import type { WebSocket } from "ws";

/** Socket WebSocket enrichie des métadonnées de session et d'abonnement. */
export interface ExtendedWebSocket extends WebSocket {
  /** Marqueur de vivacité mis à jour par le battement (ping/pong). */
  isAlive: boolean;
  /** Identifiant de l'utilisateur authentifié pour cette socket. */
  userId?: string;
  /** Identifiant de session serveur associé. */
  sessionId?: string;
  /** Agence de l'utilisateur (diffusions ciblées par agence). */
  agence?: string;
  /** Rôle système de l'utilisateur (visibilité globale des admins). */
  role?: string;
  /** Canaux d'agrégats auxquels la socket est abonnée (pour le nettoyage). */
  subscriptions?: Set<string>;
}
