/**
 * Service Validation Ouverture de Compte (Maker-Checker)
 *
 * Workflow piloté par recomputeAccountStatus():
 * 1. Agent crée compte → statut déterminé par snapshot (PENDING_PAYMENT_AND_APPROVAL, etc.)
 * 2. Chef d'agence approuve → isApproved=true, recompute (→ PENDING_PAYMENT ou ACTIVE)
 * 3. Chef d'agence rejette → CANCELLED
 */

import { db } from "../db";
import {
  comptes,
  accountOpeningRequests,
  clients,
  users,
  produitsCompte,
  evenementsOutbox,
  type AccountOpeningRequest,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  StatutCompte as StatutCompteConst,
} from "@shared/enum/status-constants";
import { CompteError, recomputeAccountStatus, type OpeningSnapshot } from "./comptes";
import { createLogger } from "../lib/logger";

const logger = createLogger("AccountOpeningValidation");

// ============================================================================
// APPROVE OPENING (Chef d'Agence)
// ============================================================================

export async function approveOpeningRequest(
  requestId: string,
  userId: string
): Promise<AccountOpeningRequest> {
  return await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountOpeningRequests)
      .where(eq(accountOpeningRequests.id, requestId));

    if (!request) {
      throw new CompteError("Demande d'ouverture introuvable", "REQUEST_NOT_FOUND");
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

    // Verify account is in a pending state that needs approval
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, request.compteId));
    const approvalPendingStatuses = [
      StatutCompteConst.PENDING_APPROVAL,
      StatutCompteConst.PENDING_PAYMENT_AND_APPROVAL,
      StatutCompteConst.PENDING_VALIDATION, // Legacy
    ];
    if (!compte || !approvalPendingStatuses.includes(compte.statut as any)) {
      throw new CompteError(
        "Le compte n'est plus en attente de validation",
        "INVALID_STATE"
      );
    }

    // Approve request
    const [updated] = await tx
      .update(accountOpeningRequests)
      .set({
        status: "APPROVED",
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accountOpeningRequests.id, requestId))
      .returning();

    // Set isApproved and recompute status
    const snapshot = (compte as any).openingSnapshot as OpeningSnapshot | null;
    const newStatus = recomputeAccountStatus({
      openingSnapshot: snapshot,
      paidOpeningFee: (compte as any).paidOpeningFee || "0",
      paidInitialDeposit: (compte as any).paidInitialDeposit || "0",
      isApproved: true,
    });

    await tx
      .update(comptes)
      .set({
        isApproved: true,
        approvedBy: userId,
        approvedAt: new Date(),
        statut: newStatus,
        updatedAt: new Date(),
      } as any)
      .where(eq(comptes.id, request.compteId));

    // Outbox event for real-time updates (Validations Center badges + list)
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: request.compteId,
      payload: {
        compteId: request.compteId,
        action: "OPENING_APPROVED",
        requestId,
        approvedBy: userId,
        newStatus,
      },
    });

    logger.info(
      { requestId, compteId: request.compteId, approvedBy: userId, newStatus },
      `Opening request approved — account status: ${newStatus}`
    );

    return updated;
  });
}

// ============================================================================
// REJECT OPENING (Chef d'Agence)
// ============================================================================

export async function rejectOpeningRequest(
  requestId: string,
  reason: string,
  userId: string
): Promise<AccountOpeningRequest> {
  return await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountOpeningRequests)
      .where(eq(accountOpeningRequests.id, requestId));

    if (!request) {
      throw new CompteError("Demande d'ouverture introuvable", "REQUEST_NOT_FOUND");
    }
    if (request.status !== "PENDING") {
      throw new CompteError("Demande déjà traitée", "ALREADY_PROCESSED");
    }

    // Reject request
    const [updated] = await tx
      .update(accountOpeningRequests)
      .set({
        status: "REJECTED",
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(accountOpeningRequests.id, requestId))
      .returning();

    // Cancel the account
    await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, request.compteId));

    // Outbox event for real-time updates (Validations Center badges + list)
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: request.compteId,
      payload: {
        compteId: request.compteId,
        action: "OPENING_REJECTED",
        requestId,
        rejectedBy: userId,
        reason,
      },
    });

    logger.info(
      { requestId, compteId: request.compteId, rejectedBy: userId, reason },
      "Opening request rejected — account cancelled"
    );

    return updated;
  });
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List pending opening requests (for validation center)
 */
