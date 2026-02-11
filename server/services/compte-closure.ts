/**
 * Service Clôture de Compte (Maker-Checker Workflow)
 *
 * Workflow:
 * 1. Initiation (maker) -> CLOSURE_PENDING + closure request PENDING
 * 2. Approbation (checker ≠ maker) -> payout + CLOSED
 * 3. Annulation (si pas encore payé) -> retour ACTIVE
 *
 * Méthodes de payout:
 * - CASH: retrait immédiat via mouvement financier (atomique)
 * - MOBILE_MONEY: création paymentIntent, finalisé via webhook
 */

import { db } from "../db";
import {
  comptes,
  transactionsCompte,
  mouvementsFinanciers,
  accountClosureRequests,
  evenementsOutbox,
  credits,
  clients,
  users,
  produitsCompte,
  type AccountClosureRequest,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  updateCompteSolde,
  generateReference,
} from "./ledger";
import { postGlForMouvement } from "./accounting-posting-service";
import {
  StatutCompte as StatutCompteConst,
  StatutCredit as StatutCreditConst,
} from "@shared/enum/status-constants";
import { VALID_TRANSITIONS, CompteError, type StatutCompte } from "./comptes";
import { createLogger } from "../lib/logger";

const logger = createLogger("CompteClosure");

// ============================================================================
// TYPES
// ============================================================================

export interface InitiateClosureData {
  compteId: string;
  reason: string;
  payoutMethod: "CASH" | "MOBILE_MONEY";
  payoutPhoneNumber?: string;
}

// ============================================================================
// INITIATE CLOSURE (Maker)
// ============================================================================

export async function initiateClosureCompte(
  data: InitiateClosureData,
  userId: string
): Promise<AccountClosureRequest> {
  return await db.transaction(async (tx) => {
    // 1. Get and lock account
    const [compte] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, data.compteId));

    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    // 2. Validate state transition
    const allowed = VALID_TRANSITIONS[compte.statut as StatutCompte];
    if (!allowed?.includes(StatutCompteConst.CLOSURE_PENDING)) {
      throw new CompteError(
        `Impossible d'initier la clôture depuis le statut ${compte.statut}`,
        "INVALID_STATE_TRANSITION"
      );
    }

    // 3. Validate no pending transactions
    const pendingTx = await tx
      .select({ id: transactionsCompte.id })
      .from(transactionsCompte)
      .where(
        and(
          eq(transactionsCompte.compteId, data.compteId),
          eq(transactionsCompte.statut, "PENDING")
        )
      )
      .limit(1);

    if (pendingTx.length > 0) {
      throw new CompteError(
        "Transactions en attente — impossible de clôturer",
        "PENDING_TRANSACTIONS"
      );
    }

    // 4. Validate no active credits
    const activeCredits = await tx
      .select({ id: credits.id })
      .from(credits)
      .where(
        and(
          eq(credits.clientId, compte.clientId),
          sql`${credits.statut} IN ('${sql.raw(StatutCreditConst.ACTIVE)}', '${sql.raw(StatutCreditConst.LATE)}')`
        )
      )
      .limit(1);

    if (activeCredits.length > 0) {
      throw new CompteError(
        "Crédits actifs — impossible de clôturer",
        "ACTIVE_CREDITS"
      );
    }

    // 5. Auto-fetch closing fee from product config (admin-controlled)
    let fee = 0;
    if (compte.produitId) {
      const [produit] = await tx
        .select({ frais: produitsCompte.frais })
        .from(produitsCompte)
        .where(eq(produitsCompte.id, compte.produitId));
      if (produit?.frais && typeof produit.frais === "object") {
        const fraisObj = produit.frais as Record<string, unknown>;
        fee = Number(fraisObj.cloture) || 0;
      }
    }

    // Calculate payout
    const balance = parseFloat(compte.soldeCourant || "0");
    const payoutAmount = Math.max(0, balance - fee);

    // 6. Validate phone for MOBILE_MONEY
    if (data.payoutMethod === "MOBILE_MONEY" && !data.payoutPhoneNumber) {
      throw new CompteError(
        "Numéro de téléphone requis pour le paiement Mobile Money",
        "PHONE_REQUIRED"
      );
    }

    // 7. Check no existing pending closure request
    const existingRequest = await tx
      .select({ id: accountClosureRequests.id })
      .from(accountClosureRequests)
      .where(
        and(
          eq(accountClosureRequests.compteId, data.compteId),
          eq(accountClosureRequests.status, "PENDING")
        )
      )
      .limit(1);

    if (existingRequest.length > 0) {
      throw new CompteError(
        "Une demande de clôture est déjà en cours",
        "CLOSURE_ALREADY_PENDING"
      );
    }

    // 8. Create closure request
    const [request] = await tx
      .insert(accountClosureRequests)
      .values({
        compteId: data.compteId,
        initiatedBy: userId,
        reason: data.reason,
        payoutMethod: data.payoutMethod,
        payoutAmount: payoutAmount.toString(),
        payoutPhoneNumber: data.payoutPhoneNumber || null,
        closingFeeAmount: fee.toString(),
        balanceAtInitiation: compte.soldeCourant,
      })
      .returning();

    // 9. Transition account to CLOSURE_PENDING
    await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.CLOSURE_PENDING,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, data.compteId));

    // 10. Outbox events
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: data.compteId,
      payload: {
        compteId: data.compteId,
        action: "CLOSURE_INITIATED",
        requestId: request.id,
        payoutMethod: data.payoutMethod,
        payoutAmount,
        initiatedBy: userId,
      },
    });

    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "CLOSURE_INITIATED",
        compteId: data.compteId,
        typeCompte: compte.typeCompte,
      },
    });

    return request;
  });
}

