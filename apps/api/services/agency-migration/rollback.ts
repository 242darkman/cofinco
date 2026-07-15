import { StatutTransaction } from "@shared/enum/status-constants";
import {
  agences,
  clients,
  comptes,
  contributionsTontine,
  credits,
  demandesCredit,
  dossiersCredit,
  employes,
  mouvementsFinanciers,
  sessionsCaisse,
  tontineCycles,
  tontineSchedules,
  tontineTurns,
  tontines,
  transfertsCoffreCaisse,
  userAgences,
  virementsProgrammes
} from "@shared/schema";
import {
  AGENCY_MIGRATION_MODE,
  MIGRATION_ENTITY_TYPE,
  MIGRATION_STATUS,
  agencyMigrations,
  migrationEntityLogs
} from "@shared/schema/agency_migration";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { AccountingRuleNotFoundError, postGlForMouvement } from "../accounting-posting-service";
import {
  assertCoffreCanCredit,
  assertCoffreCanDebit,
  updateCoffreBalance,
  type GuardContext,
} from "../coffre/coffre-guard";
import { broadcastMigrationStatus, logAudit } from "./helpers";
import { MigrationContext, MigrationError, logger } from "./types";

export async function rollbackMigration(
    migrationId: string,
    ctx?: Partial<MigrationContext>
  ): Promise<{ success: boolean; report: any }> {
    // 1. Vérifier la migration
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    if (migration.statut !== MIGRATION_STATUS.COMPLETED) {
      throw new MigrationError(
        `Seules les migrations complétées peuvent être annulées (statut actuel: ${migration.statut})`,
        "INVALID_STATUS"
      );
    }

    // 2. Vérifier le délai de 24h
    if (migration.completedAt) {
      const hoursSinceCompletion = (Date.now() - new Date(migration.completedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceCompletion > 24) {
        throw new MigrationError(
          `Le rollback n'est possible que dans les 24h suivant la completion (${Math.round(hoursSinceCompletion)}h écoulées)`,
          "ROLLBACK_EXPIRED"
        );
      }
    }

    // 3. Récupérer tous les entity logs (ordre DESC pour reverse)
    const entityLogs = await db
      .select()
      .from(migrationEntityLogs)
      .where(and(
        eq(migrationEntityLogs.migrationId, migrationId),
        eq(migrationEntityLogs.success, true),
      ))
      .orderBy(desc(migrationEntityLogs.migratedAt));

    // 4. Map entity types → table references pour le rollback
    const entityTableMap: Record<string, any> = {
      [MIGRATION_ENTITY_TYPE.CLIENT]: clients,
      [MIGRATION_ENTITY_TYPE.COMPTE]: comptes,
      [MIGRATION_ENTITY_TYPE.CREDIT]: credits,
      [MIGRATION_ENTITY_TYPE.DEMANDE_CREDIT]: demandesCredit,
      [MIGRATION_ENTITY_TYPE.DOSSIER_CREDIT]: dossiersCredit,
      [MIGRATION_ENTITY_TYPE.TONTINE]: tontines,
      // MEMBRE_TONTINE has no agenceId — follows parent tontine via FK
      [MIGRATION_ENTITY_TYPE.CONTRIBUTION_TONTINE]: contributionsTontine,
      [MIGRATION_ENTITY_TYPE.TONTINE_CYCLE]: tontineCycles,
      [MIGRATION_ENTITY_TYPE.TONTINE_TURN]: tontineTurns,
      [MIGRATION_ENTITY_TYPE.TONTINE_SCHEDULE]: tontineSchedules,
      [MIGRATION_ENTITY_TYPE.MOUVEMENT_FINANCIER]: mouvementsFinanciers,
      [MIGRATION_ENTITY_TYPE.SESSION_CAISSE]: sessionsCaisse,
      [MIGRATION_ENTITY_TYPE.TRANSFERT_COFFRE_CAISSE]: transfertsCoffreCaisse,
      [MIGRATION_ENTITY_TYPE.VIREMENT_PROGRAMME]: virementsProgrammes,
    };

    const rollbackReport: {
      entitiesRolledBack: Record<string, number>;
      treasuryReversed: boolean;
      agencyRestored: boolean;
      durationMs: number;
    } = {
      entitiesRolledBack: {},
      treasuryReversed: false,
      agencyRestored: false,
      durationMs: 0,
    };

    const startTime = Date.now();

    try {
      // Marquer en cours
      await db
        .update(agencyMigrations)
        .set({ statut: MIGRATION_STATUS.PROCESSING, progress: 0, updatedAt: new Date() })
        .where(eq(agencyMigrations.id, migrationId));

      await db.transaction(async (tx: any) => {
        // Advisory lock pour empêcher opérations concurrentes
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${migration.sourceAgencyId}))`);

        // 5a. Reverse la trésorerie en premier (si applicable)
        const treasuryLog = entityLogs.find(l => l.entityType === MIGRATION_ENTITY_TYPE.TREASURY_TRANSFER);
        if (treasuryLog?.snapshotBefore) {
          const snapshot = treasuryLog.snapshotBefore as {
            sourceCoffreId: string;
            targetCoffreId: string;
            amount: number;
            reference: string;
          };

          const guardCtx: GuardContext = {
            userId: ctx?.userId || "SYSTEM",
            operationType: "MIGRATION_ROLLBACK_TREASURY",
          };

          // Débiter le coffre cible (qui avait reçu les fonds)
          await assertCoffreCanDebit(tx, snapshot.targetCoffreId, snapshot.amount, guardCtx);
          // Créditer le coffre source (qui avait été débité)
          await assertCoffreCanCredit(tx, snapshot.sourceCoffreId, snapshot.amount, guardCtx);

          // Updates atomiques inversés
          // Bypass BALANCE_GUARD: mouvements are created right after, within the same tx
          await tx.execute(sql`SELECT set_config('app.balance_guard_bypass', 'true', true)`);
          await updateCoffreBalance(tx, snapshot.targetCoffreId, -snapshot.amount);
          await updateCoffreBalance(tx, snapshot.sourceCoffreId, +snapshot.amount);

          // Créer mouvements financiers inverses
          const reverseRef = `ROLLBACK-${snapshot.reference || Date.now()}`;

          const [rollbackDebit] = await tx.insert(mouvementsFinanciers).values({
            reference: `${reverseRef}-D`,
            dateOperation: new Date(),
            montant: snapshot.amount.toString(),
            sens: "DEBIT",
            statut: StatutTransaction.POSTED,
            sourceModule: "SYSTEME",
            agenceId: migration.targetTreasuryAgencyId!,
            createdBy: ctx?.userId,
            metadata: {
              type: "MIGRATION_ROLLBACK",
              migrationId,
              coffreId: snapshot.targetCoffreId,
              direction: "DEBIT",
              originalReference: snapshot.reference,
            },
          }).returning();

          const [rollbackCredit] = await tx.insert(mouvementsFinanciers).values({
            reference: `${reverseRef}-C`,
            dateOperation: new Date(),
            montant: snapshot.amount.toString(),
            sens: "CREDIT",
            statut: StatutTransaction.POSTED,
            sourceModule: "SYSTEME",
            agenceId: migration.sourceAgencyId,
            createdBy: ctx?.userId,
            metadata: {
              type: "MIGRATION_ROLLBACK",
              migrationId,
              coffreId: snapshot.sourceCoffreId,
              direction: "CREDIT",
              originalReference: snapshot.reference,
            },
          }).returning();

          // Post GL entries for rollback mouvements (non-blocking)
          if (migration.targetTreasuryAgencyId) {
            try {
              const glResult = await postGlForMouvement(tx, rollbackDebit, migration.targetTreasuryAgencyId, ctx?.userId, {
                operationType: 'MIGRATION_ROLLBACK',
                migrationId,
              });
              if (glResult) {
                logger.info({ mouvementId: rollbackDebit.id }, 'GL posted for rollback debit');
              }
              await tx
                .update(mouvementsFinanciers)
                .set({ glPostingStatus: "POSTED" })
                .where(eq(mouvementsFinanciers.id, rollbackDebit.id));
            } catch (glError: unknown) {
              const message = glError instanceof Error ? glError.message : "Unknown GL error";
              const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
              await tx
                .update(mouvementsFinanciers)
                .set({ glPostingStatus: status, glPostingError: message })
                .where(eq(mouvementsFinanciers.id, rollbackDebit.id));
            }
          }
          if (migration.sourceAgencyId) {
            try {
              const glResult = await postGlForMouvement(tx, rollbackCredit, migration.sourceAgencyId, ctx?.userId, {
                operationType: 'MIGRATION_ROLLBACK',
                migrationId,
              });
              if (glResult) {
                logger.info({ mouvementId: rollbackCredit.id }, 'GL posted for rollback credit');
              }
              await tx
                .update(mouvementsFinanciers)
                .set({ glPostingStatus: "POSTED" })
                .where(eq(mouvementsFinanciers.id, rollbackCredit.id));
            } catch (glError: unknown) {
              const message = glError instanceof Error ? glError.message : "Unknown GL error";
              const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
              await tx
                .update(mouvementsFinanciers)
                .set({ glPostingStatus: status, glPostingError: message })
                .where(eq(mouvementsFinanciers.id, rollbackCredit.id));
            }
          }

          rollbackReport.treasuryReversed = true;
        }

        // 5b. Reverse toutes les entités (groupées par type pour performance)
        const entityLogsByType = new Map<string, typeof entityLogs>();
        for (const log of entityLogs) {
          if (log.entityType === MIGRATION_ENTITY_TYPE.TREASURY_TRANSFER) continue; // Already handled
          if (!entityLogsByType.has(log.entityType)) {
            entityLogsByType.set(log.entityType, []);
          }
          entityLogsByType.get(log.entityType)!.push(log);
        }

        // Reverse en ordre inverse de migration (enfants d'abord, parents en dernier)
        const reverseOrder = [
          MIGRATION_ENTITY_TYPE.VIREMENT_PROGRAMME,
          MIGRATION_ENTITY_TYPE.TRANSFERT_COFFRE_CAISSE,
          MIGRATION_ENTITY_TYPE.SESSION_CAISSE,
          MIGRATION_ENTITY_TYPE.MOUVEMENT_FINANCIER,
          MIGRATION_ENTITY_TYPE.TONTINE_SCHEDULE,
          MIGRATION_ENTITY_TYPE.TONTINE_TURN,
          MIGRATION_ENTITY_TYPE.TONTINE_CYCLE,
          MIGRATION_ENTITY_TYPE.CONTRIBUTION_TONTINE,
          // MEMBRE_TONTINE has no agenceId — follows parent tontine
          MIGRATION_ENTITY_TYPE.TONTINE,
          MIGRATION_ENTITY_TYPE.DOSSIER_CREDIT,
          MIGRATION_ENTITY_TYPE.DEMANDE_CREDIT,
          MIGRATION_ENTITY_TYPE.CREDIT,
          MIGRATION_ENTITY_TYPE.COMPTE,
          MIGRATION_ENTITY_TYPE.CLIENT,
          MIGRATION_ENTITY_TYPE.EMPLOYE,
        ];

        for (const entityType of reverseOrder) {
          const logsForType = entityLogsByType.get(entityType);
          if (!logsForType || logsForType.length === 0) continue;

          const table = entityTableMap[entityType];

          if (entityType === MIGRATION_ENTITY_TYPE.EMPLOYE) {
            // Employés: reverse userAgences + employes
            const entityIds = logsForType.map(l => l.entityId);
            const previousAgencyId = logsForType[0].previousAgencyId;

            await tx.update(userAgences)
              .set({ agenceId: previousAgencyId, updatedAt: new Date() })
              .where(inArray(userAgences.id, entityIds));

            await tx.update(employes)
              .set({ agenceId: previousAgencyId, updatedAt: new Date() })
              .where(eq(employes.agenceId, logsForType[0].newAgencyId));
          } else if (table) {
            // Batch update par previousAgencyId (souvent identique pour tous les logs d'un type)
            const byPreviousAgency = new Map<string, string[]>();
            for (const log of logsForType) {
              if (!byPreviousAgency.has(log.previousAgencyId)) {
                byPreviousAgency.set(log.previousAgencyId, []);
              }
              byPreviousAgency.get(log.previousAgencyId)!.push(log.entityId);
            }

            for (const [previousAgencyId, entityIds] of Array.from(byPreviousAgency)) {
              // Batch in chunks of 500 to avoid oversized IN clauses
              for (let i = 0; i < entityIds.length; i += 500) {
                const chunk = entityIds.slice(i, i + 500);
                await tx.update(table)
                  .set({ agenceId: previousAgencyId, updatedAt: new Date() } as any)
                  .where(inArray(table.id, chunk));
              }
            }
          }

          rollbackReport.entitiesRolledBack[entityType] = logsForType.length;
        }

        // 5c. Restaurer l'agence source à ACTIVE
        await tx.update(agences)
          .set({
            statut: AGENCY_MIGRATION_MODE.ACTIVE,
            notes: `Restaurée suite au rollback de la migration ${migration.reference} le ${new Date().toISOString()}`,
            updatedAt: new Date(),
          })
          .where(eq(agences.id, migration.sourceAgencyId));

        rollbackReport.agencyRestored = true;
      });

      // 6. Marquer la migration comme ROLLED_BACK
      rollbackReport.durationMs = Date.now() - startTime;

      await db
        .update(agencyMigrations)
        .set({
          statut: MIGRATION_STATUS.ROLLED_BACK,
          progress: 100,
          report: {
            ...((migration.report as any) || {}),
            rollback: rollbackReport,
          },
          updatedAt: new Date(),
        })
        .where(eq(agencyMigrations.id, migrationId));

      // Audit log
      const context: MigrationContext = {
        migration,
        userId: ctx?.userId,
        ipAddress: ctx?.ipAddress,
      };
      await logAudit(context, "ROLLED_BACK", MIGRATION_STATUS.COMPLETED, MIGRATION_STATUS.ROLLED_BACK, {
        rollbackReport,
      });

      logger.info({ migrationId, durationMs: rollbackReport.durationMs }, 'Migration rolled back');
      broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "ROLLED_BACK", {
        reference: migration.reference,
        durationMs: rollbackReport.durationMs,
      });

      return { success: true, report: rollbackReport };
    } catch (error: any) {
      // En cas d'échec du rollback, remettre en COMPLETED (état précédent)
      await db
        .update(agencyMigrations)
        .set({
          statut: MIGRATION_STATUS.COMPLETED,
          error: `Rollback failed: ${error.message}`,
          updatedAt: new Date(),
        })
        .where(eq(agencyMigrations.id, migrationId));

      throw new MigrationError(
        `Échec du rollback: ${error.message}`,
        "ROLLBACK_FAILED",
        { originalError: error.message }
      );
    }
  }