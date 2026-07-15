import { StatutAgence, StatutCredit, StatutDemande } from "@shared/enum/status-constants";
import {
  agences,
  clients,
  coffresForts,
  comptes,
  contributionsTontine,
  credits,
  demandesCredit,
  dossiersCredit,
  membresTontine,
  mouvementsFinanciers,
  operationsCaisse,
  sessionsCaisse,
  tontineCycles,
  tontines,
  tontineSchedules,
  tontineTurns,
  transfertsCoffreCaisse,
  userAgences,
  virementsProgrammes
} from "@shared/schema";
import {
  agencyMigrations,
  type DryRunResult,
  type MigrationFinancials,
  type MigrationVolumetry
} from "@shared/schema/agency_migration";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { runPreFlightChecks } from "./checks";
import { MigrationError } from "./types";

export async function runDryRun(migrationId: string): Promise<DryRunResult> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    // Compter les entités
    const volumetry = await countEntities(migration.sourceAgencyId);

    // Exécuter les pre-flight checks
    const preFlightResult = await runPreFlightChecks(
      migrationId,
      migration.sourceAgencyId,
      migration.targetClientsAgencyId,
      undefined,
      migration.targetEmployeesAgencyId,
      migration.targetTreasuryAgencyId,
    );

    // Calculer les montants financiers
    const financials = await calculateFinancials(migration.sourceAgencyId);

    // Détecter les conflits potentiels
    const conflicts: DryRunResult["conflicts"] = [];

    // Vérifier que les agences cibles existent et sont actives
    const warnings: string[] = [];
    if (migration.targetClientsAgencyId) {
      const [targetClients] = await db
        .select()
        .from(agences)
        .where(eq(agences.id, migration.targetClientsAgencyId))
        .limit(1);
      if (!targetClients || targetClients.statut !== StatutAgence.ACTIVE) {
        warnings.push("L'agence cible pour les clients n'est pas active");
      }
    }

    const blockingReasons = preFlightResult.checks
      .filter((c: any) => !c.passed && c.blocking)
      .map((c: any) => c.message);

    const result: DryRunResult = {
      volumetry,
      preFlightChecks: preFlightResult.checks,
      conflicts,
      financials,
      warnings,
      canProceed: !preFlightResult.blockingFailed,
      blockingReasons,
    };

    // Sauvegarder le résultat du dry run
    await db
      .update(agencyMigrations)
      .set({
        dryRunResult: result,
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    return result;
  }

export async function countEntities(sourceAgencyId: string): Promise<MigrationVolumetry> {
    const countQuery = async (table: any, agencyCol: any, extraWhere?: any) => {
      const conditions = [eq(agencyCol, sourceAgencyId)];
      if (extraWhere) conditions.push(extraWhere);
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(and(...conditions));
      return result?.count || 0;
    };

    const [
      clientsN, comptesN, creditsN, demandesN, tontinesN, employesN,
      sessionsN, mouvementsN, virementsN, dossiersN,
      membresTontineN, contributionsN, cyclesN, turnsN, schedulesN,
      transfertsCCN,
    ] = await Promise.all([
      countQuery(clients, clients.agenceId, isNull(clients.deletedAt)),
      countQuery(comptes, comptes.agenceId, isNull(comptes.deletedAt)),
      countQuery(credits, credits.agenceId, isNull(credits.deletedAt)),
      countQuery(demandesCredit, demandesCredit.agenceId, isNull(demandesCredit.deletedAt)),
      countQuery(tontines, tontines.agenceId),
      db.select({ count: sql<number>`count(*)::int` }).from(userAgences)
        .where(and(eq(userAgences.agenceId, sourceAgencyId), eq(userAgences.actif, true)))
        .then(r => r[0]?.count || 0),
      countQuery(sessionsCaisse, sessionsCaisse.agenceId, isNull(sessionsCaisse.deletedAt)),
      countQuery(mouvementsFinanciers, mouvementsFinanciers.agenceId),
      countQuery(virementsProgrammes, virementsProgrammes.agenceId),
      countQuery(dossiersCredit, dossiersCredit.agenceId),
      db.select({ count: sql<number>`count(*)::int` }).from(membresTontine)
        .innerJoin(tontines, eq(membresTontine.tontineId, tontines.id))
        .where(eq(tontines.agenceId, sourceAgencyId))
        .then(r => r[0]?.count || 0),
      countQuery(contributionsTontine, contributionsTontine.agenceId),
      countQuery(tontineCycles, tontineCycles.agenceId),
      countQuery(tontineTurns, tontineTurns.agenceId),
      countQuery(tontineSchedules, tontineSchedules.agenceId),
      countQuery(transfertsCoffreCaisse, transfertsCoffreCaisse.agenceId),
    ]);

    // operationsCaisse count (transitive via sessionsCaisse)
    const [opsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(operationsCaisse)
      .where(
        sql`${operationsCaisse.sessionId} IN (
          SELECT id FROM sessions_caisse WHERE agence_id = ${sourceAgencyId}
        )`
      );

    return {
      clients: clientsN,
      comptes: comptesN,
      credits: creditsN,
      demandesCredit: demandesN,
      tontines: tontinesN,
      employes: employesN,
      sessionsCaisse: sessionsN,
      mouvementsFinanciers: mouvementsN,
      operationsCaisse: opsCount?.count || 0,
      virementsProgrammes: virementsN,
      dossiersCredit: dossiersN,
      membresTontine: membresTontineN,
      contributionsTontine: contributionsN,
      tontineCycles: cyclesN,
      tontineTurns: turnsN,
      tontineSchedules: schedulesN,
      transfertsCoffreCaisse: transfertsCCN,
    };
  }

export async function calculateFinancials(sourceAgencyId: string): Promise<MigrationFinancials> {
    // Solde du coffre
    const [coffre] = await db
      .select({ solde: coffresForts.solde })
      .from(coffresForts)
      .where(eq(coffresForts.ownerId, sourceAgencyId))
      .limit(1);

    // Total des soldes comptes
    const [totalComptes] = await db
      .select({ total: sql<string>`COALESCE(SUM(${comptes.soldeCourant}), 0)` })
      .from(comptes)
      .where(and(eq(comptes.agenceId, sourceAgencyId), isNull(comptes.deletedAt)));

    // Total crédits en cours
    const [totalCredits] = await db
      .select({ total: sql<string>`COALESCE(SUM(${credits.soldeRestant}), 0)` })
      .from(credits)
      .where(
        and(
          eq(credits.agenceId, sourceAgencyId),
          isNull(credits.deletedAt),
          ne(credits.statut, StatutCredit.PAID)
        )
      );

    // Demandes en attente
    const [demandesAttente] = await db
      .select({ total: sql<string>`COALESCE(SUM(${demandesCredit.montantDemande}), 0)` })
      .from(demandesCredit)
      .where(
        and(
          eq(demandesCredit.agenceId, sourceAgencyId),
          eq(demandesCredit.statut, StatutDemande.PENDING_FEES),
          isNull(demandesCredit.deletedAt)
        )
      );

    return {
      soldesCoffresTransferes: Number(coffre?.solde || 0),
      totalSoldesComptes: Number(totalComptes?.total || 0),
      totalCreditsEnCours: Number(totalCredits?.total || 0),
      totalDemandesEnAttente: Number(demandesAttente?.total || 0),
    };
  }