export async function getPendingOpeningRequests(agenceId?: string) {
  const initiator = alias(users, "initiator");
  const clientUser = alias(users, "client_user");

  const baseQuery = db
    .select({
      id: accountOpeningRequests.id,
      compteId: accountOpeningRequests.compteId,
      initiatedBy: accountOpeningRequests.initiatedBy,
      initiatedAt: accountOpeningRequests.initiatedAt,
      status: accountOpeningRequests.status,
      openingFeeAmount: accountOpeningRequests.openingFeeAmount,
      initialDepositAmount: accountOpeningRequests.initialDepositAmount,
      produitId: accountOpeningRequests.produitId,
      createdAt: accountOpeningRequests.createdAt,
      // Joined
      numeroCompte: comptes.numeroCompte,
      typeCompte: comptes.typeCompte,
      produitNom: produitsCompte.nom,
      clientNom: sql<string>`coalesce(${clientUser.prenom} || ' ' || ${clientUser.nom}, ${clientUser.nom})`.as("client_nom"),
      initiatorName: sql<string>`coalesce(${initiator.prenom} || ' ' || ${initiator.nom}, ${initiator.nom})`.as("initiator_name"),
    })
    .from(accountOpeningRequests)
    .innerJoin(comptes, eq(accountOpeningRequests.compteId, comptes.id))
    .leftJoin(clients, eq(comptes.clientId, clients.id))
    .leftJoin(clientUser, eq(clients.userId, clientUser.id))
    .leftJoin(initiator, eq(accountOpeningRequests.initiatedBy, initiator.id))
    .leftJoin(produitsCompte, eq(accountOpeningRequests.produitId, produitsCompte.id));

  const conditions = [eq(accountOpeningRequests.status, "PENDING")];
  if (agenceId) {
    conditions.push(eq(comptes.agenceId, agenceId));
  }

  return await baseQuery
    .where(and(...conditions))
    .orderBy(accountOpeningRequests.initiatedAt);
}

/**
 * Get the active opening request for an account
 */
export async function getOpeningRequest(
  compteId: string
): Promise<AccountOpeningRequest | null> {
  const [request] = await db
    .select()
    .from(accountOpeningRequests)
    .where(
      and(
        eq(accountOpeningRequests.compteId, compteId),
        eq(accountOpeningRequests.status, "PENDING")
      )
    )
    .limit(1);

  return request || null;
}

/**
 * Get opening fee and deposit minimum from product config for a given account
 */
export async function getOpeningFeeForCompte(
  compteId: string
): Promise<{ openingFee: number; depotMinimum: number; productName: string | null; validationRequise: boolean }> {
  const [row] = await db
    .select({
      frais: produitsCompte.frais,
      regles: produitsCompte.regles,
      nom: produitsCompte.nom,
    })
    .from(comptes)
    .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
    .where(eq(comptes.id, compteId));

  let openingFee = 0;
  let depotMinimum = 0;
  let validationRequise = false;

  if (row?.frais && typeof row.frais === "object") {
    const fraisObj = row.frais as Record<string, unknown>;
    openingFee = Number(fraisObj.ouverture) || 0;
  }

  if (row?.regles && typeof row.regles === "object") {
    const reglesObj = row.regles as Record<string, unknown>;
    depotMinimum = Number(reglesObj.depotInitialMinimum) || 0;
    validationRequise = Boolean(reglesObj.validationOuvertureRequise);
  }

  return {
    openingFee,
    depotMinimum,
    productName: row?.nom || null,
    validationRequise,
  };
}
