/**
 * Enums Drizzle — domaine « caisse ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// OPERATIONS CAISSE
// ============================================

export const typeOperationCaisseEnum = pgEnum("type_operation_caisse", [
  "SAVINGS_DEPOSIT",
  "SAVINGS_WITHDRAWAL",
  "CREDIT_DISBURSEMENT",
  "CREDIT_REPAYMENT",
  "ENGAGEMENT_FEE",
  "FEE",
  "ADJUSTMENT",
  "CASH_TRANSFER",
  "SAFE_SUPPLY",
  "SAFE_DEPOSIT",
  // CaissePaiementModal compatibility
  "DEPOSIT_SAVINGS",
  "DEPOSIT_CURRENT",
  "WITHDRAWAL_CURRENT",
  "DEPOSIT_BLOCKED",
  "WITHDRAWAL_BLOCKED",
  "MISC_COLLECTION",
  "MISC_DISBURSEMENT",
  "BANK_FEE",
  // Tontine specific
  "TONTINE_CONTRIBUTION",
  "TONTINE_WITHDRAWAL",
  // Aliases for robustness
  "LOAN_REPAYMENT",
  "LOAN_DISBURSEMENT",
  "WITHDRAWAL_SAVINGS",
  // Account activation
  "INITIAL_DEPOSIT",
  // Frais ouverture / clôture
  "OPENING_FEE",
  "CLOSING_FEE",
  // Restitution de frais
  "FEE_REFUND",
  // Provisionnement agent terrain
  "AGENT_PROVISIONING",
  // Remise / clôture agent terrain → caisse
  "AGENT_SETTLEMENT",
  "AGENT_SESSION_CLOSE",
]);

export const statutTransfertCaisseEnum = pgEnum("statut_transfert_caisse_enum", [
  "PENDING",
  "VALIDATED",
  "REJECTED",
  "CANCELLED",
  "RECEIVED",
]);

// ============================================
// CAISSE (Main Caisse status - OPEN/CLOSED)
// ============================================

export const statutCaisseMainEnum = pgEnum("statut_caisse_main_enum", [
  "OPEN",
  "CLOSED",
]);

// ============================================
// SESSION CAISSE
// ============================================

export const statutSessionCaisseEnum = pgEnum("statut_session_caisse_enum", [
  // === WORKFLOW D'OUVERTURE ===
  "REQUESTING_FUNDS", // Caissier a demandé des fonds (Phase A)
  "FUNDS_DISPATCHED", // Responsable coffre a validé, fonds envoyés (Phase B)
  "OPEN",             // Session opérationnelle
  // === WORKFLOW DE FERMETURE ===
  "CLOSING_COUNT",      // Session gelée, caissier compte ses billets (blind count)
  "CLOSING_VALIDATION", // Comptage fait, décision de transfert vers coffre
  "CLOSED",             // Session définitivement fermée
  // === RECONCILIATION (post-clôture) ===
  "RECONCILIATION_PENDING",  // Réconciliation en attente (écart détecté)
  "RECONCILIATION_COMPLETE", // Réconciliation terminée
]);

// ============================================
// CAISSE OPENING STRICTNESS (GL Guard)
// ============================================

/**
 * Niveau de strictness pour l'ouverture de session caisse
 * Contrôle la cohérence entre billetage physique et GL
 */
export const caisseOpeningStrictnessEnum = pgEnum("caisse_opening_strictness_enum", [
  "STRICT_BLOCK",              // Bloquer si billetage > GL attendu
  "WARNING_WITH_JUSTIFICATION", // Permettre avec justification + validation manager
  "LOG_ONLY",                  // Logging uniquement (dev/legacy)
]);
