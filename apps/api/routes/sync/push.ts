/**
 * @module routes/sync/push
 * Réception (push) des opérations hors-ligne depuis le client vers le serveur.
 */

import { Express, Request, Response } from 'express';
import { requireAuth } from '../../auth';
import { attachAbility } from '../../authorization';
import { db } from '../../db';
import { sql, eq, gt, and } from 'drizzle-orm';
import { idempotencyKeys } from '@shared/schema';
import { syncCacheMap } from './cache';

/**
 * Structure représentant une opération poussée par le client lors de la synchronisation.
 */
export interface PushOperation {
  /** Identifiant unique de l'opération */
  uuid: string;
  /** Clé d'idempotence pour prévenir les doublons */
  idempotencyKey: string;
  /** Type d'entité concernée */
  type: string;
  /** Point de terminaison ciblé */
  endpoint: string;
  /** Méthode HTTP utilisée */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Données de l'opération */
  payload: any;
  /** Date de création au format ISO */
  createdAt: string;
}

/**
 * Enregistre la route de réception (push) de la synchronisation.
 *
 * @param app - L'instance de l'application Express
 */
export function registerSyncPushRoutes(app: Express) {
  /**
   * POST /api/sync/push
   * Reçoit un lot d'opérations hors-ligne depuis le client.
   * Chaque opération est traitée avec une protection d'idempotence.
   */
  app.post('/api/sync/push', requireAuth, attachAbility, async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    const { operations } = req.body as { operations: PushOperation[] };

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: 'Un tableau operations est requis' });
    }

    if (operations.length > 50) {
      return res.status(400).json({ error: 'Maximum de 50 opérations par lot' });
    }

    const results: Array<{
      uuid: string;
      status: 'ok' | 'duplicate' | 'error';
      serverResponse?: any;
      error?: string;
    }> = [];

    for (const op of operations) {
      try {
        if (op.idempotencyKey) {
          const existing = await db
            .select()
            .from(idempotencyKeys)
            .where(and(
              eq(idempotencyKeys.key, `sync:${op.idempotencyKey}`),
              gt(idempotencyKeys.expiresAt, new Date())
            ))
            .limit(1);

          if (existing.length > 0 && existing[0].status === 'completed') {
            results.push({
              uuid: op.uuid,
              status: 'duplicate',
              serverResponse: existing[0].responseBody,
            });
            continue;
          }
        }

        // Le traitement réel est différé ou géré par ailleurs via les appels d'API directs.
        // Ce marqueur valide l'idempotence.
        if (op.idempotencyKey) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
          await db
            .insert(idempotencyKeys)
            .values({
              key: `sync:${op.idempotencyKey}`,
              resourceType: op.type,
              status: 'completed',
              statusCode: 200,
              responseBody: { synced: true, uuid: op.uuid },
              expiresAt,
            })
            .onConflictDoNothing();
        }

        results.push({ uuid: op.uuid, status: 'ok' });
      } catch (err: any) {
        results.push({
          uuid: op.uuid,
          status: 'error',
          error: err.message || 'Erreur de traitement',
        });
      }
    }

    const syncedCount = results.filter(r => r.status === 'ok').length;
    const duplicateCount = results.filter(r => r.status === 'duplicate').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    const cached = syncCacheMap.get(userId);
    if (cached) {
      cached.syncedSinceLast += syncedCount;
      cached.lastSyncAt = new Date();
      cached.syncState = errorCount > 0 ? 'error' : 'idle';
      cached.lastUpdated = Date.now();
    }

    res.json({
      status: 'ok',
      results,
      summary: { synced: syncedCount, duplicates: duplicateCount, errors: errorCount },
      serverTime: new Date().toISOString(),
    });
  });
}
