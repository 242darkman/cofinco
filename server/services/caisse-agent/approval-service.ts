/**
 * ApprovalService - Approbation et rejet des opérations terrain
 *
 * Ce service gère le workflow d'approbation:
 * - SUBMITTED → APPROVED (poste les écritures comptables)
 * - SUBMITTED → REJECTED (aucune écriture)
 *
 * Garanties:
 * - Idempotence: une opération déjà approuvée retourne success sans re-poster
 * - Atomicité: toutes les écritures sont dans une seule transaction
 * - Audit: chaque transition est loggée
 */

import { db } from "../../db";
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
  type OperationTerrain,
  type ApproveOperationInput,
  type RejectOperationInput,
  type OperationTerrainMetadata,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { generateReference, type MouvementFinancier } from "../ledger";
import type { PgTransaction } from "drizzle-orm/pg-core";

// Type pour les résultats d'approbation
interface ApprovalResult {
  success: boolean;
  operation?: OperationTerrain;
  mouvements?: MouvementFinancier[];
  error?: string;
  errorCode?: string;
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
        const result = await this.postCollectCashEntries(tx, operation, params.approvedBy);
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
      const [updatedOperation] = await tx
        .update(operationsTerrain)
        .set({
          statut: "APPROVED",
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
        action: "APPROVED",
        statutAvant: "SUBMITTED",
        statutApres: "APPROVED",
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
   * Poste les écritures pour COLLECT_CASH
   */
  private async postCollectCashEntries(
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
        sens: "Crédit",
        statut: "Posté",
        methodePaiement: "Espèces",
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
      console.warn(`Crédit ${metadata.creditId} non trouvé`);
      return {};
    }

    // Créer mouvement sur le crédit (réduit la dette)
    const refCredit = generateReference("CREDIT");
    const [mouvementCredit] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "Crédit", // Crédit = réduit la dette
        statut: "Posté",
        methodePaiement: "Espèces",
        reference: refCredit,
        agentId: operation.agentId,
        clientId: operation.clientId,
        creditId: metadata.creditId,
        typePaiement: "Remboursement Crédit",
        sourceModule: "CREDIT",
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: { fromCaisseAgent: true },
      })
      .returning();

    // Mettre à jour le solde restant du crédit
    await tx
      .update(credits)
      .set({
        soldeRestant: sql`GREATEST(0, ${credits.soldeRestant} - ${montant})`,
        updatedAt: new Date(),
      })
      .where(eq(credits.id, metadata.creditId!));

    // Créer le paiement terrain
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;
    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement: "Remboursement Crédit",
        montant: operation.montant,
        methodePaiement: "Espèces",
        reference: refPaiement,
        mouvementId: mouvementCredit.id,
        creditId: metadata.creditId,
        statut: "Posté",
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
      console.warn(`Compte ${metadata.compteId} non trouvé`);
      return {};
    }

    // Déterminer le type de paiement selon le type de compte
    let typePaiement: "Dépôt Épargne" | "Dépôt Courant" | "Dépôt Bloqué" = "Dépôt Épargne";
    if (compte.typeCompte === "Courant") typePaiement = "Dépôt Courant";
    if (compte.typeCompte === "Bloqué") typePaiement = "Dépôt Bloqué";

    // Créer mouvement sur le compte (crédite le compte)
    const refCompte = generateReference("EPARGNE");
    const [mouvementCompte] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "Crédit",
        statut: "Posté",
        methodePaiement: "Espèces",
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

    // Créer le paiement terrain
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;
    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement,
        montant: operation.montant,
        methodePaiement: "Espèces",
        reference: refPaiement,
        mouvementId: mouvementCompte.id,
        compteId: metadata.compteId,
        statut: "Posté",
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
        sens: "Crédit",
        statut: "Posté",
        methodePaiement: "Espèces",
        reference: refTontine,
        agentId: operation.agentId,
        clientId: operation.clientId,
        tontineId: metadata.tontineId,
        typePaiement: "Versement Tontine",
        sourceModule: "TONTINE",
        sourceTable: "operations_terrain",
        sourceId: operation.id,
        createdBy: approvedBy,
        metadata: { fromCaisseAgent: true },
      })
      .returning();

    // Créer le paiement terrain
    const refPaiement = `PAY-${generateReference("TERRAIN")}`;
    const [paiement] = await tx
      .insert(paiementsTerrain)
      .values({
        agentId: operation.agentId,
        clientId: operation.clientId!,
        typePaiement: "Versement Tontine",
        montant: operation.montant,
        methodePaiement: "Espèces",
        reference: refPaiement,
        mouvementId: mouvementTontine.id,
        tontineId: metadata.tontineId,
        statut: "Posté",
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
        sens: "Débit",
        statut: "Posté",
        methodePaiement: "Espèces",
        reference: refCaisseAgent,
        agentId: operation.agentId,
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

    // 4. Créer mouvement CaisseAgence (Crédit = entrée)
    const refCaisse = generateReference("CAISSE");
    const [mouvementCaisse] = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: operation.montant,
        sens: "Crédit",
        statut: "Posté",
        methodePaiement: "Espèces",
        reference: refCaisse,
        agentId: operation.agentId,
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

    // 5. Mettre à jour solde CaisseAgence (atomique)
    await tx
      .update(caisses)
      .set({
        solde: sql`${caisses.solde} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caisses.id, operation.destinationCaisseId!));

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
    await tx.insert(evenementsOutbox).values({
      type: "OPERATION_TERRAIN_APPROVED" as any,
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
}

// Export singleton
export const approvalService = new ApprovalService();
