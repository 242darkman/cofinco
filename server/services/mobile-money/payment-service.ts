/**
 * Payment Service
 * Service orchestrateur pour les paiements Mobile Money via pawaPay
 *
 * Fonctionnalités:
 * - Collection (dépôts, remboursements, cotisations tontine) via pawaPay
 * - Payout (retraits, décaissements) via pawaPay
 * - Webhook pawaPay avec signature RFC 9421
 * - Traçabilité operationsCaisse et caisses digitales
 * - Allocation crédit (pénalités → intérêts → principal)
 * - Reversals et réconciliation manuelle
 * - Fee tracking (pawaPay aggregator fees)
 */

import { db } from "../../db";
import { paymentIntents, operationsCaisse, sessionsCaisse, transactionsCompte, comptes, type PaymentIntent } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  executeWithLedger,
  updateCompteSolde,
  updateCreditSolde,
  type MouvementFinancier
} from "../ledger";
import { providerRegistry } from "./provider-registry";
import * as storage from "../../storage/mobile-money";
import type {
  InitiateCollectionParams,
  InitiatePayoutParams,
  PaymentIntentFilter,
  WebhookPayload,
  MobileOperator,
  RefundRequest,
} from "./types";
import { MobileMoneyError } from "./types";
import { getOrCreateDigitalCaisse, updateDigitalCaisseSolde } from "./mm-caisse-service";
import { allocateCreditRepayment } from "../credit-allocation-service";
import { canMemberWithdraw } from "../tontine-logic";
import { TypeOperationCaisse, MethodePaiement } from "@shared/enum/status-constants";
import type {
  TypePaiementTerrainDz,
  TypeOperationCaisseDz,
  StatutCreditDz,
  DisbursementStatusDz,
  StatutPaymentIntentDz,
} from "@shared/enum/enums";
import { operatorToCorrespondent, correspondentToOperator, resolveOperatorFromPhone } from "./providers/pawapay/pawapay-config";
import { createLogger } from "../../lib/logger";
import { currencyCode } from "@shared/config/currency";
import { calculateFee, type FeeEstimate } from "./fee-calculator";
import { allocateOpeningPayment, recomputeAccountStatus, type OpeningSnapshot } from "../comptes";
import { normalizePhone } from "@shared/utils/phone";

const logger = createLogger('PaymentService');

// Lazy import to avoid circular dependency
let agentMmPaymentService: typeof import("../caisse-agent/agent-mm-payment-service").agentMmPaymentService | null = null;
async function getAgentMmPaymentService() {
  if (!agentMmPaymentService) {
    const module = await import("../caisse-agent/agent-mm-payment-service");
    agentMmPaymentService = module.agentMmPaymentService;
  }
  return agentMmPaymentService;
}

// Timeout par défaut en minutes
const PAYMENT_TIMEOUT_MINUTES = parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || "30", 10);

/**
 * Résout l'opérateur (MTN/AIRTEL) à partir du numéro de téléphone ou du paramètre provider
 */
function resolveOperator(provider: MobileOperator, phone: string): MobileOperator {
  // Le paramètre provider a la priorité (sélection UI explicite)
  if (provider === "MTN" || provider === "AIRTEL") {
    return provider;
  }
  // Sinon, résoudre depuis le numéro de téléphone
  const resolved = resolveOperatorFromPhone(phone);
  if (!resolved) {
    throw new MobileMoneyError(
      `Impossible de déterminer l'opérateur pour le numéro ${phone}`,
      "OPERATOR_RESOLUTION_FAILED",
      "PAWAPAY",
      false
    );
  }
  return resolved;
}

