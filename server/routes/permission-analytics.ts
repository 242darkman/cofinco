/**
 * Permission Analytics Routes
 * ===========================
 *
 * API endpoints pour la gestion et la consultation des analytics de permissions.
 * Réservé aux administrateurs.
 */

import { Router } from 'express';
import { permissionAnalytics } from '../services/permission-analytics-service';
import { attachAbility, requireAbility } from '../authorization';
import { Actions, Subjects } from '../authorization/types';
import { createLogger } from '../lib/logger';

const logger = createLogger('PermissionAnalytics:Routes');

const router = Router();

// Tous les endpoints requièrent l'ability admin
router.use(attachAbility);
router.use(requireAbility(Actions.MANAGE, Subjects.ADMIN));

/**
 * GET /api/admin/permission-analytics/config
 * Obtenir la configuration des analytics
 */
router.get('/config', async (req, res) => {
  try {
    const config = permissionAnalytics.getConfig();
    res.json(config);
  } catch (error: any) {
    logger.error({ err: error }, 'Get config error');
    res.status(500).json({ error: 'Failed to get config' });
  }
});

/**
 * PATCH /api/admin/permission-analytics/config
 * Mettre à jour la configuration
 */
router.patch('/config', async (req, res) => {
  try {
    const updates = req.body;

    // Validation basique
    if (updates.samplingRateAllowed !== undefined) {
      const rate = parseFloat(updates.samplingRateAllowed);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        return res.status(400).json({ error: 'samplingRateAllowed must be between 0 and 1' });
      }
    }

    if (updates.samplingRateDenied !== undefined) {
      const rate = parseFloat(updates.samplingRateDenied);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        return res.status(400).json({ error: 'samplingRateDenied must be between 0 and 1' });
      }
    }

    if (updates.batchSize !== undefined) {
      const size = parseInt(updates.batchSize);
      if (isNaN(size) || size < 1 || size > 1000) {
        return res.status(400).json({ error: 'batchSize must be between 1 and 1000' });
      }
    }

    if (updates.flushIntervalMs !== undefined) {
      const interval = parseInt(updates.flushIntervalMs);
      if (isNaN(interval) || interval < 1000 || interval > 60000) {
        return res.status(400).json({ error: 'flushIntervalMs must be between 1000 and 60000' });
      }
    }

    if (updates.retentionDays !== undefined) {
      const days = parseInt(updates.retentionDays);
      if (isNaN(days) || days < 1 || days > 365) {
        return res.status(400).json({ error: 'retentionDays must be between 1 and 365' });
      }
    }

    await permissionAnalytics.updateConfig(updates);
    const newConfig = permissionAnalytics.getConfig();
    res.json(newConfig);
  } catch (error: any) {
    logger.error({ err: error }, 'Update config error');
    res.status(500).json({ error: 'Failed to update config' });
  }
});

/**
 * GET /api/admin/permission-analytics/stats
 * Obtenir les statistiques globales
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await permissionAnalytics.getStats();
    res.json(stats);
  } catch (error: any) {
    logger.error({ err: error }, 'Get stats error');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/admin/permission-analytics/denials
 * Obtenir les permissions les plus refusées
 */
router.get('/denials', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const denials = await permissionAnalytics.getTopDenials(limit);
    res.json(denials);
  } catch (error: any) {
    logger.error({ err: error }, 'Get denials error');
    res.status(500).json({ error: 'Failed to get denials' });
  }
});

/**
 * GET /api/admin/permission-analytics/unused
 * Obtenir les permissions inutilisées
 */
router.get('/unused', async (req, res) => {
  try {
    const unused = await permissionAnalytics.getUnusedPermissions();
    res.json(unused);
  } catch (error: any) {
    logger.error({ err: error }, 'Get unused error');
    res.status(500).json({ error: 'Failed to get unused permissions' });
  }
});

/**
 * POST /api/admin/permission-analytics/refresh
 * Rafraîchir les statistiques matérialisées
 */
router.post('/refresh', async (req, res) => {
  try {
    await permissionAnalytics.refreshStats();
    res.json({ success: true, message: 'Stats refreshed' });
  } catch (error: any) {
    logger.error({ err: error }, 'Refresh error');
    res.status(500).json({ error: 'Failed to refresh stats' });
  }
});

/**
 * POST /api/admin/permission-analytics/purge
 * Purger les anciens logs
 */
router.post('/purge', async (req, res) => {
  try {
    const daysToKeep = req.body.daysToKeep ? parseInt(req.body.daysToKeep) : undefined;
    const deleted = await permissionAnalytics.purgeOldLogs(daysToKeep);
    res.json({ success: true, deleted });
  } catch (error: any) {
    logger.error({ err: error }, 'Purge error');
    res.status(500).json({ error: 'Failed to purge logs' });
  }
});

/**
 * POST /api/admin/permission-analytics/flush
 * Forcer un flush du buffer
 */
router.post('/flush', async (req, res) => {
  try {
    await permissionAnalytics.flush();
    res.json({ success: true, message: 'Buffer flushed' });
  } catch (error: any) {
    logger.error({ err: error }, 'Flush error');
    res.status(500).json({ error: 'Failed to flush buffer' });
  }
});

export default router;
