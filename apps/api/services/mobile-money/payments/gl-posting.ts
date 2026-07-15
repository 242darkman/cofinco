import { createLogger } from "../../../lib/logger";
import { type PaymentIntent } from "@shared/schema";
import { executeWithLedger } from "../../ledger";
import { processSuccessfulCollection } from "./collection";
import { processSuccessfulPayout } from "./payout";

const logger = createLogger("PaymentService:GLPosting");

/**
 * Traite un paiement réussi. Crée les écritures comptables liées au dépôt/retrait,
 * ainsi que les écritures de frais (Grand Livre) si applicable.
 * 
 * @param intent - L'intention de paiement réussie
 * @param providerTxnId - L'identifiant de transaction chez le fournisseur (optionnel)
 * @param feeAmount - Le montant des frais extraits (optionnel)
 */
export async function processSuccessfulPayment(
  intent: PaymentIntent,
  providerTxnId?: string,
  feeAmount?: number
): Promise<void> {
  const amount = parseFloat(intent.amount);

  if (intent.type === "COLLECTION") {
    await processSuccessfulCollection(intent, amount, providerTxnId);
  } else if (intent.type === "PAYOUT") {
    await processSuccessfulPayout(intent, amount, providerTxnId);
  }

  // Poste l'écriture GL pour les frais opérateur pawaPay (DR 6272 / CR 578x)
  const effectiveFee = feeAmount ?? (intent.feeAmount ? parseFloat(intent.feeAmount) : 0);
  if (effectiveFee > 0) {
    await postFeeGlEntry(intent, effectiveFee);
  }

  // Poste l'écriture GL pour les frais MicroFlex facturés au client (DR 578x / CR 708700)
  const clientFee = intent.clientFeeAmount ? parseFloat(intent.clientFeeAmount) : 0;
  if (clientFee > 0) {
    await postClientFeeGlEntry(intent, clientFee);
  }
}

/**
 * Poste l'écriture au Grand Livre (GL) pour les frais opérateur pawaPay.
 * Utilise les règles COMM_MTN / COMM_AIRTEL (eventType: OPERATOR_FEE).
 * DR 6272 (Commissions Mobile Money) / CR 5781 ou 5782 (Compte Mobile Money).
 * 
 * @param intent - L'intention de paiement
 * @param feeAmount - Le montant des frais opérateur
 */
export async function postFeeGlEntry(intent: PaymentIntent, feeAmount: number): Promise<void> {
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
    // Le postage des frais est non critique — logguer mais ne pas faire échouer le paiement
    logger.warn({ intentId: intent.id, feeAmount, err: error }, 'Could not post fee GL entry');
  }
}

/**
 * Poste l'écriture au Grand Livre (GL) pour les frais MicroFlex facturés au client.
 * Utilise les règles MM_FEE_REVENUE_MTN / MM_FEE_REVENUE_AIRTEL (eventType: MM_FEE_REVENUE).
 * DR 578x (Compte Mobile Money) / CR 708700 (Frais services Mobile Money).
 * 
 * @param intent - L'intention de paiement
 * @param feeAmount - Le montant des frais facturés
 */
export async function postClientFeeGlEntry(intent: PaymentIntent, feeAmount: number): Promise<void> {
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
    // Le postage des frais est non critique — logguer mais ne pas faire échouer le paiement
    logger.warn({ intentId: intent.id, feeAmount, err: error }, 'Could not post client fee GL entry');
  }
}

/**
 * Extrait le montant des frais depuis le payload du webhook pawaPay.
 * 
 * @param payload - Les données brutes du webhook
 * @returns Le montant des frais, ou undefined s'il est introuvable
 */
export function extractFeeAmount(payload: Record<string, unknown>): number | undefined {
  // Les callbacks pawaPay incluent depositFee ou correspondentFee ou payoutFee
  const depositFee = payload.depositFee as number | undefined;
  const correspondentFee = payload.correspondentFee as number | undefined;
  const payoutFee = payload.payoutFee as number | undefined;

  if (depositFee != null) return depositFee;
  if (correspondentFee != null) return correspondentFee;
  if (payoutFee != null) return payoutFee;
  return undefined;
}

/**
 * Extrait le détail (breakdown) des frais depuis le payload du webhook pawaPay.
 * 
 * @param payload - Les données brutes du webhook
 * @returns Le détail des frais, ou undefined s'il est introuvable
 */
export function extractFeeBreakdown(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const breakdown: Record<string, unknown> = {};
  let hasFees = false;

  if (payload.depositFee != null) { breakdown.depositFee = payload.depositFee; hasFees = true; }
  if (payload.correspondentFee != null) { breakdown.correspondentFee = payload.correspondentFee; hasFees = true; }
  if (payload.payoutFee != null) { breakdown.payoutFee = payload.payoutFee; hasFees = true; }
  if (payload.suspenseAmount != null) { breakdown.suspenseAmount = payload.suspenseAmount; hasFees = true; }
  if (payload.currency != null) { breakdown.currency = payload.currency; }

  return hasFees ? breakdown : undefined;
}