class PaymentService {
  /**
   * Initie une collection (argent entrant) via pawaPay
   * Utilisé pour: dépôts, remboursements crédit, cotisations tontine
   */
  async initiateCollection(
    params: InitiateCollectionParams,
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

    // Calculer les frais Cofinco si feeOption est fourni
    let feeEstimate: FeeEstimate | null = null;
    if (params.feeOption) {
      feeEstimate = await calculateFee(amount, operator, "COLLECTION", params.feeOption);
    }

    // Montant envoyé à pawaPay : Option A → amount + fee, Option B → amount, pas d'option → amount
    const pawaPayAmount = feeEstimate && params.feeOption === "CLIENT_PAYS"
      ? feeEstimate.montantBrut
      : amount;

    // Récupérer le provider pawaPay
    const pawaPayProvider = providerRegistry.getPawaPay();

    // Créer l'intent avec status CREATED
    const intent = await storage.createPaymentIntent({
      provider: operator,
      type: "COLLECTION",
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
      // Cofinco client fee fields
      feeOption: params.feeOption || null,
      clientFeeAmount: feeEstimate?.feeAmount?.toString() || null,
      clientFeeRate: feeEstimate?.feeRate?.toString() || null,
      montantBrut: feeEstimate?.montantBrut?.toString() || null,
      montantNet: feeEstimate?.montantNet?.toString() || null,
      metadata: {
        ...metadata,
        description,
        useCase: this.determineUseCase({ compteId, creditId, tontineId }),
      },
      createdBy: userId,
    });

    try {
      // Appeler pawaPay collect avec le correspondant
      const response = await pawaPayProvider.collect({
        amount: pawaPayAmount,
        phone,
        externalRef: intent.externalRef,
        callbackUrl: "", // pawaPay v2 ne supporte pas callbackUrl dans le body — configurer dans le dashboard pawaPay
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

      logger.info({ intentId: intent.id, providerRef: response.providerRef, operator, correspondent }, 'Collection initiated via pawaPay');
      return updatedIntent!;
    } catch (error) {
      logger.error({ err: error, operator, correspondent }, 'Collection failed');

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
   * Initie un payout (argent sortant) via pawaPay
   * Utilisé pour: décaissements crédit, retraits, remboursements frais
   */
  async initiatePayout(
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

    // Calculer les frais Cofinco si feeOption est fourni
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
      // Cofinco client fee fields
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
   * Gère un webhook entrant de pawaPay
   */
  async handleWebhook(
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
      const feeAmount = this.extractFeeAmount(rawPayload);
      const feeBreakdown = this.extractFeeBreakdown(rawPayload);
      const settlementTimestamp = rawPayload.settlementTimestamp
        ? new Date(rawPayload.settlementTimestamp as string)
        : undefined;

      // Stocker les fees et le settlement
      if (feeAmount || feeBreakdown || settlementTimestamp) {
        await storage.updatePaymentIntent(intent.id, {
          feeAmount: feeAmount?.toString(),
          feeBreakdown: feeBreakdown as any,
          settlementTimestamp,
        });
      }

      await this.processSuccessfulPayment(intent, parsedPayload.financialTransactionId, feeAmount);
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

      // Notify agent MM payment service if this was an agent-initiated payment
      const metadata = intent.metadata as Record<string, unknown> | null;
      if (metadata?.initiatedByAgent) {
        try {
          const agentService = await getAgentMmPaymentService();
          await agentService.handlePaymentFailed(intent.id, errorCode, errorMessage);
        } catch (error) {
          logger.warn({ err: error }, 'Could not notify agent MM service');
        }
      }

      // Notify closure service if this was a closure payout
      if (metadata?.useCase === "CLOSURE_PAYOUT" && metadata?.closureRequestId) {
        try {
          const { handleClosurePayoutFailure } = await import("../compte-closure");
          await handleClosurePayoutFailure(metadata.closureRequestId as string);
        } catch (error) {
          logger.warn({ err: error }, 'Could not notify closure service of payout failure');
        }
      }

      // Mark credit disbursement as failed (keep WAITING_DISBURSEMENT so it can be retried)
      if (intent.creditId && intent.type === "PAYOUT") {
        try {
          const { updateCredit } = await import("../../storage/finance");
          await updateCredit(intent.creditId, {
            disbursementStatus: 'FAILED' as DisbursementStatusDz,
          });
          logger.warn({ intentId: intent.id, creditId: intent.creditId, errorCode }, 'Credit disbursement payout failed');
        } catch (error) {
          logger.error({ err: error, creditId: intent.creditId }, 'Could not update credit after payout failure');
        }
      }

      // Notify salary payment service if this was a salary payout
      if (metadata?.useCase === "SALARY_PAYOUT" && metadata?.jobId) {
        try {
          const { handlePayoutFailure } = await import("../salary-payment-service");
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

  /**
   * Extraire le montant des frais du payload pawaPay
   */
  private extractFeeAmount(payload: Record<string, unknown>): number | undefined {
    // pawaPay deposit callbacks include depositFee or correspondentFee
    const depositFee = payload.depositFee as number | undefined;
    const correspondentFee = payload.correspondentFee as number | undefined;
    const payoutFee = payload.payoutFee as number | undefined;

    if (depositFee != null) return depositFee;
    if (correspondentFee != null) return correspondentFee;
    if (payoutFee != null) return payoutFee;
    return undefined;
  }

  /**
   * Extraire le breakdown des frais du payload pawaPay
   */
  private extractFeeBreakdown(payload: Record<string, unknown>): Record<string, unknown> | undefined {
    const breakdown: Record<string, unknown> = {};
    let hasFees = false;

    if (payload.depositFee != null) { breakdown.depositFee = payload.depositFee; hasFees = true; }
    if (payload.correspondentFee != null) { breakdown.correspondentFee = payload.correspondentFee; hasFees = true; }
    if (payload.payoutFee != null) { breakdown.payoutFee = payload.payoutFee; hasFees = true; }
    if (payload.suspenseAmount != null) { breakdown.suspenseAmount = payload.suspenseAmount; hasFees = true; }
    if (payload.currency != null) { breakdown.currency = payload.currency; }

    return hasFees ? breakdown : undefined;
  }

  /**
   * Traite un paiement réussi - crée les écritures comptables + fees GL
   */
  private async processSuccessfulPayment(
    intent: PaymentIntent,
    providerTxnId?: string,
    feeAmount?: number
  ): Promise<void> {
    const amount = parseFloat(intent.amount);

    if (intent.type === "COLLECTION") {
      await this.processSuccessfulCollection(intent, amount, providerTxnId);
    } else if (intent.type === "PAYOUT") {
      await this.processSuccessfulPayout(intent, amount, providerTxnId);
    }

    // Post GL entry for pawaPay operator fees (DR 6272 / CR 578x)
    const effectiveFee = feeAmount ?? (intent.feeAmount ? parseFloat(intent.feeAmount) : 0);
    if (effectiveFee > 0) {
      await this.postFeeGlEntry(intent, effectiveFee);
    }

    // Post GL entry for Cofinco client-facing fees (DR 578x / CR 708700)
    const clientFee = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
    if (clientFee > 0) {
      await this.postClientFeeGlEntry(intent, clientFee);
    }
  }

  /**
   * Poste l'écriture GL pour les frais opérateur pawaPay
   * Utilise les règles COMM_MTN / COMM_AIRTEL (eventType: OPERATOR_FEE)
   * DR 6272 (Commissions Mobile Money) / CR 5781 ou 5782 (Compte Mobile Money)
   */
  private async postFeeGlEntry(intent: PaymentIntent, feeAmount: number): Promise<void> {
    const operator = (intent as any).operator || intent.provider;

    try {
      await executeWithLedger(
        "MOBILE_MONEY",
        {
          montant: feeAmount.toString(),
          sens: "DEBIT",
          clientId: intent.clientId || undefined,
          compteId: intent.compteId || undefined,
          methodePaiement: "MOBILE_MONEY",
          typePaiement: "OPERATOR_FEE",
          referenceExterne: intent.providerTxnId || undefined,
          idempotencyKey: `momo-fee-${intent.id}`,
          agenceId: intent.agenceId || undefined,
          requiresGlPosting: false, // Non-bloquant: si la règle GL n'existe pas, ne pas bloquer le paiement
          metadata: {
            provider: operator,
            gateway: "PAWAPAY",
            correspondent: (intent as any).correspondent,
            originalIntentId: intent.id,
            feeBreakdown: intent.feeBreakdown,
          },
        },
        async (_tx, mouvement) => {
          return { result: mouvement };
        },
        intent.createdBy || undefined
      );

      logger.info({ intentId: intent.id, feeAmount, operator }, 'Fee GL entry posted');
    } catch (error) {
      // Fee posting is non-critical — log but don't fail the payment
      logger.warn({ intentId: intent.id, feeAmount, err: error }, 'Could not post fee GL entry');
    }
  }

  /**
   * Traite une collection réussie
   * Inclut: operationsCaisse, caisse digitale, allocation crédit
   */
  private async processSuccessfulCollection(
    intent: PaymentIntent,
    amount: number,
    providerTxnId?: string
  ): Promise<void> {
    const metadata = intent.metadata as Record<string, unknown> | null;
    const typePaiement = this.determineTypePaiement(intent);
    // GL routing utilise le champ provider (= operator MTN/AIRTEL)
    const operator = (intent as any).operator || intent.provider;

    // Déterminer les montants selon l'option frais
    const clientFeeAmount = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
    const creditAmount = intent.montantNet ? parseFloat(intent.montantNet) : amount; // Montant crédité au compte
    const caisseAmount = intent.montantBrut ? parseFloat(intent.montantBrut) : amount; // Montant entré dans le wallet MM
    const feeObservation = clientFeeAmount > 0 ? ` (frais MM: ${clientFeeAmount.toLocaleString("fr-FR")})` : '';

    const { mouvement } = await executeWithLedger(
      "MOBILE_MONEY",
      {
        montant: caisseAmount.toString(), // GL mouvement = montant total entré dans le wallet
        sens: "CREDIT",
        clientId: intent.clientId || undefined,
        compteId: intent.compteId || undefined,
        creditId: intent.creditId || undefined,
        tontineId: intent.tontineId || undefined,
        methodePaiement: "MOBILE_MONEY",
        typePaiement,
        referenceExterne: providerTxnId,
        idempotencyKey: `momo-col-${intent.id}`,
        agenceId: intent.agenceId || undefined,
        metadata: {
          provider: operator, // GL rules match on operator (MTN/AIRTEL)
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

        // 1. Mettre à jour le solde du compte si applicable (montant NET)
        if (intent.compteId) {
          const nouveauSolde = await updateCompteSolde(tx, intent.compteId, creditAmount);
          additionalEventData.nouveauSoldeCompte = nouveauSolde;

          // Create transaction record for account history
          await tx.insert(transactionsCompte).values({
            compteId: intent.compteId,
            mouvementId: mouvement.id,
            typePaiement: typePaiement as TypePaiementTerrainDz,
            sens: "CREDIT",
            montant: creditAmount.toString(),
            soldeApres: nouveauSolde,
            methodePaiement: MethodePaiement.MOBILE_MONEY,
            observations: `Dépôt Mobile Money ${operator} via pawaPay${feeObservation}`,
            idempotencyKey: `tx-momo-col-${intent.id}`,
            createdBy: intent.createdBy,
          });

          // 1b. Account activation: update opening snapshot + recompute status
          if (metadata?.purpose === "ACCOUNT_ACTIVATION") {
            const activationResult = await this.handleAccountActivationInTx(tx, intent.compteId, creditAmount);
            if (activationResult) {
              additionalEventData.accountActivation = activationResult;
            }
          }
        }

        // 2. Allocation crédit si applicable (remboursement) — utilise montant net
        if (intent.creditId) {
          const allocation = await allocateCreditRepayment(
            tx,
            intent.creditId,
            creditAmount,
            mouvement.id,
            intent.id,
            "MOBILE_MONEY"
          );
          additionalEventData.allocation = allocation;
          additionalEventData.nouveauSoldeCredit = allocation.soldeApres;
        }

        // 3. Mettre à jour la caisse digitale si agence définie (montant BRUT = tout entre dans le wallet)
        if (intent.agenceId) {
          try {
            const digitalCaisse = await getOrCreateDigitalCaisse(tx, operator as "MTN" | "AIRTEL", intent.agenceId);
            await updateDigitalCaisseSolde(tx, digitalCaisse.id, caisseAmount, mouvement.id);
            additionalEventData.digitalCaisseId = digitalCaisse.id;
          } catch (error) {
            logger.warn({ err: error }, 'Could not update digital caisse');
          }
        }

        // 4. Créer operationsCaisse si session active trouvée
        if (intent.agenceId && intent.clientId) {
          try {
            const activeSession = await this.findActiveSession(tx, intent.agenceId);
            if (activeSession) {
              const [opCaisse] = await tx
                .insert(operationsCaisse)
                .values({
                  sessionId: activeSession.id,
                  mouvementId: mouvement.id,
                  clientId: intent.clientId,
                  typeOperation: this.mapToOperationType(intent) as TypeOperationCaisseDz,
                  montant: caisseAmount.toString(),
                  methodePaiement: MethodePaiement.MOBILE_MONEY,
                  reference: `MM-${operator}-${intent.externalRef}`,
                  description: `Paiement Mobile Money ${operator} via pawaPay${feeObservation}`,
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

        // 5. Mettre à jour l'intent dans la même transaction
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

    logger.info({ intentId: intent.id, mouvementId: mouvement.id }, 'Collection processed');

    // Notify agent MM payment service if this was an agent-initiated payment
    if (metadata?.initiatedByAgent) {
      try {
        const agentService = await getAgentMmPaymentService();
        await agentService.handlePaymentSuccess(intent.id, mouvement.id);
      } catch (error) {
        logger.warn({ err: error }, 'Could not notify agent MM service');
      }
    }
  }

  /**
   * Handle account activation within the collection transaction.
   * Updates paidOpeningFee / paidInitialDeposit and recomputes account status.
   */
  private async handleAccountActivationInTx(
    tx: any,
    compteId: string,
    creditAmount: number,
  ): Promise<{ newStatus: string; feePayment: number; depositPayment: number } | null> {
    const [account] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, compteId));

    if (!account?.openingSnapshot) return null;

    const snapshot = account.openingSnapshot as OpeningSnapshot;
    const currentPaidFee = parseFloat(account.paidOpeningFee || "0");
    const currentPaidDeposit = parseFloat(account.paidInitialDeposit || "0");

    const { feePayment, depositPayment } = allocateOpeningPayment(
      creditAmount,
      snapshot,
      currentPaidFee,
      currentPaidDeposit,
    );

    const newPaidFee = currentPaidFee + feePayment;
    const newPaidDeposit = currentPaidDeposit + depositPayment;

    await tx
      .update(comptes)
      .set({
        paidOpeningFee: newPaidFee.toString(),
        paidInitialDeposit: newPaidDeposit.toString(),
      })
      .where(eq(comptes.id, compteId));

    // Recompute the account status
    const newStatus = recomputeAccountStatus({
      openingSnapshot: snapshot,
      paidOpeningFee: newPaidFee.toString(),
      paidInitialDeposit: newPaidDeposit.toString(),
      isApproved: account.isApproved ?? false,
    });

    if (newStatus !== account.statut) {
      await tx
        .update(comptes)
        .set({ statut: newStatus })
        .where(eq(comptes.id, compteId));
    }

    logger.info(
      { compteId, feePayment, depositPayment, newStatus },
      "Account activation processed via MM collection",
    );

    return { newStatus, feePayment, depositPayment };
  }

  /**
   * Traite un payout réussi
   * Inclut: operationsCaisse, caisse digitale
   */
  private async processSuccessfulPayout(
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
        montant: debitAmount.toString(), // GL mouvement = montant total débité du compte
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
          provider: operator, // GL rules match on operator (MTN/AIRTEL)
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

          // Create transaction record for account history
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
            const activeSession = await this.findActiveSession(tx, intent.agenceId);
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

    // Post-payout hook: finalize closure if this was a closure payout
    if (metadata?.useCase === "CLOSURE_PAYOUT" && metadata?.closureRequestId) {
      try {
        const { handleClosurePayoutSuccess } = await import("../compte-closure");
        await handleClosurePayoutSuccess(
          metadata.closureRequestId as string,
          mouvement.id
        );
        logger.info({ intentId: intent.id, closureRequestId: metadata.closureRequestId }, 'Closure payout finalized');
      } catch (error) {
        logger.error({ intentId: intent.id, err: error }, 'Failed to finalize closure after payout');
      }
    }

    // Post-payout hook: finalize commission payment
    if (metadata?.useCase === "COMMISSION_PAYOUT" && metadata?.commissionId) {
      try {
        const { finalizeCommissionMobileMoney } = await import("../commission-payment-service");
        await finalizeCommissionMobileMoney(
          metadata.commissionId as string,
          mouvement.id
        );
        logger.info({ intentId: intent.id, commissionId: metadata.commissionId }, 'Commission payout finalized');
      } catch (error) {
        logger.error({ intentId: intent.id, err: error }, 'Failed to finalize commission after payout');
      }
    }

    // Post-payout hook: activate credit after successful Mobile Money disbursement
    if (intent.creditId && typePaiement === "CREDIT_DISBURSEMENT") {
      try {
        const { updateCredit, generateCreditSchedule } = await import("../../storage/finance");
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

        // Broadcast WebSocket notification
        try {
          const { getWsInstance } = await import("../../ws-server");
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
        } catch (_wsErr) { /* non-critical */ }

        logger.info({ intentId: intent.id, creditId: intent.creditId }, 'Credit activated after Mobile Money disbursement');
      } catch (error) {
        logger.error({ intentId: intent.id, creditId: intent.creditId, err: error }, 'Failed to activate credit after payout');
      }
    }

    // Post-payout hook: finalize salary payment after successful Mobile Money payout
    if (metadata?.useCase === "SALARY_PAYOUT" && metadata?.jobId) {
      try {
        const { handlePayoutSuccess } = await import("../salary-payment-service");
        await handlePayoutSuccess(metadata.jobId as string, mouvement.id);
        logger.info({ intentId: intent.id, jobId: metadata.jobId }, 'Salary payout finalized');
      } catch (error) {
        logger.error({ intentId: intent.id, jobId: metadata.jobId, err: error }, 'Failed to finalize salary payout');
      }
    }
  }

  /**
   * Poste l'écriture GL pour les frais Cofinco facturés au client
   * Utilise les règles MM_FEE_REVENUE_MTN / MM_FEE_REVENUE_AIRTEL (eventType: MM_FEE_REVENUE)
   * DR 578x (Compte Mobile Money) / CR 708700 (Frais services Mobile Money)
   */
  private async postClientFeeGlEntry(intent: PaymentIntent, feeAmount: number): Promise<void> {
    const operator = (intent as any).operator || intent.provider;

    try {
      await executeWithLedger(
        "MOBILE_MONEY",
        {
          montant: feeAmount.toString(),
          sens: "CREDIT",
          clientId: intent.clientId || undefined,
          compteId: intent.compteId || undefined,
          methodePaiement: "MOBILE_MONEY",
          typePaiement: "MM_FEE_REVENUE",
          referenceExterne: intent.providerTxnId || undefined,
          idempotencyKey: `momo-client-fee-${intent.id}`,
          agenceId: intent.agenceId || undefined,
          requiresGlPosting: false, // Non-bloquant: si la règle GL n'existe pas, ne pas bloquer
          metadata: {
            provider: operator,
            gateway: "PAWAPAY",
            correspondent: (intent as any).correspondent,
            originalIntentId: intent.id,
            feeOption: intent.feeOption,
            clientFeeRate: intent.clientFeeRate,
          },
        },
        async (_tx, mouvement) => {
          return { result: mouvement };
        },
        intent.createdBy || undefined
      );

      logger.info({ intentId: intent.id, feeAmount, operator }, 'Client fee GL entry posted');
    } catch (error) {
      // Fee posting is non-critical — log but don't fail the payment
      logger.warn({ intentId: intent.id, feeAmount, err: error }, 'Could not post client fee GL entry');
    }
  }

  /**
   * Traite une réconciliation réussie (appelé par le cron)
   */
  async handleReconciliationSuccess(
    intent: PaymentIntent,
    statusResponse: { providerTxnId?: string }
  ): Promise<void> {
    logger.info({ intentId: intent.id }, 'Reconciliation: processing as SUCCESS');
    await this.processSuccessfulPayment(intent, statusResponse.providerTxnId);
  }

  /**
   * Initie un remboursement (refund) via pawaPay
   * Seul un COLLECTION en status SUCCESS peut être remboursé
   */
  async initiateRefund(
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

    // Create a new payment intent for the refund
    const refundIntent = await storage.createPaymentIntent({
      provider: operator,
      type: "PAYOUT", // pawaPay treats refunds as payouts to the customer
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

      // ACCEPTED - wait for callback
      const updatedIntent = await storage.updatePaymentIntent(refundIntent.id, {
        providerRef: refundIntent.externalRef,
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
   * Récupère un payment intent par ID.
   * Si l'intent est PENDING, vérifie le statut auprès de pawaPay (polling fallback)
   * car en sandbox le webhook ne peut pas atteindre localhost.
   */
  async getPaymentIntent(id: string): Promise<PaymentIntent | undefined> {
    const intent = await storage.getPaymentIntent(id);
    if (!intent) return undefined;

    // Si PENDING, vérifier le statut directement auprès de pawaPay
    if (intent.status === "PENDING" && intent.externalRef) {
      const updated = await this.checkAndUpdatePendingStatus(intent);
      if (updated) return updated;
    }

    return intent;
  }

  /**
   * Vérifie le statut d'un intent PENDING auprès de pawaPay (polling fallback).
   * Utilisé quand le webhook ne peut pas atteindre le serveur (sandbox/localhost).
   * Retourne l'intent mis à jour si le statut a changé, sinon undefined.
   */
  private async checkAndUpdatePendingStatus(intent: PaymentIntent): Promise<PaymentIntent | undefined> {
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
        await this.processSuccessfulPayment(intent, statusResponse.providerTxnId);
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
   * Liste les payment intents avec filtres
   */
  async listPaymentIntents(filter: PaymentIntentFilter): Promise<{
    data: PaymentIntent[];
    total: number;
  }> {
    return storage.listPaymentIntents(filter);
  }

  /**
   * Annule un payment intent PENDING
   */
  async cancelPayment(id: string, userId?: string): Promise<PaymentIntent> {
    const intent = await storage.getPaymentIntent(id);

    if (!intent) {
      throw new Error("Payment intent not found");
    }

    if (intent.status !== "PENDING" && intent.status !== "CREATED") {
      throw new Error(`Cannot cancel payment in status: ${intent.status}`);
    }

    const updated = await storage.updatePaymentIntent(id, {
      status: "CANCELLED",
      confirmedAt: new Date(),
      metadata: {
        ...(intent.metadata as Record<string, unknown> || {}),
        cancelledBy: userId,
        cancelledAt: new Date().toISOString(),
      },
    });

    logger.info({ intentId: id }, 'Payment cancelled');
    return updated!;
  }

  /**
   * Détermine le use case basé sur les entités liées
   */
  private determineUseCase(params: {
    compteId?: string;
    creditId?: string;
    tontineId?: string;
  }): string {
    if (params.creditId) return "CREDIT_REPAYMENT";
    if (params.tontineId) return "TONTINE_CONTRIBUTION";
    if (params.compteId) return "DEPOSIT_SAVINGS";
    return "DEPOSIT_SAVINGS";
  }

  /**
   * Détermine le type de paiement pour le mouvement
   */
  private determineTypePaiement(intent: PaymentIntent): string {
    if (intent.creditId) return "CREDIT_REPAYMENT";
    if (intent.tontineId) return "TONTINE_CONTRIBUTION";
    if (intent.compteId) return "DEPOSIT_SAVINGS";
    return "DEPOSIT_SAVINGS";
  }

  /**
   * Mappe l'intent vers un type d'opération caisse
   */
  private mapToOperationType(intent: PaymentIntent): string {
    if (intent.type === "COLLECTION") {
      if (intent.creditId) return TypeOperationCaisse.CREDIT_REPAYMENT;
      if (intent.tontineId) return TypeOperationCaisse.TONTINE_CONTRIBUTION;
      return TypeOperationCaisse.DEPOSIT_SAVINGS;
    } else {
      if (intent.creditId) return TypeOperationCaisse.CREDIT_DISBURSEMENT;
      if (intent.tontineId) return TypeOperationCaisse.TONTINE_WITHDRAWAL;
      return TypeOperationCaisse.WITHDRAWAL_SAVINGS;
    }
  }

  /**
   * Trouve une session caisse active pour l'agence
   */
  private async findActiveSession(
    tx: PgTransaction<any, any, any>,
    agenceId: string
  ): Promise<{ id: string } | null> {
    const [session] = await tx
      .select({ id: sessionsCaisse.id })
      .from(sessionsCaisse)
      .where(
        and(
          eq(sessionsCaisse.agenceId, agenceId),
          eq(sessionsCaisse.statut, "OPEN")
        )
      )
      .orderBy(desc(sessionsCaisse.openedAt))
      .limit(1);

    return session || null;
  }

  /**
   * Traite un reversal/refund du provider
   * Appelé quand pawaPay annule une transaction après SUCCESS
   */
  async processReversal(
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

    // Créer le mouvement inverse
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
        // Inverser les soldes
        if (intent.compteId) {
          const delta = intent.type === "COLLECTION" ? -amount : amount;
          await updateCompteSolde(tx, intent.compteId, delta);
        }

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

        // Marquer l'intent comme REVERSED
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

  /**
   * Réconciliation manuelle par admin
   */
  async manualReconcile(
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
      await this.processSuccessfulPayment(intent, providerTxnId);

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

  /**
   * Vérifie si un payout tontine est autorisé
   */
  async validateTontinePayout(
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
}

// Singleton export
export const paymentService = new PaymentService();
export default paymentService;
