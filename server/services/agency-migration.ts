import { db } from "../db";
import {
  agencyMigrations,
  migrationPreFlightChecks,
  migrationEntityLogs,
  migrationAuditLogs,
  MIGRATION_STATUS,
  AGENCY_MIGRATION_MODE,
  MIGRATION_ENTITY_TYPE,
  type MigrationReport,
  type MigrationVolumetry,
  type MigrationFinancials,
  type MigrationOptions,
  type DryRunResult,
  type AgencyMigration
} from "@shared/schema/agency_migration";
import {
  clients,
  comptes,
  credits,
  demandesCredit,
  tontines,
  membresTontine,
  contributionsTontine,
  tontineCycles,
  tontineTurns,
  tontineSchedules,
  userAgences,
  agences,
  coffresForts,
  mouvementsFinanciers,
  sessionsCaisse,
  operationsCaisse,
  caisses,
  employes,
  users,
  transfertsCoffreCaisse,
  virementsProgrammes,
  dossiersCredit,
  configCoffreFort,
} from "@shared/schema";
import { transfertsInterCoffres } from "@shared/schema/coffres-forts";
import { eq, sql, and, isNull, notInArray, ne, inArray, or, desc } from "drizzle-orm";
import { StatutAgence, StatutCompte, StatutCredit, StatutDemande, StatutTransaction, StatutTransfertInterCoffre } from "@shared/enum/status-constants";
import { createHash, randomBytes } from "crypto";
import {
  assertCoffreCanDebit,
  assertCoffreCanCredit,
  updateCoffreBalance,
  type GuardContext,
} from "./coffre/coffre-guard";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";
import { postGlForMouvement, AccountingRuleNotFoundError } from "./accounting-posting-service";
import { currencySymbol } from "@shared/config/currency";

const logger = createLogger('AgencyMigration');

// ============================================
// TYPES & INTERFACES
// ============================================

interface MigrationContext {
  migration: AgencyMigration;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface StepLog {
  step: string;
  timestamp: string;
  details?: any;
  success: boolean;
  count?: number;
  durationMs?: number;
}

type PreFlightCheckType =
  | "OPEN_SESSIONS"
  | "PENDING_TRANSFERS"
  | "ACTIVE_OPERATIONS"
  | "BALANCE_VERIFICATION"
  | "DATA_INTEGRITY"
  | "TREASURY_RULES";

// ============================================
// ERRORS
// ============================================

export class MigrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

// ============================================
// AGENCY MIGRATION SERVICE
// ============================================

export class AgencyMigrationService {
  /**
   * Génère une référence unique pour la migration
   */
  private generateReference(): string {
    const year = new Date().getFullYear();
    const random = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    return `MIG-${year}-${random}`;
  }

