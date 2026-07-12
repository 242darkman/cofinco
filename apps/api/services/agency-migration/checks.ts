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

export async function checkDataIntegrity(
    sourceAgencyId: string,
    targetClientsAgencyId?: string | null,
    targetEmployeesAgencyId?: string | null,
    targetTreasuryAgencyId?: string | null,
  ): Promise<{
    passed: boolean;
    message: string;
    details: any;
    resolution?: string;
  }> {
    const conflicts: Array<{ type: string; description: string; entities?: any[] }> = [];

    // 1. Vérifier que les agences cibles existent et sont actives
    const targetIds = [targetClientsAgencyId, targetEmployeesAgencyId, targetTreasuryAgencyId].filter(Boolean) as string[];
    if (targetIds.length > 0) {
      const targetAgencies = await db
        .select({ id: agences.id, nom: agences.nom, statut: agences.statut })
        .from(agences)
        .where(inArray(agences.id, targetIds));

      for (const targetId of targetIds) {
        const target = targetAgencies.find(a => a.id === targetId);
        if (!target) {
          conflicts.push({ type: "MISSING_TARGET_AGENCY", description: `Agence cible ${targetId} introuvable` });
        } else if (target.statut !== StatutAgence.ACTIVE) {
          conflicts.push({ type: "INACTIVE_TARGET_AGENCY", description: `Agence cible "${target.nom}" n'est pas active (statut: ${target.statut})` });
        }
      }
    }

    // 2. Vérifier le coffre cible existe (si transfert trésorerie demandé)
    if (targetTreasuryAgencyId) {
      const [targetCoffre] = await db
        .select({ id: coffresForts.id, statut: coffresForts.statut })
        .from(coffresForts)
        .where(eq(coffresForts.ownerId, targetTreasuryAgencyId))
        .limit(1);

      if (!targetCoffre) {
        conflicts.push({ type: "MISSING_TARGET_COFFRE", description: "Aucun coffre-fort trouvé pour l'agence trésorerie cible" });
      } else if (targetCoffre.statut !== "ACTIVE") {
        conflicts.push({ type: "INACTIVE_TARGET_COFFRE", description: `Le coffre-fort cible n'est pas actif (statut: ${targetCoffre.statut})` });
      }
    }

    // 3. Doublons emails — clients source vs clients target
    if (targetClientsAgencyId) {
      const duplicateEmails = await db
        .select({
          email: sql<string>`su.email`,
          sourceClientId: sql<string>`sc.id`,
          targetClientId: sql<string>`tc.id`,
        })
        .from(sql`
          (SELECT c.id, c.user_id FROM clients c WHERE c.agence_id = ${sourceAgencyId} AND c.deleted_at IS NULL) sc
          JOIN users su ON su.id = sc.user_id
          JOIN (SELECT c.id, c.user_id FROM clients c WHERE c.agence_id = ${targetClientsAgencyId} AND c.deleted_at IS NULL) tc
            ON true
          JOIN users tu ON tu.id = tc.user_id
        `)
        .where(sql`su.email IS NOT NULL AND su.email = tu.email`);

      if (duplicateEmails.length > 0) {
        conflicts.push({
          type: "DUPLICATE_EMAILS",
          description: `${duplicateEmails.length} client(s) avec email dupliqué entre agence source et cible`,
          entities: duplicateEmails.slice(0, 10), // Limit to first 10
        });
      }

      // 4. Doublons telephones
      const duplicatePhones = await db
        .select({
          telephone: sql<string>`su.telephone`,
          sourceClientId: sql<string>`sc.id`,
          targetClientId: sql<string>`tc.id`,
        })
        .from(sql`
          (SELECT c.id, c.user_id FROM clients c WHERE c.agence_id = ${sourceAgencyId} AND c.deleted_at IS NULL) sc
          JOIN users su ON su.id = sc.user_id
          JOIN (SELECT c.id, c.user_id FROM clients c WHERE c.agence_id = ${targetClientsAgencyId} AND c.deleted_at IS NULL) tc
            ON true
          JOIN users tu ON tu.id = tc.user_id
        `)
        .where(sql`su.telephone IS NOT NULL AND su.telephone = tu.telephone`);

      if (duplicatePhones.length > 0) {
        conflicts.push({
          type: "DUPLICATE_PHONES",
          description: `${duplicatePhones.length} client(s) avec téléphone dupliqué entre agence source et cible`,
          entities: duplicatePhones.slice(0, 10),
        });
      }

      // 5. Doublons numeroCompte (unique index global)
      const sourceCompteNumbers = await db
        .select({ numeroCompte: comptes.numeroCompte })
        .from(comptes)
        .innerJoin(clients, eq(comptes.clientId, clients.id))
        .where(and(eq(clients.agenceId, sourceAgencyId), isNull(clients.deletedAt)));

      if (sourceCompteNumbers.length > 0) {
        const nums = sourceCompteNumbers.map(c => c.numeroCompte);
        const existingInTarget = await db
          .select({ numeroCompte: comptes.numeroCompte })
          .from(comptes)
          .innerJoin(clients, eq(comptes.clientId, clients.id))
          .where(and(
            eq(clients.agenceId, targetClientsAgencyId),
            isNull(clients.deletedAt),
            inArray(comptes.numeroCompte, nums),
          ));

        if (existingInTarget.length > 0) {
          conflicts.push({
            type: "DUPLICATE_NUMERO_COMPTE",
            description: `${existingInTarget.length} numéro(s) de compte dupliqué(s)`,
            entities: existingInTarget.slice(0, 10),
          });
        }
      }

      // 6. FK integrity — clients sans userId valide
      const orphanClients = await db
        .select({ id: clients.id })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(
          eq(clients.agenceId, sourceAgencyId),
          isNull(clients.deletedAt),
          isNull(users.id),
          sql`${clients.userId} IS NOT NULL`,
        ));

      if (orphanClients.length > 0) {
        conflicts.push({
          type: "ORPHAN_CLIENTS",
          description: `${orphanClients.length} client(s) avec userId pointant vers un utilisateur inexistant`,
          entities: orphanClients.slice(0, 10),
        });
      }
    }

    return {
      passed: conflicts.length === 0,
      message: conflicts.length === 0
        ? "Aucun conflit de données détecté"
        : `${conflicts.length} conflit(s) détecté(s)`,
      details: { conflicts, conflictCount: conflicts.length },
      resolution: conflicts.length > 0
        ? "Résolvez les conflits (doublons, entités manquantes) avant de procéder"
        : undefined,
    };
  }

