import cron from 'node-cron';
import { executeAutomaticTransfer, getComptesWithPendingTransfers } from '../services/automatic-transfers-service';
import { createLogger } from '../lib/logger';

const logger = createLogger('Cron:AutomaticTransfers');

let cronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Démarre le cron job pour les versements automatiques
 * Exécution quotidienne à 2h du matin
 */
export function startAutomaticTransfersCron() {
  // Exécuter tous les jours à 2h du matin
  cronJob = cron.schedule('0 2 * * *', async () => {
    logger.info('Demarrage du job de versements automatiques');

    try {
      // Récupérer tous les comptes avec versement auto à exécuter
      const comptesAvecVersement = await getComptesWithPendingTransfers();

      logger.info({ count: comptesAvecVersement.length }, `${comptesAvecVersement.length} transfert(s) a executer`);

      if (comptesAvecVersement.length === 0) {
        logger.info('Aucun transfert a executer');
        return;
      }

      let success = 0;
      let failed = 0;
      const errors: { compteId: string; error: string }[] = [];

      // Exécuter les transferts un par un
      for (const compte of comptesAvecVersement) {
        try {
          const result = await executeAutomaticTransfer(
            compte.id,
            'SYSTEM' // User ID système pour les cron jobs
          );

          if (result.success) {
            success++;
            logger.info({ compteId: compte.id, numeroCompte: compte.numeroCompte, mouvementId: result.mouvementId }, `Transfert reussi pour compte ${compte.numeroCompte}`);
          } else {
            failed++;
            errors.push({ compteId: compte.id, error: result.error || 'Erreur inconnue' });
            logger.error({ compteId: compte.id, numeroCompte: compte.numeroCompte, error: result.error }, `Echec pour compte ${compte.numeroCompte}`);
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
          errors.push({ compteId: compte.id, error: errorMessage });
          logger.error({ err: error, compteId: compte.id, numeroCompte: compte.numeroCompte }, `Exception pour compte ${compte.numeroCompte}`);
        }

        // Petite pause entre chaque transfert pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info({ success, failed }, `Termine: ${success} succes, ${failed} echecs`);

      if (errors.length > 0) {
        logger.info({ errors }, 'Details des echecs');
      }

    } catch (error) {
      logger.error({ err: error }, 'Erreur critique');
    }
  });

  logger.info('Cron job demarre (execution quotidienne a 2h du matin)');
}

/**
 * Arrête le cron job
 */
export function stopAutomaticTransfersCron() {
  if (cronJob) {
    cronJob.stop();
    logger.info('Cron job arrete');
  }
}

/**
 * Exécute manuellement le job (pour tests)
 */
export async function runAutomaticTransfersManually() {
  logger.info('Execution manuelle demarree');

  try {
    const comptesAvecVersement = await getComptesWithPendingTransfers();

    logger.info({ count: comptesAvecVersement.length }, `${comptesAvecVersement.length} transfert(s) a executer`);

    const results = [];

    for (const compte of comptesAvecVersement) {
      const result = await executeAutomaticTransfer(compte.id, 'SYSTEM');
      results.push({
        compteId: compte.id,
        numeroCompte: compte.numeroCompte,
        ...result
      });
    }

    return results;
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors de l\'execution manuelle');
    throw error;
  }
}
