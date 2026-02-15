/**
 * Caisse Payment Requests Queue Service
 *
 * Centralized queue for all payment requests that must be processed at the caisse:
 * - ENGAGEMENT_FEE: Credit application fees (IN)
 * - FEE_REFUND: Credit fee refunds (OUT)
 * - SALARY_PAYMENT: Employee salary cash payments (OUT)
 * - ACCOUNT_ACTIVATION: Opening fees + initial deposit (IN)
 */

import { db } from "../db";
import {
  caissePaymentRequests,
  sessionsCaisse,
  clients,
  users,
  type CaissePaymentRequest,
} from "@shared/schema";
import { eq, and, or, sql, desc, aliasedTable, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getWsInstance } from "../ws-server";

const logger = createLogger("CaisseQueue");

// ============================================================================
// TYPES
// ============================================================================

export interface CreateCaisseRequestData {
  category: "ENGAGEMENT_FEE" | "FEE_REFUND" | "SALARY_PAYMENT" | "ACCOUNT_ACTIVATION";
  direction: "IN" | "OUT";
  agenceId: string;
  targetCaisseId?: string;
  sourceType: string;
  sourceId: string;
  clientId?: string;
  employeeId?: string;
  montant: number;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface EnrichedCaisseRequest extends CaissePaymentRequest {
  clientNom?: string;
  clientPrenom?: string;
  createdByNom?: string;
}

// ============================================================================
// CREATE REQUEST
// ============================================================================

export async function createCaisseRequest(
  data: CreateCaisseRequestData
): Promise<CaissePaymentRequest> {
  const [request] = await db
    .insert(caissePaymentRequests)
    .values({
      category: data.category,
      direction: data.direction,
      agenceId: data.agenceId,
      targetCaisseId: data.targetCaisseId || null,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      clientId: data.clientId || null,
      employeeId: data.employeeId || null,
      montant: data.montant.toString(),
      label: data.label,
      description: data.description || null,
      metadata: data.metadata || null,
      createdBy: data.createdBy || null,
    } as any)
    .returning();

  logger.info(
    { requestId: request.id, category: data.category, agenceId: data.agenceId, montant: data.montant },
    "Caisse payment request created"
  );

  // Broadcast to agency for real-time badge + list update
  try {
    const ws = getWsInstance();
    ws.broadcastToAgency(data.agenceId, {
      type: "CAISSE_REQUEST_CREATED" as any,
      payload: {
        requestId: request.id,
        category: data.category,
        direction: data.direction,
        montant: data.montant,
        label: data.label,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to broadcast caisse request creation");
  }

  return request;
}

// ============================================================================
// LIST PENDING REQUESTS
// ============================================================================

export async function getPendingRequests(
  agenceId?: string,
  category?: string,
  caisseId?: string,
): Promise<EnrichedCaisseRequest[]> {
  const clientUserAlias = aliasedTable(users, "client_user");
  const creatorAlias = aliasedTable(users, "creator");

  const conditions = [
    eq(caissePaymentRequests.statut, "PENDING"),
  ];

  if (agenceId) {
    conditions.push(eq(caissePaymentRequests.agenceId, agenceId));
  }

  if (category) {
    conditions.push(eq(caissePaymentRequests.category, category as any));
  }

  if (caisseId) {
    conditions.push(
      or(
        eq(caissePaymentRequests.targetCaisseId, caisseId),
        isNull(caissePaymentRequests.targetCaisseId),
      )!
    );
  }

  const rows = await db
    .select({
      request: caissePaymentRequests,
      clientNom: clientUserAlias.nom,
      clientPrenom: clientUserAlias.prenom,
      createdByNom: creatorAlias.nom,
    })
    .from(caissePaymentRequests)
    .leftJoin(clients, eq(caissePaymentRequests.clientId, clients.id))
    .leftJoin(clientUserAlias, eq(clients.userId, clientUserAlias.id))
    .leftJoin(creatorAlias, eq(caissePaymentRequests.createdBy, creatorAlias.id))
    .where(and(...conditions))
    .orderBy(desc(caissePaymentRequests.createdAt));

  return rows.map((row) => ({
    ...row.request,
    clientNom: row.clientNom || undefined,
    clientPrenom: row.clientPrenom || undefined,
    createdByNom: row.createdByNom || undefined,
  }));
}

// ============================================================================
// COUNT PENDING (for badge)
// ============================================================================

export async function getPendingCount(agenceId?: string): Promise<number> {
  const conditions = [eq(caissePaymentRequests.statut, "PENDING")];
  if (agenceId) {
    conditions.push(eq(caissePaymentRequests.agenceId, agenceId));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(caissePaymentRequests)
    .where(and(...conditions));

  return result?.count || 0;
}

// ============================================================================
// PROCESS REQUEST
// ============================================================================

export async function processRequest(
  requestId: string,
  sessionCaisseId: string,
  userId: string
): Promise<CaissePaymentRequest> {
  // 1. Validate request exists and is PENDING
  const [request] = await db
    .select()
    .from(caissePaymentRequests)
    .where(eq(caissePaymentRequests.id, requestId));

  if (!request) {
    throw new Error("Demande de paiement introuvable");
  }
  if (request.statut !== "PENDING") {
    throw new Error(`Demande déjà traitée (statut: ${request.statut})`);
  }

  // 2. Validate session caisse is open
  const [session] = await db
    .select()
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionCaisseId));

  if (!session || session.closedAt) {
    throw new Error("Session caisse invalide ou fermée");
  }

  // 3. Process based on category
  let mouvementId: string | undefined;

  switch (request.category) {
    case "ENGAGEMENT_FEE":
      mouvementId = await processEngagementFee(request, sessionCaisseId, userId);
      break;
    case "FEE_REFUND":
      mouvementId = await processFeeRefund(request, sessionCaisseId, userId);
      break;
    case "SALARY_PAYMENT":
      mouvementId = await processSalaryPayment(request, sessionCaisseId, userId);
      break;
    case "ACCOUNT_ACTIVATION":
      mouvementId = await processAccountActivation(request, sessionCaisseId, userId);
      break;
    default:
      throw new Error(`Catégorie non supportée: ${request.category}`);
  }

  // 4. Mark as COMPLETED
  const [updated] = await db
    .update(caissePaymentRequests)
    .set({
      statut: "COMPLETED",
      processedBy: userId,
      processedAt: new Date(),
      sessionCaisseId,
      mouvementId: mouvementId || null,
      updatedAt: new Date(),
    })
    .where(eq(caissePaymentRequests.id, requestId))
    .returning();

  logger.info(
    { requestId, category: request.category, mouvementId },
    "Caisse payment request processed"
  );

  // 5. Broadcast completion
  try {
    const ws = getWsInstance();
    ws.broadcastToAgency(request.agenceId, {
      type: "CAISSE_REQUEST_COMPLETED" as any,
      payload: {
        requestId,
        category: request.category,
        montant: request.montant,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to broadcast caisse request completion");
  }

  return updated;
}

// ============================================================================
// CANCEL REQUEST
// ============================================================================

export async function cancelRequest(
  requestId: string,
  reason: string,
  userId: string
): Promise<CaissePaymentRequest> {
  const [request] = await db
    .select()
    .from(caissePaymentRequests)
    .where(eq(caissePaymentRequests.id, requestId));

  if (!request) {
    throw new Error("Demande de paiement introuvable");
  }
  if (request.statut !== "PENDING") {
    throw new Error(`Impossible d'annuler (statut: ${request.statut})`);
  }

  const [updated] = await db
    .update(caissePaymentRequests)
    .set({
      statut: "CANCELLED",
      processedBy: userId,
      processedAt: new Date(),
      metadata: {
        ...(request.metadata as Record<string, unknown> || {}),
        cancelReason: reason,
        cancelledBy: userId,
      },
      updatedAt: new Date(),
    })
    .where(eq(caissePaymentRequests.id, requestId))
    .returning();

  logger.info({ requestId, reason }, "Caisse payment request cancelled");

  try {
    const ws = getWsInstance();
    ws.broadcastToAgency(request.agenceId, {
      type: "CAISSE_REQUEST_CANCELLED" as any,
      payload: { requestId, category: request.category },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to broadcast caisse request cancellation");
  }

  return updated;
}

// ============================================================================
// CATEGORY-SPECIFIC PROCESSORS
// ============================================================================

async function processEngagementFee(
  request: CaissePaymentRequest,
  sessionCaisseId: string,
  userId: string
): Promise<string | undefined> {
  const { payerFraisEngagement } = await import("../storage/finance");
  const meta = request.metadata as Record<string, unknown> | null;

  const result = await payerFraisEngagement(
    {
      demandeId: request.sourceId,
      montant: request.montant,
      methodePaiement: "CASH",
      sessionCaisseId,
      idempotencyKey: `caisse-req-${request.id}`,
    },
    userId
  );

  return result.mouvement?.id;
}

async function processFeeRefund(
  request: CaissePaymentRequest,
  sessionCaisseId: string,
  userId: string
): Promise<string | undefined> {
  const { creditRefundRequests, operationsCaisse } = await import("@shared/schema");
  const { createMouvementFinancier, generateReference } = await import("./ledger");
  const { postGlForMouvement } = await import("./accounting-posting-service");

  let mouvementId: string | undefined;

  await db.transaction(async (tx) => {
    // 1. Get and validate refund
    const [refundData] = await tx
      .select()
      .from(creditRefundRequests)
      .where(eq(creditRefundRequests.id, request.sourceId));

    if (!refundData) throw new Error("Remboursement non trouvé");
    if (refundData.statut !== "PENDING_CAISSE") {
      throw new Error(`Remboursement pas en attente caisse (statut: ${refundData.statut})`);
    }

    const amount = Number(refundData.montantRemboursable);

    // 2. Create caisse operation
    const [op] = await tx.insert(operationsCaisse).values({
      sessionId: sessionCaisseId,
      typeOperation: "FEE_REFUND" as any,
      montant: amount.toString(),
      methodePaiement: "CASH" as any,
      reference: generateReference("REFUND"),
      description: `Remboursement frais dossier (Ref: ${refundData.id.substring(0, 8)})`,
      clientId: refundData.clientId,
      createdBy: userId,
    } as any).returning();

    // 3. Create ledger mouvement
    const mouvement = await createMouvementFinancier(tx, {
      montant: amount.toString(),
      sens: "DEBIT",
      sourceModule: "CAISSE",
      sourceId: op.id,
      typePaiement: "FEE_REFUND",
      sessionCaisseId,
      clientId: refundData.clientId,
      agenceId: refundData.agenceId,
      metadata: {
        type: "REFUND_PAYMENT",
        refundId: refundData.id,
        operationId: op.id,
        demandeId: refundData.demandeId,
      },
    }, userId);

    // 4. GL Posting
    if (refundData.agenceId) {
      await postGlForMouvement(tx, mouvement, refundData.agenceId, userId, {
        refundId: refundData.id,
        type: "REFUND_CAISSE_PAYMENT",
      });
    }

    // 5. Update refund to PAID
    await tx.update(creditRefundRequests).set({
      statut: "PAID",
      paidAt: new Date(),
      paidBy: userId,
      paymentReference: `CASH-${op.reference}`,
      mouvementId: mouvement.id,
      updatedAt: new Date(),
    } as any).where(eq(creditRefundRequests.id, refundData.id));

    mouvementId = mouvement.id;
  });

  // Broadcast refund paid event
  try {
    const ws = getWsInstance();
    ws.broadcast({
      type: "REFUND_PAID" as any,
      payload: { refundId: request.sourceId },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to broadcast refund paid");
  }

  return mouvementId;
}

async function processSalaryPayment(
  request: CaissePaymentRequest,
  sessionCaisseId: string,
  userId: string
): Promise<string | undefined> {
  const { executeWithLedger } = await import("./ledger");
  const { bulletinsPaie } = await import("@shared/schema");
  const { TypeOperationCaisse } = await import("@shared/enum/status-constants");
  const { operationsCaisse } = await import("@shared/schema");
  const { generateReference } = await import("./ledger");
  const meta = request.metadata as Record<string, unknown> | null;
  const amount = parseFloat(request.montant);

  const { mouvement } = await executeWithLedger(
    "HR",
    {
      montant: amount.toString(),
      sens: "DEBIT" as const,
      clientId: undefined,
      compteId: undefined,
      agenceId: request.agenceId,
      methodePaiement: "CASH",
      typePaiement: "SALARY_PAYMENT",
      idempotencyKey: `salary-caisse-${request.id}`,
      metadata: {
        bulletinId: request.sourceId,
        employeeId: request.employeeId,
        description: request.label,
      },
    },
    async (tx, mouvement) => {
      // Create caisse operation
      const [op] = await tx
        .insert(operationsCaisse)
        .values({
          sessionId: sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: TypeOperationCaisse.SALARY_PAYMENT as any,
          montant: amount.toString(),
          methodePaiement: "CASH" as any,
          reference: generateReference("SAL"),
          description: request.label,
          createdBy: userId,
        } as any)
        .returning();

      // Update bulletin to PAID
      if (request.sourceId) {
        await tx
          .update(bulletinsPaie)
          .set({
            statut: "PAID",
            datePaiement: new Date().toISOString().split("T")[0],
          } as any)
          .where(eq(bulletinsPaie.id, parseInt(request.sourceId)));
      }

      return { result: mouvement, additionalEventData: { operationCaisseId: op.id } };
    },
    userId
  );

  return mouvement.id;
}

async function processAccountActivation(
  request: CaissePaymentRequest,
  sessionCaisseId: string,
  userId: string
): Promise<string | undefined> {
  const { payerDepotInitialCompte } = await import("./comptes");
  const meta = request.metadata as Record<string, unknown> | null;
  const amount = parseFloat(request.montant);
  const compteId = meta?.compteId as string || request.sourceId;

  const result = await payerDepotInitialCompte(compteId, {
    montant: amount,
    sessionCaisseId,
    userId,
    methodePaiement: "CASH",
  });

  return undefined; // mouvement created internally
}
