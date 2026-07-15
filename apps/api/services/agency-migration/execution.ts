import { StatutTransaction } from "@shared/enum/status-constants";
import {
  agences,
  caisses,
  clients,
  coffresForts,
  comptes,
  contributionsTontine,
  credits,
  demandesCredit,
  dossiersCredit,
  employes,
  mouvementsFinanciers,
  sessionsCaisse,
  tontineCycles,
  tontines,
  tontineSchedules,
  tontineTurns,
  transfertsCoffreCaisse,
  userAgences,
  users,
  virementsProgrammes
} from "@shared/schema";
import {
  AGENCY_MIGRATION_MODE,
  agencyMigrations,
  MIGRATION_ENTITY_TYPE,
  MIGRATION_STATUS,
  migrationEntityLogs,
  type MigrationFinancials,
  type MigrationReport,
  type MigrationVolumetry
} from "@shared/schema/agency_migration";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { AccountingRuleNotFoundError, postGlForMouvement } from "../accounting-posting-service";
import {
  assertCoffreCanCredit,
  assertCoffreCanDebit,
  updateCoffreBalance,
  type GuardContext,
} from "../coffre/coffre-guard";
import { runPreFlightChecks } from "./checks";
import { batchInsertEntityLogs, broadcastMigrationStatus, generateChecksum, logAudit, updateMigrationStatus } from "./helpers";
import { logger, MigrationContext, MigrationError, StepLog } from "./types";
import { migrateClientData } from "./execution-donnees";
import { transferTreasuryAndCloseSource } from "./execution-tresorerie";

