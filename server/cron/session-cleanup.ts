/**
 * Cron Job: Nettoyage des sessions de caisse expirées
 *
 * Ce job s'exécute périodiquement pour:
 * - Fermer automatiquement les sessions inactives depuis trop longtemps
 * - Envoyer des alertes pour les sessions à risque
 * - Notifier les admins des écarts significatifs
 */

import * as sessionService from "../services/caisse/session-service";
import { cleanupOrphanSessions } from "../session-tracker";
import { getWsInstance } from "../ws-server";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:SessionCleanup');

// Configuration
const SESSION_TIMEOUT_HOURS = 12; // Fermer les sessions après 12h d'inactivité
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Vérifier toutes les heures
const RISKY_SESSION_CHECK_INTERVAL_MS = 15 * 60 * 1000; // Vérifier sessions à risque toutes les 15 min

let cleanupIntervalId: NodeJS.Timeout | null = null;
let riskyCheckIntervalId: NodeJS.Timeout | null = null;

/**
 * Ferme les sessions expirées et notifie via WebSocket
 */
async function runSessionCleanup(): Promise<void> {
  logger.info({ timeoutHours: SESSION_TIMEOUT_HOURS }, 'Vérification des sessions expirées...');

  try {
    // 1. Nettoyage des sessions orphelines (Technique)
    await cleanupOrphanSessions();

    // 2. Nettoyage des sessions de caisse expirées (Business)
    const closedSessions = await sessionService.closeExpiredSessions(SESSION_TIMEOUT_HOURS);

    if (closedSessions.length > 0) {
      logger.info({ count: closedSessions.length }, 'Sessions fermées automatiquement');
      closedSessions.forEach((s) => {
        logger.debug({ sessionId: s.sessionId, caisseId: s.caisseId, hoursInactive: s.hoursInactive }, 'Session fermée');
      });

      // Notifier via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        closedSessions.forEach((s) => {
          wsInstance.broadcast({
            type: "SESSION_TIMEOUT",
            payload: {
              sessionId: s.sessionId,
              caisseId: s.caisseId,
              caissierId: s.caissierId,
              hoursInactive: s.hoursInactive,
            },
          });
        });
        wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      // Domain event: sessions force closed
      dispatchDomainEvent({
        type: "SESSION_FORCE_CLOSED",
        data: {
          sessions: closedSessions.map((s) => ({
            sessionId: s.sessionId,
            caisseId: s.caisseId,
            caissierId: s.caissierId,
            hoursInactive: s.hoursInactive,
          })),
        },
        timestamp: new Date(),
      });
    } else {
      logger.debug('Aucune session expirée trouvée');
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors du nettoyage des sessions');
  }
}

/**
 * Vérifie les sessions à risque et envoie des alertes
 */
async function checkRiskySessions(): Promise<void> {
  try {
    const riskySessions = await sessionService.getRiskySessions();

    if (riskySessions.length > 0) {
      logger.warn({ count: riskySessions.length }, 'Sessions à risque détectées');

      const wsInstance = getWsInstance();

      for (const session of riskySessions) {
        logger.warn({
          caisseNom: session.caisseNom,
          caissierNom: session.caissierNom,
          hoursInactive: session.hoursInactive,
          riskLevel: session.riskLevel
        }, 'Session à risque');

        // Envoyer une alerte WebSocket pour les sessions à risque (WARNING + CRITICAL)
        if (wsInstance) {
          wsInstance.broadcast({
            type: "SESSION_RISK_ALERT",
            payload: {
              sessionId: session.sessionId,
              caisseNom: session.caisseNom,
              caissierNom: session.caissierNom,
              hoursInactive: session.hoursInactive,
              riskLevel: session.riskLevel,
              soldeCurrent: session.soldeCurrent,
            },
          });
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de la vérification des sessions à risque');
  }
}

/**
 * Démarre les jobs de nettoyage périodiques
 */
export function startSessionCleanupCron(): void {
  logger.info('Démarrage du job de nettoyage des sessions...');

  // Exécuter immédiatement au démarrage
  runSessionCleanup();
  checkRiskySessions();

  // Programmer les exécutions périodiques
  cleanupIntervalId = setInterval(runSessionCleanup, CHECK_INTERVAL_MS);
  riskyCheckIntervalId = setInterval(checkRiskySessions, RISKY_SESSION_CHECK_INTERVAL_MS);

  logger.info({
    cleanupIntervalMinutes: CHECK_INTERVAL_MS / 60000,
    riskyCheckIntervalMinutes: RISKY_SESSION_CHECK_INTERVAL_MS / 60000
  }, 'Job de nettoyage configuré');
}

/**
 * Arrête les jobs de nettoyage
 */
export function stopSessionCleanupCron(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  if (riskyCheckIntervalId) {
    clearInterval(riskyCheckIntervalId);
    riskyCheckIntervalId = null;
  }
  logger.info('Jobs de nettoyage arrêtés');
}

/**
 * Exécute manuellement le nettoyage (pour tests ou appel admin)
 */
export async function runCleanupNow(): Promise<{
  closedCount: number;
  riskyCount: number;
}> {
  await runSessionCleanup();
  const riskySessions = await sessionService.getRiskySessions();
  const closedSessions = await sessionService.closeExpiredSessions(SESSION_TIMEOUT_HOURS);

  return {
    closedCount: closedSessions.length,
    riskyCount: riskySessions.length,
  };
}