  /**
   * Génère un checksum SHA256 pour vérifier l'intégrité des données
   */
  private generateChecksum(data: any): string {
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

  /**
   * Log d'audit immutable
   */
  private async logAudit(
    ctx: MigrationContext,
    action: string,
    statutAvant: string | null,
    statutApres: string | null,
    details: any
  ): Promise<void> {
    await db.insert(migrationAuditLogs).values({
      migrationId: ctx.migration.id,
      action,
      statutAvant,
      statutApres,
      details,
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Mise à jour du statut et de la progression
   */
  private async updateMigrationStatus(
    migrationId: string,
    statut: string,
    progress: number,
    logs: StepLog[],
    currentStep?: string,
    error?: string,
    errorDetails?: any,
    /** Pass sourceAgencyId to enable WebSocket broadcasting */
    sourceAgencyId?: string,
  ): Promise<void> {
    await db
      .update(agencyMigrations)
      .set({
        statut,
        progress,
        logs,
        currentStep,
        error,
        errorDetails,
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    // Broadcast real-time progress via WebSocket
    this.broadcastMigrationProgress(migrationId, sourceAgencyId, currentStep || statut, progress);
  }

  /**
   * Broadcast migration progress to all connected users in the agency
   */
  private broadcastMigrationProgress(
    migrationId: string,
    sourceAgencyId?: string,
    step?: string,
    progress?: number,
    count?: number,
    total?: number,
  ): void {
    try {
      const ws = getWsInstance();
      if (!ws) return;

      const payload = { migrationId, step, progress, count, total, timestamp: new Date().toISOString() };

      if (sourceAgencyId) {
        ws.broadcastToAgency(sourceAgencyId, { type: "MIGRATION_PROGRESS", payload });
      }
      // Also broadcast globally for admin dashboards
      ws.broadcast({ type: "MIGRATION_PROGRESS", payload });
    } catch {
      // WebSocket broadcast failure is non-critical
    }
  }

  /**
   * Broadcast migration status change (lifecycle events: STARTED, COMPLETED, FAILED, ROLLED_BACK)
   */
  private broadcastMigrationStatus(
    migrationId: string,
    sourceAgencyId: string,
    status: string,
    details?: Record<string, any>,
  ): void {
    try {
      const ws = getWsInstance();
      if (!ws) return;

      const payload = { migrationId, status, ...details, timestamp: new Date().toISOString() };

      ws.broadcastToAgency(sourceAgencyId, { type: "MIGRATION_STATUS", payload });
      ws.broadcast({ type: "MIGRATION_STATUS", payload });
    } catch {
      // WebSocket broadcast failure is non-critical
    }
  }

  // ============================================
  // ENTITY MIGRATION HELPERS
  // ============================================

  /**
   * Batch-insert entity logs with snapshotBefore.
   * Inserts in chunks of `batchSize` to avoid OOM on large datasets.
   */
  private async batchInsertEntityLogs<T extends { id: string }>(
    tx: any,
    migrationId: string,
    entityType: string,
    entities: T[],
    sourceAgencyId: string,
    targetAgencyId: string,
    snapshotFn: (entity: T) => object,
    batchSize: number = 500
  ): Promise<void> {
    const logBatch = entities.map((e) => ({
      migrationId,
      entityType,
      entityId: e.id,
      previousAgencyId: sourceAgencyId,
      newAgencyId: targetAgencyId,
      snapshotBefore: snapshotFn(e),
      success: true,
    }));

    for (let i = 0; i < logBatch.length; i += batchSize) {
      await tx.insert(migrationEntityLogs).values(logBatch.slice(i, i + batchSize));
    }
  }

  // ============================================
  // PRE-FLIGHT CHECKS
  // ============================================

  /**
   * Vérifier les sessions de caisse ouvertes
   */
  private async checkOpenSessions(sourceAgencyId: string): Promise<{
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

  /**
   * Vérifier les transferts inter-coffres en attente
   */
  private async checkPendingTransfers(sourceAgencyId: string): Promise<{
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

  /**
   * Vérifier l'intégrité des données (doublons emails/telephones/comptes, FK, agences cibles)
   */
  private async checkDataIntegrity(
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

  /**
   * Vérifier la cohérence des soldes coffre (solde DB vs SUM mouvements)
   */
  private async checkBalanceVerification(
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

  /**
   * Vérifier qu'il n'y a pas d'opérations actives (crédits en décaissement, etc.)
   */
  private async checkActiveOperations(
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

  /**
   * Vérifier les règles de trésorerie (plafonds, solde minimum)
   */
  private async checkTreasuryRules(
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

  /**
   * Exécuter tous les pre-flight checks
   */
  async runPreFlightChecks(
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
      { type: "OPEN_SESSIONS", fn: () => this.checkOpenSessions(sourceAgencyId), blocking: true },
      { type: "PENDING_TRANSFERS", fn: () => this.checkPendingTransfers(sourceAgencyId), blocking: true },
      { type: "ACTIVE_OPERATIONS", fn: () => this.checkActiveOperations(sourceAgencyId), blocking: true },
      { type: "DATA_INTEGRITY", fn: () => this.checkDataIntegrity(sourceAgencyId, targetClientsAgencyId, targetEmployeesAgencyId, targetTreasuryAgencyId), blocking: true },
      { type: "BALANCE_VERIFICATION", fn: () => this.checkBalanceVerification(sourceAgencyId), blocking: false },
      { type: "TREASURY_RULES", fn: () => this.checkTreasuryRules(sourceAgencyId, targetTreasuryAgencyId), blocking: false },
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

  // ============================================
  // DRY RUN (SIMULATION)
  // ============================================

  /**
   * Exécuter une simulation de migration (sans modifications)
   */
  async runDryRun(migrationId: string): Promise<DryRunResult> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    // Compter les entités
    const volumetry = await this.countEntities(migration.sourceAgencyId);

    // Exécuter les pre-flight checks
    const preFlightResult = await this.runPreFlightChecks(
      migrationId,
      migration.sourceAgencyId,
      migration.targetClientsAgencyId,
      undefined,
      migration.targetEmployeesAgencyId,
      migration.targetTreasuryAgencyId,
    );

    // Calculer les montants financiers
    const financials = await this.calculateFinancials(migration.sourceAgencyId);

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
      .filter((c) => !c.passed && c.blocking)
      .map((c) => c.message);

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

  // ============================================
  // COMPTAGE DES ENTITÉS
  // ============================================

  private async countEntities(sourceAgencyId: string): Promise<MigrationVolumetry> {
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

  private async calculateFinancials(sourceAgencyId: string): Promise<MigrationFinancials> {
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

  // ============================================
  // MIGRATION PRINCIPALE (TRANSACTION ACID)
  // ============================================

  /**
   * Exécuter la migration avec atomicité totale
   */
  async processMigration(migrationId: string, ctx?: Partial<MigrationContext>): Promise<void> {
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

      await this.logAudit(context, "STARTED", migration.statut, MIGRATION_STATUS.PRE_FLIGHT_CHECK, {
        startTime: new Date().toISOString(),
      });
      this.broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "STARTED", { reference: migration.reference });

      // ============================================
      // ÉTAPE 0: PRE-FLIGHT CHECKS
      // ============================================
      const stepStartPre = Date.now();
      await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PRE_FLIGHT_CHECK, 5, logs, "Pre-flight checks");

      const preFlightResult = await this.runPreFlightChecks(
        migrationId,
        migration.sourceAgencyId,
        migration.targetClientsAgencyId,
        ctx?.userId,
        migration.targetEmployeesAgencyId,
        migration.targetTreasuryAgencyId,
      );

      if (preFlightResult.blockingFailed) {
        const failedChecks = preFlightResult.checks
          .filter((c) => !c.passed && c.blocking)
          .map((c) => c.message)
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
      await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 10, logs, "Début transaction");

      await db.transaction(async (tx) => {
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
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 10, logs, "Migration clients");

          const clientsToMigrate = await tx
            .select({ id: clients.id, nom: users.nom, prenom: users.prenom, telephone: users.telephone, email: users.email })
            .from(clients)
            .leftJoin(users, eq(clients.userId, users.id))
            .where(and(eq(clients.agenceId, migration.sourceAgencyId), isNull(clients.deletedAt)));

          await tx.update(clients)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(clients.agenceId, migration.sourceAgencyId), isNull(clients.deletedAt)));

          volumetry.clients = clientsToMigrate.length;
          await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.CLIENT,
            clientsToMigrate, migration.sourceAgencyId, targetClients,
            (c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email })
          );
          logStep("Migration clients", true, clientsToMigrate.length, undefined, Date.now() - stepStart);

          // ============================================
          // ÉTAPE 2: MIGRATION DES COMPTES (15-25%)
          // ============================================
          const s2 = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 15, logs, "Migration comptes");

          const comptesToMigrate = await tx
            .select({ id: comptes.id, numeroCompte: comptes.numeroCompte, typeCompte: comptes.typeCompte, statut: comptes.statut, soldeCourant: comptes.soldeCourant })
            .from(comptes)
            .where(and(eq(comptes.agenceId, migration.sourceAgencyId), isNull(comptes.deletedAt)));

          await tx.update(comptes)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(comptes.agenceId, migration.sourceAgencyId), isNull(comptes.deletedAt)));

          volumetry.comptes = comptesToMigrate.length;
          financials.totalSoldesComptes = comptesToMigrate.reduce((s, c) => s + Number(c.soldeCourant || 0), 0);
          await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.COMPTE,
            comptesToMigrate, migration.sourceAgencyId, targetClients,
            (c) => ({ id: c.id, numeroCompte: c.numeroCompte, typeCompte: c.typeCompte, statut: c.statut, soldeCourant: c.soldeCourant })
          );
          logStep("Migration comptes", true, comptesToMigrate.length, undefined, Date.now() - s2);

          // ============================================
          // ÉTAPE 3: MIGRATION DES CRÉDITS (25-30%)
          // ============================================
          const s3 = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 25, logs, "Migration crédits");

          const creditsToMigrate = await tx
            .select({ id: credits.id, numeroCredit: credits.numeroCredit, statut: credits.statut, soldeRestant: credits.soldeRestant, montantAccorde: credits.montant })
            .from(credits)
            .where(and(eq(credits.agenceId, migration.sourceAgencyId), isNull(credits.deletedAt)));

          await tx.update(credits)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(credits.agenceId, migration.sourceAgencyId), isNull(credits.deletedAt)));

          volumetry.credits = creditsToMigrate.length;
          financials.totalCreditsEnCours = creditsToMigrate.reduce((s, c) => s + Number(c.soldeRestant || 0), 0);
          await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.CREDIT,
            creditsToMigrate, migration.sourceAgencyId, targetClients,
            (c) => ({ id: c.id, numeroCredit: c.numeroCredit, statut: c.statut, soldeRestant: c.soldeRestant, montantAccorde: c.montantAccorde })
          );
          logStep("Migration crédits", true, creditsToMigrate.length, undefined, Date.now() - s3);

          // ============================================
          // ÉTAPE 4: MIGRATION DES DEMANDES DE CRÉDIT (30-33%)
          // ============================================
          const s4 = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 30, logs, "Migration demandes crédit");

          const demandesToMigrate = await tx
            .select({ id: demandesCredit.id, statut: demandesCredit.statut, montantDemande: demandesCredit.montantDemande })
            .from(demandesCredit)
            .where(and(eq(demandesCredit.agenceId, migration.sourceAgencyId), isNull(demandesCredit.deletedAt)));

          await tx.update(demandesCredit)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(and(eq(demandesCredit.agenceId, migration.sourceAgencyId), isNull(demandesCredit.deletedAt)));

          volumetry.demandesCredit = demandesToMigrate.length;
          await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.DEMANDE_CREDIT,
            demandesToMigrate, migration.sourceAgencyId, targetClients,
            (d) => ({ id: d.id, statut: d.statut, montantDemande: d.montantDemande })
          );
          logStep("Migration demandes crédit", true, demandesToMigrate.length, undefined, Date.now() - s4);

          // ============================================
          // ÉTAPE 4b: MIGRATION DES DOSSIERS CRÉDIT (33-35%)
          // ============================================
          const s4b = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 33, logs, "Migration dossiers crédit");

