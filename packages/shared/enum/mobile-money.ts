/**
 * Enums Drizzle — domaine « mobile-money ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// MOBILE MONEY PAYMENTS
// ============================================

export const mobileMoneyProviderEnum = pgEnum("mobile_money_provider_enum", [
  "MTN",
  "AIRTEL",
]);

export const typePaymentIntentEnum = pgEnum("type_payment_intent_enum", [
  "COLLECTION",  // Argent entrant (dépôt, remboursement)
  "PAYOUT",      // Argent sortant (décaissement, retrait)
]);

export const statutPaymentIntentEnum = pgEnum("statut_payment_intent_enum", [
  "CREATED",     // Intent créé localement
  "PENDING",     // Envoyé au provider, en attente confirmation
  "SUCCESS",     // Provider a confirmé le succès
  "FAILED",      // Provider a confirmé l'échec
  "EXPIRED",     // Timeout - pas de réponse dans le délai
  "CANCELLED",   // Annulé manuellement avant completion
  "REVERSED",    // Paiement réussi mais annulé/remboursé
]);
