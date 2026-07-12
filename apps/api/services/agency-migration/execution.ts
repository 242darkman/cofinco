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