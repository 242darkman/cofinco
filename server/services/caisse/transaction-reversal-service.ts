import { db } from "../../db";
import {
  operationsCaisse,
  transactionsCompte,
  mouvementsFinanciers,
  comptes,
  sessionsCaisse,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  createMouvementFinancier,
  createOutboxEvent,
  createMouvementEvents,
  updateCompteSolde,
  updateSessionSolde,
  generateReference,
  emitBalanceUpdates,
  type SourceModule,
} from "../ledger";
import { postGlForMouvement, AccountingRuleNotFoundError } from "../accounting-posting-service";
import { dispatchDomainEvent } from "../notifications/domain-events/event-registry";
import type { MouvementFinancier } from "@shared/schema/finance";
import { createLogger } from "../../lib/logger";

const logger = createLogger('TxReversal');

// ============================================================================
// TRANSACTION REVERSAL SERVICE
// Creates compensating entries (contra-entries) for financial operations.
// Financial systems never "delete" - they create inverse movements.
// ============================================================================

export class ReversalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 400
  ) {
    super(message);
    this.name = "ReversalError";
  }
}

interface ReversalRequest {
  operationId: string;
  reason: string;
  userId: string;
  sessionCaisseId?: string; // Current active session for the reversal operation
}

interface ReversalResult {
  reversalOperation: typeof operationsCaisse.$inferSelect;
  reversalMouvement: MouvementFinancier;
  originalOperation: typeof operationsCaisse.$inferSelect;
}

/**
 * Reverse a caisse operation by creating a compensating entry.
 *
 * This function:
 * 1. Validates the original operation can be reversed
 * 2. Creates an inverse ledger movement (flip DEBIT/CREDIT)
 * 3. Creates a new caisse operation linked to the original
 * 4. Updates the original operation status to REVERSED
 * 5. Adjusts account and session balances
 * 6. Emits domain events and real-time updates
 */