export async function checkBalanceVerification(
    sourceAgencyId: string
  ): Promise<{
    passed: boolean;
    message: string;
    details: any;
    resolution?: string;
  }> {
    const [sourceCoffre] = await db
      .select({ id: coffresForts.id, solde: coffresForts.solde, nom: coffresForts.nom })
      .from(coffresForts)
      .where(eq(coffresForts.ownerId, sourceAgencyId))
      .limit(1);

    if (!sourceCoffre) {
      return { passed: true, message: "Aucun coffre à vérifier", details: null };
    }

    const [sumResult] = await db
      .select({
        totalCredit: sql<string>`COALESCE(SUM(CASE WHEN ${mouvementsFinanciers.sens} = 'CREDIT' THEN ${mouvementsFinanciers.montant}::numeric ELSE 0 END), 0)`,
        totalDebit: sql<string>`COALESCE(SUM(CASE WHEN ${mouvementsFinanciers.sens} = 'DEBIT' THEN ${mouvementsFinanciers.montant}::numeric ELSE 0 END), 0)`,
      })
      .from(mouvementsFinanciers)
      .where(and(
        sql`${mouvementsFinanciers.metadata}->>'coffreId' = ${sourceCoffre.id}`,
        eq(mouvementsFinanciers.statut, StatutTransaction.POSTED),
      ));

    const soldeDb = parseFloat(sourceCoffre.solde || "0");
    const soldeCalculated = parseFloat(sumResult.totalCredit) - parseFloat(sumResult.totalDebit);
    const ecart = Math.abs(soldeDb - soldeCalculated);
    const passed = ecart < 1; // Tolérance de 1 FCFA pour arrondis

    return {
      passed,
      message: passed
        ? `Solde coffre cohérent (${soldeDb.toLocaleString()} ${currencySymbol()})`
        : `Écart de solde détecté sur le coffre "${sourceCoffre.nom}": DB=${soldeDb}, Calculé=${soldeCalculated}, Écart=${ecart}`,
      details: { coffreId: sourceCoffre.id, soldeDb, soldeCalculated, ecart },
      resolution: !passed
        ? "Investiguez l'écart de solde avant la migration. Un ajustement comptable peut être nécessaire."
        : undefined,
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