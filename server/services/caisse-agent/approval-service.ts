/**
 * ApprovalService - Approbation et rejet des opérations terrain
 *
 * Ce service gère le workflow d'approbation:
 * - SUBMITTED → PENDING_SETTLEMENT (pour COLLECT_CASH - attend la REMISE)
 * - SUBMITTED → SETTLED (pour SETTLEMENT_CASH - règlement immédiat)
 * - SUBMITTED → REJECTED (aucune écriture)
 *
 * IMPORTANT: Pour COLLECT_CASH, l'approbation:
 * - Crée un mouvement uniquement sur la caisse agent (soldeValide += montant)
 * - Crée un paiement terrain avec statut PENDING_SETTLEMENT
 * - NE TOUCHE PAS aux comptes clients (crédit, épargne, tontine)
 * - Les comptes clients sont impactés SEULEMENT à la validation de la REMISE
 *   (voir RemiseSettlementService)
 *
 * Garanties:
 * - Idempotence: une opération déjà approuvée retourne success sans re-poster
 * - Atomicité: toutes les écritures sont dans une seule transaction
 * - Audit: chaque transition est loggée
 */

import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger('ApprovalService');
import {
  operationsTerrain,
  operationsTerrainAuditLogs,
  caissesAgent,
  mouvementsFinanciers,
  paiementsTerrain,
  caisses,
  credits,
  comptes,
  evenementsOutbox,
  sessionsCaisse,
  agentsTerrain,
  employes,
  type OperationTerrain,
  type ApproveOperationInput,
  type RejectOperationInput,
  type OperationTerrainMetadata,
  contributionsTontine,
  remboursements,
  transactionsCompte,
} from "@shared/schema";
import { StatutTransaction, TypeCompte, TypeOperationCaisse, type TypeOperationCaisseType } from "@shared/enum/status-constants";
import { eq, sql, and, isNull } from "drizzle-orm";
import { generateReference, updateCreditSolde, updateSessionSolde, type MouvementFinancier } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import type { PgTransaction } from "drizzle-orm/pg-core";

// Type pour les résultats d'approbation
interface ApprovalResult {
  success: boolean;
  operation?: OperationTerrain;
  mouvements?: MouvementFinancier[];
  error?: string;
  errorCode?: string;
}

/**
 * Helper: Get agenceId from agent (via employes table)
 */
async function getAgenceIdFromAgent(
  tx: PgTransaction<any, any, any>,
  agentId: string
): Promise<string | undefined> {
  const [result] = await tx
    .select({ agenceId: employes.agenceId })
    .from(agentsTerrain)
    .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .where(eq(agentsTerrain.id, agentId))
    .limit(1);
  return result?.agenceId || undefined;
}

/**
 * Helper: Get agenceId from caisse
 */
async function getAgenceIdFromCaisse(
  tx: PgTransaction<any, any, any>,
  caisseId: string
): Promise<string | undefined> {
  const [result] = await tx
    .select({ agenceId: caisses.agenceId })
    .from(caisses)
    .where(eq(caisses.id, caisseId))
    .limit(1);
  return result?.agenceId || undefined;
}

/**
 * Helper: Post GL entry for a mouvement, handling errors gracefully
 * Returns true if posted, false if skipped/failed (non-critical)
 */
async function tryPostGl(
  tx: PgTransaction<any, any, any>,
  mouvement: MouvementFinancier,
  agenceId: string | undefined,
  userId: string,
  additionalMetadata?: Record<string, any>
): Promise<boolean> {
  if (!agenceId) {
    throw new Error(`GL posting impossible: no agenceId for mouvement ${mouvement.id}`);
  }

  // STRICT — GL failure rolls back the entire transaction
  const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, additionalMetadata);
  if (glResult) {
    logger.info({ mouvementId: mouvement.id, numeroPiece: glResult.numeroPiece }, 'GL posted for mouvement');
  }
  await tx
    .update(mouvementsFinanciers)
    .set({ glPostingStatus: "POSTED" })
    .where(eq(mouvementsFinanciers.id, mouvement.id));
  return true;
}

