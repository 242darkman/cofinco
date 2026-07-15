import { eq } from "drizzle-orm";
import { type PaymentIntent, transactionsCompte, operationsCaisse, paymentIntents, comptes } from "@shared/schema";
import { executeWithLedger, updateCompteSolde, updateCreditSolde } from "../../ledger";
import { getOrCreateDigitalCaisse, updateDigitalCaisseSolde } from "../mm-caisse-service";
import { allocateCreditRepayment } from "../../credit-allocation-service";
import { allocateOpeningPayment, recomputeAccountStatus, type OpeningSnapshot } from "../../comptes";
import { MethodePaiement, TypeOperationCaisse } from "@shared/enum/status-constants";
import type { TypePaiementTerrainDz, TypeOperationCaisseDz } from "@shared/enum/enums";
import { createLogger } from "../../../lib/logger";
import { determineTypePaiement, findActiveSession, mapToOperationType, determineUseCase, resolveOperator } from "./helpers";
import { operatorToCorrespondent } from "../providers/pawapay/pawapay-config";
import { calculateFee, type FeeEstimate } from "../fee-calculator";
import { providerRegistry } from "../provider-registry";
import { currencyCode } from "@shared/config/currency";
import * as storage from "../../../storage/mobile-money";
import { normalizePhone } from "@shared/utils/phone";
import type { InitiateCollectionParams } from "../types";
import { MobileMoneyError } from "../types";

const logger = createLogger("PaymentService:Collection");

const PAYMENT_TIMEOUT_MINUTES = parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || "30", 10);

// Lazy import to avoid circular dependency
let agentMmPaymentService: typeof import("../../caisse-agent/agent-mm-payment-service") | null = null;
async function getAgentMmPaymentService() {
  if (!agentMmPaymentService) {
    agentMmPaymentService = await import("../../caisse-agent/agent-mm-payment-service");
  }
  return agentMmPaymentService;
}

/**
 * Initie une collection (argent entrant) via pawaPay.
 * Utilisé pour : dépôts, remboursements de crédit, cotisations tontine.
 * 
 * @param params - Les paramètres d'initiation de la collection
 * @param userId - L'identifiant de l'utilisateur initiant la demande
 * @returns L'intention de paiement créée
 */
export async function initiateCollection(
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

  // Calculer les frais MicroFlex si feeOption est fourni
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
    // MicroFlex client fee fields
    feeOption: params.feeOption || null,
    clientFeeAmount: feeEstimate?.feeAmount?.toString() || null,
    clientFeeRate: feeEstimate?.feeRate?.toString() || null,
    montantBrut: feeEstimate?.montantBrut?.toString() || null,
    montantNet: feeEstimate?.montantNet?.toString() || null,
    metadata: {
      ...metadata,
      description,
      useCase: determineUseCase({ compteId, creditId, tontineId }),
    },
    createdBy: userId,
  });

  try {
    // Appeler pawaPay collect avec le correspondant
    const response = await pawaPayProvider.collect({
      amount: pawaPayAmount,
      phone,
      externalRef: intent.externalRef,
      callbackUrl: "", // pawaPay v2 ne supporte pas callbackUrl dans le body
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
 * Traite une collection réussie.
 * Inclut : opérations de caisse, mise à jour caisse digitale, et allocation de crédit.
 * 
 * @param intent - L'intention de paiement
 * @param amount - Le montant traité
 * @param providerTxnId - L'ID de transaction du fournisseur
 */
export async function processSuccessfulCollection(
  intent: PaymentIntent,
  amount: number,
  providerTxnId?: string
): Promise<void> {
  const metadata = intent.metadata as Record<string, unknown> | null;
  const typePaiement = determineTypePaiement(intent);
  // Le routage GL utilise le champ provider (= operator MTN/AIRTEL)
  const operator = (intent as any).operator || intent.provider;

  // Déterminer les montants selon l'option de frais
  const clientFeeAmount = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
  const creditAmount = intent.montantNet ? parseFloat(intent.montantNet) : amount; // Montant crédité au compte
  const caisseAmount = intent.montantBrut ? parseFloat(intent.montantBrut) : amount; // Montant entré dans le wallet MM
  const feeObservation = clientFeeAmount > 0 ? ` (frais MM: ${clientFeeAmount.toLocaleString("fr-FR")})` : '';

  const { mouvement } = await executeWithLedger(
    "MOBILE_MONEY",
    {
      montant: caisseAmount.toString(), // Mouvement GL = montant total entré dans le wallet
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
        provider: operator,
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

        // Créer un enregistrement de transaction pour l'historique du compte
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

        // 1b. Activation de compte : mise à jour snapshot ouverture + recalcul statut
        if (metadata?.purpose === "ACCOUNT_ACTIVATION") {
          const activationResult = await handleAccountActivationInTx(tx, intent.compteId, creditAmount);
          if (activationResult) {
            additionalEventData.accountActivation = activationResult;
          }
        }
      }

      // 2. Allocation crédit si applicable (remboursement) — utilise montant NET
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
          const activeSession = await findActiveSession(tx, intent.agenceId);
          if (activeSession) {
            const [opCaisse] = await tx
              .insert(operationsCaisse)
              .values({
                sessionId: activeSession.id,
                mouvementId: mouvement.id,
                clientId: intent.clientId,
                typeOperation: mapToOperationType(intent) as TypeOperationCaisseDz,
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

  // Notifier le service de paiement MM de l'agent si initié par un agent
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
 * Gère l'activation de compte au sein de la transaction de collection.
 * Met à jour paidOpeningFee / paidInitialDeposit et recalcule le statut du compte.
 * 
 * @param tx - La transaction de base de données
 * @param compteId - L'identifiant du compte
 * @param creditAmount - Le montant crédité
 * @returns Les informations d'activation ou null
 */
export async function handleAccountActivationInTx(
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

  // Recalculer le statut du compte
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