// ============================================================================
// APPROVE CLOSURE (Checker)
// ============================================================================

export async function approveClosureCompte(
  requestId: string,
  userId: string
): Promise<AccountClosureRequest> {
  return await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountClosureRequests)
      .where(eq(accountClosureRequests.id, requestId));

    if (!request) {
      throw new CompteError("Demande de clôture introuvable", "REQUEST_NOT_FOUND");
    }
    if (request.status !== "PENDING") {
      throw new CompteError("Demande déjà traitée", "ALREADY_PROCESSED");
    }

    // Maker-checker: approver must differ from initiator
    if (request.initiatedBy === userId) {
      throw new CompteError(
        "L'approbateur doit être différent de l'initiateur (maker-checker)",
        "SAME_USER_APPROVAL"
      );
    }

    // Mark approved
    const [updated] = await tx
      .update(accountClosureRequests)
      .set({
        status: "APPROVED",
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, requestId))
      .returning();

    // Execute payout
    await executeClosurePayout(tx, updated);

    return updated;
  });
}

// ============================================================================
// EXECUTE PAYOUT (internal)
// ============================================================================

async function executeClosurePayout(
  tx: PgTransaction<any, any, any>,
  request: AccountClosureRequest
): Promise<void> {
  const payoutAmount = parseFloat(request.payoutAmount);

  // No payout needed if balance is already 0
  if (payoutAmount <= 0) {
    await finalizeClosureCompte(tx, request);
    return;
  }

  if (request.payoutMethod === "CASH") {
    // Cash payout: create withdrawal mouvement immediately
    const [compte] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, request.compteId));

    if (!compte) {
      throw new CompteError("Compte introuvable", "COMPTE_NOT_FOUND");
    }

    const reference = generateReference("EPARGNE");

    // Create mouvement financier
    const [mouvement] = await tx
      .insert(mouvementsFinanciers)
      .values({
        reference,
        sourceModule: "EPARGNE",
        sens: "DEBIT",
        montant: payoutAmount.toString(),
        dateOperation: new Date(),
        clientId: compte.clientId,
        compteId: request.compteId,
        agenceId: compte.agenceId,
        methodePaiement: "CASH",
        typePaiement: "CLOSURE_PAYOUT",
        createdBy: request.approvedBy,
        statut: "POSTED",
        requiresGlPosting: true,
        glPostingStatus: "PENDING",
        metadata: { description: "Retrait clôture de compte", closureRequestId: request.id },
      } as any)
      .returning();

    // Update balance to 0
    await updateCompteSolde(tx, request.compteId, -payoutAmount);

    // Transaction record
    await tx.insert(transactionsCompte).values({
      compteId: request.compteId,
      mouvementId: mouvement.id,
      typePaiement: "CLOSURE_PAYOUT",
      sens: "DEBIT",
      montant: payoutAmount.toString(),
      soldeApres: "0",
      statut: "POSTED",
      methodePaiement: "CASH",
      observations: "Retrait de clôture — Restitution solde client",
      createdBy: request.approvedBy,
    } as any);

    // Link mouvement to closure request
    await tx
      .update(accountClosureRequests)
      .set({
        payoutMouvementId: mouvement.id,
        payoutStatus: "SUCCESS",
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, request.id));

    // Post GL (async-safe, errors logged but don't block)
    try {
      await postGlForMouvement(mouvement.id, tx);
    } catch (err) {
      // GL posting failure is logged, auto-fix cron will retry
      console.error("[CLOSURE] GL posting failed, will retry:", err);
    }

    // Finalize (CLOSED)
    await finalizeClosureCompte(tx, request);
  } else if (request.payoutMethod === "MOBILE_MONEY") {
    // Mobile Money: mark as PROCESSING, actual payout handled asynchronously
    // The payment intent will be created by the route handler after the TX commits
    await tx
      .update(accountClosureRequests)
      .set({
        payoutStatus: "PROCESSING",
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, request.id));
  }
}

