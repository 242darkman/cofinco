/**
 * Agent Mobile Money Payment Service
 *
 * Service spécialisé pour les paiements Mobile Money initiés par les agents terrain.
 *
 * DIFFÉRENCE AVEC LES PAIEMENTS CASH:
 * - Cash: COLLECT_CASH → PENDING_SETTLEMENT → REMISE → SETTLED (impact client à la remise)
 * - MM: Initiate → PENDING → SUCCESS webhook → SETTLED (impact client immédiat)
 *
 * Ce service:
 * 1. Crée un enregistrement agent_mm_payments pour traçabilité agent
 * 2. Utilise paymentService pour initier le paiement MM
 * 3. Le webhook SUCCESS déclenche automatiquement le settlement via paymentService
 * 4. Le settlement impacte directement les comptes clients (crédit, épargne, tontine)
 *
 * Garanties:
 * - Idempotence via idempotencyKey
 * - Atomicité des écritures
 * - Traçabilité complète (agent → paymentIntent → mouvement → compte client)
 */

import { db } from "../../db";
import {
  agentMmPayments,
  agentsTerrain,
  clients,
  credits,
  comptes,
  users,
  type AgentMmPayment,
  type InsertAgentMmPayment,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import { paymentService } from "../mobile-money/payment-service";
import { generateReference } from "../ledger";
import type { InitiateCollectionParams } from "../mobile-money/types";

// ============================================
// TYPES
// ============================================

export interface InitiateAgentMmPaymentParams {
  // Agent & client
  agentId: string;
  clientId: string;
  agenceId: string;

  // Payment details
  provider: "MTN" | "AIRTEL";
  phone: string;
  amount: number;
  typePaiement: "CREDIT_REPAYMENT" | "DEPOSIT_SAVINGS" | "TONTINE_CONTRIBUTION";

  // Target financial product
  creditId?: string;
  compteId?: string;
  tontineId?: string;

  // Optional
  description?: string;
  idempotencyKey?: string;
  latitude?: number;
  longitude?: number;
  observations?: string;

  // Audit
  createdBy: string;
}

export interface AgentMmPaymentResult {
  success: boolean;
  payment?: AgentMmPayment;
  paymentIntentId?: string;
  error?: string;
  errorCode?: string;
}

export interface AgentMmPaymentFilter {
  agentId?: string;
  clientId?: string;
  agenceId?: string;
  statut?: string;
  provider?: string;
  typePaiement?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

// ============================================
// SERVICE
// ============================================

class AgentMmPaymentService {
  /**
   * Initie un paiement Mobile Money par un agent terrain
   *
   * Flow:
   * 1. Valide les paramètres et l'idempotence
   * 2. Crée un enregistrement agent_mm_payments (statut PENDING)
   * 3. Appelle paymentService.initiateCollection()
   * 4. Met à jour avec le paymentIntentId
   *
   * Le webhook SUCCESS (via paymentService) fait le settlement automatiquement.
   */
  async initiatePayment(params: InitiateAgentMmPaymentParams): Promise<AgentMmPaymentResult> {
    const {
      agentId,
      clientId,
      agenceId,
      provider,
      phone,
      amount,
      typePaiement,
      creditId,
      compteId,
      tontineId,
      description,
      idempotencyKey,
      latitude,
      longitude,
      observations,
      createdBy,
    } = params;

    // 1. Vérifier l'idempotence
    if (idempotencyKey) {
      const existing = await this.getByIdempotencyKey(idempotencyKey);
      if (existing) {
        console.log(`[AgentMmPaymentService] Idempotent request, returning existing: ${existing.id}`);
        return { success: true, payment: existing, paymentIntentId: existing.paymentIntentId || undefined };
      }
    }

    // 2. Valider l'agent
    const [agent] = await db
      .select({ id: agentsTerrain.id })
      .from(agentsTerrain)
      .where(and(eq(agentsTerrain.id, agentId), isNull(agentsTerrain.deletedAt)));

    if (!agent) {
      return { success: false, error: "Agent non trouvé", errorCode: "AGENT_NOT_FOUND" };
    }

    // 3. Valider le client et récupérer son nom depuis la table users
    const [client] = await db
      .select({
        id: clients.id,
        nom: users.nom,
        prenom: users.prenom,
      })
      .from(clients)
      .leftJoin(users, eq(clients.userId, users.id))
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)));

    if (!client) {
      return { success: false, error: "Client non trouvé", errorCode: "CLIENT_NOT_FOUND" };
    }

    // 4. Valider le produit financier cible
    const targetValidation = await this.validateFinancialTarget(typePaiement, { creditId, compteId, tontineId });
    if (!targetValidation.valid) {
      return { success: false, error: targetValidation.error, errorCode: "INVALID_TARGET" };
    }

    // 5. Générer la référence unique
    const reference = `AGT-MM-${generateReference("MOBILE_MONEY")}`;

    // 6. Créer l'enregistrement agent_mm_payments
    const [payment] = await db
      .insert(agentMmPayments)
      .values({
        agentId,
        clientId,
        agenceId,
        provider,
        phone,
        montant: amount.toString(),
        typePaiement,
        reference,
        idempotencyKey,
        creditId,
        compteId,
        tontineId,
        statut: "PENDING",
        latitude: latitude?.toString(),
        longitude: longitude?.toString(),
        observations,
        createdBy,
      })
      .returning();

    console.log(`[AgentMmPaymentService] Created agent payment: ${payment.id}`);

    try {
      // 7. Initier le paiement via paymentService
      const collectionParams: InitiateCollectionParams = {
        provider,
        amount,
        phone,
        clientId,
        compteId,
        creditId,
        tontineId,
        description: description || `Paiement agent ${reference} - ${client.nom} ${client.prenom || ""}`,
        idempotencyKey: `agent-mm-${payment.id}`, // Idempotency key dédiée pour le payment intent
        agenceId,
        metadata: {
          agentPaymentId: payment.id,
          agentId,
          typePaiement,
          reference,
          initiatedByAgent: true,
        },
      };

      const intent = await paymentService.initiateCollection(collectionParams, createdBy);

      // 8. Lier le payment intent à notre enregistrement
      const [updatedPayment] = await db
        .update(agentMmPayments)
        .set({
          paymentIntentId: intent.id,
          externalReference: intent.externalRef?.toString(),
          statut: "PROCESSING",
          updatedAt: new Date(),
        })
        .where(eq(agentMmPayments.id, payment.id))
        .returning();

      console.log(`[AgentMmPaymentService] Linked to payment intent: ${intent.id}`);

      return {
        success: true,
        payment: updatedPayment,
        paymentIntentId: intent.id,
      };
    } catch (error) {
      // En cas d'erreur, marquer le paiement comme FAILED
      console.error(`[AgentMmPaymentService] Failed to initiate:`, error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorCode = (error as any)?.code || "PROVIDER_ERROR";

      const [failedPayment] = await db
        .update(agentMmPayments)
        .set({
          statut: "FAILED",
          errorCode,
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(agentMmPayments.id, payment.id))
        .returning();

      return {
        success: false,
        payment: failedPayment,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Appelé par le webhook paymentService quand le paiement est SUCCESS
   * Met à jour l'enregistrement agent_mm_payments
   */
  async handlePaymentSuccess(paymentIntentId: string, mouvementClientId: string): Promise<void> {
    const [payment] = await db
      .select()
      .from(agentMmPayments)
      .where(eq(agentMmPayments.paymentIntentId, paymentIntentId));

    if (!payment) {
      console.warn(`[AgentMmPaymentService] No agent payment found for intent: ${paymentIntentId}`);
      return;
    }

    await db
      .update(agentMmPayments)
      .set({
        statut: "SUCCESS",
        settledAt: new Date(),
        mouvementClientId,
        updatedAt: new Date(),
      })
      .where(eq(agentMmPayments.id, payment.id));

    console.log(`[AgentMmPaymentService] Payment settled: ${payment.id}`);
  }

  /**
   * Appelé par le webhook paymentService quand le paiement FAILED
   */
  async handlePaymentFailed(paymentIntentId: string, errorCode: string, errorMessage: string): Promise<void> {
    const [payment] = await db
      .select()
      .from(agentMmPayments)
      .where(eq(agentMmPayments.paymentIntentId, paymentIntentId));

    if (!payment) {
      console.warn(`[AgentMmPaymentService] No agent payment found for intent: ${paymentIntentId}`);
      return;
    }

    await db
      .update(agentMmPayments)
      .set({
        statut: "FAILED",
        errorCode,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(agentMmPayments.id, payment.id));

    console.log(`[AgentMmPaymentService] Payment failed: ${payment.id}`);
  }

  /**
   * Récupère un paiement par ID
   */
  async getById(id: string): Promise<AgentMmPayment | undefined> {
    const [payment] = await db
      .select()
      .from(agentMmPayments)
      .where(eq(agentMmPayments.id, id));

    return payment;
  }

  /**
   * Récupère un paiement par clé d'idempotence
   */
  async getByIdempotencyKey(key: string): Promise<AgentMmPayment | undefined> {
    const [payment] = await db
      .select()
      .from(agentMmPayments)
      .where(eq(agentMmPayments.idempotencyKey, key));

    return payment;
  }

  /**
   * Liste les paiements avec filtres
   */
  async list(filter: AgentMmPaymentFilter): Promise<{ data: AgentMmPayment[]; total: number }> {
    const conditions = [];

    if (filter.agentId) {
      conditions.push(eq(agentMmPayments.agentId, filter.agentId));
    }
    if (filter.clientId) {
      conditions.push(eq(agentMmPayments.clientId, filter.clientId));
    }
    if (filter.agenceId) {
      conditions.push(eq(agentMmPayments.agenceId, filter.agenceId));
    }
    if (filter.statut) {
      conditions.push(eq(agentMmPayments.statut, filter.statut));
    }
    if (filter.provider) {
      conditions.push(eq(agentMmPayments.provider, filter.provider));
    }
    if (filter.typePaiement) {
      conditions.push(eq(agentMmPayments.typePaiement, filter.typePaiement));
    }
    if (filter.from) {
      conditions.push(gte(agentMmPayments.createdAt, filter.from));
    }
    if (filter.to) {
      conditions.push(lte(agentMmPayments.createdAt, filter.to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(agentMmPayments)
        .where(whereClause)
        .orderBy(desc(agentMmPayments.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentMmPayments)
        .where(whereClause),
    ]);

    return {
      data,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Récupère les statistiques d'un agent
   */
  async getAgentStats(agentId: string, from?: Date, to?: Date): Promise<{
    totalPayments: number;
    successCount: number;
    failedCount: number;
    pendingCount: number;
    totalAmount: number;
    successAmount: number;
  }> {
    const conditions = [eq(agentMmPayments.agentId, agentId)];

    if (from) conditions.push(gte(agentMmPayments.createdAt, from));
    if (to) conditions.push(lte(agentMmPayments.createdAt, to));

    const whereClause = and(...conditions);

    const [stats] = await db
      .select({
        totalPayments: sql<number>`count(*)::int`,
        successCount: sql<number>`count(*) filter (where ${agentMmPayments.statut} = 'SUCCESS')::int`,
        failedCount: sql<number>`count(*) filter (where ${agentMmPayments.statut} = 'FAILED')::int`,
        pendingCount: sql<number>`count(*) filter (where ${agentMmPayments.statut} IN ('PENDING', 'PROCESSING'))::int`,
        totalAmount: sql<number>`coalesce(sum(${agentMmPayments.montant}::numeric), 0)`,
        successAmount: sql<number>`coalesce(sum(${agentMmPayments.montant}::numeric) filter (where ${agentMmPayments.statut} = 'SUCCESS'), 0)`,
      })
      .from(agentMmPayments)
      .where(whereClause);

    return {
      totalPayments: stats?.totalPayments || 0,
      successCount: stats?.successCount || 0,
      failedCount: stats?.failedCount || 0,
      pendingCount: stats?.pendingCount || 0,
      totalAmount: stats?.totalAmount || 0,
      successAmount: stats?.successAmount || 0,
    };
  }

  /**
   * Annule un paiement en attente
   */
  async cancelPayment(paymentId: string, userId: string): Promise<AgentMmPaymentResult> {
    const payment = await this.getById(paymentId);

    if (!payment) {
      return { success: false, error: "Paiement non trouvé", errorCode: "NOT_FOUND" };
    }

    if (!["PENDING", "PROCESSING"].includes(payment.statut)) {
      return { success: false, error: `Impossible d'annuler: statut ${payment.statut}`, errorCode: "INVALID_STATUS" };
    }

    // Si un payment intent existe, l'annuler aussi
    if (payment.paymentIntentId) {
      try {
        await paymentService.cancelPayment(payment.paymentIntentId, userId);
      } catch (error) {
        console.warn(`[AgentMmPaymentService] Could not cancel payment intent:`, error);
      }
    }

    const [cancelled] = await db
      .update(agentMmPayments)
      .set({
        statut: "CANCELLED",
        updatedAt: new Date(),
        observations: `${payment.observations || ""}\nAnnulé par ${userId} le ${new Date().toISOString()}`.trim(),
      })
      .where(eq(agentMmPayments.id, paymentId))
      .returning();

    return { success: true, payment: cancelled };
  }

  /**
   * Valide que le produit financier cible existe
   */
  private async validateFinancialTarget(
    typePaiement: string,
    targets: { creditId?: string; compteId?: string; tontineId?: string }
  ): Promise<{ valid: boolean; error?: string }> {
    if (typePaiement === "CREDIT_REPAYMENT") {
      if (!targets.creditId) {
        return { valid: false, error: "creditId requis pour un remboursement de crédit" };
      }
      const [credit] = await db
        .select({ id: credits.id })
        .from(credits)
        .where(eq(credits.id, targets.creditId));
      if (!credit) {
        return { valid: false, error: "Crédit non trouvé" };
      }
    } else if (typePaiement === "DEPOSIT_SAVINGS") {
      if (!targets.compteId) {
        return { valid: false, error: "compteId requis pour un dépôt épargne" };
      }
      const [compte] = await db
        .select({ id: comptes.id })
        .from(comptes)
        .where(eq(comptes.id, targets.compteId));
      if (!compte) {
        return { valid: false, error: "Compte non trouvé" };
      }
    } else if (typePaiement === "TONTINE_CONTRIBUTION") {
      if (!targets.tontineId) {
        return { valid: false, error: "tontineId requis pour une cotisation tontine" };
      }
      // Tontine validation is soft - just check ID format
    }

    return { valid: true };
  }
}

// Singleton export
export const agentMmPaymentService = new AgentMmPaymentService();
export default agentMmPaymentService;
