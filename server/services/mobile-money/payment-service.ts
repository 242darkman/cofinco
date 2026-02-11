/**
 * Payment Service
 * Service orchestrateur pour les paiements Mobile Money
 *
 * Fonctionnalités:
 * - Collection (dépôts, remboursements, cotisations tontine)
 * - Payout (retraits, décaissements)
 * - Webhooks et réconciliation
 * - Traçabilité operationsCaisse et caisses digitales
 * - Allocation crédit (pénalités → intérêts → principal)
 * - Reversals et réconciliation manuelle
 */

import { db } from "../../db";
import { paymentIntents, operationsCaisse, sessionsCaisse, type PaymentIntent } from "@shared/schema";
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
  WebhookPayload
} from "./types";
import { MobileMoneyError, WebhookVerificationError } from "./types";
import { getOrCreateDigitalCaisse, updateDigitalCaisseSolde } from "./mm-caisse-service";
import { allocateCreditRepayment, type AllocationResult } from "../credit-allocation-service";
import { canMemberWithdraw } from "../tontine-logic";
import { TypeOperationCaisse, MethodePaiement } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";

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

// URL de callback
const CALLBACK_BASE_URL = process.env.APP_URL || "http://localhost:5000";

class PaymentService {
  /**
   * Initie une collection (argent entrant)
   * Utilisé pour: dépôts, remboursements crédit, cotisations tontine
   */
  async initiateCollection(
    params: InitiateCollectionParams,
    userId?: string
  ): Promise<PaymentIntent> {
    const {
      provider,
      amount,
      phone,
      clientId,
      compteId,
      creditId,
      tontineId,
      description,
      idempotencyKey,
      agenceId,
      metadata,
    } = params;

    // Vérifier l'idempotence
    if (idempotencyKey) {
      const existing = await storage.getPaymentIntentByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ intentId: existing.id }, 'Idempotent request, returning existing intent');
        return existing;
      }
    }

    // Récupérer le provider
    const providerInstance = providerRegistry.getOrThrow(provider);

    // Récupérer la currency du provider (adapté selon sandbox/production)
    const providerConfig = (providerInstance as any).config || (providerInstance as any).getConfig?.() || {};
    const currency = providerConfig.currency || "XAF";

    // Créer l'intent avec status CREATED
    const intent = await storage.createPaymentIntent({
      provider,
      type: "COLLECTION",
      status: "CREATED",
      amount: amount.toString(),
      currency,
      phone,
      clientId,
      compteId,
      creditId,
      tontineId,
      agenceId,
      idempotencyKey,
      metadata: {
        ...metadata,
        description,
        useCase: this.determineUseCase({ compteId, creditId, tontineId }),
      },
      createdBy: userId,
    });

    try {
      // Appeler le provider
      // Use provider's configured callback URL (from MTN_MOMO_CALLBACK_URL)
      // If not configured, fallback to constructing from APP_URL
      const providerCallbackUrl = providerConfig.callbackUrl || `${CALLBACK_BASE_URL}/api/webhooks/${provider.toLowerCase()}`;
      const response = await providerInstance.collect({
        amount,
        phone,
        externalRef: intent.externalRef,
        callbackUrl: providerCallbackUrl,
        description,
      });

      // Mettre à jour l'intent avec providerRef et status PENDING
      const updatedIntent = await storage.updatePaymentIntent(intent.id, {
        providerRef: response.providerRef,
        status: "PENDING",
        initiatedAt: new Date(),
        expireAt: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000),
        callbackUrl: providerCallbackUrl,
      });

      logger.info({ intentId: intent.id, providerRef: response.providerRef }, 'Collection initiated');
      return updatedIntent!;
    } catch (error) {
      // En cas d'erreur, marquer l'intent comme FAILED
      logger.error({ err: error }, 'Collection failed');

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
   * Initie un payout (argent sortant)
   * Utilisé pour: décaissements crédit, retraits, remboursements frais
   */
  async initiatePayout(
    params: InitiatePayoutParams,
    userId?: string
  ): Promise<PaymentIntent> {
    const {
      provider,
      amount,
      phone,
      clientId,
      compteId,
      creditId,
      description,
      idempotencyKey,
      agenceId,
      metadata,
    } = params;

    // Vérifier l'idempotence
    if (idempotencyKey) {
      const existing = await storage.getPaymentIntentByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ intentId: existing.id }, 'Idempotent request, returning existing intent');
        return existing;
      }
    }

    // Récupérer le provider
    const providerInstance = providerRegistry.getOrThrow(provider);

    // Récupérer la currency du provider (adapté selon sandbox/production)
    const providerConfig = (providerInstance as any).config || (providerInstance as any).getConfig?.() || {};
    const currency = providerConfig.currency || "XAF";

    // Créer l'intent avec status CREATED
    const intent = await storage.createPaymentIntent({
      provider,
      type: "PAYOUT",
      status: "CREATED",
      amount: amount.toString(),
      currency,
      phone,
      clientId,
      compteId,
      creditId,
      agenceId,
      idempotencyKey,
      metadata: {
        ...metadata,
        description,
        useCase: creditId ? "CREDIT_DISBURSEMENT" : "WITHDRAWAL",
      },
      createdBy: userId,
    });

    try {
      // Appeler le provider
      const response = await providerInstance.payout({
        amount,
        phone,
        externalRef: intent.externalRef,
        description,
      });

      // Mettre à jour l'intent avec providerRef et status PENDING
      const updatedIntent = await storage.updatePaymentIntent(intent.id, {
        providerRef: response.providerRef,
        status: "PENDING",
        initiatedAt: new Date(),
        expireAt: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000),
      });

      logger.info({ intentId: intent.id, providerRef: response.providerRef }, 'Payout initiated');
      return updatedIntent!;
    } catch (error) {
      logger.error({ err: error }, 'Payout failed');

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
   * Gère un webhook entrant d'un provider
   */
  async handleWebhook(
    provider: "MTN" | "AIRTEL",
    payload: unknown,
    signature: string,
    headers: Record<string, string>
  ): Promise<void> {
    const providerInstance = providerRegistry.getOrThrow(provider);

    // 1. Logger l'événement brut
    const parsedPayload = providerInstance.parseWebhookPayload(payload);
    console.log(">>> [DEBUG] Parsed Payload:", JSON.stringify(parsedPayload, null, 2));

    const event = await storage.createProviderEvent({
      provider,
      eventType: parsedPayload.status || "UNKNOWN",
      providerRef: parsedPayload.providerRef,
      externalRef: parsedPayload.externalRef,
      payload: payload as Record<string, unknown>,
      signature,
      processed: false,
    });

    logger.info({ provider, eventId: event.id }, 'Webhook received');

    // 2. Vérifier la signature
    const isValid = providerInstance.verifyWebhook(payload, signature, headers);
    console.log(`>>> [DEBUG] Webhook Signature Valid: ${isValid}`);
    console.log(`>>> [DEBUG] Signature headers present:`, JSON.stringify(headers));

    if (!isValid) {
      logger.warn({ provider }, 'Invalid webhook signature');
      await storage.markEventProcessed(event.id, undefined, "INVALID_SIGNATURE");
      return; // Ne pas lever d'erreur, retourner 200 quand même
    }

    // 3. Trouver le payment intent
    let intent: PaymentIntent | undefined;

    if (parsedPayload.providerRef) {
      intent = await storage.getPaymentIntentByProviderRef(provider, parsedPayload.providerRef);
    }

    if (!intent && parsedPayload.externalRef) {
      intent = await storage.getPaymentIntentByExternalRef(parsedPayload.externalRef);
    }

    if (!intent) {
      console.log(">>> [DEBUG] NO INTENT FOUND for ref:", parsedPayload.providerRef || parsedPayload.externalRef);
      logger.warn({ provider, providerRef: parsedPayload.providerRef }, 'Orphan webhook: no intent found');
      await storage.markEventProcessed(event.id, undefined, "INTENT_NOT_FOUND");
      return;
    }
    
    console.log(`>>> [DEBUG] Intent Found: ${intent.id} | Status: ${intent.status}`);

    // 4. Vérifier l'idempotence
    if (["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "REVERSED"].includes(intent.status)) {
      console.log(">>> [DEBUG] Intent already terminal, skipping.");
      logger.info({ intentId: intent.id, status: intent.status }, 'Intent already in terminal state');
      await storage.markEventProcessed(event.id, intent.id, "ALREADY_PROCESSED");
      return;
    }

    // 5. Normaliser le statut
    const normalizedStatus = providerInstance.normalizeStatus(parsedPayload.status);
    console.log(`>>> [DEBUG] Local Intent Status: ${intent.status} -> New Provider Status: ${parsedPayload.status} (Normalized: ${normalizedStatus})`);


    // 6. Traiter selon le statut
    if (normalizedStatus === "SUCCESS") {
      await this.processSuccessfulPayment(intent, parsedPayload.financialTransactionId);
      await storage.markEventProcessed(event.id, intent.id);
    } else if (normalizedStatus === "FAILED") {
      const errorCode = parsedPayload.reason as string || "UNKNOWN";
      const errorMessage = `Payment failed: ${parsedPayload.reason}`;

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
    } else if (normalizedStatus === "EXPIRED") {
      await storage.updatePaymentIntent(intent.id, {
        status: "EXPIRED",
        confirmedAt: new Date(),
      });
      await storage.markEventProcessed(event.id, intent.id);
    }
    // Si PENDING, on ne fait rien (on attend le prochain webhook)

    logger.info({ intentId: intent.id, status: normalizedStatus }, 'Webhook processed');
  }

  /**
   * Traite un paiement réussi - crée les écritures comptables
   */
  private async processSuccessfulPayment(
    intent: PaymentIntent,
    providerTxnId?: string
  ): Promise<void> {
    const amount = parseFloat(intent.amount);
    const metadata = intent.metadata as Record<string, unknown> | null;

    if (intent.type === "COLLECTION") {
      await this.processSuccessfulCollection(intent, amount, providerTxnId);
    } else if (intent.type === "PAYOUT") {
      await this.processSuccessfulPayout(intent, amount, providerTxnId);
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

    const { mouvement } = await executeWithLedger(
      "MOBILE_MONEY",
      {
        montant: amount.toString(),
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
          provider: intent.provider,
          phone: intent.phone,
          externalRef: intent.externalRef,
          ...(metadata || {}),
        },
      },
      async (tx, mouvement) => {
        let additionalEventData: Record<string, unknown> = {};
        let operationCaisseId: string | undefined;

        // 1. Mettre à jour le solde du compte si applicable
        if (intent.compteId) {
          const nouveauSolde = await updateCompteSolde(tx, intent.compteId, amount);
          additionalEventData.nouveauSoldeCompte = nouveauSolde;
        }

        // 2. Allocation crédit si applicable (remboursement)
        if (intent.creditId) {
          const allocation = await allocateCreditRepayment(
            tx,
            intent.creditId,
            amount,
            mouvement.id,
            intent.id,
            "MOBILE_MONEY"
          );
          additionalEventData.allocation = allocation;
          additionalEventData.nouveauSoldeCredit = allocation.soldeApres;
        }

        // 3. Mettre à jour la caisse digitale si agence définie
        if (intent.agenceId) {
          try {
            const digitalCaisse = await getOrCreateDigitalCaisse(tx, intent.provider, intent.agenceId);
            await updateDigitalCaisseSolde(tx, digitalCaisse.id, amount, mouvement.id);
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
                  typeOperation: this.mapToOperationType(intent) as any,
                  montant: amount.toString(),
                  methodePaiement: MethodePaiement.MOBILE_MONEY,
                  reference: `MM-${intent.provider}-${intent.externalRef}`,
                  description: `Paiement Mobile Money ${intent.provider}`,
                  metadata: {
                    provider: intent.provider,
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
   * Traite un payout réussi
   * Inclut: operationsCaisse, caisse digitale
   */
  private async processSuccessfulPayout(
    intent: PaymentIntent,
    amount: number,
    providerTxnId?: string
  ): Promise<void> {
    const metadata = intent.metadata as Record<string, unknown> | null;
    const typePaiement = intent.creditId
      ? "CREDIT_DISBURSEMENT"
      : metadata?.useCase === "CLOSURE_PAYOUT"
        ? "CLOSURE_PAYOUT"
        : "WITHDRAWAL_SAVINGS";

    const { mouvement } = await executeWithLedger(
      "MOBILE_MONEY",
      {
        montant: amount.toString(),
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
          provider: intent.provider,
          phone: intent.phone,
          externalRef: intent.externalRef,
          ...(metadata || {}),
        },
      },
      async (tx, mouvement) => {
        let additionalEventData: Record<string, unknown> = {};
        let operationCaisseId: string | undefined;

        // 1. Mettre à jour le solde du compte si applicable
        if (intent.compteId) {
          const nouveauSolde = await updateCompteSolde(tx, intent.compteId, -amount);
          additionalEventData.nouveauSoldeCompte = nouveauSolde;
        }

        // 2. Mettre à jour la caisse digitale si agence définie (débit)
        if (intent.agenceId) {
          try {
            const digitalCaisse = await getOrCreateDigitalCaisse(tx, intent.provider, intent.agenceId);
            await updateDigitalCaisseSolde(tx, digitalCaisse.id, -amount, mouvement.id);
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
                  typeOperation: opType as any,
                  montant: amount.toString(),
                  methodePaiement: MethodePaiement.MOBILE_MONEY,
                  reference: `MM-${intent.provider}-${intent.externalRef}`,
                  description: `Payout Mobile Money ${intent.provider}`,
                  metadata: {
                    provider: intent.provider,
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
   * Récupère un payment intent par ID
   */
  async getPaymentIntent(id: string): Promise<PaymentIntent | undefined> {
    return storage.getPaymentIntent(id);
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
    return "DEPOSIT_SAVINGS"; // Défaut pour les collections Mobile Money
  }

  /**
   * Détermine le type de paiement pour le mouvement
   * Doit correspondre à type_paiement_terrain_enum
   */
  private determineTypePaiement(intent: PaymentIntent): string {
    if (intent.creditId) return "CREDIT_REPAYMENT";
    if (intent.tontineId) return "TONTINE_CONTRIBUTION";
    if (intent.compteId) return "DEPOSIT_SAVINGS";

    // Par défaut pour Mobile Money sans compte spécifique
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
   * Appelé quand un provider annule une transaction après SUCCESS
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

    // Créer le mouvement inverse
    const { mouvement } = await executeWithLedger(
      "MOBILE_MONEY",
      {
        montant: amount.toString(),
        // Inverser le sens
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
          provider: intent.provider,
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
          // Réaugmenter le solde du crédit si c'était un remboursement
          await updateCreditSolde(tx, intent.creditId, amount);
        }

        // Inverser la caisse digitale
        if (intent.agenceId) {
          try {
            const digitalCaisse = await getOrCreateDigitalCaisse(tx, intent.provider, intent.agenceId);
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
   * Permet de forcer un statut sur un intent bloqué
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
      // Traiter comme un succès normal
      await this.processSuccessfulPayment(intent, providerTxnId);

      // Ajouter les notes de réconciliation
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
      // Marquer comme FAILED
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
   * Utilise la logique de calcul retirable
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
