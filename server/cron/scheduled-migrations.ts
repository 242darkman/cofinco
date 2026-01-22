import cron, { ScheduledTask } from "node-cron";
import { agencyMigrationService } from "../services/agency-migration";

let scheduledMigrationsCron: ScheduledTask | null = null;

/**
 * Cron job pour exécuter les migrations d'agence planifiées
 * S'exécute toutes les 5 minutes pour vérifier s'il y a des migrations à lancer
 */
export function startScheduledMigrationsCron() {
  if (scheduledMigrationsCron) {
    console.log("[ScheduledMigrations] Cron already running");
    return;
  }

  console.log("[ScheduledMigrations] Starting cron job (every 5 minutes)");

  // Exécution toutes les 5 minutes
  scheduledMigrationsCron = cron.schedule("*/5 * * * *", async () => {
    console.log("[ScheduledMigrations] Checking for scheduled migrations...");

    try {
      const migrationsToExecute = await agencyMigrationService.getScheduledMigrationsToExecute();

      if (migrationsToExecute.length === 0) {
        console.log("[ScheduledMigrations] No migrations to execute");
        return;
      }

      console.log(`[ScheduledMigrations] Found ${migrationsToExecute.length} migration(s) to execute`);

      for (const migration of migrationsToExecute) {
        console.log(`[ScheduledMigrations] Executing migration ${migration.reference} (${migration.id})`);

        try {
          // Exécuter la migration de manière asynchrone (fire & forget avec logging)
          agencyMigrationService.processMigration(migration.id).catch((error) => {
            console.error(`[ScheduledMigrations] Migration ${migration.id} failed:`, error);
          });

          console.log(`[ScheduledMigrations] Migration ${migration.reference} started`);
        } catch (error: any) {
          console.error(`[ScheduledMigrations] Failed to start migration ${migration.id}:`, error);
        }
      }
    } catch (error: any) {
      console.error("[ScheduledMigrations] Error checking scheduled migrations:", error);
    }
  });

  // Exécuter immédiatement au démarrage pour ne pas attendre 5 minutes
  runScheduledMigrationsCheck();
}

export function stopScheduledMigrationsCron() {
  if (scheduledMigrationsCron) {
    scheduledMigrationsCron.stop();
    scheduledMigrationsCron = null;
    console.log("[ScheduledMigrations] Cron stopped");
  }
}

/**
 * Exécution manuelle de la vérification
 */
export async function runScheduledMigrationsCheck() {
  console.log("[ScheduledMigrations] Manual check triggered");

  try {
    const migrationsToExecute = await agencyMigrationService.getScheduledMigrationsToExecute();

    if (migrationsToExecute.length === 0) {
      console.log("[ScheduledMigrations] No migrations to execute");
      return { executed: 0 };
    }

    console.log(`[ScheduledMigrations] Found ${migrationsToExecute.length} migration(s) to execute`);

    let executedCount = 0;
    for (const migration of migrationsToExecute) {
      try {
        agencyMigrationService.processMigration(migration.id).catch((error) => {
          console.error(`[ScheduledMigrations] Migration ${migration.id} failed:`, error);
        });
        executedCount++;
      } catch (error: any) {
        console.error(`[ScheduledMigrations] Failed to start migration ${migration.id}:`, error);
      }
    }

    return { executed: executedCount };
  } catch (error: any) {
    console.error("[ScheduledMigrations] Error:", error);
    return { executed: 0, error: error.message };
  }
}
