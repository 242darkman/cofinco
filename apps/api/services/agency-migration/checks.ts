import { currencySymbol } from "@shared/config/currency";
import { StatutAgence, StatutTransaction, StatutTransfertInterCoffre } from "@shared/enum/status-constants";
import {
  agences,
  clients,
  coffresForts,
  comptes,
  configCoffreFort,
  credits,
  mouvementsFinanciers,
  sessionsCaisse,
  users
} from "@shared/schema";
import {
  migrationPreFlightChecks
} from "@shared/schema/agency_migration";
import { transfertsInterCoffres } from "@shared/schema/coffres-forts";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { PreFlightCheckType } from "./types";
import { checkDataIntegrity, checkBalanceVerification } from "./checks-integrite";

// Réexport pour compatibilité des imports existants
export { checkDataIntegrity, checkBalanceVerification } from "./checks-integrite";
export async function checkOpenSessions(sourceAgencyId: string): Promise<{
    passed: boolean;
    message: string;
    details: any;
    resolution?: string;
  }> {
    const openSessions = await db
      .select({
        id: sessionsCaisse.id,
        caissierId: sessionsCaisse.caissierId,
        openedAt: sessionsCaisse.openedAt,
        montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
      })
      .from(sessionsCaisse)
      .where(
        and(
          eq(sessionsCaisse.agenceId, sourceAgencyId),
          notInArray(sessionsCaisse.statut, ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"]),
          isNull(sessionsCaisse.deletedAt)
        )
      );

    if (openSessions.length > 0) {
      return {
        passed: false,
        message: `${openSessions.length} session(s) de caisse encore ouverte(s)`,
        details: { sessions: openSessions },
        resolution: "Veuillez fermer toutes les sessions de caisse avant de procéder à la migration",
      };
    }

    return {
      passed: true,
      message: "Aucune session de caisse ouverte",
      details: null,
    };
  }

export async function checkPendingTransfers(sourceAgencyId: string): Promise<{
    passed: boolean;
    message: string;
    details: any;
    resolution?: string;
  }> {
    // Récupérer le coffre de l'agence source
    const [sourceCoffre] = await db
      .select({ id: coffresForts.id })
      .from(coffresForts)
      .where(eq(coffresForts.ownerId, sourceAgencyId))
      .limit(1);

    if (!sourceCoffre) {
      return {
        passed: true,
        message: "Aucun coffre associé à cette agence",
        details: null,
      };
    }

    // Vérifier les transferts en attente (non finalisés)
    const pendingStatuses = [
      StatutTransfertInterCoffre.DRAFT,
      StatutTransfertInterCoffre.SUBMITTED,
      StatutTransfertInterCoffre.APPROVED_L1,
      StatutTransfertInterCoffre.APPROVED_L2,
      StatutTransfertInterCoffre.IN_TRANSIT,
    ] as const;
    const pendingTransfers = await db
      .select({
        id: transfertsInterCoffres.id,
        reference: transfertsInterCoffres.reference,
        montant: transfertsInterCoffres.montant,
        statut: transfertsInterCoffres.statut,
      })
      .from(transfertsInterCoffres)
      .where(
        and(
          eq(transfertsInterCoffres.coffreSourceId, sourceCoffre.id),
          inArray(transfertsInterCoffres.statut, [...pendingStatuses])
        )
      );

    if (pendingTransfers.length > 0) {
      return {
        passed: false,
        message: `${pendingTransfers.length} transfert(s) inter-coffres en attente`,
        details: { transfers: pendingTransfers },
        resolution: "Finalisez ou annulez tous les transferts en attente avant la migration",
      };
    }

    return {
      passed: true,
      message: "Aucun transfert en attente",
      details: null,
    };
  }

export async function checkActiveOperations(
    sourceAgencyId: string
  ): Promise<{
    passed: boolean;
    message: string;
    details: any;
    resolution?: string;
  }> {
    // Crédits en cours de décaissement
    const activeCredits = await db
      .select({ id: credits.id, statut: credits.statut })
      .from(credits)
      .innerJoin(clients, eq(credits.clientId, clients.id))
      .where(and(
        eq(clients.agenceId, sourceAgencyId),
        or(
          eq(credits.statut, "PENDING"),
          eq(credits.statut, "WAITING_DISBURSEMENT"),
        ),
      ));

    if (activeCredits.length > 0) {
      return {
        passed: false,
        message: `${activeCredits.length} crédit(s) en cours d'approbation/décaissement`,
        details: { credits: activeCredits.slice(0, 10) },
        resolution: "Finalisez ou annulez les crédits en cours avant la migration",
      };
    }

    return {
      passed: true,
      message: "Aucune opération active bloquante",
      details: null,
    };
  }

export async function checkTreasuryRules(
    sourceAgencyId: string,
    targetTreasuryAgencyId?: string | null,
  ): Promise<{
    passed: boolean;
    message: string;
    details: any;
    resolution?: string;
  }> {
    if (!targetTreasuryAgencyId) {
      return { passed: true, message: "Pas de transfert de trésorerie", details: null };
    }

    const warnings: string[] = [];

    // Coffre source
    const [sourceCoffre] = await db
      .select({ id: coffresForts.id, solde: coffresForts.solde, soldeMinimum: coffresForts.soldeMinimum })
      .from(coffresForts)
      .where(eq(coffresForts.ownerId, sourceAgencyId))
      .limit(1);

    if (!sourceCoffre || parseFloat(sourceCoffre.solde || "0") <= 0) {
      return { passed: true, message: "Pas de fonds à transférer", details: null };
    }

    const amount = parseFloat(sourceCoffre.solde || "0");

    // Vérifier plafond journalier entrant du coffre cible
    const [targetConfig] = await db
      .select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, targetTreasuryAgencyId));

    if (targetConfig?.plafondJournalierEntrant) {
      const plafond = parseFloat(targetConfig.plafondJournalierEntrant);
      if (plafond > 0 && amount > plafond) {
        warnings.push(
          `Le montant à transférer (${amount.toLocaleString()} ${currencySymbol()}) dépasse le plafond journalier entrant du coffre cible (${plafond.toLocaleString()} ${currencySymbol()}). Ajustez le plafond avant la migration.`
        );
      }
    }

    // Vérifier plafond journalier sortant du coffre source
    const [sourceConfig] = await db
      .select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, sourceAgencyId));

    if (sourceConfig?.plafondJournalierSortant) {
      const plafond = parseFloat(sourceConfig.plafondJournalierSortant);
      if (plafond > 0 && amount > plafond) {
        warnings.push(
          `Le montant à transférer (${amount.toLocaleString()} ${currencySymbol()}) dépasse le plafond journalier sortant du coffre source (${plafond.toLocaleString()} ${currencySymbol()}). Ajustez le plafond avant la migration.`
        );
      }
    }

    // Vérifier solde minimum source
    const soldeMinimum = parseFloat(sourceCoffre.soldeMinimum || "0");
    if (soldeMinimum > 0) {
      warnings.push(
        `Le coffre source a un solde minimum de ${soldeMinimum.toLocaleString()} ${currencySymbol()}. Le transfert de migration videra le coffre (montant: ${amount.toLocaleString()} ${currencySymbol()}).`
      );
    }

    return {
      passed: warnings.length === 0,
      message: warnings.length === 0
        ? "Règles de trésorerie OK"
        : `${warnings.length} avertissement(s) de trésorerie`,
      details: { warnings, amount },
      resolution: warnings.length > 0
        ? "Ajustez les plafonds journaliers et/ou le solde minimum avant la migration"
        : undefined,
    };
  }

