import type { PaymentIntent } from "@shared/schema";
import type { DisbursementStatusDz, StatutCreditDz } from "@shared/enum/enums";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("PaymentService:PayoutPostProcessing");

type PayoutMetadata = Record<string, unknown> | null;

export type SuccessfulPayoutType = "CREDIT_DISBURSEMENT" | "CLOSURE_PAYOUT" | "WITHDRAWAL_SAVINGS";

interface SuccessfulPayoutPostProcessingParams {
  intent: PaymentIntent;
  metadata: PayoutMetadata;
  mouvementId: string;
  typePaiement: SuccessfulPayoutType;
}

/**
 * Exécute les effets métier déclenchés après confirmation d'un payout Mobile Money.
 *
 * Ces traitements restent volontairement hors de la transaction ledger principale :
 * ils finalisent les workflows consommateurs une fois le mouvement financier créé et
 * journalisent leurs propres échecs sans annuler le paiement déjà confirmé.
 *
 * @param params - Contexte du payout confirmé et du mouvement financier associé.
 */
export async function runSuccessfulPayoutPostProcessing(
  params: SuccessfulPayoutPostProcessingParams
): Promise<void> {
  const { intent, metadata, mouvementId, typePaiement } = params;

  await finalizeClosurePayout(intent, metadata, mouvementId);
  await finalizeCommissionPayout(intent, metadata, mouvementId);
  await activateCreditAfterPayout(intent, typePaiement);
  await finalizeSalaryPayout(intent, metadata, mouvementId);
}

async function finalizeClosurePayout(
  intent: PaymentIntent,
  metadata: PayoutMetadata,
  mouvementId: string
): Promise<void> {
  const closureRequestId = typeof metadata?.closureRequestId === "string" ? metadata.closureRequestId : null;
  if (metadata?.useCase !== "CLOSURE_PAYOUT" || !closureRequestId) {
    return;
  }

  try {
    const { handleClosurePayoutSuccess } = await import("../../compte-closure");
    await handleClosurePayoutSuccess(closureRequestId, mouvementId);
    logger.info({ intentId: intent.id, closureRequestId }, "Closure payout finalized");
  } catch (error) {
    logger.error({ intentId: intent.id, err: error }, "Failed to finalize closure after payout");
  }
}

async function finalizeCommissionPayout(
  intent: PaymentIntent,
  metadata: PayoutMetadata,
  mouvementId: string
): Promise<void> {
  const commissionId = typeof metadata?.commissionId === "string" ? metadata.commissionId : null;
  if (metadata?.useCase !== "COMMISSION_PAYOUT" || !commissionId) {
    return;
  }

  try {
    const { finalizeCommissionMobileMoney } = await import("../../commission-payment-service");
    await finalizeCommissionMobileMoney(commissionId, mouvementId);
    logger.info({ intentId: intent.id, commissionId }, "Commission payout finalized");
  } catch (error) {
    logger.error({ intentId: intent.id, err: error }, "Failed to finalize commission after payout");
  }
}

async function activateCreditAfterPayout(
  intent: PaymentIntent,
  typePaiement: SuccessfulPayoutType
): Promise<void> {
  if (!intent.creditId || typePaiement !== "CREDIT_DISBURSEMENT") {
    return;
  }

  try {
    const { updateCredit, generateCreditSchedule } = await import("../../../storage/finance");
    const { StatutCredit } = await import("@shared/enum/status-constants");

    await updateCredit(intent.creditId, {
      statut: StatutCredit.ACTIVE as StatutCreditDz,
      disbursementStatus: "COMPLETED" as DisbursementStatusDz,
      disbursedAt: new Date(),
      disbursedBy: intent.createdBy,
    });

    try {
      await generateCreditSchedule(intent.creditId);
    } catch (scheduleErr) {
      logger.error(
        { err: scheduleErr, creditId: intent.creditId },
        "Échec génération échéancier après décaissement MM — crédit rétrogradé"
      );
      await updateCredit(intent.creditId, {
        statut: "PENDING" as StatutCreditDz,
        disbursementStatus: "FAILED" as DisbursementStatusDz,
      });
    }

    await broadcastCreditDisbursement(intent);

    logger.info(
      { intentId: intent.id, creditId: intent.creditId },
      "Credit activated after Mobile Money disbursement"
    );
  } catch (error) {
    logger.error(
      { intentId: intent.id, creditId: intent.creditId, err: error },
      "Failed to activate credit after payout"
    );
  }
}

async function broadcastCreditDisbursement(intent: PaymentIntent): Promise<void> {
  try {
    const { getWsInstance } = await import("../../../ws-server");
    const wsInstance = getWsInstance();
    if (!wsInstance || !intent.creditId) {
      return;
    }

    wsInstance.broadcast({
      type: "CAISSE_UPDATE",
      payload: {
        subtype: "LOAN_DISBURSEMENT_CONFIRMED",
        creditId: intent.creditId,
        channel: "MOBILE_MONEY",
        provider: intent.operator || intent.provider,
        amount: parseFloat(intent.amount),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (_wsErr) {
    // La diffusion temps réel est informative et ne doit pas invalider le payout confirmé.
  }
}

async function finalizeSalaryPayout(
  intent: PaymentIntent,
  metadata: PayoutMetadata,
  mouvementId: string
): Promise<void> {
  const jobId = typeof metadata?.jobId === "string" ? metadata.jobId : null;
  if (metadata?.useCase !== "SALARY_PAYOUT" || !jobId) {
    return;
  }

  try {
    const { handlePayoutSuccess } = await import("../../salary-payment-service");
    await handlePayoutSuccess(jobId, mouvementId);
    logger.info({ intentId: intent.id, jobId }, "Salary payout finalized");
  } catch (error) {
    logger.error({ intentId: intent.id, jobId, err: error }, "Failed to finalize salary payout");
  }
}
