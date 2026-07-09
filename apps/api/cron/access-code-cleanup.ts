/**
 * Cron Job: Nettoyage des codes d'accès caisse
 * =============================================
 *
 * Ce job s'exécute périodiquement pour:
 * - Désactiver les codes d'accès expirés
 * - Supprimer les codes inactifs très anciens (> 90 jours)
 * - Envoyer des avertissements avant expiration aux utilisateurs assignés
 * - Logger les statistiques de nettoyage pour l'audit
 */

import {
  cleanupExpiredCodes,
  cleanupExpiredAuthorizations,
} from '../services/caisse/access-control-service';
import { db } from '../db';
import { caisseSecurityCodes, users } from '@shared/schema';
import { eq, and, gt, isNotNull, sql } from 'drizzle-orm';
import { emitNotificationEvent, sendInAppNotification } from '../services/notifications/notification-service';
import { sendPushToUser } from '../services/push-notification-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:AccessCodeCleanup');

// Configuration
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Nettoyage toutes les heures
const WARNING_CHECK_INTERVAL_MS = 15 * 60 * 1000; // Avertissements toutes les 15 minutes
const WARNING_THRESHOLD_HOURS = 1; // Avertir 1h avant expiration

let cleanupIntervalId: NodeJS.Timeout | null = null;
let warningIntervalId: NodeJS.Timeout | null = null;

/**
 * Exécuter le nettoyage des codes expirés
 */
async function runCodeCleanup(): Promise<void> {
  try {
    const result = await cleanupExpiredCodes();
    const expiredAuths = await cleanupExpiredAuthorizations();

    if (result.deactivated > 0 || result.deleted > 0 || expiredAuths > 0) {
      logger.info({
        codesDeactivated: result.deactivated,
        codesDeleted: result.deleted,
        authorizationsExpired: expiredAuths,
      }, 'Nettoyage des codes d\'accès terminé');
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors du nettoyage des codes d\'accès');
  }
}

/**
 * Envoyer des avertissements pour les codes qui vont expirer
 */
async function runExpiryWarnings(): Promise<void> {
  try {
    const now = new Date();
    const warningThreshold = new Date(now.getTime() + WARNING_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Trouver les codes actifs qui vont expirer dans l'heure suivante
    // et qui ont un utilisateur assigné
    const expiringCodes = await db
      .select({
        codeId: caisseSecurityCodes.id,
        expiresAt: caisseSecurityCodes.expiresAt,
        codeType: caisseSecurityCodes.codeType,
        description: caisseSecurityCodes.description,
        userId: caisseSecurityCodes.agentId,
        userName: sql<string>`CONCAT(${users.prenom}, ' ', ${users.nom})`,
        userEmail: users.email,
        userPhone: users.telephone,
      })
      .from(caisseSecurityCodes)
      .leftJoin(users, eq(caisseSecurityCodes.agentId, users.id))
      .where(and(
        eq(caisseSecurityCodes.active, true),
        isNotNull(caisseSecurityCodes.agentId),
        gt(caisseSecurityCodes.expiresAt, now),
        sql`${caisseSecurityCodes.expiresAt} <= ${warningThreshold}`
      ));

    for (const code of expiringCodes) {
      if (!code.userId) continue;

      const timeRemaining = code.expiresAt
        ? Math.round((code.expiresAt.getTime() - now.getTime()) / (60 * 1000))
        : 0;

      const timeRemainingText = timeRemaining > 60
        ? `${Math.round(timeRemaining / 60)}h`
        : `${timeRemaining} min`;

      try {
        // Send push notification
        await sendPushToUser(code.userId, {
          title: '⚠️ Code d\'accès expire bientôt',
          body: `Votre code d'accès caisse expire dans ${timeRemainingText}`,
          data: {
            type: 'access_code_expiring',
            codeId: code.codeId,
            expiresAt: code.expiresAt?.toISOString(),
          },
        });

        // Send in-app notification
        await sendInAppNotification({
          userId: code.userId,
          type: 'ACCESS_CODE_EXPIRING',
          titre: '⚠️ Code d\'accès expire bientôt',
          message: `Votre code d'accès caisse${code.description ? ` (${code.description})` : ''} expire dans ${timeRemainingText}`,
          priorite: 'HIGH',
          referenceId: code.codeId,
          referenceType: 'caisse_security_code',
          expiresAt: code.expiresAt || undefined,
        });

        logger.debug({ userId: code.userId, codeId: code.codeId, timeRemaining }, 'Avertissement d\'expiration envoyé');
      } catch (notifErr) {
        logger.warn({ err: notifErr, userId: code.userId }, 'Erreur lors de l\'envoi de l\'avertissement d\'expiration');
      }
    }

    if (expiringCodes.length > 0) {
      logger.info({ count: expiringCodes.length }, 'Avertissements d\'expiration de codes envoyés');
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de l\'envoi des avertissements d\'expiration');
  }
}

/**
 * Démarrer le cron job de nettoyage
 */
export function startAccessCodeCleanupCron(): void {
  logger.info('Démarrage du job de nettoyage des codes d\'accès');

  // Exécuter immédiatement au démarrage
  runCodeCleanup();

  // Planifier les vérifications périodiques
  cleanupIntervalId = setInterval(runCodeCleanup, CLEANUP_INTERVAL_MS);
  warningIntervalId = setInterval(runExpiryWarnings, WARNING_CHECK_INTERVAL_MS);

  logger.info({
    cleanupIntervalMinutes: CLEANUP_INTERVAL_MS / 60000,
    warningIntervalMinutes: WARNING_CHECK_INTERVAL_MS / 60000,
  }, 'Jobs de nettoyage des codes d\'accès configurés');
}

/**
 * Arrêter le cron job de nettoyage
 */
export function stopAccessCodeCleanupCron(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  if (warningIntervalId) {
    clearInterval(warningIntervalId);
    warningIntervalId = null;
  }
  logger.info('Jobs de nettoyage des codes d\'accès arrêtés');
}
