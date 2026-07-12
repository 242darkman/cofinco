import { eq } from "drizzle-orm";
import { type PaymentIntent, transactionsCompte, operationsCaisse, paymentIntents } from "@shared/schema";
import { executeWithLedger, updateCompteSolde } from "../../ledger";
import { getOrCreateDigitalCaisse, updateDigitalCaisseSolde } from "../mm-caisse-service";
import { MethodePaiement, TypeOperationCaisse } from "@shared/enum/status-constants";
import type { TypePaiementTerrainDz, TypeOperationCaisseDz, DisbursementStatusDz, StatutCreditDz } from "@shared/enum/enums";
import { createLogger } from "../../../lib/logger";
import { findActiveSession, resolveOperator } from "./helpers";
import { operatorToCorrespondent } from "../providers/pawapay/pawapay-config";
import { calculateFee, type FeeEstimate } from "../fee-calculator";
import { providerRegistry } from "../provider-registry";
import { currencyCode } from "@shared/config/currency";
import * as storage from "../../../storage/mobile-money";
import { normalizePhone } from "@shared/utils/phone";
import type { InitiatePayoutParams } from "../types";
import { MobileMoneyError } from "../types";
import { canMemberWithdraw } from "../../tontine-logic";

const logger = createLogger("PaymentService:Payout");

const PAYMENT_TIMEOUT_MINUTES = parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || "30", 10);

/**
 * Initie un paiement sortant (payout) via pawaPay.
 * Utilisé pour : décaissements de crédit, retraits, remboursements de frais.
 * 
 * @param params - Les paramètres d'initiation du paiement sortant
 * @param userId - L'identifiant de l'utilisateur initiant la demande
 * @returns L'intention de paiement créée
 */
export async function initiatePayout(
  params: InitiatePayoutParams,
  userId?: string
): Promise<PaymentIntent> {
  const {
    provider,
    amount,
    phone: rawPhone,
    clientId,
    compteId,
    creditId,
    tontineId,
    description,
    idempotencyKey,
    agenceId,
    metadata,
  } = params;

  const phone = normalizePhone(rawPhone) || rawPhone;

  // Vérifier l'idempotence
  if (idempotencyKey) {
    const existing = await storage.getPaymentIntentByIdempotencyKey(idempotencyKey);
    if (existing) {
      logger.info({ intentId: existing.id }, 'Idempotent request, returning existing intent');
      return existing;
    }
  }

  // Résoudre l'opérateur et le correspondant pawaPay
  const operator = resolveOperator(provider, phone);
  const correspondent = operatorToCorrespondent(operator);

  // Calculer les frais MicroFlex si feeOption est fourni
  let feeEstimate: FeeEstimate | null = null;
  if (params.feeOption) {
    feeEstimate = await calculateFee(amount, operator, "PAYOUT", params.feeOption);
  }

  // Montant envoyé au téléphone via pawaPay :
  // Option A → amount (client reçoit le montant intégral, compte débité amount + fee)
  // Option B → amount - fee (frais déduits, compte débité amount)
  // Pas d'option → amount
  const pawaPayAmount = feeEstimate ? feeEstimate.montantNet : amount;

  // Récupérer le provider pawaPay
  const pawaPayProvider = providerRegistry.getPawaPay();

  // Déterminer le useCase
  const useCase = creditId
    ? "CREDIT_DISBURSEMENT"
    : tontineId
      ? "TONTINE_DISTRIBUTION"
      : "WITHDRAWAL_SAVINGS";

  // Créer l'intent avec status CREATED
  const intent = await storage.createPaymentIntent({
    provider: operator,
    type: "PAYOUT",
    status: "CREATED",
    gateway: "PAWAPAY",
    operator,
    correspondent,
    amount: amount.toString(),
    currency: currencyCode(),
    phone,
    clientId,
    compteId,
    creditId,
    tontineId,
    agenceId,
    idempotencyKey,
    // MicroFlex client fee fields
    feeOption: params.feeOption || null,
    clientFeeAmount: feeEstimate?.feeAmount?.toString() || null,
    clientFeeRate: feeEstimate?.feeRate?.toString() || null,
    montantBrut: feeEstimate?.montantBrut?.toString() || null,
    montantNet: feeEstimate?.montantNet?.toString() || null,
    metadata: {
      ...metadata,
      description,
      useCase,
    },
    createdBy: userId,
  });

  try {
    // Appeler pawaPay payout
    const response = await pawaPayProvider.payout({
      amount: pawaPayAmount,
      phone,
      externalRef: intent.externalRef,
      correspondent,
      description,
    });

    // Mettre à jour l'intent avec providerRef et status PENDING
    const updatedIntent = await storage.updatePaymentIntent(intent.id, {
      providerRef: response.providerRef,
      status: "PENDING",
      initiatedAt: new Date(),
      expireAt: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000),
    });

    logger.info({ intentId: intent.id, providerRef: response.providerRef, operator, correspondent }, 'Payout initiated via pawaPay');
    return updatedIntent!;
  } catch (error) {
    logger.error({ err: error, operator, correspondent }, 'Payout failed');

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode = error instanceof MobileMoneyError ? error.code : "PROVIDER_ERROR";

    await storage.updatePaymentIntent(intent.id, {
      status: "FAILED",
      errorCode,
      errorMessage,
      confirmedAt: new Date(),
    });

    throw error;
  }
}

