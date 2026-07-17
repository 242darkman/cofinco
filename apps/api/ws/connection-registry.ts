/**
 * Registre des connexions WebSocket : source unique de l'état temps réel.
 *
 * Encapsule les trois tables auparavant globales dans `ws-server.ts` :
 * - sockets actives par utilisateur (présence, envoi ciblé) ;
 * - abonnements par canal d'agrégat (client/compte/credit/conversation…) ;
 * - anti-rebond des journaux de localisation par utilisateur.
 *
 * Fournir des méthodes explicites (plutôt que des Map nues) réduit la
 * complexité des gestionnaires et centralise les invariants (nettoyage des
 * ensembles vides, etc.).
 */

import type { WebSocket } from "ws";

/** Intervalle minimal entre deux journaux de localisation persistés (ms). */
export const LOCATION_LOG_MIN_INTERVAL_MS = 10_000;

export class ConnectionRegistry {
  /** Sockets actives indexées par identifiant utilisateur. */
  private readonly clients = new Map<string, WebSocket[]>();
  /** Sockets abonnées, indexées par canal d'agrégat. */
  private readonly subscriptions = new Map<string, Set<WebSocket>>();
  /** Dernier instant de journalisation de localisation, par utilisateur. */
  private readonly locationLogThrottles = new Map<string, number>();

  /** Enregistre une socket pour un utilisateur. */
  addClient(userId: string, ws: WebSocket): void {
    const sockets = this.clients.get(userId);
    if (sockets) {
      sockets.push(ws);
    } else {
      this.clients.set(userId, [ws]);
    }
  }

  /**
   * Retire une socket. Renvoie `true` si l'utilisateur n'a plus aucune socket
   * active (transition en ligne → hors ligne).
   */
  removeClient(userId: string, ws: WebSocket): boolean {
    const sockets = this.clients.get(userId);
    if (!sockets) return false;

    const index = sockets.indexOf(ws);
    if (index > -1) sockets.splice(index, 1);

    if (sockets.length === 0) {
      this.clients.delete(userId);
      return true;
    }
    return false;
  }

  /** Sockets actives d'un utilisateur (ou tableau vide). */
  getUserSockets(userId: string): WebSocket[] {
    return this.clients.get(userId) ?? [];
  }

  /** L'utilisateur a-t-il au moins une socket active ? */
  isOnline(userId: string): boolean {
    return (this.clients.get(userId)?.length ?? 0) > 0;
  }

  /** Identifiants des utilisateurs en ligne, en excluant `exceptUserId`. */
  onlineUserIdsExcept(exceptUserId: string): string[] {
    const ids: string[] = [];
    this.clients.forEach((sockets, userId) => {
      if (sockets.length > 0 && userId !== exceptUserId) ids.push(userId);
    });
    return ids;
  }

  /** Abonne une socket à un canal d'agrégat. */
  subscribe(channel: string, ws: WebSocket): void {
    let subs = this.subscriptions.get(channel);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(channel, subs);
    }
    subs.add(ws);
  }

  /** Désabonne une socket d'un canal ; supprime le canal s'il devient vide. */
  unsubscribe(channel: string, ws: WebSocket): void {
    const subs = this.subscriptions.get(channel);
    if (!subs) return;
    subs.delete(ws);
    if (subs.size === 0) this.subscriptions.delete(channel);
  }

  /** Abonnés d'un canal (ou `undefined` si aucun). */
  getSubscribers(channel: string): Set<WebSocket> | undefined {
    return this.subscriptions.get(channel);
  }

  /** Retire une socket de tous ses canaux (à la fermeture). */
  cleanupSocketSubscriptions(channels: Iterable<string> | undefined, ws: WebSocket): void {
    if (!channels) return;
    for (const channel of channels) {
      this.unsubscribe(channel, ws);
    }
  }

  /** Statistiques d'abonnement par canal (diagnostic/supervision). */
  subscriptionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.subscriptions.forEach((subs, channel) => {
      stats[channel] = subs.size;
    });
    return stats;
  }

  /**
   * Indique si un journal de localisation peut être persisté pour l'utilisateur
   * (anti-rebond) et met à jour l'horodatage le cas échéant.
   */
  shouldLogLocation(userId: string, now: number = Date.now()): boolean {
    const last = this.locationLogThrottles.get(userId) ?? 0;
    if (now - last < LOCATION_LOG_MIN_INTERVAL_MS) return false;
    this.locationLogThrottles.set(userId, now);
    return true;
  }
}