export async function runPreFlightChecks(
    migrationId: string,
    sourceAgencyId: string,
    targetClientsAgencyId?: string | null,
    userId?: string,
    targetEmployeesAgencyId?: string | null,
    targetTreasuryAgencyId?: string | null,
  ): Promise<{
    allPassed: boolean;
    blockingFailed: boolean;
    checks: Array<{
      type: string;
      passed: boolean;
      blocking: boolean;
      message: string;
      details?: any;
      resolution?: string;
    }>;
  }> {
    const checks: Array<{
      type: PreFlightCheckType;
      fn: () => Promise<{ passed: boolean; message: string; details: any; resolution?: string }>;
      blocking: boolean;
    }> = [
      { type: "OPEN_SESSIONS", fn: () => checkOpenSessions(sourceAgencyId), blocking: true },
      { type: "PENDING_TRANSFERS", fn: () => checkPendingTransfers(sourceAgencyId), blocking: true },
      { type: "ACTIVE_OPERATIONS", fn: () => checkActiveOperations(sourceAgencyId), blocking: true },
      { type: "DATA_INTEGRITY", fn: () => checkDataIntegrity(sourceAgencyId, targetClientsAgencyId, targetEmployeesAgencyId, targetTreasuryAgencyId), blocking: true },
      { type: "BALANCE_VERIFICATION", fn: () => checkBalanceVerification(sourceAgencyId), blocking: false },
      { type: "TREASURY_RULES", fn: () => checkTreasuryRules(sourceAgencyId, targetTreasuryAgencyId), blocking: false },
    ];

    const results = [];
    let allPassed = true;
    let blockingFailed = false;

    for (const check of checks) {
      const result = await check.fn();

      // Enregistrer en base
      await db.insert(migrationPreFlightChecks).values({
        migrationId,
        checkType: check.type,
        passed: result.passed,
        blocking: check.blocking,
        message: result.message,
        details: result.details,
        resolution: result.resolution,
        checkedBy: userId,
      });

      results.push({
        type: check.type,
        passed: result.passed,
        blocking: check.blocking,
        message: result.message,
        details: result.details,
        resolution: result.resolution,
      });

      if (!result.passed) {
        allPassed = false;
        if (check.blocking) {
          blockingFailed = true;
        }
      }
    }

    return { allPassed, blockingFailed, checks: results };
  }