/**
 * Traite un paiement sortant réussi.
 * Inclut : opérations de caisse, mise à jour caisse digitale.
 * 
 * @param intent - L'intention de paiement
 * @param amount - Le montant traité
 * @param providerTxnId - L'ID de transaction du fournisseur
 */
export async function processSuccessfulPayout(
  intent: PaymentIntent,
  amount: number,
  providerTxnId?: string
): Promise<void> {
  const metadata = intent.metadata as Record<string, unknown> | null;
  const operator = (intent as any).operator || intent.provider;
  const typePaiement = intent.creditId
    ? "CREDIT_DISBURSEMENT"
    : metadata?.useCase === "CLOSURE_PAYOUT"
      ? "CLOSURE_PAYOUT"
      : "WITHDRAWAL_SAVINGS";

  // Déterminer les montants selon l'option frais
  const clientFeeAmount = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
  const debitAmount = intent.montantBrut ? parseFloat(intent.montantBrut) : amount; // Montant débité du compte
  const caisseAmount = intent.montantNet ? parseFloat(intent.montantNet) : amount; // Montant sorti du wallet MM (envoyé au téléphone)
  const feeObservation = clientFeeAmount > 0 ? ` (frais MM: ${clientFeeAmount.toLocaleString("fr-FR")})` : '';

  const { mouvement } = await executeWithLedger(
    "MOBILE_MONEY",
    {
      montant: debitAmount.toString(), // Mouvement GL = montant total débité du compte
      sens: "DEBIT",
      clientId: intent.clientId || undefined,
      compteId: intent.compteId || undefined,
      creditId: intent.creditId || undefined,
      tontineId: intent.tontineId || undefined,
      methodePaiement: "MOBILE_MONEY",
      typePaiement,
      referenceExterne: providerTxnId,
      idempotencyKey: `momo-pay-${intent.id}`,
      agenceId: intent.agenceId || undefined,
      metadata: {
        provider: operator, // Les règles GL correspondent à l'opérateur (MTN/AIRTEL)
        gateway: "PAWAPAY",
        correspondent: (intent as any).correspondent,
        phone: intent.phone,
        externalRef: intent.externalRef,
        feeOption: intent.feeOption || undefined,
        clientFeeAmount: clientFeeAmount || undefined,
        ...(metadata || {}),
      },
    },
    async (tx, mouvement) => {
      let additionalEventData: Record<string, unknown> = {};
      let operationCaisseId: string | undefined;

      // 1. Mettre à jour le solde du compte si applicable (montant BRUT = total débité)
      if (intent.compteId) {
        const nouveauSolde = await updateCompteSolde(tx, intent.compteId, -debitAmount);
        additionalEventData.nouveauSoldeCompte = nouveauSolde;

        // Créer un enregistrement de transaction pour l'historique du compte
        await tx.insert(transactionsCompte).values({
          compteId: intent.compteId,
          mouvementId: mouvement.id,
          typePaiement: typePaiement as TypePaiementTerrainDz,
          sens: "DEBIT",
          montant: debitAmount.toString(),
          soldeApres: nouveauSolde,
          methodePaiement: MethodePaiement.MOBILE_MONEY,
          observations: `Retrait Mobile Money ${operator} via pawaPay${feeObservation}`,
          idempotencyKey: `tx-momo-pay-${intent.id}`,
          createdBy: intent.createdBy,
        });
      }

      // 2. Mettre à jour la caisse digitale si agence définie (montant NET = ce qui sort réellement du wallet)
      if (intent.agenceId) {
        try {
          const digitalCaisse = await getOrCreateDigitalCaisse(tx, operator as "MTN" | "AIRTEL", intent.agenceId);
          await updateDigitalCaisseSolde(tx, digitalCaisse.id, -caisseAmount, mouvement.id);
          additionalEventData.digitalCaisseId = digitalCaisse.id;
        } catch (error) {
          logger.warn({ err: error }, 'Could not update digital caisse');
        }
      }

      // 3. Créer operationsCaisse si session active trouvée
      if (intent.agenceId && intent.clientId) {
        try {
          const activeSession = await findActiveSession(tx, intent.agenceId);
          if (activeSession) {
            const opType = intent.creditId
              ? TypeOperationCaisse.CREDIT_DISBURSEMENT
              : TypeOperationCaisse.WITHDRAWAL_SAVINGS;

            const [opCaisse] = await tx
              .insert(operationsCaisse)
              .values({
                sessionId: activeSession.id,
                mouvementId: mouvement.id,
                clientId: intent.clientId,
                typeOperation: opType as TypeOperationCaisseDz,
                montant: debitAmount.toString(),
                methodePaiement: MethodePaiement.MOBILE_MONEY,
                reference: `MM-${operator}-${intent.externalRef}`,
                description: `Payout Mobile Money ${operator} via pawaPay${feeObservation}`,
                metadata: {
                  gateway: "PAWAPAY",
                  operator,
                  correspondent: (intent as any).correspondent,
                  providerTxnId,
                  phone: intent.phone,
                },
                createdBy: intent.createdBy,
              })
              .returning();

            operationCaisseId = opCaisse.id;
            additionalEventData.operationCaisseId = operationCaisseId;
          }
        } catch (error) {
          logger.warn({ err: error }, 'Could not create operationsCaisse');
        }
      }

      // 4. Mettre à jour l'intent dans la même transaction
      await tx
        .update(paymentIntents)
        .set({
          status: "SUCCESS",
          providerTxnId,
          mouvementId: mouvement.id,
          operationCaisseId,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentIntents.id, intent.id));

      return { result: mouvement, additionalEventData };
    },
    intent.createdBy || undefined
  );

  logger.info({ intentId: intent.id, mouvementId: mouvement.id }, 'Payout processed');

  // Hook post-payout: finaliser la fermeture si c'était un paiement de clôture
  if (metadata?.useCase === "CLOSURE_PAYOUT" && metadata?.closureRequestId) {
    try {
      const { handleClosurePayoutSuccess } = await import("../../compte-closure");
      await handleClosurePayoutSuccess(
        metadata.closureRequestId as string,
        mouvement.id
      );
      logger.info({ intentId: intent.id, closureRequestId: metadata.closureRequestId }, 'Closure payout finalized');
    } catch (error) {
      logger.error({ intentId: intent.id, err: error }, 'Failed to finalize closure after payout');
    }
  }

  // Hook post-payout: finaliser le paiement de commission
  if (metadata?.useCase === "COMMISSION_PAYOUT" && metadata?.commissionId) {
    try {
      const { finalizeCommissionMobileMoney } = await import("../../commission-payment-service");
      await finalizeCommissionMobileMoney(
        metadata.commissionId as string,
        mouvement.id
      );
      logger.info({ intentId: intent.id, commissionId: metadata.commissionId }, 'Commission payout finalized');
    } catch (error) {
      logger.error({ intentId: intent.id, err: error }, 'Failed to finalize commission after payout');
    }
  }

  // Hook post-payout: activer le crédit après décaissement réussi par Mobile Money
  if (intent.creditId && typePaiement === "CREDIT_DISBURSEMENT") {
    try {
      const { updateCredit, generateCreditSchedule } = await import("../../../storage/finance");
      const { StatutCredit } = await import("@shared/enum/status-constants");

      await updateCredit(intent.creditId, {
        statut: StatutCredit.ACTIVE as StatutCreditDz,
        disbursementStatus: 'COMPLETED' as DisbursementStatusDz,
        disbursedAt: new Date(),
        disbursedBy: intent.createdBy,
      });

      // Générer l'échéancier (obligatoire, même pattern que le canal ACCOUNT)
      try {
        await generateCreditSchedule(intent.creditId);
      } catch (scheduleErr) {
        logger.error({ err: scheduleErr, creditId: intent.creditId }, 'Échec génération échéancier après décaissement MM — crédit rétrogradé');
        await updateCredit(intent.creditId, {
          statut: 'PENDING' as StatutCreditDz,
          disbursementStatus: 'FAILED' as DisbursementStatusDz,
        });
      }

      // Diffuser la notification WebSocket
      try {
        const { getWsInstance } = await import("../../../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "CAISSE_UPDATE" as any,
            payload: {
              subtype: 'LOAN_DISBURSEMENT_CONFIRMED',
              creditId: intent.creditId,
              channel: 'MOBILE_MONEY',
              provider: (intent as any).operator || intent.provider,
              amount: parseFloat(intent.amount),
              timestamp: new Date().toISOString(),
            }
          });
        }
      } catch (_wsErr) { /* non critique */ }

      logger.info({ intentId: intent.id, creditId: intent.creditId }, 'Credit activated after Mobile Money disbursement');
    } catch (error) {
      logger.error({ intentId: intent.id, creditId: intent.creditId, err: error }, 'Failed to activate credit after payout');
    }
  }

  // Hook post-payout: finaliser le paiement de salaire après succès
  if (metadata?.useCase === "SALARY_PAYOUT" && metadata?.jobId) {
    try {
      const { handlePayoutSuccess } = await import("../../salary-payment-service");
      await handlePayoutSuccess(metadata.jobId as string, mouvement.id);
      logger.info({ intentId: intent.id, jobId: metadata.jobId }, 'Salary payout finalized');
    } catch (error) {
      logger.error({ intentId: intent.id, jobId: metadata.jobId, err: error }, 'Failed to finalize salary payout');
    }
  }
}

/**
 * Vérifie si un paiement de tontine est autorisé pour un membre.
 * 
 * @param tontineId - L'identifiant de la tontine
 * @param membreId - L'identifiant du membre
 * @param amount - Le montant à retirer
 * @returns Le résultat de validation
 */
export async function validateTontinePayout(
  tontineId: string,
  membreId: string,
  amount: number
): Promise<{ isValid: boolean; reason?: string; maxAmount?: number }> {
  const result = await canMemberWithdraw(tontineId, membreId, amount);

  return {
    isValid: result.canWithdraw,
    reason: result.reason,
    maxAmount: result.maxAmount,
  };
}
