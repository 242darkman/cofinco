import cron, { ScheduledTask } from "node-cron";
import { agencyMigrationService } from "../services/agency-migration";
import { createLogger } from "../lib/logger";

const logger = createLogger('Cron:ScheduledMigrations');

let scheduledMigrationsCron: ScheduledTask | null = null;

/**
 * Cron job pour exécuter les migrations d'agence planifiées
 * S'exécute toutes les 5 minutes pour vérifier s'il y a des migrations à lancer
 */
export function startScheduledMigrationsCron() {
  if (scheduledMigrationsCron) {
    logger.info('Cron already running');
    return;
  }

  logger.info('Starting cron job (every 5 minutes)');

  // Exécution toutes les 5 minutes
  scheduledMigrationsCron = cron.schedule("*/5 * * * *", async () => {
    logger.info('Checking for scheduled migrations');

    try {
      const migrationsToExecute = await agencyMigrationService.getScheduledMigrationsToExecute();

      if (migrationsToExecute.length === 0) {
        logger.info('No migrations to execute');
        return;
      }

      logger.info({ count: migrationsToExecute.length }, `Found ${migrationsToExecute.length} migration(s) to execute`);

      for (const migration of migrationsToExecute) {
        logger.info({ migrationId: migration.id, reference: migration.reference }, `Executing migration ${migration.reference}`);

        try {
          // Exécuter la migration de manière asynchrone (fire & forget avec logging)
          agencyMigrationService.processMigration(migration.id).catch((error) => {
            logger.error({ err: error, migrationId: migration.id }, `Migration ${migration.id} failed`);
          });

          logger.info({ migrationId: migration.id, reference: migration.reference }, `Migration ${migration.reference} started`);
        } catch (error: any) {
          logger.error({ err: error, migrationId: migration.id }, `Failed to start migration ${migration.id}`);
        }
      }
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking scheduled migrations');
    }
  });

  // Exécuter immédiatement au démarrage pour ne pas attendre 5 minutes
  runScheduledMigrationsCheck();
}

export function stopScheduledMigrationsCron() {
  if (scheduledMigrationsCron) {
    scheduledMigrationsCron.stop();
    scheduledMigrationsCron = null;
    logger.info('Cron stopped');
  }
}

/**
 * Exécution manuelle de la vérification
 */
export async function runScheduledMigrationsCheck() {
  logger.info('Manual check triggered');

  try {
    const migrationsToExecute = await agencyMigrationService.getScheduledMigrationsToExecute();

    if (migrationsToExecute.length === 0) {
      logger.info('No migrations to execute');
      return { executed: 0 };
    }

    logger.info({ count: migrationsToExecute.length }, `Found ${migrationsToExecute.length} migration(s) to execute`);

    let executedCount = 0;
    for (const migration of migrationsToExecute) {
      try {
        agencyMigrationService.processMigration(migration.id).catch((error) => {
          logger.error({ err: error, migrationId: migration.id }, `Migration ${migration.id} failed`);
        });
        executedCount++;
      } catch (error: any) {
        logger.error({ err: error, migrationId: migration.id }, `Failed to start migration ${migration.id}`);
      }
    }

    return { executed: executedCount };
  } catch (error: any) {
    logger.error({ err: error }, 'Error');
    return { executed: 0, error: error.message };
  }
}