// ============================================================================
// FINALIZE CLOSURE (internal)
// ============================================================================

async function finalizeClosureCompte(
  tx: PgTransaction<any, any, any>,
  request: AccountClosureRequest
): Promise<void> {
  // Set account to CLOSED
  await tx
    .update(comptes)
    .set({
      statut: StatutCompteConst.CLOSED,
      closedAt: new Date(),
      closedBy: request.approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(comptes.id, request.compteId));

  // Mark request completed
  await tx
    .update(accountClosureRequests)
    .set({
      status: "COMPLETED",
      updatedAt: new Date(),
    })
    .where(eq(accountClosureRequests.id, request.id));

  // Get account info for event
  const [compte] = await tx
    .select({ clientId: comptes.clientId, typeCompte: comptes.typeCompte, numeroCompte: comptes.numeroCompte })
    .from(comptes)
    .where(eq(comptes.id, request.compteId));

  // Outbox events
  await tx.insert(evenementsOutbox).values({
    type: "MOUVEMENT_STATUT_CHANGE",
    aggregateType: "compte",
    aggregateId: request.compteId,
    payload: {
      compteId: request.compteId,
      action: "CLOSURE_FINALIZED",
      closureRequestId: request.id,
      closedAt: new Date().toISOString(),
      closedBy: request.approvedBy,
    },
  });

  if (compte) {
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_CLOTURE",
        compteId: request.compteId,
        typeCompte: compte.typeCompte,
      },
    });
  }
}

// ============================================================================
// CANCEL CLOSURE
// ============================================================================

export async function cancelClosureCompte(
  requestId: string,
  cancelReason: string,
  userId: string
): Promise<AccountClosureRequest> {
  return await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountClosureRequests)
      .where(eq(accountClosureRequests.id, requestId));

    if (!request) {
      throw new CompteError("Demande introuvable", "REQUEST_NOT_FOUND");
    }
    if (request.status !== "PENDING") {
      throw new CompteError(
        "Seules les demandes en attente peuvent être annulées",
        "CANNOT_CANCEL"
      );
    }
    if (request.payoutStatus === "PROCESSING") {
      throw new CompteError(
        "Le paiement est en cours de traitement",
        "PAYOUT_IN_PROGRESS"
      );
    }

    // Cancel request
    const [updated] = await tx
      .update(accountClosureRequests)
      .set({
        status: "CANCELLED",
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancelReason,
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, requestId))
      .returning();

    // Revert account status to ACTIVE
    await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, request.compteId));

    // Outbox event
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: request.compteId,
      payload: {
        compteId: request.compteId,
        action: "CLOSURE_CANCELLED",
        requestId,
        cancelledBy: userId,
        cancelReason,
      },
    });

    return updated;
  });
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Récupère la demande de clôture active d'un compte
 */