export class ApprovalService {
  /**
   * Approuve une opération et poste les écritures
   * TRANSACTIONNEL et IDEMPOTENT
   */
  async approveOperation(params: ApproveOperationInput): Promise<ApprovalResult> {
    return await db.transaction(async (tx) => {
      // 1. Verrouiller l'opération (SELECT FOR UPDATE)
      const [operation] = await tx
        .select()
        .from(operationsTerrain)
        .where(eq(operationsTerrain.id, params.operationId))
        .for("update");

      if (!operation) {
        return {
          success: false,
          error: "Opération non trouvée",
          errorCode: "NOT_FOUND",
        };
      }

      // 2. Vérifier idempotence (déjà approuvée?)
      if (operation.statut === "APPROVED") {
        // Retourner succès sans re-poster
        return { success: true, operation, mouvements: [] };
      }

      // 3. Vérifier statut valide
      if (operation.statut !== "SUBMITTED") {
        return {
          success: false,
          error: `Impossible d'approuver: statut actuel ${operation.statut}`,
          errorCode: "INVALID_STATUS",
        };
      }

      // 4. Poster les écritures selon le type
      let mouvements: MouvementFinancier[] = [];
      let paiementTerrainId: string | null = null;

      if (operation.type === "COLLECT_CASH") {
        // NOUVEAU WORKFLOW: N'impacte PAS les comptes clients
        // - Seul le solde de l'agent est incrémenté
        // - Un paiement terrain est créé avec statut PENDING_SETTLEMENT
        // - Les comptes clients seront impactés à la validation de la REMISE
        const result = await this.postCollectCashEntriesPendingSettlement(tx, operation, params.approvedBy);
        if (!result.success) {
          return result;
        }
        mouvements = result.mouvements || [];
        paiementTerrainId = result.paiementTerrainId || null;
      } else if (operation.type === "SETTLEMENT_CASH") {
        const result = await this.postSettlementCashEntries(tx, operation, params.approvedBy);
        if (!result.success) {
          return result;
        }
        mouvements = result.mouvements || [];
      }

      // 5. Mettre à jour l'opération
      // COLLECT_CASH → PENDING_SETTLEMENT (attend la remise)
      // SETTLEMENT_CASH → SETTLED (règlement immédiat)
      const finalStatut = operation.type === "SETTLEMENT_CASH" ? "SETTLED" : "PENDING_SETTLEMENT";
      const [updatedOperation] = await tx
        .update(operationsTerrain)
        .set({
          statut: finalStatut,
          approvedBy: params.approvedBy,
          approvedAt: new Date(),
          postedAt: new Date(),
          postedMouvementCaisseAgentId: mouvements[0]?.id || null,
          postedMouvementClientId: operation.type === "COLLECT_CASH" ? mouvements[1]?.id || null : null,
          postedMouvementDestinationId: operation.type === "SETTLEMENT_CASH" ? mouvements[1]?.id || null : null,
          postedPaiementTerrainId: paiementTerrainId,
          updatedAt: new Date(),
        })
        .where(eq(operationsTerrain.id, operation.id))
        .returning();

      // 6. Log audit
      await tx.insert(operationsTerrainAuditLogs).values({
        operationId: operation.id,
        action: finalStatut,
        statutAvant: "SUBMITTED",
        statutApres: finalStatut,
        details: {
          mouvementIds: mouvements.map((m) => m.id),
          paiementTerrainId,
        },
        userId: params.approvedBy,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      // 7. Créer événements outbox pour notifications
      await this.createOutboxEvents(tx, updatedOperation, mouvements);

      return { success: true, operation: updatedOperation, mouvements };
    });
  }

  /**
   * NOUVEAU: Poste les écritures pour COLLECT_CASH avec statut PENDING_SETTLEMENT
   *
   * NE TOUCHE PAS AUX COMPTES CLIENTS!
   * - Seul le solde de l'agent est incrémenté
   * - Un paiement terrain est créé avec statut PENDING_SETTLEMENT
   * - Les comptes clients seront impactés à la validation de la REMISE
   */
  private async postCollectCashEntriesPendingSettlement(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    approvedBy: string
  ): Promise<ApprovalResult & { paiementTerrainId?: string }> {
    const montant = parseFloat(operation.montant);
    const metadata = operation.metadata as OperationTerrainMetadata | null;

    // Validate caisseAgentId exists (schema says notNull but let's be safe)
    if (!operation.caisseAgentId) {
      logger.error({ operationId: operation.id }, 'CRITICAL: Operation has no caisseAgentId');
      return {
        success: false,
        error: "Opération sans caisse agent associée",
        errorCode: "MISSING_CAISSE_AGENT",
      };
    }

    // 1. Créer mouvement CaisseAgent (Débit = Augmente la créance envers l'agent)
    const refCaisseAgent = generateReference("CAISSE_AGENT" as any);
    const [mouvementCaisseAgent] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "DEBIT", // Débit = Augmente la créance envers l'agent
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCaisseAgent,
        agentId: operation.agentId,
        clientId: operation.clientId,
        typePaiement: "MISC_COLLECTION" as any, // Type pour matching des règles comptables
        sourceModule: "CAISSE_AGENT" as any,
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: {
          operationType: "COLLECT_CASH",
          caisseAgentId: operation.caisseAgentId,
          pendingSettlement: true,
        },
      })
      .returning();

    // 2. Mettre à jour solde CaisseAgent (atomique) avec vérification
    const [updatedCaisse] = await tx
      .update(caissesAgent)
      .set({
        soldeValide: sql`${caissesAgent.soldeValide} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, operation.caisseAgentId))
      .returning({ id: caissesAgent.id, soldeValide: caissesAgent.soldeValide });

    if (!updatedCaisse) {
      logger.error({ operationId: operation.id, caisseAgentId: operation.caisseAgentId }, 'Caisse agent update failed - no rows matched');
      throw new Error(`Caisse agent ${operation.caisseAgentId} introuvable pour mise à jour du solde`);
    }

    logger.info({
      operationId: operation.id,
      caisseAgentId: operation.caisseAgentId,
      montant,
      nouveauSolde: updatedCaisse.soldeValide,
    }, 'Caisse agent solde updated after collect approval');

    // 2b. Post GL entry for caisse agent mouvement
    const agenceId = await getAgenceIdFromAgent(tx, operation.agentId);
    await tryPostGl(tx, mouvementCaisseAgent, agenceId, approvedBy, {
      operationType: "COLLECT_CASH",
      caisseAgentId: operation.caisseAgentId,
    });

    const mouvements: MouvementFinancier[] = [mouvementCaisseAgent];

    // 3. Créer le paiement terrain avec statut PENDING_SETTLEMENT
    // PAS de mouvement client, PAS d'impact sur crédit/compte/tontine
    // Cela sera fait à la validation de la REMISE
    const typePaiement = this.determinePaymentType(metadata);
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;

    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement,
        montant: operation.montant,
        methodePaiement: "CASH",
        reference: refPaiement,
        // PAS de mouvementId client - sera créé à la REMISE
        mouvementId: mouvementCaisseAgent.id, // Lien vers le mouvement caisse agent
        creditId: metadata?.creditId,
        compteId: metadata?.compteId,
        tontineId: metadata?.tontineId,
        statut: "PENDING_SETTLEMENT", // NOUVEAU STATUT
        observations: metadata?.observations,
        latitude: metadata?.latitude?.toString(),
        longitude: metadata?.longitude?.toString(),
        createdBy: approvedBy,
      })
      .returning();

    return { success: true, mouvements, paiementTerrainId: paiement.id };
  }

  /**
   * Détermine le type de paiement basé sur les métadonnées
   */
  private determinePaymentType(metadata: OperationTerrainMetadata | null): any {
    if (metadata?.creditId) return TypeOperationCaisse.CREDIT_REPAYMENT;
    if (metadata?.compteId) return TypeOperationCaisse.DEPOSIT_SAVINGS;
    if (metadata?.tontineId) return TypeOperationCaisse.TONTINE_CONTRIBUTION;
    return TypeOperationCaisse.MISC_COLLECTION;
  }

  /**
   * @deprecated Utilisez postCollectCashEntriesPendingSettlement
   * Cette méthode impactait les comptes clients à l'approbation
   * Elle est conservée pour référence mais ne doit plus être utilisée
   */
  private async postCollectCashEntries_LEGACY(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    approvedBy: string
  ): Promise<ApprovalResult & { paiementTerrainId?: string }> {
    const montant = parseFloat(operation.montant);
    const metadata = operation.metadata as OperationTerrainMetadata | null;

    // 1. Créer mouvement CaisseAgent (Crédit = entrée)
    const refCaisseAgent = generateReference("CAISSE_AGENT" as any);
    const [mouvementCaisseAgent] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "DEBIT", // Débit = Augmente la créance envers l'agent
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCaisseAgent,
        agentId: operation.agentId,
        clientId: operation.clientId,
        sourceModule: "CAISSE_AGENT" as any,
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: {
          operationType: "COLLECT_CASH",
          caisseAgentId: operation.caisseAgentId,
        },
      })
      .returning();

    // 2. Mettre à jour solde CaisseAgent (atomique)
    await tx
      .update(caissesAgent)
      .set({
        soldeValide: sql`${caissesAgent.soldeValide} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, operation.caisseAgentId));

    const mouvements: MouvementFinancier[] = [mouvementCaisseAgent];
    let paiementTerrainId: string | null = null;

    // 3. Créer mouvement/paiement client selon le type de paiement
    if (metadata?.creditId) {
      // Remboursement crédit
      const result = await this.postCreditPayment(tx, operation, metadata, approvedBy);
      if (result.mouvement) mouvements.push(result.mouvement);
      paiementTerrainId = result.paiementTerrainId || null;
    } else if (metadata?.compteId) {
      // Dépôt sur compte épargne/courant
      const result = await this.postAccountDeposit(tx, operation, metadata, approvedBy);
      if (result.mouvement) mouvements.push(result.mouvement);
      paiementTerrainId = result.paiementTerrainId || null;
    } else if (metadata?.tontineId) {
      // Versement tontine - créer juste le paiement terrain
      const result = await this.postTontinePayment(tx, operation, metadata, approvedBy);
      if (result.mouvement) mouvements.push(result.mouvement);
      paiementTerrainId = result.paiementTerrainId || null;
    }

    return { success: true, mouvements, paiementTerrainId: paiementTerrainId || undefined };
  }

