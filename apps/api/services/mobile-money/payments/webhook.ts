import { type PaymentIntent } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import * as storage from "../../../storage/mobile-money";
import { providerRegistry } from "../provider-registry";
import { correspondentToOperator } from "../providers/pawapay/pawapay-config";
import { extractFeeAmount, extractFeeBreakdown, processSuccessfulPayment } from "./gl-posting";
import type { DisbursementStatusDz } from "@shared/enum/enums";

const logger = createLogger("PaymentService:Webhook");

// Lazy import to avoid circular dependency
let handlePaymentFailed: typeof import("../../caisse-agent/agent-mm-payment-service").handlePaymentFailed | null = null;
async function getHandlePaymentFailed() {
  if (!handlePaymentFailed) {
    const module = await import("../../caisse-agent/agent-mm-payment-service");
    handlePaymentFailed = module.handlePaymentFailed;
  }
  return handlePaymentFailed;
}

/**
 * Gère un webhook entrant de pawaPay.
 * 
 * @param payload - Les données brutes du webhook
 * @param rawBodyStr - Le corps brut de la requête sous forme de chaîne
 * @param signature - La signature reçue dans les headers
 * @param headers - Les entêtes de la requête
 */
export async function handleWebhook(
  payload: unknown,
  rawBodyStr: string,
  signature: string,
  headers: Record<string, string>
): Promise<void> {
  const pawaPayProvider = providerRegistry.getPawaPay();

  // 1. Parser le payload
  const parsedPayload = pawaPayProvider.parseWebhookPayload(payload);

  // Extraire l'opérateur depuis le correspondent dans le payload
  const rawPayload = payload as Record<string, unknown>;
  const payloadCorrespondent = (rawPayload.correspondent as string) || "";
  const operator = payloadCorrespondent ? correspondentToOperator(payloadCorrespondent) : undefined;

  // 2. Logger l'événement brut
  const event = await storage.createProviderEvent({
    provider: operator || "MTN", // Fallback, sera corrigé lors du traitement
    eventType: parsedPayload.status || "UNKNOWN",
    providerRef: parsedPayload.providerRef,
    externalRef: parsedPayload.externalRef,
    payload: payload as Record<string, unknown>,
    signature,
    processed: false,
  });

  logger.info({ eventId: event.id, operator, correspondent: payloadCorrespondent }, 'pawaPay webhook received');

  // 3. Vérifier la signature RFC 9421 (utilise le rawBody pour Content-Digest)
  const isValid = pawaPayProvider.verifyWebhook(rawBodyStr, signature, headers);

  if (!isValid) {
    logger.warn('Invalid pawaPay webhook signature');
    await storage.markEventProcessed(event.id, undefined, "INVALID_SIGNATURE");
    return;
  }

  // 4. Trouver le payment intent par externalRef (= depositId/payoutId)
  let intent: PaymentIntent | undefined;

  if (parsedPayload.externalRef) {
    intent = await storage.getPaymentIntentByExternalRef(parsedPayload.externalRef);
  }

  if (!intent && parsedPayload.providerRef) {
    // Fallback par providerRef
    const searchOperator = operator || "MTN";
    intent = await storage.getPaymentIntentByProviderRef(searchOperator, parsedPayload.providerRef);
  }

  if (!intent) {
    logger.warn({ providerRef: parsedPayload.providerRef, externalRef: parsedPayload.externalRef }, 'Orphan webhook: no intent found');
    await storage.markEventProcessed(event.id, undefined, "INTENT_NOT_FOUND");
    return;
  }

  // 5. Stocker le callback brut et la validité de la signature
  await storage.updatePaymentIntent(intent.id, {
    rawCallbackPayload: payload as Record<string, unknown>,
    callbackSignatureValid: isValid,
    providerTxnId: (rawPayload.financialTransactionId as string) || undefined,
  });

  // 6. Vérifier l'idempotence
  if (["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "REVERSED"].includes(intent.status)) {
    logger.info({ intentId: intent.id, status: intent.status }, 'Intent already in terminal state');
    await storage.markEventProcessed(event.id, intent.id, "ALREADY_PROCESSED");
    return;
  }

  // 7. Normaliser le statut pawaPay
  const normalizedStatus = pawaPayProvider.normalizeStatus(parsedPayload.status);

  // 8. Traiter selon le statut
  if (normalizedStatus === "SUCCESS") {
    // Extraire les frais du payload
    const feeAmount = extractFeeAmount(rawPayload);
    const feeBreakdown = extractFeeBreakdown(rawPayload);
    const settlementTimestamp = rawPayload.settlementTimestamp
      ? new Date(rawPayload.settlementTimestamp as string)
      : undefined;

    // Stocker les frais et la date de règlement
    if (feeAmount || feeBreakdown || settlementTimestamp) {
      await storage.updatePaymentIntent(intent.id, {
        feeAmount: feeAmount?.toString(),
        feeBreakdown: feeBreakdown as any,
        settlementTimestamp,
      });
    }

    await processSuccessfulPayment(intent, parsedPayload.financialTransactionId, feeAmount);
    await storage.markEventProcessed(event.id, intent.id);
  } else if (normalizedStatus === "FAILED") {
    const errorCode = (parsedPayload.reason as string) || "UNKNOWN";
    const errorMessage = `Payment failed: ${parsedPayload.reason || "unknown reason"}`;

    await storage.updatePaymentIntent(intent.id, {
      status: "FAILED",
      errorCode,
      errorMessage,
      confirmedAt: new Date(),
    });
    await storage.markEventProcessed(event.id, intent.id);

    // Notifier le service de paiement MM de l'agent si c'était un paiement initié par un agent
    const metadata = intent.metadata as Record<string, unknown> | null;
    if (metadata?.initiatedByAgent) {
      try {
        const handleAgentFailed = await getHandlePaymentFailed();
        await handleAgentFailed(intent.id, errorCode, errorMessage);
      } catch (error) {
        logger.warn({ err: error }, 'Could not notify agent MM service');
      }
    }

    // Notifier le service de fermeture si c'était un paiement de clôture
    if (metadata?.useCase === "CLOSURE_PAYOUT" && metadata?.closureRequestId) {
      try {
        const { handleClosurePayoutFailure } = await import("../../compte-closure");
        await handleClosurePayoutFailure(metadata.closureRequestId as string);
      } catch (error) {
        logger.warn({ err: error }, 'Could not notify closure service of payout failure');
      }
    }

    // Marquer le décaissement de crédit comme échoué (garder WAITING_DISBURSEMENT pour réessayer)
    if (intent.creditId && intent.type === "PAYOUT") {
      try {
        const { updateCredit } = await import("../../../storage/finance");
        await updateCredit(intent.creditId, {
          disbursementStatus: 'FAILED' as DisbursementStatusDz,
        });
        logger.warn({ intentId: intent.id, creditId: intent.creditId, errorCode }, 'Credit disbursement payout failed');
      } catch (error) {
        logger.error({ err: error, creditId: intent.creditId }, 'Could not update credit after payout failure');
      }
    }

    // Notifier le service de paiement de salaire
    if (metadata?.useCase === "SALARY_PAYOUT" && metadata?.jobId) {
      try {
        const { handlePayoutFailure } = await import("../../salary-payment-service");
        await handlePayoutFailure(metadata.jobId as string, errorCode, errorMessage);
      } catch (error) {
        logger.warn({ err: error, jobId: metadata.jobId }, 'Could not notify salary payment service of payout failure');
      }
    }
  } else if (normalizedStatus === "EXPIRED") {
    await storage.updatePaymentIntent(intent.id, {
      status: "EXPIRED",
      confirmedAt: new Date(),
    });
    await storage.markEventProcessed(event.id, intent.id);
  }
  // Si PENDING, on ne fait rien (on attend le prochain webhook)

  logger.info({ intentId: intent.id, status: normalizedStatus }, 'pawaPay webhook processed');
}