export async function getClosureRequest(
  compteId: string
): Promise<AccountClosureRequest | null> {
  const [request] = await db
    .select()
    .from(accountClosureRequests)
    .where(
      and(
        eq(accountClosureRequests.compteId, compteId),
        sql`${accountClosureRequests.status} IN ('PENDING', 'APPROVED')`
      )
    )
    .limit(1);

  return request || null;
}

/**
 * Liste les demandes de clôture en attente (pour l'écran d'approbation)
 * Retourne les données enrichies (numéro compte, nom client, nom initiateur)
 */
export async function getPendingClosureRequests(
  agenceId?: string
) {
  const initiator = alias(users, "initiator");
  const clientUser = alias(users, "client_user");

  const baseQuery = db
    .select({
      id: accountClosureRequests.id,
      compteId: accountClosureRequests.compteId,
      initiatedBy: accountClosureRequests.initiatedBy,
      initiatedAt: accountClosureRequests.initiatedAt,
      approvedBy: accountClosureRequests.approvedBy,
      approvedAt: accountClosureRequests.approvedAt,
      status: accountClosureRequests.status,
      reason: accountClosureRequests.reason,
      closingFeeAmount: accountClosureRequests.closingFeeAmount,
      payoutMethod: accountClosureRequests.payoutMethod,
      payoutAmount: accountClosureRequests.payoutAmount,
      payoutPhoneNumber: accountClosureRequests.payoutPhoneNumber,
      payoutStatus: accountClosureRequests.payoutStatus,
      payoutMouvementId: accountClosureRequests.payoutMouvementId,
      payoutPaymentIntentId: accountClosureRequests.payoutPaymentIntentId,
      balanceAtInitiation: accountClosureRequests.balanceAtInitiation,
      cancelledBy: accountClosureRequests.cancelledBy,
      cancelledAt: accountClosureRequests.cancelledAt,
      cancelReason: accountClosureRequests.cancelReason,
      createdAt: accountClosureRequests.createdAt,
      updatedAt: accountClosureRequests.updatedAt,
      // Joined fields
      numeroCompte: comptes.numeroCompte,
      clientNom: sql<string>`coalesce(${clientUser.prenom} || ' ' || ${clientUser.nom}, ${clientUser.nom})`.as("client_nom"),
      initiatorName: sql<string>`coalesce(${initiator.prenom} || ' ' || ${initiator.nom}, ${initiator.nom})`.as("initiator_name"),
    })
    .from(accountClosureRequests)
    .innerJoin(comptes, eq(accountClosureRequests.compteId, comptes.id))
    .leftJoin(clients, eq(comptes.clientId, clients.id))
    .leftJoin(clientUser, eq(clients.userId, clientUser.id))
    .leftJoin(initiator, eq(accountClosureRequests.initiatedBy, initiator.id));

  const conditions = [eq(accountClosureRequests.status, "PENDING")];
  if (agenceId) {
    conditions.push(eq(comptes.agenceId, agenceId));
  }

  return await baseQuery
    .where(and(...conditions))
    .orderBy(accountClosureRequests.initiatedAt);
}

/**
 * Retourne les frais de clôture configurés pour un compte (via son produit).
 */
export async function getClosureFeeForCompte(
  compteId: string
): Promise<{ closingFee: number; productName: string | null }> {
  const [row] = await db
    .select({
      frais: produitsCompte.frais,
      nom: produitsCompte.nom,
    })
    .from(comptes)
    .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
    .where(eq(comptes.id, compteId));

  if (!row?.frais || typeof row.frais !== "object") {
    return { closingFee: 0, productName: row?.nom || null };
  }

  const fraisObj = row.frais as Record<string, unknown>;
  return {
    closingFee: Number(fraisObj.cloture) || 0,
    productName: row.nom || null,
  };
}

// ============================================================================
// MOBILE MONEY PAYOUT (post-commit)
// ============================================================================

/**
 * Détecte le fournisseur Mobile Money à partir du numéro de téléphone.
 * Convention Gabon: 077/076/066 = Airtel, 062/060/061 = MTN
 */
