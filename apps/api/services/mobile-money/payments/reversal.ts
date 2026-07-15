import { eq } from "drizzle-orm";
import { type PaymentIntent, paymentIntents } from "@shared/schema";
import { executeWithLedger, updateCompteSolde, updateCreditSolde } from "../../ledger";
import { getOrCreateDigitalCaisse, updateDigitalCaisseSolde } from "../mm-caisse-service";
import { createLogger } from "../../../lib/logger";
import { providerRegistry } from "../provider-registry";
import { currencyCode } from "@shared/config/currency";
import * as storage from "../../../storage/mobile-money";
import { MobileMoneyError, type RefundRequest } from "../types";

const logger = createLogger("PaymentService:Reversal");

const PAYMENT_TIMEOUT_MINUTES = parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || "30", 10);

/**
 * Initie un remboursement (refund) via pawaPay.
 * Seule une COLLECTION (dépôt) en statut SUCCESS peut être remboursée.
 * 
 * @param intentId - L'identifiant de l'intention de paiement originale
 * @param amount - Le montant optionnel à rembourser (partiel ou total)
 * @param userId - L'identifiant de l'utilisateur initiant le remboursement
 * @returns La nouvelle intention de paiement (type PAYOUT) pour le remboursement
 */
export async function initiateRefund(
  intentId: string,
  amount?: number,
  userId?: string
): Promise<PaymentIntent> {
  const originalIntent = await storage.getPaymentIntent(intentId);

  if (!originalIntent) {
    throw new Error("Payment intent not found");
  }

  if (originalIntent.type !== "COLLECTION") {
    throw new Error("Seules les collections (dépôts) peuvent être remboursées");
  }

  if (originalIntent.status !== "SUCCESS") {
    throw new Error(`Cannot refund payment in status: ${originalIntent.status}`);
  }

  if (!originalIntent.externalRef) {
    throw new Error("Original intent has no externalRef (depositId) for pawaPay refund");
  }

  const operator = (originalIntent as any).operator || originalIntent.provider;
  const correspondent = (originalIntent as any).correspondent;
  const refundAmount = amount ?? parseFloat(originalIntent.amount);

  if (refundAmount > parseFloat(originalIntent.amount)) {
    throw new Error(`Refund amount (${refundAmount}) exceeds original amount (${originalIntent.amount})`);
  }

  const pawaPayProvider = providerRegistry.getPawaPay();

  // Créer une nouvelle intention de paiement pour le remboursement
  const refundIntent = await storage.createPaymentIntent({
    provider: operator,
    type: "PAYOUT", // pawaPay traite les remboursements comme des retraits (payouts) vers le client
    status: "CREATED",
    gateway: "PAWAPAY",
    operator,
    correspondent,
    amount: refundAmount.toString(),
    currency: currencyCode(),
    phone: originalIntent.phone,
    clientId: originalIntent.clientId,
    compteId: originalIntent.compteId,
    creditId: originalIntent.creditId,
    tontineId: originalIntent.tontineId,
    agenceId: originalIntent.agenceId,
    metadata: {
      useCase: "REFUND",
      originalIntentId: intentId,
      originalExternalRef: originalIntent.externalRef,
      isPartialRefund: amount != null && amount < parseFloat(originalIntent.amount),
    },
    createdBy: userId,
  });

  try {
    const response = await (pawaPayProvider as any).refund({
      refundId: refundIntent.externalRef,
      depositId: originalIntent.externalRef,
      amount: refundAmount,
      currency: currencyCode(),
    } as RefundRequest);

    if (response.status === "REJECTED") {
      await storage.updatePaymentIntent(refundIntent.id, {
        status: "FAILED",
        errorCode: response.rejectionCode || "REJECTED",
        errorMessage: response.rejectionMessage || "Refund rejected by pawaPay",
        confirmedAt: new Date(),
      });

      throw new MobileMoneyError(
        `Refund rejected: ${response.rejectionCode || "UNKNOWN"}`,
        response.rejectionCode || "REJECTED",
        "PAWAPAY",
        false
      );
    }

    // ACCEPTED - attendre le webhook (callback)
    const updatedIntent = await storage.updatePaymentIntent(refundIntent.id, {
      providerRef: refundIntent.externalRef, // often refundId serves as providerRef initially
      status: "PENDING",
      initiatedAt: new Date(),
      expireAt: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000),
    });

    logger.info({
      refundIntentId: refundIntent.id,
      originalIntentId: intentId,
      operator,
      amount: refundAmount,
    }, 'Refund initiated via pawaPay');

    return updatedIntent!;
  } catch (error) {
    if (error instanceof MobileMoneyError) throw error;

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await storage.updatePaymentIntent(refundIntent.id, {
      status: "FAILED",
      errorCode: "PROVIDER_ERROR",
      errorMessage,
      confirmedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Traite un reversement (reversal/refund) initié par le fournisseur.
 * Appelé quand pawaPay annule une transaction après un SUCCESS.
 * 
 * @param intentId - L'identifiant de l'intention de paiement
 * @param reversalRef - La référence externe de l'annulation
 * @param userId - L'identifiant de l'utilisateur initiant l'action (système ou admin)
 * @returns L'intention de paiement mise à jour
 */
export async function processReversal(
  intentId: string,
  reversalRef?: string,
  userId?: string
): Promise<PaymentIntent> {
  const intent = await storage.getPaymentIntent(intentId);

  if (!intent) {
    throw new Error("Payment intent not found");
  }

  if (intent.status !== "SUCCESS") {
    throw new Error(`Cannot reverse payment in status: ${intent.status}`);
  }

  const amount = parseFloat(intent.amount);
  const operator = (intent as any).operator || intent.provider;

  // Créer le mouvement comptable inverse
  const { mouvement } = await executeWithLedger(
    "MOBILE_MONEY",
    {
      montant: amount.toString(),
      sens: intent.type === "COLLECTION" ? "DEBIT" : "CREDIT",
      clientId: intent.clientId || undefined,
      compteId: intent.compteId || undefined,
      creditId: intent.creditId || undefined,
      tontineId: intent.tontineId || undefined,
      methodePaiement: "MOBILE_MONEY",
      typePaiement: `REVERSAL_${intent.type}`,
      referenceExterne: reversalRef,
      idempotencyKey: `momo-rev-${intent.id}`,
      agenceId: intent.agenceId || undefined,
      metadata: {
        provider: operator,
        gateway: "PAWAPAY",
        originalIntentId: intent.id,
        originalMouvementId: intent.mouvementId,
        reversalReason: "Provider reversal",
      },
    },
    async (tx, mouvement) => {
      // Inverser les soldes du compte
      if (intent.compteId) {
        const delta = intent.type === "COLLECTION" ? -amount : amount;
        await updateCompteSolde(tx, intent.compteId, delta);
      }

      // Inverser le crédit
      if (intent.creditId && intent.type === "COLLECTION") {
        await updateCreditSolde(tx, intent.creditId, amount);
      }

      // Inverser la caisse digitale
      if (intent.agenceId) {
        try {
          const digitalCaisse = await getOrCreateDigitalCaisse(tx, operator as "MTN" | "AIRTEL", intent.agenceId);
          const delta = intent.type === "COLLECTION" ? -amount : amount;
          await updateDigitalCaisseSolde(tx, digitalCaisse.id, delta, mouvement.id);
        } catch (error) {
          logger.warn({ err: error }, 'Could not reverse digital caisse');
        }
      }

      // Marquer l'intention comme REVERSED
      await tx
        .update(paymentIntents)
        .set({
          status: "REVERSED",
          metadata: {
            ...(intent.metadata as Record<string, unknown> || {}),
            reversalMouvementId: mouvement.id,
            reversalRef,
            reversedAt: new Date().toISOString(),
            reversedBy: userId,
          },
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, intent.id));

      return { result: mouvement };
    },
    userId
  );

  logger.info({ intentId: intent.id, mouvementId: mouvement.id }, 'Reversal processed');

  return (await storage.getPaymentIntent(intentId))!;
}