export async function reverseOperation(req: ReversalRequest): Promise<ReversalResult> {
  const { operationId, reason, userId, sessionCaisseId } = req;

  if (!reason || reason.trim().length < 3) {
    throw new ReversalError(
      "Un motif d'annulation est obligatoire (minimum 3 caracteres)",
      "REASON_REQUIRED"
    );
  }

  // 1. Load the original operation with its mouvement
  const [original] = await db
    .select()
    .from(operationsCaisse)
    .where(eq(operationsCaisse.id, operationId));

  if (!original) {
    throw new ReversalError(
      "Operation introuvable",
      "OPERATION_NOT_FOUND",
      404
    );
  }

  // 2. Validate reversibility
  if (original.statut === "REVERSED") {
    throw new ReversalError(
      "Cette operation a deja ete annulee",
      "ALREADY_REVERSED"
    );
  }

  if (original.statut === "CANCELLED") {
    throw new ReversalError(
      "Cette operation a deja ete annulee",
      "ALREADY_CANCELLED"
    );
  }

  if (original.statut !== "POSTED") {
    throw new ReversalError(
      `Seules les operations POSTED peuvent etre annulees (statut actuel: ${original.statut})`,
      "INVALID_STATUS"
    );
  }

  // A reversal operation itself cannot be reversed
  if (original.reversalOfId) {
    throw new ReversalError(
      "Une operation de contrepassation ne peut pas etre annulee",
      "IS_REVERSAL"
    );
  }

  // Check if already reversed (via reversalOfId link)
  const [existingReversal] = await db
    .select({ id: operationsCaisse.id })
    .from(operationsCaisse)
    .where(eq(operationsCaisse.reversalOfId, operationId));

  if (existingReversal) {
    throw new ReversalError(
      "Une ecriture de contre-passation existe deja pour cette operation",
      "REVERSAL_EXISTS"
    );
  }

  // 3. Load the original mouvement
  let originalMouvement: MouvementFinancier | null = null;
  if (original.mouvementId) {
    const [mvt] = await db
      .select()
      .from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.id, original.mouvementId));
    originalMouvement = mvt ?? null;
  }

  if (!originalMouvement) {
    throw new ReversalError(
      "Mouvement financier original introuvable - impossible d'annuler",
      "MOUVEMENT_NOT_FOUND"
    );
  }

  // Check that the original operation's session is not closed (end-of-day clôture)
  const [originalSession] = await db
    .select({ id: sessionsCaisse.id, statut: sessionsCaisse.statut })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, original.sessionId));

  if (originalSession?.statut === "CLOSED") {
    throw new ReversalError(
      "La session de caisse a ete cloturee. Les annulations ne sont plus possibles apres la cloture de la journee.",
      "SESSION_CLOSED"
    );
  }

  // Determine the session to use for the reversal
  const reversalSessionId = sessionCaisseId || original.sessionId;

  // Validate the reversal session is open
  const [session] = await db
    .select({ id: sessionsCaisse.id, statut: sessionsCaisse.statut })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, reversalSessionId));

  if (!session || session.statut !== "OPEN") {
    throw new ReversalError(
      "La session de caisse doit etre ouverte pour effectuer une annulation",
      "SESSION_NOT_OPEN"
    );
  }

  // 4. Execute reversal within a transaction
  const inverseSens = originalMouvement.sens === "DEBIT" ? "CREDIT" : "DEBIT";
  const montant = originalMouvement.montant;
  const montantNum = parseFloat(montant);

  // Delta for balances: reverse the original effect
  // CREDIT (reversing a withdrawal) = cash comes back in = +montant
  // DEBIT (reversing a deposit) = cash goes back out = -montant
  // Session and account always move in the same direction for caisse operations
  const compteDelta = inverseSens === "CREDIT" ? montantNum : -montantNum;
  const sessionDelta = compteDelta;

  const result = await db.transaction(async (tx) => {
    // 4a. Create inverse mouvement
    const [reversalMvt] = await tx.insert(mouvementsFinanciers).values({
      montant,
      sens: inverseSens as "DEBIT" | "CREDIT",
      sourceModule: originalMouvement!.sourceModule,
      typePaiement: originalMouvement!.typePaiement,
      methodePaiement: originalMouvement!.methodePaiement,
      clientId: originalMouvement!.clientId,
      compteId: originalMouvement!.compteId,
      creditId: originalMouvement!.creditId,
      tontineId: originalMouvement!.tontineId,
      sessionCaisseId: reversalSessionId,
      agenceId: originalMouvement!.agenceId,
      agentId: originalMouvement!.agentId,
      reference: generateReference(originalMouvement!.sourceModule as SourceModule),
      idempotencyKey: `REV-${original.id}-${Date.now()}`,
      metadata: {
        reversalOf: originalMouvement!.id,
        reversalReason: reason,
        originalReference: originalMouvement!.reference,
      },
      createdBy: userId,
      dateOperation: new Date(),
      requiresGlPosting: true,
      glPostingStatus: "PENDING",
      reversalOfId: originalMouvement!.id,
      reversalReason: reason,
    }).returning();

    // 4b. Create reversal caisse operation
    const [reversalOp] = await tx.insert(operationsCaisse).values({
      sessionId: reversalSessionId,
      mouvementId: reversalMvt.id,
      typeOperation: original.typeOperation,
      statut: "POSTED",
      montant,
      methodePaiement: original.methodePaiement,
      reference: reversalMvt.reference,
      idempotencyKey: reversalMvt.idempotencyKey,
      description: `[ANNULATION] ${original.description || original.typeOperation} - Motif: ${reason}`,
      clientId: original.clientId,
      metadata: {
        reversalOf: original.id,
        originalReference: original.reference,
        reason,
      },
      createdBy: userId,
      reversalOfId: original.id,
      reversalReason: reason,
      reversedByUserId: userId,
    }).returning();

    // 4c. Mark original operation as REVERSED
    await tx
      .update(operationsCaisse)
      .set({
        statut: "REVERSED",
        reversedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(operationsCaisse.id, original.id));

    // 4d. Mark original mouvement as REVERSED
    await tx
      .update(mouvementsFinanciers)
      .set({ statut: "REVERSED" })
      .where(eq(mouvementsFinanciers.id, originalMouvement!.id));

    // 4e. Update account balance if applicable
    if (originalMouvement!.compteId) {
      await updateCompteSolde(tx, originalMouvement!.compteId, compteDelta);
    }

    // 4f. Update session balance
    await updateSessionSolde(tx, reversalSessionId, sessionDelta);

    // 4g. If there's a linked transaction_compte, reverse it too
    if (originalMouvement!.compteId) {
      const [linkedTx] = await tx
        .select()
        .from(transactionsCompte)
        .where(eq(transactionsCompte.mouvementId, originalMouvement!.id));

      if (linkedTx) {
        // Create reversal transaction
        const newSolde = linkedTx.soldeApres
          ? (parseFloat(linkedTx.soldeApres) + compteDelta).toString()
          : null;

        await tx.insert(transactionsCompte).values({
          compteId: linkedTx.compteId,
          mouvementId: reversalMvt.id,
          typePaiement: linkedTx.typePaiement,
          sens: inverseSens as "DEBIT" | "CREDIT", // Opposite of original
          statut: "POSTED",
          montant,
          soldeApres: newSolde,
          methodePaiement: linkedTx.methodePaiement,
          observations: `[ANNULATION] ${linkedTx.observations || ""} - Motif: ${reason}`,
          createdBy: userId,
          reversalOfId: linkedTx.id,
          reversalReason: reason,
          reversedByUserId: userId,
        });

        // Mark original transaction as REVERSED
        await tx
          .update(transactionsCompte)
          .set({
            statut: "REVERSED",
            reversedAt: new Date(),
          })
          .where(eq(transactionsCompte.id, linkedTx.id));
      }
    }

    // 4h. Create outbox event for real-time updates
    await createMouvementEvents(tx, reversalMvt);

    // 4i. Post to General Ledger
    if (originalMouvement!.agenceId) {
      try {
        await postGlForMouvement(tx, reversalMvt, originalMouvement!.agenceId, userId, {
          reversalOf: originalMouvement!.id,
          reversalReason: reason,
        });
        // postGlForMouvement does NOT update glPostingStatus — we must do it
        await tx
          .update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, reversalMvt.id));
        logger.info({ mouvementId: reversalMvt.id }, "GL posting successful for reversal");
      } catch (error) {
        if (error instanceof AccountingRuleNotFoundError) {
          logger.warn(
            { mouvementId: reversalMvt.id, error: error.message },
            "No accounting rule for reversal - skipping GL posting"
          );
          // Mark as SKIPPED instead of failing the whole transaction
          await tx
            .update(mouvementsFinanciers)
            .set({ glPostingStatus: "SKIPPED", glPostingError: error.message })
            .where(eq(mouvementsFinanciers.id, reversalMvt.id));
        } else {
          throw error;
        }
      }
    } else {
      // No agenceId → cannot post to GL, mark as SKIPPED
      await tx
        .update(mouvementsFinanciers)
        .set({ glPostingStatus: "SKIPPED", glPostingError: "No agenceId available" })
        .where(eq(mouvementsFinanciers.id, reversalMvt.id));
    }

    // Reload the original to return updated version
    const [updatedOriginal] = await tx
      .select()
      .from(operationsCaisse)
      .where(eq(operationsCaisse.id, original.id));

    return {
      reversalOperation: reversalOp,
      reversalMouvement: reversalMvt,
      originalOperation: updatedOriginal,
    };
  });

  // 5. Post-commit: emit domain events + WS updates
  dispatchDomainEvent({
    type: "ACCOUNT_WITHDRAWAL", // Re-use existing event type for balance update
    data: {
      compteId: originalMouvement.compteId,
      clientId: originalMouvement.clientId,
      montant: montantNum,
      reversalOf: original.id,
      reason,
      agenceId: originalMouvement.agenceId,
    },
    timestamp: new Date(),
    agenceId: originalMouvement.agenceId ?? undefined,
  });

  emitBalanceUpdates(result.reversalMouvement, originalMouvement.agenceId ?? undefined);

  logger.info({ operationId: original.id, reference: original.reference, userId, reason }, 'Operation reversed');

  return result;
}

