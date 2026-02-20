/**
 * Job périodique pour marquer les échéances en retard
 * S'exécute toutes les heures pour identifier et marquer les échéances non payées dont la date est passée
 */

import cron from 'node-cron';
import { markLateInstallments } from '../services/repayment-allocation-service';
import { createLogger } from '../lib/logger';
import { dispatchDomainEvent } from '../services/notifications/domain-events/event-registry';
import { db } from '../db';
import { credits, clients, users } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

const logger = createLogger('LateInstallmentsCron');

// Configuration du job
const CRON_SCHEDULE = '0 * * * *'; // Toutes les heures
const TIMEZONE = 'Africa/Brazzaville'; // Adapter selon le fuseau horaire

/**
 * Fonction principale du job
 */
async function runLateInstallmentsJob() {
  const startTime = Date.now();
  logger.info('Starting late installments marking job');

  try {
    // Exécuter le marquage des échéances en retard
    const { markedCount, creditIds } = await markLateInstallments();

    if (markedCount === 0) {
      logger.info('No installments to mark as late');
      return;
    }

    // Pour chaque crédit impacté, émettre un événement de domaine
    for (const creditId of creditIds) {
      try {
        // Récupérer les infos du crédit, client et user
        const creditInfo = await db.select({
          credit: credits,
          client: clients,
          user: users
        })
        .from(credits)
        .innerJoin(clients, eq(credits.clientId, clients.id))
        .innerJoin(users, eq(clients.userId, users.id))
        .where(eq(credits.id, creditId))
        .limit(1);

        if (creditInfo.length > 0) {
          const { credit, client, user } = creditInfo[0];

          // Émettre un événement pour les notifications
          dispatchDomainEvent({
            type: 'CREDIT_INSTALLMENT_LATE',
            data: {
              creditId,
              numeroCredit: credit.numeroCredit,
              clientId: client.id,
              clientName: `${user.prenom || ''} ${user.nom || ''}`.trim(),
              agenceId: credit.agenceId,
              metadata: {
                markedAt: new Date().toISOString()
              }
            },
            timestamp: new Date()
          });

          // Score event: incident retard
          const { recordScoreEvent } = await import('../services/scoring-engine');
          const today = new Date().toISOString().slice(0, 10);
          await recordScoreEvent({
            clientId: client.id,
            agenceId: credit.agenceId ?? undefined,
            eventType: 'INCIDENT_RETARD',
            refId: `late-${creditId}-${today}`,
            refType: 'credit',
            metadata: { creditId, numeroCredit: credit.numeroCredit },
          });
        }
      } catch (err) {
        logger.error({ err, creditId }, 'Failed to dispatch event for late credit');
      }
    }

    // Log de succès avec métriques
    const duration = Date.now() - startTime;
    logger.info({
      markedCount,
      affectedCredits: creditIds.length,
      duration
    }, 'Late installments job completed successfully');

    // Envoyer des métriques si un système de monitoring est en place
    try {
      const metrics = await import('../lib/metrics');
      if (metrics.lateInstallmentsMarked) {
        metrics.lateInstallmentsMarked.set(markedCount);
        metrics.lateCreditsCount.set(creditIds.length);
        metrics.lateInstallmentsJobDuration.observe(duration);
      }
    } catch (err) {
      // Ignorer si les métriques ne sont pas disponibles
    }

  } catch (error) {
    logger.error({ error }, 'Failed to run late installments job');
    
    // Envoyer une alerte si le job échoue
    try {
      dispatchDomainEvent({
        type: 'SYSTEM_JOB_FAILED',
        data: {
          jobName: 'late_installments_marking',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date()
      });
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch job failure event');
    }
  }
}

/**
 * Créer et démarrer le job cron
 */
export function startLateInstallmentsJob() {
  const job = cron.schedule(
    CRON_SCHEDULE,
    runLateInstallmentsJob,
    {
      timezone: TIMEZONE
    }
  );

  logger.info({ schedule: CRON_SCHEDULE, timezone: TIMEZONE }, 'Late installments job configured');
  
  return job;
}

/**
 * Exécuter le job manuellement (pour tests ou déclenchement manuel)
 */
export async function runLateInstallmentsJobManual() {
  logger.info('Manually triggering late installments job');
  await runLateInstallmentsJob();
}

// Export pour utilisation dans le scheduler principal
export default {
  name: 'late_installments_marking',
  schedule: CRON_SCHEDULE,
  timezone: TIMEZONE,
  handler: runLateInstallmentsJob,
  start: startLateInstallmentsJob
};