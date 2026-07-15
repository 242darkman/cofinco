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

/**
 * Étapes 7/7b/7c : transfert de trésorerie (coffre source → coffre
 * cible, soldes des caisses, fermeture caisses et coffre source).
 * Extrait de processMigration (limite de 400 lignes) — code verbatim,
 * s'exécute dans la MÊME transaction que l'orchestrateur.
 */
export async function transferTreasuryAndCloseSource(
  tx: any,
  migration: any,
  migrationId: string,
  ctx: Partial<MigrationContext> | undefined,
  financials: MigrationFinancials,
  logs: StepLog[],
  logStep: (step: string, success: boolean, count?: number, details?: any, durationMs?: number) => void,
): Promise<void> {
        // ============================================
        // ÉTAPE 7: TRANSFERT DE TRÉSORERIE (75-90%)
        // ============================================
        if (migration.targetTreasuryAgencyId) {
          const stepStartTreasury = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 75, logs, "Transfert trésorerie");

          // Récupérer les coffres
          const [sourceCoffre] = await tx
            .select()
            .from(coffresForts)
            .where(eq(coffresForts.ownerId, migration.sourceAgencyId))
            .limit(1);

          const [targetCoffre] = await tx
            .select()
            .from(coffresForts)
            .where(eq(coffresForts.ownerId, migration.targetTreasuryAgencyId))
            .limit(1);

          if (sourceCoffre && targetCoffre && Number(sourceCoffre.solde) > 0) {
            const amount = Number(sourceCoffre.solde);
            financials.soldesCoffresTransferes = amount;

            const guardCtx: GuardContext = {
              userId: ctx?.userId || "SYSTEM",
              operationType: "MIGRATION_TREASURY_TRANSFER",
              skipLimits: true, // Migration: allow draining coffre to 0
            };

            // 1. Guard source (SELECT FOR UPDATE + active + solde + minimum + plafond)
            const { soldeBefore: sourceBeforeSolde } = await assertCoffreCanDebit(
              tx, sourceCoffre.id, amount, guardCtx
            );

            // 2. Guard target (SELECT FOR UPDATE + active + plafond entrant)
            const { soldeBefore: targetBeforeSolde } = await assertCoffreCanCredit(
              tx, targetCoffre.id, amount, guardCtx
            );

            // 3. Atomic balance updates (rows already locked by guards)
            // Bypass BALANCE_GUARD: mouvements are created right after, within the same tx
            await tx.execute(sql`SELECT set_config('app.balance_guard_bypass', 'true', true)`);
            const sourceAfter = await updateCoffreBalance(tx, sourceCoffre.id, -amount);
            const targetAfter = await updateCoffreBalance(tx, targetCoffre.id, +amount);

            // 4. Create BOTH mouvement financier entries (DEBIT + CREDIT)
            const reference = `MIG-TRF-${Date.now()}`;

            const [mouvementDebit] = await tx.insert(mouvementsFinanciers).values({
              reference: `${reference}-D`,
              dateOperation: new Date(),
              montant: amount.toString(),
              sens: "DEBIT",
              statut: StatutTransaction.POSTED,
              sourceModule: "SYSTEME",
              agenceId: migration.sourceAgencyId,
              createdBy: ctx?.userId,
              metadata: {
                type: "MIGRATION_AGENCE",
                migrationId,
                coffreId: sourceCoffre.id,
                direction: "DEBIT",
                sourceAgencyId: migration.sourceAgencyId,
                targetAgencyId: migration.targetTreasuryAgencyId,
              },
            }).returning();

            const [mouvementCredit] = await tx.insert(mouvementsFinanciers).values({
              reference: `${reference}-C`,
              dateOperation: new Date(),
              montant: amount.toString(),
              sens: "CREDIT",
              statut: StatutTransaction.POSTED,
              sourceModule: "SYSTEME",
              agenceId: migration.targetTreasuryAgencyId,
              createdBy: ctx?.userId,
              metadata: {
                type: "MIGRATION_AGENCE",
                migrationId,
                coffreId: targetCoffre.id,
                direction: "CREDIT",
                sourceAgencyId: migration.sourceAgencyId,
                targetAgencyId: migration.targetTreasuryAgencyId,
              },
            }).returning();

            // 4b. Post GL entries for migration mouvements (non-blocking)
            // Debit mouvement
            if (migration.sourceAgencyId) {
              try {
                const glResult = await postGlForMouvement(tx, mouvementDebit, migration.sourceAgencyId, ctx?.userId, {
                  operationType: 'MIGRATION_AGENCE',
                  migrationId,
                });
                if (glResult) {
                  logger.info({ mouvementId: mouvementDebit.id, numeroPiece: glResult.numeroPiece }, 'GL posted for migration debit');
                }
                await tx
                  .update(mouvementsFinanciers)
                  .set({ glPostingStatus: "POSTED" })
                  .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
              } catch (glError: unknown) {
                const message = glError instanceof Error ? glError.message : "Unknown GL error";
                const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
                logger.warn({ mouvementId: mouvementDebit.id, error: message }, `GL ${status.toLowerCase()} for migration debit`);
                await tx
                  .update(mouvementsFinanciers)
                  .set({ glPostingStatus: status, glPostingError: message })
                  .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
              }
            }
            // Credit mouvement
            if (migration.targetTreasuryAgencyId) {
              try {
                const glResult = await postGlForMouvement(tx, mouvementCredit, migration.targetTreasuryAgencyId, ctx?.userId, {
                  operationType: 'MIGRATION_AGENCE',
                  migrationId,
                });
                if (glResult) {
                  logger.info({ mouvementId: mouvementCredit.id, numeroPiece: glResult.numeroPiece }, 'GL posted for migration credit');
                }
                await tx
                  .update(mouvementsFinanciers)
                  .set({ glPostingStatus: "POSTED" })
                  .where(eq(mouvementsFinanciers.id, mouvementCredit.id));
              } catch (glError: unknown) {
                const message = glError instanceof Error ? glError.message : "Unknown GL error";
                const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
                logger.warn({ mouvementId: mouvementCredit.id, error: message }, `GL ${status.toLowerCase()} for migration credit`);
                await tx
                  .update(mouvementsFinanciers)
                  .set({ glPostingStatus: status, glPostingError: message })
                  .where(eq(mouvementsFinanciers.id, mouvementCredit.id));
              }
            }

            // 5. Entity log with snapshotBefore (for rollback)
            await tx.insert(migrationEntityLogs).values({
              migrationId,
              entityType: MIGRATION_ENTITY_TYPE.TREASURY_TRANSFER,
              entityId: sourceCoffre.id,
              previousAgencyId: migration.sourceAgencyId,
              newAgencyId: migration.targetTreasuryAgencyId!,
              snapshotBefore: {
                sourceCoffreId: sourceCoffre.id,
                targetCoffreId: targetCoffre.id,
                amount,
                sourceSoldeBefore: sourceBeforeSolde,
                targetSoldeBefore: targetBeforeSolde,
                sourceSoldeAfter: Number(sourceAfter.solde),
                targetSoldeAfter: Number(targetAfter.solde),
                reference,
              },
              success: true,
            });

            logStep(
              "Transfert trésorerie",
              true,
              undefined,
              { montant: amount, source: sourceCoffre.code, destination: targetCoffre.code },
              Date.now() - stepStartTreasury
            );
          } else {
            logStep("Transfert trésorerie", true, undefined, { message: "Pas de fonds à transférer" });
          }

          // 7b. Transfer caisse balances to target coffre and close source caisses
          const sourceCaisses = await tx
            .select()
            .from(caisses)
            .where(eq(caisses.agenceId, migration.sourceAgencyId));

          if (sourceCaisses.length > 0) {
            const [targetCoffre7b] = await tx
              .select()
              .from(coffresForts)
              .where(eq(coffresForts.ownerId, migration.targetTreasuryAgencyId))
              .limit(1);

            let totalCaisseBalance = 0;
            for (const caisse of sourceCaisses) {
              const soldeCaisse = Number(caisse.solde || 0);
              if (soldeCaisse > 0 && targetCoffre7b) {
                totalCaisseBalance += soldeCaisse;
                // Debit caisse balance → zero
                await tx
                  .update(caisses)
                  .set({ solde: "0", updatedAt: new Date() })
                  .where(eq(caisses.id, caisse.id));
              }
              // Close the caisse
              await tx
                .update(caisses)
                .set({ statut: "CLOSED", updatedAt: new Date() })
                .where(eq(caisses.id, caisse.id));
            }

            if (totalCaisseBalance > 0 && targetCoffre7b) {
              // Credit target coffre with total caisse balances
              await tx.execute(sql`SELECT set_config('app.balance_guard_bypass', 'true', true)`);
              await updateCoffreBalance(tx, targetCoffre7b.id, +totalCaisseBalance);

              // Record mouvement for caisse→coffre transfer
              const refCaisse = `MIG-CAISSE-${Date.now()}`;
              await tx.insert(mouvementsFinanciers).values({
                reference: refCaisse,
                dateOperation: new Date(),
                montant: totalCaisseBalance.toString(),
                sens: "CREDIT",
                statut: StatutTransaction.POSTED,
                sourceModule: "SYSTEME",
                agenceId: migration.targetTreasuryAgencyId,
                createdBy: ctx?.userId,
                metadata: {
                  type: "MIGRATION_AGENCE_CAISSE",
                  migrationId,
                  coffreId: targetCoffre7b.id,
                  sourceAgencyId: migration.sourceAgencyId,
                  targetAgencyId: migration.targetTreasuryAgencyId,
                  caissesCount: sourceCaisses.length,
                },
              });

              financials.soldesCoffresTransferes = (financials.soldesCoffresTransferes || 0) + totalCaisseBalance;
            }

            logStep("Transfert soldes caisses", true, sourceCaisses.length, { totalCaisseBalance });
          }
        }

        // 7c. Close source agency coffre-fort
        if (migration.targetTreasuryAgencyId) {
          const [sourceCoffreToClose] = await tx
            .select()
            .from(coffresForts)
            .where(eq(coffresForts.ownerId, migration.sourceAgencyId))
            .limit(1);

          if (sourceCoffreToClose) {
            await tx
              .update(coffresForts)
              .set({ statut: "CLOSED", updatedAt: new Date() })
              .where(eq(coffresForts.id, sourceCoffreToClose.id));
          }
        }
}