/**
 * Check if an operation can be reversed (read-only check).
 * Useful for UI to show/hide the "Cancel" button.
 */
export async function canReverseOperation(operationId: string): Promise<{
  reversible: boolean;
  reason?: string;
}> {
  const [op] = await db
    .select()
    .from(operationsCaisse)
    .where(eq(operationsCaisse.id, operationId));

  if (!op) {
    return { reversible: false, reason: "Operation introuvable" };
  }

  if (op.statut !== "POSTED") {
    return { reversible: false, reason: `Statut actuel: ${op.statut}` };
  }

  // A reversal operation itself cannot be reversed
  if (op.reversalOfId) {
    return { reversible: false, reason: "Operation de contrepassation" };
  }

  if (!op.mouvementId) {
    return { reversible: false, reason: "Pas de mouvement financier associe" };
  }

  // Check if already has a reversal
  const [existing] = await db
    .select({ id: operationsCaisse.id })
    .from(operationsCaisse)
    .where(eq(operationsCaisse.reversalOfId, operationId));

  if (existing) {
    return { reversible: false, reason: "Deja annulee" };
  }

  // Check that the original session is not closed (end-of-day clôture)
  const [session] = await db
    .select({ statut: sessionsCaisse.statut })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, op.sessionId));

  if (session?.statut === "CLOSED") {
    return { reversible: false, reason: "Session cloturee" };
  }

  return { reversible: true };
}
