/**
 * @module routes/sync/pull
 * Envoi (pull) des modifications du serveur vers le client selon un curseur temporel.
 */

import { Express, Request, Response } from 'express';
import { requireAuth } from '../../auth';
import { attachAbility } from '../../authorization';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Entités capables d'être synchronisées via l'opération pull.
 * Mappe le nom de l'entité à son nom de table SQL.
 */
export const SYNCABLE_ENTITIES: Record<string, string> = {
  clients: 'clients',
  credits: 'credits',
  remboursements: 'remboursements',
  comptes: 'comptes',
  transferts: 'transferts',
  tontines: 'tontines',
  remises_terrain: 'remises_terrain',
  paiements_terrain: 'paiements_terrain',
  prospections: 'prospections',
};

/**
 * Enregistre les routes permettant aux clients de récupérer (pull) les données synchronisées.
 *
 * @param app - L'instance de l'application Express
 */
export function registerSyncPullRoutes(app: Express) {
  /**
   * POST /api/sync/pull
   * Retourne les entités modifiées depuis le dernier curseur de synchronisation du client.
   * Supporte plusieurs types d'entités en une seule requête.
   */
  app.post('/api/sync/pull', requireAuth, attachAbility, async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Non autorisé' });

    const {
      cursors = {} as Record<string, string>,
      entities = [] as string[],
      limit = 100,
    } = req.body;

    const maxLimit = Math.min(limit, 500);

    const validEntities = entities.filter((e: string) => SYNCABLE_ENTITIES[e]);
    if (validEntities.length === 0) {
      return res.status(400).json({
        error: 'Aucune entité valide demandée',
        validEntities: Object.keys(SYNCABLE_ENTITIES),
      });
    }

    const userResult = await db.execute(sql`
      SELECT e.agence_id FROM employes e
      JOIN users u ON u.id = e.user_id
      WHERE u.id = ${userId}
      LIMIT 1
    `);
    const agenceId = userResult.rows?.[0]?.agence_id as string | undefined;

    const changes: Record<string, any[]> = {};
    const newCursors: Record<string, string> = {};
    const hasMore: Record<string, boolean> = {};

    for (const entity of validEntities) {
      const tableName = SYNCABLE_ENTITIES[entity];
      const cursor = cursors[entity] || '1970-01-01T00:00:00.000Z';

      try {
        const hasAgenceCol = ['clients', 'credits', 'tontines', 'remises_terrain', 'paiements_terrain', 'prospections'].includes(entity);
        const agenceFilter = hasAgenceCol && agenceId
          ? sql.raw(` AND agence_id = '${agenceId}'`)
          : sql.raw('');

        const result = await db.execute(sql.raw(`
          SELECT *, updated_at::text as _cursor
          FROM ${tableName}
          WHERE updated_at > '${cursor}'
            AND (deleted_at IS NULL OR deleted_at > '${cursor}')
            ${agenceFilter.queryChunks ? agenceFilter.queryChunks[0] : ''}
          ORDER BY updated_at ASC
          LIMIT ${maxLimit + 1}
        `));

        const rows = result.rows || [];
        hasMore[entity] = rows.length > maxLimit;
        const truncated = rows.slice(0, maxLimit);

        changes[entity] = truncated;
        newCursors[entity] = truncated.length > 0
          ? (truncated[truncated.length - 1] as any)._cursor
          : cursor;
      } catch (err: any) {
        console.warn(`[Sync Pull] Erreur lors de la récupération de ${entity}:`, err.message);
        changes[entity] = [];
        newCursors[entity] = cursor;
        hasMore[entity] = false;
      }
    }

    res.json({
      status: 'ok',
      changes,
      cursors: newCursors,
      hasMore,
      serverTime: new Date().toISOString(),
    });
  });

  /**
   * POST /api/sync/ack
   * Le client confirme le traitement réussi des changements récupérés.
   */
  app.post('/api/sync/ack', requireAuth, (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });
}
