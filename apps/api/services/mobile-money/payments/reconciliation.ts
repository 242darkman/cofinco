import { createLogger } from "../../../lib/logger";
import { type PaymentIntent } from "@shared/schema";
import * as storage from "../../../storage/mobile-money";
import { providerRegistry } from "../provider-registry";
import { processSuccessfulPayment } from "./gl-posting";

const logger = createLogger("PaymentService:Reconciliation");

/**
 * Vérifie le statut d'une intention de paiement (PENDING) auprès de pawaPay (polling fallback).
 * Utilisé quand le webhook ne peut pas atteindre le serveur (sandbox/localhost).
 * Retourne l'intention mise à jour si le statut a changé, sinon undefined.
 * 
 * @param intent - L'intention de paiement à vérifier
 * @returns L'intention de paiement mise à jour, ou undefined si inchangée
 */
export async function checkAndUpdatePendingStatus(intent: PaymentIntent): Promise<PaymentIntent | undefined> {
  try {
    const pawaPayProvider = providerRegistry.getPawaPay();
    const statusResponse = await pawaPayProvider.getStatus(intent.externalRef!);

    if (statusResponse.status === "PENDING") {
      return undefined; // Pas encore traité par pawaPay
    }

    logger.info(
      { intentId: intent.id, externalRef: intent.externalRef, newStatus: statusResponse.status },
      'Polling fallback: pawaPay status changed'
    );

    if (statusResponse.status === "SUCCESS") {
      await processSuccessfulPayment(intent, statusResponse.providerTxnId);
      return (await storage.getPaymentIntent(intent.id))!;
    }

    if (statusResponse.status === "FAILED") {
      const errorCode = statusResponse.errorCode || "UNKNOWN";
      const errorMessage = statusResponse.errorMessage || "Payment failed";
      await storage.updatePaymentIntent(intent.id, {
        status: "FAILED",
        errorCode,
        errorMessage,
        confirmedAt: new Date(),
      });
      return (await storage.getPaymentIntent(intent.id))!;
    }

    if (statusResponse.status === "EXPIRED") {
      await storage.updatePaymentIntent(intent.id, {
        status: "EXPIRED",
        confirmedAt: new Date(),
      });
      return (await storage.getPaymentIntent(intent.id))!;
    }
  } catch (error) {
    // Polling is best-effort — don't fail the GET request
    logger.warn({ intentId: intent.id, err: error }, 'Polling fallback: could not check pawaPay status');
  }

  return undefined;
}

/**
 * Traite une réconciliation réussie (appelée par la tâche planifiée - cron).
 * 
 * @param intent - L'intention de paiement à rapprocher
 * @param statusResponse - La réponse contenant l'ID de transaction du fournisseur
 */
export async function handleReconciliationSuccess(
  intent: PaymentIntent,
  statusResponse: { providerTxnId?: string }
): Promise<void> {
  logger.info({ intentId: intent.id }, 'Reconciliation: processing as SUCCESS');
  await processSuccessfulPayment(intent, statusResponse.providerTxnId);
}

/**
 * Rapprochement manuel par un administrateur.
 * Force le statut du paiement en succès ou échec.
 * 
 * @param intentId - L'identifiant de l'intention de paiement
 * @param decision - La décision ("SUCCESS" ou "FAILED")
 * @param providerTxnId - L'ID de transaction fournisseur optionnel
 * @param notes - Des notes explicatives optionnelles
 * @param userId - L'identifiant de l'administrateur
 * @returns L'intention de paiement mise à jour
 */
export async function manualReconcile(
  intentId: string,
  decision: "SUCCESS" | "FAILED",
  providerTxnId?: string,
  notes?: string,
  userId?: string
): Promise<PaymentIntent> {
  const intent = await storage.getPaymentIntent(intentId);

  if (!intent) {
    throw new Error("Payment intent not found");
  }

  if (["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "REVERSED"].includes(intent.status)) {
    throw new Error(`Cannot reconcile payment already in terminal status: ${intent.status}`);
  }

  logger.info({ intentId, decision, userId }, 'Manual reconciliation');

  if (decision === "SUCCESS") {
    await processSuccessfulPayment(intent, providerTxnId);

    await storage.updatePaymentIntent(intentId, {
      metadata: {
        ...(intent.metadata as Record<string, unknown> || {}),
        manualReconciliation: {
          decision,
          providerTxnId,
          notes,
          reconcileBy: userId,
          reconciledAt: new Date().toISOString(),
        },
      },
    });
  } else {
    await storage.updatePaymentIntent(intentId, {
      status: "FAILED",
      errorCode: "MANUAL_RECONCILIATION",
      errorMessage: notes || "Manually reconciled as failed",
      confirmedAt: new Date(),
      metadata: {
        ...(intent.metadata as Record<string, unknown> || {}),
        manualReconciliation: {
          decision,
          notes,
          reconcileBy: userId,
          reconciledAt: new Date().toISOString(),
        },
      },
    });
  }

  return (await storage.getPaymentIntent(intentId))!;
}
