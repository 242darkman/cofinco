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
  console.log(`[CRON] Vérification des sessions expirées (timeout: ${SESSION_TIMEOUT_HOURS}h)...`);

  try {
    // 1. Nettoyage des sessions orphelines (Technique)
    await cleanupOrphanSessions();

    // 2. Nettoyage des sessions de caisse expirées (Business)
    const closedSessions = await sessionService.closeExpiredSessions(SESSION_TIMEOUT_HOURS);

    if (closedSessions.length > 0) {
      console.log(`[CRON] ${closedSessions.length} session(s) fermée(s) automatiquement:`);
      closedSessions.forEach((s) => {
        console.log(`  - Session ${s.sessionId} (Caisse: ${s.caisseId}, inactive: ${s.hoursInactive}h)`);
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
    } else {
      console.log("[CRON] Aucune session expirée trouvée.");
    }
  } catch (error) {
    console.error("[CRON] Erreur lors du nettoyage des sessions:", error);
  }
}

/**
 * Vérifie les sessions à risque et envoie des alertes
 */
async function checkRiskySessions(): Promise<void> {
  try {
    const riskySessions = await sessionService.getRiskySessions();

    if (riskySessions.length > 0) {
      console.log(`[CRON] ${riskySessions.length} session(s) à risque détectée(s):`);

      const wsInstance = getWsInstance();

      for (const session of riskySessions) {
        console.log(
          `  - ${session.caisseNom} (${session.caissierNom}): ${session.hoursInactive}h inactive [${session.riskLevel}]`
        );

        // Envoyer une alerte WebSocket pour les sessions critiques
        if (session.riskLevel === "CRITICAL" && wsInstance) {
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
    console.error("[CRON] Erreur lors de la vérification des sessions à risque:", error);
  }
}

/**
 * Démarre les jobs de nettoyage périodiques
 */
export function startSessionCleanupCron(): void {
  console.log("[CRON] Démarrage du job de nettoyage des sessions...");

  // Exécuter immédiatement au démarrage
  runSessionCleanup();
  checkRiskySessions();

  // Programmer les exécutions périodiques
  cleanupIntervalId = setInterval(runSessionCleanup, CHECK_INTERVAL_MS);
  riskyCheckIntervalId = setInterval(checkRiskySessions, RISKY_SESSION_CHECK_INTERVAL_MS);

  console.log(`[CRON] Job de nettoyage configuré:`);
  console.log(`  - Fermeture sessions expirées: toutes les ${CHECK_INTERVAL_MS / 60000} minutes`);
  console.log(`  - Vérification sessions à risque: toutes les ${RISKY_SESSION_CHECK_INTERVAL_MS / 60000} minutes`);
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
  console.log("[CRON] Jobs de nettoyage arrêtés.");
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