          const dossiersToMigrate = await tx
            .select({ id: dossiersCredit.id })
            .from(dossiersCredit)
            .where(eq(dossiersCredit.agenceId, migration.sourceAgencyId));

          if (dossiersToMigrate.length > 0) {
            await tx.update(dossiersCredit)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(eq(dossiersCredit.agenceId, migration.sourceAgencyId));

            volumetry.dossiersCredit = dossiersToMigrate.length;
            await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.DOSSIER_CREDIT,
              dossiersToMigrate, migration.sourceAgencyId, targetClients,
              (d) => ({ id: d.id })
            );
          }
          logStep("Migration dossiers crédit", true, dossiersToMigrate.length, undefined, Date.now() - s4b);

          // ============================================
          // ÉTAPE 5: MIGRATION DES TONTINES + SUB-TABLES (35-45%)
          // ============================================
          const s5 = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 35, logs, "Migration tontines");

          const tontinesToMigrate = await tx
            .select({ id: tontines.id, nom: tontines.nom, statut: tontines.statut })
            .from(tontines)
            .where(eq(tontines.agenceId, migration.sourceAgencyId));

          await tx.update(tontines)
            .set({ agenceId: targetClients, updatedAt: new Date() })
            .where(eq(tontines.agenceId, migration.sourceAgencyId));

          volumetry.tontines = tontinesToMigrate.length;
          await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.TONTINE,
            tontinesToMigrate, migration.sourceAgencyId, targetClients,
            (t) => ({ id: t.id, nom: t.nom, statut: t.statut })
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
              await this.batchInsertEntityLogs(tx, migrationId, sub.type,
                rows, migration.sourceAgencyId, targetClients,
                (r) => ({ id: r.id })
              );
            }
          }

          logStep("Migration tontines + sub-tables", true, tontinesToMigrate.length, undefined, Date.now() - s5);

          // ============================================
          // ÉTAPE 5b: MIGRATION MOUVEMENTS FINANCIERS (45-50%)
          // ============================================
          const s5b = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 45, logs, "Migration mouvements financiers");

          const mouvementsToMigrate = await tx
            .select({ id: mouvementsFinanciers.id, reference: mouvementsFinanciers.reference, sens: mouvementsFinanciers.sens, montant: mouvementsFinanciers.montant })
            .from(mouvementsFinanciers)
            .where(eq(mouvementsFinanciers.agenceId, migration.sourceAgencyId));

          if (mouvementsToMigrate.length > 0) {
            await tx.update(mouvementsFinanciers)
              .set({ agenceId: targetClients })
              .where(eq(mouvementsFinanciers.agenceId, migration.sourceAgencyId));

            volumetry.mouvementsFinanciers = mouvementsToMigrate.length;
            await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.MOUVEMENT_FINANCIER,
              mouvementsToMigrate, migration.sourceAgencyId, targetClients,
              (m) => ({ id: m.id, reference: m.reference, sens: m.sens, montant: m.montant })
            );
          }
          logStep("Migration mouvements financiers", true, mouvementsToMigrate.length, undefined, Date.now() - s5b);

          // ============================================
          // ÉTAPE 5c: MIGRATION SESSIONS CAISSE (50-53%)
          // ============================================
          const s5c = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 50, logs, "Migration sessions caisse");

          const sessionsToMigrate = await tx
            .select({ id: sessionsCaisse.id })
            .from(sessionsCaisse)
            .where(and(eq(sessionsCaisse.agenceId, migration.sourceAgencyId), isNull(sessionsCaisse.deletedAt)));

          if (sessionsToMigrate.length > 0) {
            await tx.update(sessionsCaisse)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(and(eq(sessionsCaisse.agenceId, migration.sourceAgencyId), isNull(sessionsCaisse.deletedAt)));

            volumetry.sessionsCaisse = sessionsToMigrate.length;
            await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.SESSION_CAISSE,
              sessionsToMigrate, migration.sourceAgencyId, targetClients,
              (s) => ({ id: s.id })
            );
          }
          logStep("Migration sessions caisse", true, sessionsToMigrate.length, undefined, Date.now() - s5c);

          // ============================================
          // ÉTAPE 5d: MIGRATION TRANSFERTS COFFRE-CAISSE (53-55%)
          // ============================================
          const s5d = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 53, logs, "Migration transferts coffre-caisse");

          const transfertsCCToMigrate = await tx
            .select({ id: transfertsCoffreCaisse.id })
            .from(transfertsCoffreCaisse)
            .where(eq(transfertsCoffreCaisse.agenceId, migration.sourceAgencyId));

          if (transfertsCCToMigrate.length > 0) {
            await tx.update(transfertsCoffreCaisse)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(eq(transfertsCoffreCaisse.agenceId, migration.sourceAgencyId));

            volumetry.transfertsCoffreCaisse = transfertsCCToMigrate.length;
            await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.TRANSFERT_COFFRE_CAISSE,
              transfertsCCToMigrate, migration.sourceAgencyId, targetClients,
              (t) => ({ id: t.id })
            );
          }
          logStep("Migration transferts coffre-caisse", true, transfertsCCToMigrate.length, undefined, Date.now() - s5d);

          // ============================================
          // ÉTAPE 5e: MIGRATION VIREMENTS PROGRAMMÉS (55-57%)
          // ============================================
          const s5e = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 55, logs, "Migration virements programmés");

          const virementsToMigrate = await tx
            .select({ id: virementsProgrammes.id })
            .from(virementsProgrammes)
            .where(eq(virementsProgrammes.agenceId, migration.sourceAgencyId));

          if (virementsToMigrate.length > 0) {
            await tx.update(virementsProgrammes)
              .set({ agenceId: targetClients, updatedAt: new Date() })
              .where(eq(virementsProgrammes.agenceId, migration.sourceAgencyId));

            volumetry.virementsProgrammes = virementsToMigrate.length;
            await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.VIREMENT_PROGRAMME,
              virementsToMigrate, migration.sourceAgencyId, targetClients,
              (v) => ({ id: v.id })
            );
          }
          logStep("Migration virements programmés", true, virementsToMigrate.length, undefined, Date.now() - s5e);
        }

        // ============================================
        // ÉTAPE 6: MIGRATION DES EMPLOYÉS (65-75%)
        // ============================================
        if (migration.targetEmployeesAgencyId) {
          const stepStartEmployes = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 65, logs, "Migration employés");

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
          await this.batchInsertEntityLogs(tx, migrationId, MIGRATION_ENTITY_TYPE.EMPLOYE,
            userAgencesToMigrate, migration.sourceAgencyId, migration.targetEmployeesAgencyId!,
            (ua) => ({ id: ua.id, userId: ua.userId, agenceId: ua.agenceId, actif: ua.actif })
          );

          logStep("Migration employés", true, employesToMigrate.length, undefined, Date.now() - stepStartEmployes);
        }

        // ============================================
        // ÉTAPE 7: TRANSFERT DE TRÉSORERIE (75-90%)
        // ============================================
        if (migration.targetTreasuryAgencyId) {
          const stepStartTreasury = Date.now();
          await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 75, logs, "Transfert trésorerie");

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
        await this.updateMigrationStatus(migrationId, MIGRATION_STATUS.PROCESSING, 90, logs, "Archivage agence source");

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
        checksum: this.generateChecksum({ volumetry, financials, migrationId }),
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

      await this.logAudit(context, "COMPLETED", MIGRATION_STATUS.PROCESSING, MIGRATION_STATUS.COMPLETED, {
        report,
        durationMs: endTime - startTime,
      });

      logger.info({ migrationId, durationMs: endTime - startTime }, 'Job completed');
      this.broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "COMPLETED", {
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

      await this.logAudit(context, "FAILED", MIGRATION_STATUS.PROCESSING, MIGRATION_STATUS.FAILED, {
        error: error.message,
        code: error.code,
      });
      this.broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "FAILED", {
        error: error.message,
        code: error.code,
      });

      throw error;
    }
  }

  // ============================================
  // ROLLBACK
  // ============================================

  /**
   * Rollback complet d'une migration (reverse toutes les entités + trésorerie)
   * Limité à 24h après completion.
   */
  async rollbackMigration(
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

      await db.transaction(async (tx) => {
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
      await this.logAudit(context, "ROLLED_BACK", MIGRATION_STATUS.COMPLETED, MIGRATION_STATUS.ROLLED_BACK, {
        rollbackReport,
      });

      logger.info({ migrationId, durationMs: rollbackReport.durationMs }, 'Migration rolled back');
      this.broadcastMigrationStatus(migrationId, migration.sourceAgencyId, "ROLLED_BACK", {
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

  // ============================================
  // MÉTHODES UTILITAIRES
  // ============================================

  /**
   * Créer une nouvelle migration
   */
  async createMigration(params: {
    sourceAgencyId: string;
    targetClientsAgencyId?: string;
    targetEmployeesAgencyId?: string;
    targetTreasuryAgencyId?: string;
    scheduledAt?: Date;
    createdBy?: string;
  }): Promise<AgencyMigration> {
    const reference = this.generateReference();

    const [migration] = await db
      .insert(agencyMigrations)
      .values({
        reference,
        sourceAgencyId: params.sourceAgencyId,
        targetClientsAgencyId: params.targetClientsAgencyId,
        targetEmployeesAgencyId: params.targetEmployeesAgencyId,
        targetTreasuryAgencyId: params.targetTreasuryAgencyId,
        scheduledAt: params.scheduledAt,
        statut: params.scheduledAt ? MIGRATION_STATUS.SCHEDULED : MIGRATION_STATUS.DRAFT,
        createdBy: params.createdBy,
      })
      .returning();

    // Log d'audit
    await db.insert(migrationAuditLogs).values({
      migrationId: migration.id,
      action: "CREATED",
      statutAvant: null,
      statutApres: migration.statut,
      details: { ...params, reference },
      userId: params.createdBy,
    });

    // Si planifiée, passer l'agence en mode "En fermeture"
    if (params.scheduledAt) {
      await db
        .update(agences)
        .set({
          statut: AGENCY_MIGRATION_MODE.CLOSING_PENDING,
          notes: `Migration planifiée pour le ${params.scheduledAt.toISOString()}. Référence: ${reference}`,
          updatedAt: new Date(),
        })
        .where(eq(agences.id, params.sourceAgencyId));
    }

    return migration;
  }

  /**
   * Soumettre une migration pour exécution
   */
  async submitMigration(migrationId: string, userId?: string): Promise<void> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    // Idempotent: if already submitted (PENDING/SCHEDULED), return silently
    if (migration.statut === MIGRATION_STATUS.PENDING || migration.statut === MIGRATION_STATUS.SCHEDULED) {
      return;
    }

    if (migration.statut !== MIGRATION_STATUS.DRAFT) {
      throw new MigrationError("Seuls les brouillons peuvent être soumis", "INVALID_STATUS");
    }

    const previousStatus = migration.statut;
    const newStatus = migration.scheduledAt ? MIGRATION_STATUS.SCHEDULED : MIGRATION_STATUS.PENDING;

    await db
      .update(agencyMigrations)
      .set({
        statut: newStatus,
        executedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    await db.insert(migrationAuditLogs).values({
      migrationId,
      action: "SUBMITTED",
      statutAvant: previousStatus,
      statutApres: newStatus,
      details: { executedBy: userId },
      userId,
    });

    // Mettre l'agence en mode fermeture si pas déjà fait
    await db
      .update(agences)
      .set({
        statut: AGENCY_MIGRATION_MODE.CLOSING_PENDING,
        updatedAt: new Date(),
      })
      .where(eq(agences.id, migration.sourceAgencyId));
  }

  /**
   * Annuler une migration
   */
  async cancelMigration(migrationId: string, reason: string, userId?: string): Promise<void> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    const cancelableStatuses: string[] = [MIGRATION_STATUS.DRAFT, MIGRATION_STATUS.PENDING, MIGRATION_STATUS.SCHEDULED];
    if (!cancelableStatuses.includes(migration.statut)) {
      throw new MigrationError("Cette migration ne peut plus être annulée", "INVALID_STATUS");
    }

    await db
      .update(agencyMigrations)
      .set({
        statut: MIGRATION_STATUS.CANCELLED,
        error: reason,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    await db.insert(migrationAuditLogs).values({
      migrationId,
      action: "CANCELLED",
      statutAvant: migration.statut,
      statutApres: MIGRATION_STATUS.CANCELLED,
      details: { reason },
      userId,
    });

    // Remettre l'agence en mode actif
    await db
      .update(agences)
      .set({
        statut: AGENCY_MIGRATION_MODE.ACTIVE,
        notes: null,
        updatedAt: new Date(),
      })
      .where(eq(agences.id, migration.sourceAgencyId));
  }

  /**
   * Récupérer les migrations planifiées à exécuter
   */
  async getScheduledMigrationsToExecute(): Promise<AgencyMigration[]> {
    return db
      .select()
      .from(agencyMigrations)
      .where(
        and(
          eq(agencyMigrations.statut, MIGRATION_STATUS.SCHEDULED),
          sql`${agencyMigrations.scheduledAt} <= NOW()`
        )
      );
  }

  /**
   * Récupérer le statut d'une migration
   */
  async getMigrationStatus(migrationId: string): Promise<AgencyMigration | null> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    return migration || null;
  }

  /**
   * Récupérer les pre-flight checks d'une migration
   */
  async getMigrationPreFlightChecks(migrationId: string) {
    return db
      .select()
      .from(migrationPreFlightChecks)
      .where(eq(migrationPreFlightChecks.migrationId, migrationId))
      .orderBy(migrationPreFlightChecks.checkedAt);
  }

  /**
   * Récupérer les logs d'audit d'une migration
   */
  async getMigrationAuditLogs(migrationId: string) {
    return db
      .select()
      .from(migrationAuditLogs)
      .where(eq(migrationAuditLogs.migrationId, migrationId))
      .orderBy(migrationAuditLogs.timestamp);
  }

  /**
   * Récupérer les entités migrées
   */
  async getMigrationEntityLogs(migrationId: string, entityType?: string) {
    const conditions = [eq(migrationEntityLogs.migrationId, migrationId)];

    if (entityType) {
      conditions.push(eq(migrationEntityLogs.entityType, entityType));
    }

    return db
      .select()
      .from(migrationEntityLogs)
      .where(and(...conditions))
      .orderBy(migrationEntityLogs.migratedAt);
  }
}

export const agencyMigrationService = new AgencyMigrationService();
