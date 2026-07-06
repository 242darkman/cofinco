/**
 * Cron Job: Expiration et notifications des permissions temporaires
 * ==================================================================
 *
 * Ce job s'exécute périodiquement pour:
 * - Désactiver les permissions temporaires expirées
 * - Envoyer des avertissements avant expiration (1h, 24h)
 * - Notifier les utilisateurs concernés via WebSocket/Email
 * - Déclencher les webhooks externes
 * - Logger les expirations pour l'audit
 */

import {
  expireTemporaryPermissions,
  sendExpiryWarnings,
  triggerWebhook,
} from '../services/temporary-permissions-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:TempPermExpiry');

// Configuration
const CHECK_INTERVAL_MS = 60 * 1000; // Vérification toutes les minutes
const WARNING_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Avertissements toutes les 5 minutes

let expiryIntervalId: NodeJS.Timeout | null = null;
let warningIntervalId: NodeJS.Timeout | null = null;

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

      // Déclencher les webhooks pour chaque permission expirée
      for (const perm of expiredPerms) {
        await triggerWebhook('temp_permission.expired', {
          userId: perm.userId,
          permissionCode: perm.permissionCode,
          expiredAt: perm.expiresAt.toISOString(),
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de la vérification des permissions temporaires');
  }
}

/**
 * Exécuter l'envoi des avertissements d'expiration
 */
async function runExpiryWarningsCheck(): Promise<void> {
  try {
    const result = await sendExpiryWarnings();

    if (result.notificationsSent > 0) {
      logger.info({
        notificationsSent: result.notificationsSent,
      }, `${result.notificationsSent} avertissement(s) d'expiration envoyé(s)`);
    }

    if (result.errors.length > 0) {
      logger.warn({
        errors: result.errors,
      }, `${result.errors.length} erreur(s) lors de l'envoi des avertissements`);
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de l\'envoi des avertissements d\'expiration');
  }
}

/**
 * Démarrer le cron job d'expiration
 */
export function startTempPermissionExpiryCron(): void {
  logger.info('Démarrage du job d\'expiration des permissions temporaires');

  // Exécuter immédiatement au démarrage
  runPermissionExpiryCheck();
  runExpiryWarningsCheck();

  // Planifier les vérifications périodiques
  expiryIntervalId = setInterval(runPermissionExpiryCheck, CHECK_INTERVAL_MS);
  warningIntervalId = setInterval(runExpiryWarningsCheck, WARNING_CHECK_INTERVAL_MS);

  logger.info({
    expiryCheckIntervalSeconds: CHECK_INTERVAL_MS / 1000,
    warningCheckIntervalSeconds: WARNING_CHECK_INTERVAL_MS / 1000,
  }, 'Jobs configurés');
}

/**
 * Arrêter le cron job d'expiration
 */
export function stopTempPermissionExpiryCron(): void {
  if (expiryIntervalId) {
    clearInterval(expiryIntervalId);
    expiryIntervalId = null;
  }
  if (warningIntervalId) {
    clearInterval(warningIntervalId);
    warningIntervalId = null;
  }
  logger.info('Jobs d\'expiration des permissions temporaires arrêtés');
}
