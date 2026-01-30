/**
 * Cron Job: Expiration des permissions temporaires
 * ================================================
 *
 * Ce job s'exécute périodiquement pour:
 * - Désactiver les permissions temporaires expirées
 * - Notifier les utilisateurs concernés via WebSocket
 * - Logger les expirations pour l'audit
 */

import { expireTemporaryPermissions } from '../services/temporary-permissions-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:TempPermExpiry');

// Configuration
const CHECK_INTERVAL_MS = 60 * 1000; // Vérification toutes les minutes

let expiryIntervalId: NodeJS.Timeout | null = null;

/**
 * Exécuter la vérification d'expiration
 */
async function runPermissionExpiryCheck(): Promise<void> {
  try {
    const expiredPerms = await expireTemporaryPermissions();

    if (expiredPerms.length > 0) {
      logger.info({
        count: expiredPerms.length,
        expired: expiredPerms.map(p => ({
          userId: p.userId,
          permissionCode: p.permissionCode,
          expiresAt: p.expiresAt.toISOString(),
        })),
      }, `${expiredPerms.length} permission(s) temporaire(s) expirée(s)`);
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de la vérification des permissions temporaires');
  }
}

/**
 * Démarrer le cron job d'expiration
 */
export function startTempPermissionExpiryCron(): void {
  logger.info('Démarrage du job d\'expiration des permissions temporaires');

  // Exécuter immédiatement au démarrage
  runPermissionExpiryCheck();

  // Planifier les vérifications périodiques
  expiryIntervalId = setInterval(runPermissionExpiryCheck, CHECK_INTERVAL_MS);

  logger.info({ intervalSeconds: CHECK_INTERVAL_MS / 1000 }, 'Job configuré');
}

/**
 * Arrêter le cron job d'expiration
 */
export function stopTempPermissionExpiryCron(): void {
  if (expiryIntervalId) {
    clearInterval(expiryIntervalId);
    expiryIntervalId = null;
  }
  logger.info('Job d\'expiration des permissions temporaires arrêté');
}
