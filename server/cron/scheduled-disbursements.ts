import cron from 'node-cron';
import { executeScheduledDisbursement, getCreditsWithPendingDisbursement } from '../services/scheduled-disbursements-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:ScheduledDisbursements');

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Démarre le cron job pour les décaissements programmés
 * Exécution quotidienne à 9h du matin
 */
export function startScheduledDisbursementsCron() {
  // Exécuter tous les jours à 9h du matin
  cronJob = cron.schedule('0 9 * * *', async () => {
    logger.info('Demarrage du job de decaissements programmes');

    try {
      // Récupérer tous les crédits avec décaissement programmé à exécuter
      const creditsToDisburse = await getCreditsWithPendingDisbursement();

      logger.info({ count: creditsToDisburse.length }, `${creditsToDisburse.length} decaissement(s) a executer`);

      if (creditsToDisburse.length === 0) {
        logger.info('Aucun decaissement a executer');
        return;
      }

      let success = 0;
      let failed = 0;
      const errors: { creditId: string; numeroCredit: string; error: string }[] = [];

      // Exécuter les décaissements un par un
      for (const credit of creditsToDisburse) {
        try {
          const result = await executeScheduledDisbursement(
            credit.id,
            'SYSTEM' // User ID système pour les cron jobs
          );

          if (result.success) {
            success++;
            logger.info({ creditId: credit.id, numeroCredit: credit.numeroCredit, mouvementId: result.mouvementId }, `Decaissement reussi pour credit ${credit.numeroCredit}`);
          } else {
            failed++;
            errors.push({
              creditId: credit.id,
              numeroCredit: credit.numeroCredit,
              error: result.error || 'Erreur inconnue'
            });
            logger.error({ creditId: credit.id, numeroCredit: credit.numeroCredit, error: result.error }, `Echec pour credit ${credit.numeroCredit}`);
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
          errors.push({
            creditId: credit.id,
            numeroCredit: credit.numeroCredit,
            error: errorMessage
          });
          logger.error({ err: error, creditId: credit.id, numeroCredit: credit.numeroCredit }, `Exception pour credit ${credit.numeroCredit}`);
        }

        // Petite pause entre chaque décaissement pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info({ success, failed }, `Termine: ${success} succes, ${failed} echecs`);

      if (errors.length > 0) {
        logger.info({ errors }, 'Details des echecs');
      }

    } catch (error) {
      logger.error({ err: error }, 'Erreur critique');
    }
  });

  logger.info('Cron job demarre (execution quotidienne a 9h du matin)');
}

/**
 * Arrête le cron job
 */
export function stopScheduledDisbursementsCron() {
  if (cronJob) {
    cronJob.stop();
    logger.info('Cron job arrete');
  }
}

/**
 * Exécute manuellement le job (pour tests)
 */
export async function runScheduledDisbursementsManually() {
  logger.info('Execution manuelle demarree');

  try {
    const creditsToDisburse = await getCreditsWithPendingDisbursement();

    logger.info({ count: creditsToDisburse.length }, `${creditsToDisburse.length} decaissement(s) a executer`);

    const results = [];

    for (const credit of creditsToDisburse) {
      const result = await executeScheduledDisbursement(credit.id, 'SYSTEM');
      results.push({
        creditId: credit.id,
        numeroCredit: credit.numeroCredit,
        ...result
      });
    }

    return results;
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de l\'execution manuelle');
    throw error;
  }
}
