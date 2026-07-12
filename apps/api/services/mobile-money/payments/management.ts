import { createLogger } from "../../../lib/logger";
import type { PaymentIntentFilter } from "../types";
import { type PaymentIntent } from "@shared/schema";
import * as storage from "../../../storage/mobile-money";
import { checkAndUpdatePendingStatus } from "./reconciliation";

const logger = createLogger("PaymentService:Management");

/**
 * Récupère une intention de paiement par son identifiant.
 * Si l'intention est en attente (PENDING), vérifie le statut auprès de pawaPay (polling fallback)
 * car en environnement de test (sandbox), le webhook ne peut pas atteindre localhost.
 * 
 * @param id - L'identifiant de l'intention de paiement
 * @returns L'intention de paiement mise à jour, ou undefined si introuvable
 */
export async function getPaymentIntent(id: string): Promise<PaymentIntent | undefined> {
  const intent = await storage.getPaymentIntent(id);
  if (!intent) return undefined;

  // Si PENDING, vérifier le statut directement auprès de pawaPay
  if (intent.status === "PENDING" && intent.externalRef) {
    const updated = await checkAndUpdatePendingStatus(intent);
    if (updated) return updated;
  }

  return intent;
}

/**
 * Liste les intentions de paiement en fonction des filtres fournis.
 * 
 * @param filter - Les filtres à appliquer (date, statut, type, etc.)
 * @returns Les intentions correspondantes et le nombre total
 */
export async function listPaymentIntents(filter: PaymentIntentFilter): Promise<{
  data: PaymentIntent[];
  total: number;
}> {
  return storage.listPaymentIntents(filter);
}

/**
 * Annule une intention de paiement en attente (PENDING).
 * 
 * @param id - L'identifiant de l'intention de paiement
 * @param userId - L'identifiant de l'utilisateur effectuant l'annulation
 * @returns L'intention de paiement mise à jour
 * @throws Error si l'intention est introuvable ou si son statut n'est pas annulable
 */
export async function cancelPayment(id: string, userId?: string): Promise<PaymentIntent> {
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