function detectMomoProvider(phone: string): "MTN" | "AIRTEL" {
  const clean = phone.replace(/\D/g, "");
  const prefix = clean.slice(-9, -7); // last 9 digits, first 2
  if (["06", "07"].includes(prefix.slice(0, 2))) {
    if (["62", "60", "61"].includes(prefix)) return "MTN";
    return "AIRTEL";
  }
  // Default to MTN
  return "MTN";
}

/**
 * Crée un payout Mobile Money pour une demande de clôture approuvée.
 * Appelé APRÈS le commit de la transaction d'approbation.
 */
export async function createClosureMoMoPayout(
  request: AccountClosureRequest
): Promise<void> {
  const payoutAmount = parseFloat(request.payoutAmount);
  if (payoutAmount <= 0) return;

  if (!request.payoutPhoneNumber) {
    throw new CompteError(
      "Numéro de téléphone requis pour le paiement Mobile Money",
      "PHONE_REQUIRED"
    );
  }

  // Lazy import to avoid circular dependency
  const { paymentService } = await import("./mobile-money/payment-service");

  const [compte] = await db
    .select({
      clientId: comptes.clientId,
      agenceId: comptes.agenceId,
    })
    .from(comptes)
    .where(eq(comptes.id, request.compteId));

  if (!compte) {
    throw new CompteError("Compte introuvable", "COMPTE_NOT_FOUND");
  }

  const provider = detectMomoProvider(request.payoutPhoneNumber);

  try {
    const intent = await paymentService.initiatePayout(
      {
        provider,
        amount: payoutAmount,
        phone: request.payoutPhoneNumber,
        clientId: compte.clientId,
        compteId: request.compteId,
        agenceId: compte.agenceId,
        description: `Restitution clôture compte`,
        idempotencyKey: `closure-payout-${request.id}`,
        metadata: {
          useCase: "CLOSURE_PAYOUT",
          closureRequestId: request.id,
        },
      },
      request.approvedBy || undefined
    );

    // Link the payment intent to the closure request
    await db
      .update(accountClosureRequests)
      .set({
        payoutPaymentIntentId: intent.id,
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, request.id));

    logger.info(
      { requestId: request.id, intentId: intent.id, provider },
      "Closure MoMo payout initiated"
    );
  } catch (error) {
    // Mark payout as FAILED so UI shows retry option
    await db
      .update(accountClosureRequests)
      .set({
        payoutStatus: "FAILED",
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, request.id));

    logger.error(
      { requestId: request.id, err: error },
      "Failed to initiate closure MoMo payout"
    );
    throw error;
  }
}

/**
 * Appelé par le webhook handler quand un payout de clôture réussit.
 * Finalise la clôture: solde → 0, statut → CLOSED.
 */
export async function handleClosurePayoutSuccess(
  closureRequestId: string,
  mouvementId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountClosureRequests)
      .where(eq(accountClosureRequests.id, closureRequestId));

    if (!request) {
      logger.warn({ closureRequestId }, "Closure request not found for payout success");
      return;
    }

    if (request.status === "COMPLETED") {
      logger.info({ closureRequestId }, "Closure already completed, skipping");
      return;
    }

    // Link mouvement + mark payout success
    await tx
      .update(accountClosureRequests)
      .set({
        payoutMouvementId: mouvementId,
        payoutStatus: "SUCCESS",
        updatedAt: new Date(),
      })
      .where(eq(accountClosureRequests.id, closureRequestId));

    // Finalize closure (CLOSED status + outbox events)
    await finalizeClosureCompte(tx, request);

    logger.info(
      { closureRequestId, mouvementId },
      "Closure finalized via MoMo payout webhook"
    );
  });
}

/**
 * Appelé par le webhook handler quand un payout de clôture échoue.
 */
export async function handleClosurePayoutFailure(
  closureRequestId: string
): Promise<void> {
  await db
    .update(accountClosureRequests)
    .set({
      payoutStatus: "FAILED",
      updatedAt: new Date(),
    })
    .where(eq(accountClosureRequests.id, closureRequestId));

  logger.warn({ closureRequestId }, "Closure MoMo payout failed");
}