  /**
   * Poste un remboursement de crédit
   */
  private async postCreditPayment(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    metadata: OperationTerrainMetadata,
    approvedBy: string
  ): Promise<{ mouvement?: MouvementFinancier; paiementTerrainId?: string }> {
    const montant = parseFloat(operation.montant);

    // Vérifier que le crédit existe
    const [credit] = await tx
      .select()
      .from(credits)
      .where(eq(credits.id, metadata.creditId!));

    if (!credit) {
      logger.warn({ creditId: metadata.creditId }, 'Credit not found');
      return {};
    }

    // Créer mouvement sur le crédit (réduit la dette)
    const refCredit = generateReference("CREDIT");
    const [mouvementCredit] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "CREDIT", // Crédit = réduit la dette
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCredit,
        agentId: operation.agentId,
        clientId: operation.clientId,
        creditId: metadata.creditId,
        typePaiement: TypeOperationCaisse.CREDIT_REPAYMENT,
        sourceModule: "CREDIT",
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: { fromCaisseAgent: true },
      })
      .returning();

    // Mettre à jour le solde restant du crédit via la fonction centrale du ledger
    // Note: delta négatif car on réduit la dette (paiement reçu)
    await updateCreditSolde(tx, metadata.creditId!, -montant);

    // NEW: Insérer dans la table métier remboursements
    await tx.insert(remboursements).values({
      creditId: metadata.creditId!,
      mouvementId: mouvementCredit.id,
      montant: operation.montant,
      dateRemboursement: new Date(),
      statut: StatutTransaction.POSTED,
      methodePaiement: "CASH",
      observations: metadata.observations,
      createdBy: approvedBy,
    });

    // Créer le paiement terrain
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;
    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement: TypeOperationCaisse.CREDIT_REPAYMENT,
        montant: operation.montant,
        methodePaiement: "CASH",
        reference: refPaiement,
        mouvementId: mouvementCredit.id,
        creditId: metadata.creditId,
        statut: StatutTransaction.POSTED,
        observations: metadata.observations,
        latitude: metadata.latitude?.toString(),
        longitude: metadata.longitude?.toString(),
        createdBy: approvedBy,
      })
      .returning();

    return { mouvement: mouvementCredit, paiementTerrainId: paiement.id };
  }

  /**
   * Poste un dépôt sur compte
   */
  private async postAccountDeposit(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    metadata: OperationTerrainMetadata,
    approvedBy: string
  ): Promise<{ mouvement?: MouvementFinancier; paiementTerrainId?: string }> {
    const montant = parseFloat(operation.montant);

    // Vérifier que le compte existe
    const [compte] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, metadata.compteId!));

    if (!compte) {
      logger.warn({ compteId: metadata.compteId }, 'Account not found');
      return {};
    }

    // Déterminer le type de paiement selon le type de compte
    let typePaiement: TypeOperationCaisseType = TypeOperationCaisse.DEPOSIT_SAVINGS;
    if (compte.typeCompte === TypeCompte.CURRENT) typePaiement = TypeOperationCaisse.DEPOSIT_CURRENT;
    if (compte.typeCompte === TypeCompte.BLOCKED) typePaiement = TypeOperationCaisse.DEPOSIT_BLOCKED;

    // Créer mouvement sur le compte (crédite le compte)
    const refCompte = generateReference("EPARGNE");
    const [mouvementCompte] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "CREDIT",
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCompte,
        agentId: operation.agentId,
        clientId: operation.clientId,
        compteId: metadata.compteId,
        typePaiement,
        sourceModule: "EPARGNE",
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: { fromCaisseAgent: true },
      })
      .returning();

    // Mettre à jour le solde du compte
    await tx
      .update(comptes)
      .set({
        soldeCourant: sql`${comptes.soldeCourant} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, metadata.compteId!));

    // NEW: Insérer dans la table métier transactionsCompte
    await tx.insert(transactionsCompte).values({
      compteId: metadata.compteId!,
      mouvementId: mouvementCompte.id,
      typePaiement,
      sens: "CREDIT", // Deposit is money coming in
      statut: StatutTransaction.POSTED,
      montant: operation.montant,
      methodePaiement: "CASH",
      observations: metadata.observations,
      createdBy: approvedBy,
    });

    // Créer le paiement terrain
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;
    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement,
        montant: operation.montant,
        methodePaiement: "CASH",
        reference: refPaiement,
        mouvementId: mouvementCompte.id,
        compteId: metadata.compteId,
        statut: StatutTransaction.POSTED,
        observations: metadata.observations,
        latitude: metadata.latitude?.toString(),
        longitude: metadata.longitude?.toString(),
        createdBy: approvedBy,
      })
      .returning();

    return { mouvement: mouvementCompte, paiementTerrainId: paiement.id };
  }

  /**
   * Poste un versement tontine
   */
  private async postTontinePayment(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    metadata: OperationTerrainMetadata,
    approvedBy: string
  ): Promise<{ mouvement?: MouvementFinancier; paiementTerrainId?: string }> {
    // Créer mouvement pour la tontine
    const refTontine = generateReference("TONTINE");
    const [mouvementTontine] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "CREDIT",
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refTontine,
        agentId: operation.agentId,
        clientId: operation.clientId,
        tontineId: metadata.tontineId,
        typePaiement: TypeOperationCaisse.TONTINE_CONTRIBUTION,
        sourceModule: "TONTINE",
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: { fromCaisseAgent: true },
      })
      .returning();

    // NEW: Insérer dans la table métier contributionsTontine
    const refContribution = generateReference("CONTRIBUTION" as any);
    await tx.insert(contributionsTontine).values({
      tontineId: metadata.tontineId!,
      clientId: operation.clientId,
      mouvementId: mouvementTontine.id,
      typeOperation: TypeOperationCaisse.TONTINE_CONTRIBUTION,
      montant: operation.montant,
      methodePaiement: "CASH",
      statutTransaction: StatutTransaction.POSTED,
      reference: refContribution,
      observations: metadata.observations,
      createdBy: approvedBy,
    });

    // Créer le paiement terrain
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;
    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement: TypeOperationCaisse.TONTINE_CONTRIBUTION,
        montant: operation.montant,
        methodePaiement: "CASH",
        reference: refPaiement,
        mouvementId: mouvementTontine.id,
        tontineId: metadata.tontineId,
        statut: StatutTransaction.POSTED,
        observations: metadata.observations,
        latitude: metadata.latitude?.toString(),
        longitude: metadata.longitude?.toString(),
        createdBy: approvedBy,
      })
      .returning();

    return { mouvement: mouvementTontine, paiementTerrainId: paiement.id };
  }

  /**
   * Poste les écritures pour SETTLEMENT_CASH
   */
  private async postSettlementCashEntries(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    approvedBy: string
  ): Promise<ApprovalResult> {
    const montant = parseFloat(operation.montant);

    // 1. Vérifier solde suffisant (re-vérification dans transaction)
    const [caisseAgent] = await tx
      .select()
      .from(caissesAgent)
      .where(eq(caissesAgent.id, operation.caisseAgentId))
      .for("update");

    if (parseFloat(caisseAgent.soldeValide) < montant) {
      return {
        success: false,
        error: `Solde insuffisant: ${caisseAgent.soldeValide} < ${montant}`,
        errorCode: "INSUFFICIENT_BALANCE",
      };
    }

    // 2. Créer mouvement CaisseAgent (Débit = sortie)
    const refCaisseAgent = generateReference("CAISSE_AGENT" as any);
    const [mouvementCaisseAgent] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "CREDIT", // Crédit = Réduit la créance de l'agent
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCaisseAgent,
        agentId: operation.agentId,
        typePaiement: "MISC_DISBURSEMENT" as any, // Type pour matching des règles comptables
        sourceModule: "CAISSE_AGENT" as any,
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: {
          operationType: "SETTLEMENT_CASH",
          caisseAgentId: operation.caisseAgentId,
        },
      })
      .returning();

    // 3. Mettre à jour solde CaisseAgent (atomique)
    await tx
      .update(caissesAgent)
      .set({
        soldeValide: sql`${caissesAgent.soldeValide} - ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, operation.caisseAgentId));

    // 3b. Skip GL for agent mouvement — the combined entry is posted
    // via the AGENT_REMISE_TRANSFER rule on the caisse mouvement (step 4b).
    // Posting here would double-count (debit 521 / credit 573).
    await tx
      .update(mouvementsFinanciers)
      .set({ glPostingStatus: "SKIPPED" })
      .where(eq(mouvementsFinanciers.id, mouvementCaisseAgent.id));

    // 4. Créer mouvement CaisseAgence (Crédit = entrée)
    const refCaisse = generateReference("CAISSE");
    const [mouvementCaisse] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "DEBIT", // Débit = Entrée en caisse physique
        statut: StatutTransaction.POSTED,
        methodePaiement: "CASH",
        reference: refCaisse,
        agentId: operation.agentId,
        typePaiement: "CASH_TRANSFER" as any, // Type spécifique pour réception remise agent
        sourceModule: "CAISSE",
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: {
          operationType: "SETTLEMENT_CASH",
          fromCaisseAgent: operation.caisseAgentId,
        },
      })
      .returning();

    // 4b. Post GL entry for caisse agence mouvement
    const agenceIdCaisse = await getAgenceIdFromCaisse(tx, operation.destinationCaisseId!);
    await tryPostGl(tx, mouvementCaisse, agenceIdCaisse, approvedBy, {
      operationType: "SETTLEMENT_CASH",
      fromCaisseAgent: operation.caisseAgentId,
      destinationCaisseId: operation.destinationCaisseId,
    });

    // 5. Mettre à jour solde CaisseAgence (atomique)
    // Vérifier s'il y a une session active sur la caisse de destination
    const [activeSession] = await tx
      .select({ id: sessionsCaisse.id })
      .from(sessionsCaisse)
      .where(
        and(
          eq(sessionsCaisse.caisseId, operation.destinationCaisseId!),
          isNull(sessionsCaisse.closedAt)
        )
      )
      .limit(1);

    if (activeSession) {
      // Session active: utiliser updateSessionSolde pour synchroniser
      // session.montantFermetureTheorique ET caisses.solde
      await updateSessionSolde(tx, activeSession.id, montant, true);
    } else {
      // Pas de session active: mettre à jour seulement caisses.solde
      // La prochaine session reprendra ce solde à l'ouverture
      await tx
        .update(caisses)
        .set({
          solde: sql`${caisses.solde} + ${montant}`,
          updatedAt: new Date(),
        })
        .where(eq(caisses.id, operation.destinationCaisseId!));
    }

    return { success: true, mouvements: [mouvementCaisseAgent, mouvementCaisse] };
  }

  /**
   * Rejette une opération (aucune écriture comptable)
   */
  async rejectOperation(params: RejectOperationInput): Promise<ApprovalResult> {
    return await db.transaction(async (tx) => {
      // 1. Verrouiller l'opération
      const [operation] = await tx
        .select()
        .from(operationsTerrain)
        .where(eq(operationsTerrain.id, params.operationId))
        .for("update");

      if (!operation) {
        return {
          success: false,
          error: "Opération non trouvée",
          errorCode: "NOT_FOUND",
        };
      }

      // 2. Vérifier idempotence (déjà rejetée?)
      if (operation.statut === "REJECTED") {
        return { success: true, operation };
      }

      // 3. Vérifier statut valide
      if (operation.statut !== "SUBMITTED") {
        return {
          success: false,
          error: `Impossible de rejeter: statut actuel ${operation.statut}`,
          errorCode: "INVALID_STATUS",
        };
      }

      // 4. Mettre à jour l'opération
      const [updatedOperation] = await tx
        .update(operationsTerrain)
        .set({
          statut: "REJECTED",
          rejectedBy: params.rejectedBy,
          rejectedAt: new Date(),
          rejectionReason: params.rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(operationsTerrain.id, operation.id))
        .returning();

      // 5. Log audit - AUCUNE écriture comptable créée
      await tx.insert(operationsTerrainAuditLogs).values({
        operationId: operation.id,
        action: "REJECTED",
        statutAvant: "SUBMITTED",
        statutApres: "REJECTED",
        details: {
          reason: params.rejectionReason,
        },
        userId: params.rejectedBy,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      // 6. Créer événement outbox pour notification
      await tx.insert(evenementsOutbox).values({
        type: "OPERATION_TERRAIN_REJECTED" as any,
        aggregateType: "operation_terrain",
        aggregateId: operation.id,
        payload: {
          operationId: operation.id,
          type: operation.type,
          agentId: operation.agentId,
          montant: operation.montant,
          reason: params.rejectionReason,
        },
      });

      return { success: true, operation: updatedOperation };
    });
  }

  /**
   * Crée les événements outbox pour les notifications temps réel
   */
  private async createOutboxEvents(
    tx: PgTransaction<any, any, any>,
    operation: OperationTerrain,
    mouvements: MouvementFinancier[]
  ): Promise<void> {
    // Événement principal d'approbation
    const eventType = operation.statut === "SETTLED" ? "OPERATION_TERRAIN_SETTLED" : "OPERATION_TERRAIN_APPROVED";
    
    await tx.insert(evenementsOutbox).values({
      type: eventType as any,
      aggregateType: "operation_terrain",
      aggregateId: operation.id,
      payload: {
        operationId: operation.id,
        type: operation.type,
        agentId: operation.agentId,
        montant: operation.montant,
        mouvementIds: mouvements.map((m) => m.id),
      },
    });

    // Événement de changement de solde caisse agent
    await tx.insert(evenementsOutbox).values({
      type: "CAISSE_AGENT_SOLDE_CHANGE" as any,
      aggregateType: "caisse_agent",
      aggregateId: operation.caisseAgentId,
      payload: {
        caisseAgentId: operation.caisseAgentId,
        agentId: operation.agentId,
        operationId: operation.id,
        type: operation.type,
        montant: operation.montant,
      },
    });

    // Pour COLLECT_CASH, notifier aussi le client si pertinent
    if (operation.type === "COLLECT_CASH" && operation.clientId) {
      await tx.insert(evenementsOutbox).values({
        type: "MOUVEMENT_CREE" as any,
        aggregateType: "client",
        aggregateId: operation.clientId,
        payload: {
          clientId: operation.clientId,
          operationId: operation.id,
          montant: operation.montant,
          type: "COLLECT_CASH",
        },
      });
    }
  }

  /**
   * Approuve plusieurs opérations en une seule transaction
   */
  async approveOperationsBulk(params: {
    operationIds: string[];
    approvedBy: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; results: { id: string; success: boolean; error?: string }[] }> {
    const results: { id: string; success: boolean; error?: string }[] = [];

    // On traite individuellement mais si on veut une transaction totale :
    return await db.transaction(async (tx) => {
      for (const id of params.operationIds) {
        try {
          const res = await this.approveOperation({
            operationId: id,
            approvedBy: params.approvedBy,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
          });
          results.push({ id, success: res.success, error: res.error });
        } catch (error: any) {
          results.push({ id, success: false, error: error.message });
        }
      }
      return { success: results.every(r => r.success), results };
    });
  }
}

// Export singleton
export const approvalService = new ApprovalService();
