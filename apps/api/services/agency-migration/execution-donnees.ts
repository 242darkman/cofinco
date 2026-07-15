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
 * Étapes 1 à 5e : migration des données clients (clients, comptes,
 * crédits, demandes, dossiers, tontines et sous-tables, mouvements,
 * sessions caisse, transferts coffre-caisse, virements programmés).
 * Extrait de processMigration (limite de 400 lignes) — code verbatim,
 * s'exécute dans la MÊME transaction que l'orchestrateur.
 */
export async function migrateClientData(
  tx: any,
  migration: any,
  migrationId: string,
  volumetry: MigrationVolumetry,
  financials: MigrationFinancials,
  logs: StepLog[],
  logStep: (step: string, success: boolean, count?: number, details?: any, durationMs?: number) => void,
): Promise<void> {
        // ============================================
        // ÉTAPE 1: MIGRATION DES CLIENTS (10-15%)
        // ============================================
        const targetClients = migration.targetClientsAgencyId;
        if (targetClients) {
          const stepStart = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 10, logs, "Migration clients");

          const clientsToMigrate = await tx
            .select({ id: clients.id, nom: users.nom, prenom: users.prenom, telephone: users.telephone, email: users.email })
            .from(clients)
            .leftJoin(users, eq(clients.userId, users.id))
            .where(and(eq(clients.agenceId, migration.sourceAgencyId), isNull(clients.deletedAt)));

          await tx.update(clients)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(clients.agenceId, migration.sourceAgencyId), isNull(clients.deletedAt)));

          volumetry.clients = clientsToMigrate.length;
          await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.CLIENT,
            clientsToMigrate, migration.sourceAgencyId, targetClients,
            (c: any) => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email })
          );
          logStep("Migration clients", true, clientsToMigrate.length, undefined, Date.now() - stepStart);

          // ============================================
          // ÉTAPE 2: MIGRATION DES COMPTES (15-25%)
          // ============================================
          const s2 = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 15, logs, "Migration comptes");

          const comptesToMigrate = await tx
            .select({ id: comptes.id, numeroCompte: comptes.numeroCompte, typeCompte: comptes.typeCompte, statut: comptes.statut, soldeCourant: comptes.soldeCourant })
            .from(comptes)
            .where(and(eq(comptes.agenceId, migration.sourceAgencyId), isNull(comptes.deletedAt)));

          await tx.update(comptes)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(comptes.agenceId, migration.sourceAgencyId), isNull(comptes.deletedAt)));

          volumetry.comptes = comptesToMigrate.length;
          financials.totalSoldesComptes = comptesToMigrate.reduce((s: any, c: any) => s + Number(c.soldeCourant || 0), 0);
          await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.COMPTE,
            comptesToMigrate, migration.sourceAgencyId, targetClients,
            (c: any) => ({ id: c.id, numeroCompte: c.numeroCompte, typeCompte: c.typeCompte, statut: c.statut, soldeCourant: c.soldeCourant })
          );
          logStep("Migration comptes", true, comptesToMigrate.length, undefined, Date.now() - s2);

          // ============================================
          // ÉTAPE 3: MIGRATION DES CRÉDITS (25-30%)
          // ============================================
          const s3 = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 25, logs, "Migration crédits");

          const creditsToMigrate = await tx
            .select({ id: credits.id, numeroCredit: credits.numeroCredit, statut: credits.statut, soldeRestant: credits.soldeRestant, montantAccorde: credits.montant })
            .from(credits)
            .where(and(eq(credits.agenceId, migration.sourceAgencyId), isNull(credits.deletedAt)));

          await tx.update(credits)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(credits.agenceId, migration.sourceAgencyId), isNull(credits.deletedAt)));

          volumetry.credits = creditsToMigrate.length;
          financials.totalCreditsEnCours = creditsToMigrate.reduce((s: any, c: any) => s + Number(c.soldeRestant || 0), 0);
          await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.CREDIT,
            creditsToMigrate, migration.sourceAgencyId, targetClients,
            (c: any) => ({ id: c.id, numeroCredit: c.numeroCredit, statut: c.statut, soldeRestant: c.soldeRestant, montantAccorde: c.montantAccorde })
          );
          logStep("Migration crédits", true, creditsToMigrate.length, undefined, Date.now() - s3);

          // ============================================
          // ÉTAPE 4: MIGRATION DES DEMANDES DE CRÉDIT (30-33%)
          // ============================================
          const s4 = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 30, logs, "Migration demandes crédit");

          const demandesToMigrate = await tx
            .select({ id: demandesCredit.id, statut: demandesCredit.statut, montantDemande: demandesCredit.montantDemande })
            .from(demandesCredit)
            .where(and(eq(demandesCredit.agenceId, migration.sourceAgencyId), isNull(demandesCredit.deletedAt)));

          await tx.update(demandesCredit)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(demandesCredit.agenceId, migration.sourceAgencyId), isNull(demandesCredit.deletedAt)));

          volumetry.demandesCredit = demandesToMigrate.length;
          await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.DEMANDE_CREDIT,
            demandesToMigrate, migration.sourceAgencyId, targetClients,
            (d: any) => ({ id: d.id, statut: d.statut, montantDemande: d.montantDemande })
          );
          logStep("Migration demandes crédit", true, demandesToMigrate.length, undefined, Date.now() - s4);

          // ============================================
          // ÉTAPE 4b: MIGRATION DES DOSSIERS CRÉDIT (33-35%)
          // ============================================
          const s4b = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 33, logs, "Migration dossiers crédit");

          const dossiersToMigrate = await tx
            .select({ id: dossiersCredit.id })
            .from(dossiersCredit)
            .where(eq(dossiersCredit.agenceId, migration.sourceAgencyId));

          if (dossiersToMigrate.length > 0) {
            await tx.update(dossiersCredit)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(eq(dossiersCredit.agenceId, migration.sourceAgencyId));

            volumetry.dossiersCredit = dossiersToMigrate.length;
            await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.DOSSIER_CREDIT,
              dossiersToMigrate, migration.sourceAgencyId, targetClients,
              (d: any) => ({ id: d.id })
            );
          }
          logStep("Migration dossiers crédit", true, dossiersToMigrate.length, undefined, Date.now() - s4b);

          // ============================================
          // ÉTAPE 5: MIGRATION DES TONTINES + SUB-TABLES (35-45%)
          // ============================================
          const s5 = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 35, logs, "Migration tontines");

          const tontinesToMigrate = await tx
            .select({ id: tontines.id, nom: tontines.nom, statut: tontines.statut })
            .from(tontines)
            .where(eq(tontines.agenceId, migration.sourceAgencyId));

          await tx.update(tontines)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(eq(tontines.agenceId, migration.sourceAgencyId));

          volumetry.tontines = tontinesToMigrate.length;
          await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.TONTINE,
            tontinesToMigrate, migration.sourceAgencyId, targetClients,
            (t: any) => ({ id: t.id, nom: t.nom, statut: t.statut })
          );

          // Tontine sub-tables with agenceId — bulk update
          // membresTontine has no agenceId — follows parent tontine via tontineId FK
          // Count for volumetry is done through tontines join in countEntities()
          const tontineSubTables = [
            { table: contributionsTontine, col: contributionsTontine.agenceId, type: MIGRATION_ENTITY_TYPE.CONTRIBUTION_TONTINE, volKey: "contributionsTontine" as const },
            { table: tontineCycles, col: tontineCycles.agenceId, type: MIGRATION_ENTITY_TYPE.TONTINE_CYCLE, volKey: "tontineCycles" as const },
            { table: tontineTurns, col: tontineTurns.agenceId, type: MIGRATION_ENTITY_TYPE.TONTINE_TURN, volKey: "tontineTurns" as const },
            { table: tontineSchedules, col: tontineSchedules.agenceId, type: MIGRATION_ENTITY_TYPE.TONTINE_SCHEDULE, volKey: "tontineSchedules" as const },
          ];

          for (const sub of tontineSubTables) {
            const rows = await tx
              .select({ id: sub.table.id })
              .from(sub.table)
              .where(eq(sub.col, migration.sourceAgencyId));

            if (rows.length > 0) {
              await tx.update(sub.table)
                .set({ agenceId: targetClients, updatedAt: new Date() } as any)
                .where(eq(sub.col, migration.sourceAgencyId));

              volumetry[sub.volKey] = rows.length;
              await batchInsertEntityLogs(tx, migrationId, sub.type,
                rows, migration.sourceAgencyId, targetClients,
                (r: any) => ({ id: r.id })
              );
            }
          }

          logStep("Migration tontines + sub-tables", true, tontinesToMigrate.length, undefined, Date.now() - s5);

          // ============================================
          // ÉTAPE 5b: MIGRATION MOUVEMENTS FINANCIERS (45-50%)
          // ============================================
          const s5b = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 45, logs, "Migration mouvements financiers");

          const mouvementsToMigrate = await tx
            .select({ id: mouvementsFinanciers.id, reference: mouvementsFinanciers.reference, sens: mouvementsFinanciers.sens, montant: mouvementsFinanciers.montant })
            .from(mouvementsFinanciers)
            .where(eq(mouvementsFinanciers.agenceId, migration.sourceAgencyId));

          if (mouvementsToMigrate.length > 0) {
            await tx.update(mouvementsFinanciers)
              .set({ agenceId: targetClients })
              .where(eq(mouvementsFinanciers.agenceId, migration.sourceAgencyId));

            volumetry.mouvementsFinanciers = mouvementsToMigrate.length;
            await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.MOUVEMENT_FINANCIER,
              mouvementsToMigrate, migration.sourceAgencyId, targetClients,
              (m: any) => ({ id: m.id, reference: m.reference, sens: m.sens, montant: m.montant })
            );
          }
          logStep("Migration mouvements financiers", true, mouvementsToMigrate.length, undefined, Date.now() - s5b);

          // ============================================
          // ÉTAPE 5c: MIGRATION SESSIONS CAISSE (50-53%)
          // ============================================
          const s5c = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 50, logs, "Migration sessions caisse");

          const sessionsToMigrate = await tx
            .select({ id: sessionsCaisse.id })
            .from(sessionsCaisse)
            .where(and(eq(sessionsCaisse.agenceId, migration.sourceAgencyId), isNull(sessionsCaisse.deletedAt)));

          if (sessionsToMigrate.length > 0) {
            await tx.update(sessionsCaisse)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(and(eq(sessionsCaisse.agenceId, migration.sourceAgencyId), isNull(sessionsCaisse.deletedAt)));

            volumetry.sessionsCaisse = sessionsToMigrate.length;
            await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.SESSION_CAISSE,
              sessionsToMigrate, migration.sourceAgencyId, targetClients,
              (s: any) => ({ id: s.id })
            );
          }
          logStep("Migration sessions caisse", true, sessionsToMigrate.length, undefined, Date.now() - s5c);

          // ============================================
          // ÉTAPE 5d: MIGRATION TRANSFERTS COFFRE-CAISSE (53-55%)
          // ============================================
          const s5d = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 53, logs, "Migration transferts coffre-caisse");

          const transfertsCCToMigrate = await tx
            .select({ id: transfertsCoffreCaisse.id })
            .from(transfertsCoffreCaisse)
            .where(eq(transfertsCoffreCaisse.agenceId, migration.sourceAgencyId));

          if (transfertsCCToMigrate.length > 0) {
            await tx.update(transfertsCoffreCaisse)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(eq(transfertsCoffreCaisse.agenceId, migration.sourceAgencyId));

            volumetry.transfertsCoffreCaisse = transfertsCCToMigrate.length;
            await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.TRANSFERT_COFFRE_CAISSE,
              transfertsCCToMigrate, migration.sourceAgencyId, targetClients,
              (t: any) => ({ id: t.id })
            );
          }
          logStep("Migration transferts coffre-caisse", true, transfertsCCToMigrate.length, undefined, Date.now() - s5d);

          // ============================================
          // ÉTAPE 5e: MIGRATION VIREMENTS PROGRAMMÉS (55-57%)
          // ============================================
          const s5e = Date.now();
          await updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 55, logs, "Migration virements programmés");

          const virementsToMigrate = await tx
            .select({ id: virementsProgrammes.id })
            .from(virementsProgrammes)
            .where(eq(virementsProgrammes.agenceId, migration.sourceAgencyId));

          if (virementsToMigrate.length > 0) {
            await tx.update(virementsProgrammes)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(eq(virementsProgrammes.agenceId, migration.sourceAgencyId));

            volumetry.virementsProgrammes = virementsToMigrate.length;
            await batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.VIREMENT_PROGRAMME,
              virementsToMigrate, migration.sourceAgencyId, targetClients,
              (v: any) => ({ id: v.id })
            );
          }
          logStep("Migration virements programmés", true, virementsToMigrate.length, undefined, Date.now() - s5e);
        }
}
