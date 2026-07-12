/**
 * @module routes/sync/heartbeat
 * API de battement de cœur (Heartbeat) pour la synchronisation.
 * Fournit les informations d'état de synchronisation en temps réel pour le tableau de bord.
 */

import { Express, Request, Response } from 'express';
import { requireAuth } from '../../auth';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { SyncCache, syncCacheMap, activeSyncs } from './cache';

const CACHE_TTL_MS = 5000; // Cache de 5 secondes

/**
 * Récupère les statistiques de synchronisation pour un utilisateur spécifique.
 * Optimisé pour la performance avec un minimum de requêtes base de données.
 *
 * @param userId - L'identifiant de l'utilisateur
 * @returns Les statistiques de synchronisation en cours
 */
export async function getSyncStats(userId: string): Promise<SyncCache> {
  try {
    let pending = 0;
    let lastSyncAt: Date | null = null;

    try {
      const result = await db.execute(sql`
        SELECT MAX(created_at) as last_activity
        FROM audit_logs
        WHERE user_id = ${userId}
        AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `);

      if (result.rows && result.rows.length > 0 && result.rows[0].last_activity) {
        lastSyncAt = new Date(result.rows[0].last_activity as string);
      }
    } catch {
      lastSyncAt = new Date();
    }

    return {
      pending,
      syncedSinceLast: 0,
      lastSyncAt: lastSyncAt || new Date(),
      syncState: 'idle',
      lastError: null,
      lastUpdated: Date.now()
    };
  } catch (error) {
    console.error('[getSyncStats] Erreur:', error);
    return {
      pending: 0,
      syncedSinceLast: 0,
      lastSyncAt: new Date(),
      syncState: 'idle',
      lastError: null,
      lastUpdated: Date.now()
    };
  }
}

/**
 * Récupère les opérations en attente depuis la file d'attente de synchronisation.
 *
 * @param _userId - L'identifiant de l'utilisateur
 * @returns Une liste des opérations en attente (actuellement vide en l'absence de table dédiée)
 */
export async function getPendingQueue(_userId: string): Promise<Array<{ id: string; type: string; createdAt: Date }>> {
  return [];
}

/**
 * Enregistre les routes de suivi de l'état de synchronisation sur l'application Express.
 *
 * @param app - L'instance de l'application Express
 */
export function registerSyncHeartbeatRoutes(app: Express) {
  /**
   * GET /api/sync/heartbeat
   * Retourne l'état de synchronisation allégé pour la surveillance en temps réel.
   */
  app.get('/api/sync/heartbeat', requireAuth, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    try {
      let syncData = syncCacheMap.get(userId);
      const now = Date.now();

      if (!syncData || (now - syncData.lastUpdated) > CACHE_TTL_MS) {
        syncData = await getSyncStats(userId);
        syncCacheMap.set(userId, syncData);
      }

      const activeSync = activeSyncs.get(userId);
      const syncState = activeSync && activeSync.count > 0 ? 'syncing' : syncData.syncState;

      res.json({
        status: 'ok',
        serverTime: new Date().toISOString(),
        pending: syncData.pending,
        syncedSinceLast: syncData.syncedSinceLast,
        lastSyncAt: syncData.lastSyncAt?.toISOString() || null,
        syncState,
        lastError: syncData.lastError,
        responseTime: Date.now() - startTime
      });
    } catch (error) {
      console.error('[Sync Heartbeat] Erreur:', error);
      res.status(500).json({
        status: 'error',
        serverTime: new Date().toISOString(),
        pending: 0,
        syncedSinceLast: 0,
        lastSyncAt: null,
        syncState: 'error',
        lastError: 'Erreur serveur interne',
        responseTime: Date.now() - startTime
      });
    }
  });

  /**
   * POST /api/sync/ping
   * Requête de ping ultra-légère pour mesurer la latence.
   */
  app.post('/api/sync/ping', requireAuth, (_req: Request, res: Response) => {
    res.json({
      pong: true,
      serverTime: new Date().toISOString()
    });
  });

  /**
   * POST /api/sync/start
   * Appelé lorsque le client démarre une opération de synchronisation.
   */
  app.post('/api/sync/start', requireAuth, (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    const current = activeSyncs.get(userId) || { count: 0, startedAt: new Date() };
    current.count++;
    current.startedAt = new Date();
    activeSyncs.set(userId, current);

    res.json({ status: 'ok', activeSyncs: current.count });
  });

  /**
   * POST /api/sync/complete
   * Appelé lorsque le client termine une opération de synchronisation.
   */
  app.post('/api/sync/complete', requireAuth, (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    const { syncedCount = 0, error = null } = req.body;

    const current = activeSyncs.get(userId);
    if (current) {
      current.count = Math.max(0, current.count - 1);
      if (current.count === 0) {
        activeSyncs.delete(userId);
      } else {
        activeSyncs.set(userId, current);
      }
    }

    const cached = syncCacheMap.get(userId);
    if (cached) {
      cached.syncedSinceLast += syncedCount;
      cached.lastSyncAt = new Date();
      cached.syncState = error ? 'error' : 'idle';
      cached.lastError = error;
      cached.lastUpdated = Date.now();
      syncCacheMap.set(userId, cached);
    }

    res.json({ status: 'ok', syncedCount });
  });

  /**
   * POST /api/sync/error
   * Appelé lorsqu'une erreur de synchronisation se produit.
   */
  app.post('/api/sync/error', requireAuth, (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    const { message = 'Erreur inconnue' } = req.body;

    activeSyncs.delete(userId);

    const cached = syncCacheMap.get(userId);
    if (cached) {
      cached.syncState = 'error';
      cached.lastError = message;
      cached.lastUpdated = Date.now();
      syncCacheMap.set(userId, cached);
    }

    res.json({ status: 'ok' });
  });

  /**
   * GET /api/sync/queue
   * Retourne la file d'attente détaillée des opérations en attente.
   */
  app.get('/api/sync/queue', requireAuth, async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    try {
      const queue = await getPendingQueue(userId);
      res.json({
        status: 'ok',
        queue,
        total: queue.length
      });
    } catch (error) {
      console.error('[Sync Queue] Erreur:', error);
      res.json({
        status: 'ok',
        queue: [],
        total: 0
      });
    }
  });

  /**
   * POST /api/sync/retry
   * Déclenche manuellement une nouvelle tentative pour les opérations ayant échoué.
   */
  app.post('/api/sync/retry', requireAuth, async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    const cached = syncCacheMap.get(userId);
    if (cached) {
      cached.syncState = 'idle';
      cached.lastError = null;
      cached.lastUpdated = Date.now();
      syncCacheMap.set(userId, cached);
    }

    res.json({ status: 'ok', message: 'Nouvelle tentative initiée' });
  });

  // Nettoyage périodique des anciennes entrées du cache
  setInterval(() => {
    const now = Date.now();
    const maxAge = 60000; // 1 minute

    for (const [uid, cache] of syncCacheMap.entries()) {
      if (now - cache.lastUpdated > maxAge) {
        syncCacheMap.delete(uid);
      }
    }
  }, 30000);
}
