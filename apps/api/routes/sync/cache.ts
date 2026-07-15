/**
 * @module routes/sync/cache
 * Cache en mémoire pour les statistiques et l'état de synchronisation par utilisateur.
 */

/**
 * Représente l'état du cache de synchronisation d'un utilisateur.
 */
export interface SyncCache {
  /** Nombre d'opérations en attente de synchronisation */
  pending: number;
  /** Nombre d'opérations synchronisées depuis la dernière mise à jour */
  syncedSinceLast: number;
  /** Date de la dernière synchronisation réussie, ou null si aucune */
  lastSyncAt: Date | null;
  /** État actuel du processus de synchronisation */
  syncState: 'idle' | 'syncing' | 'error';
  /** Dernier message d'erreur de synchronisation, ou null si succès */
  lastError: string | null;
  /** Horodatage (ms) de la dernière mise à jour de ce cache */
  lastUpdated: number;
}

/**
 * Dictionnaire stockant l'état de synchronisation par identifiant utilisateur.
 */
export const syncCacheMap = new Map<string, SyncCache>();

/**
 * Dictionnaire suivant les opérations de synchronisation actives (en cours) par utilisateur.
 */
export const activeSyncs = new Map<string, { count: number; startedAt: Date }>();