export async function processMigration(migrationId: string, ctx?: Partial<MigrationContext>): Promise<void> {
    logger.info({ migrationId }, 'Starting job');
    const startTime = Date.now();

    // Récupérer la migration
    let [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    // Allow retry of FAILED migrations: reset status, then proceed
    if (migration.statut === MIGRATION_STATUS.FAILED) {
      if (!migration.canRetry) {
        throw new MigrationError(
          "Migration échouée définitivement (nombre max de tentatives atteint)",
          "MAX_RETRIES_EXCEEDED"
        );
      }
      await db
        .update(agencyMigrations)
        .set({
          statut: MIGRATION_STATUS.PENDING,
          error: null,
          errorDetails: null,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(agencyMigrations.id, migrationId));
      [migration] = await db.select().from(agencyMigrations).where(eq(agencyMigrations.id, migrationId)).limit(1);
    } else if (migration.statut !== MIGRATION_STATUS.PENDING && migration.statut !== MIGRATION_STATUS.SCHEDULED) {
      throw new MigrationError(
        `Migration ne peut pas être exécutée (statut actuel: ${migration.statut})`,
        "INVALID_STATUS"
      );
    }

    const context: MigrationContext = {
      migration,
      userId: ctx?.userId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    };

    const logs: StepLog[] = [];
    const warnings: string[] = [];
    let volumetry: MigrationVolumetry = {
      clients: 0,
      comptes: 0,
      credits: 0,
      demandesCredit: 0,
      tontines: 0,
      employes: 0,
      sessionsCaisse: 0,
      mouvementsFinanciers: 0,
      operationsCaisse: 0,
      virementsProgrammes: 0,
      dossiersCredit: 0,
      membresTontine: 0,
      contributionsTontine: 0,
      tontineCycles: 0,
      tontineTurns: 0,
      tontineSchedules: 0,
      transfertsCoffreCaisse: 0,
    };
    let financials: MigrationFinancials = {
      soldesCoffresTransferes: 0,
      totalSoldesComptes: 0,
      totalCreditsEnCours: 0,
      totalDemandesEnAttente: 0,
    };

    const logStep = (step: string, success: boolean, count?: number, details?: any, durationMs?: number) => {
      const log: StepLog = {
        step,
        timestamp: new Date().toISOString(),
        success,
        count,
        details,
        durationMs,
      };
      logs.push(log);
      logger.info({ step, success, count }, 'Step completed');
    };

    try {
      // Verrouiller la migration
      await db
        .update(agencyMigrations)
        .set({
          statut: MIGRATION_STATUS.PRE_FLIGHT_CHECK,
          locked: true,
          lockedAt: new Date(),
          executionStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agencyMigrations.id, migrationId));

      await logAudit(context, "STARTED", migration.statut, MIGRATION_STATUS.PRE_FLIGHT_CHECK, {
        startTime: new Date().toISOString(),
      });
      broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "STARTED", { reference: migration.reference });

      // ============================================
      // ÉTAPE 0: PRE-FLIGHT CHECKS
      // ============================================
      const stepStartPre = Date.now();
      await updateMigrationStatus(migrationId, MIGRATION_STATUS.PRE_FLIGHT_CHECK, 5, logs, "Pre-flight checks");

      const preFlightResult = await runPreFlightChecks(
        migrationId,
        migration.sourceAgencyId,
        migration.targetClientsAgencyId,
        ctx?.userId,
        migration.targetEmployeesAgencyId,
        migration.targetTreasuryAgencyId,
      );

      if (preFlightResult.blockingFailed) {
        const failedChecks = preFlightResult.checks
          .filter((c: any) => !c.passed && c.blocking)
          .map((c: any) => c.message)
          .join(", ");

        throw new MigrationError(
          `Pre-flight checks échoués: ${failedChecks}`,
          "PRE_FLIGHT_FAILED",
          preFlightResult.checks
        );
      }

      logStep("Pre-flight checks", true, undefined, preFlightResult.checks, Date.now() - stepStartPre);

      // ============================================
      // TRANSACTION ATOMIQUE POUR TOUTES LES MIGRATIONS
      // ============================================
      await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 10, logs, "Début transaction");

      await db.transaction(async (tx: any) => {
        // Advisory lock: prevent concurrent migrations on the same source agency
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${migration.sourceAgencyId}))`);

        // Verify no other migration is already PROCESSING for this agency
        const [activeMigration] = await tx
          .select({ id: agencyMigrations.id })
          .from(agencyMigrations)
          .where(and(
            eq(agencyMigrations.sourceAgencyId, migration.sourceAgencyId),
            eq(agencyMigrations.statut, MIGRATION_STATUS.PROCESSING),
            ne(agencyMigrations.id, migrationId)
          ))
          .limit(1);

        if (activeMigration) {
          throw new MigrationError(
            "Une autre migration est déjà en cours pour cette agence",
            "CONCURRENT_MIGRATION"
          );
        }

        // ÉTAPES 1 à 5e — données clients (module execution-donnees)
        await migrateClientData(tx, migration, migrationId, volumetry, financials, logs, logStep);

        // ============================================
        // ÉTAPE 6: MIGRATION DES EMPLOYÉS (65-75%)
        // ============================================
        if (migration.targetEmployeesAgencyId) {
          const stepStartEmployes = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 65, logs, "Migration employés");

          // Snapshot userAgences before migration
          const userAgencesToMigrate = await tx
            .select({ id: userAgences.id, userId: userAgences.userId, agenceId: userAgences.agenceId, actif: userAgences.actif })
            .from(userAgences)
            .where(and(eq(userAgences.agenceId, migration.sourceAgencyId), eq(userAgences.actif, true)));

          await tx
            .update(userAgences)
            .set({
              agenceId: migration.targetEmployeesAgencyId,
              updatedAt: new Date(),
            })
            .where(and(eq(userAgences.agenceId, migration.sourceAgencyId), eq(userAgences.actif, true)));

          // Snapshot employes before migration
          const employesToMigrate = await tx
            .select({ id: employes.id, userId: employes.userId, matricule: employes.matricule, agenceId: employes.agenceId, statut: employes.statut })
            .from(employes)
            .where(eq(employes.agenceId, migration.sourceAgencyId));

          await tx
            .update(employes)
            .set({
              agenceId: migration.targetEmployeesAgencyId,
              updatedAt: new Date(),
            })
            .where(eq(employes.agenceId, migration.sourceAgencyId));

          volumetry.employes = userAgencesToMigrate.length;

          // Batch entity logs with snapshotBefore
          await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.EMPLOYE,
            userAgencesToMigrate, migration.sourceAgencyId, migration.targetEmployeesAgencyId!,
            (ua: any) => ({ id: ua.id, userId: ua.userId, agenceId: ua.agenceId, actif: ua.actif })
          );

          logStep("Migration employés", true, employesToMigrate.length, undefined, Date.now() - stepStartEmployes);
        }


        // ÉTAPES 7/7b/7c — trésorerie (module execution-tresorerie)
        await transferTreasuryAndCloseSource(tx, migration, migrationId, ctx, financials, logs, logStep);

        // ============================================
        // ÉTAPE 8: ARCHIVAGE DE L'AGENCE SOURCE (90-100%)
        // ============================================
        const stepStartArchive = Date.now();
        await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 90, logs, "Archivage agence source");

        await tx
          .update(agences)
          .set({
            statut: AGENCY_MIGRATION_MODE.CLOSED,
            notes: `Fermée suite à migration ${migration.reference} le ${new Date().toISOString()}. ` +
              `Clients → ${migration.targetClientsAgencyId || "N/A"}, ` +
              `Employés → ${migration.targetEmployeesAgencyId || "N/A"}, ` +
              `Trésorerie → ${migration.targetTreasuryAgencyId || "N/A"}`,
            updatedAt: new Date(),
          })
          .where(eq(agences.id, migration.sourceAgencyId));

        logStep("Archivage agence source", true, undefined, undefined, Date.now() - stepStartArchive);
      });

      // ============================================
      // GÉNÉRATION DU RAPPORT FINAL
      // ============================================
      const endTime = Date.now();
      const report: MigrationReport = {
        volumetry,
        financials,
        checksum: generateChecksum({ volumetry, financials, migrationId }),
        durationMs: endTime - startTime,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        warnings,
        steps: logs.map((l) => ({
          name: l.step,
          count: l.count || 0,
          durationMs: l.durationMs || 0,
          success: l.success,
        })),
      };

      // Marquer comme terminé
      await db
        .update(agencyMigrations)
        .set({
          statut: MIGRATION_STATUS.COMPLETED,
          progress: 100,
          logs,
          report,
          reportGeneratedAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agencyMigrations.id, migrationId));

      await logAudit(context, "COMPLETED", MIGRATION_STATUS.PROCESSING, MIGRATION_STATUS.COMPLETED, {
        report,
        durationMs: endTime - startTime,
      });

      logger.info({ migrationId, durationMs: endTime - startTime }, 'Job completed');
      broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "COMPLETED", {
        reference: migration.reference,
        durationMs: endTime - startTime,
      });
    } catch (error: any) {
      logger.error({ err: error, migrationId }, 'Job failed');

      const canRetry = migration.retryCount < migration.maxRetries;

      await db
        .update(agencyMigrations)
        .set({
          statut: MIGRATION_STATUS.FAILED,
          error: error.message,
          errorDetails: {
            code: error.code,
            stack: error.stack,
            details: error.details,
          },
          logs,
          canRetry,
          retryCount: migration.retryCount + 1,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agencyMigrations.id, migrationId));

      await logAudit(context, "FAILED", MIGRATION_STATUS.PROCESSING, MIGRATION_STATUS.FAILED, {
        error: error.message,
        code: error.code,
      });
      broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "FAILED", {
        error: error.message,
        code: error.code,
      });

      throw error;
    }
  }