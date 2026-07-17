/**
 * Enums Drizzle — domaine « terrain ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// PAIEMENT TERRAIN
// ============================================

export const typePaiementTerrainEnum = pgEnum("type_paiement_terrain_enum", [
  // Dépôts (par type de compte)
  "DEPOSIT_SAVINGS",
  "DEPOSIT_CURRENT",
  "DEPOSIT_BLOCKED",
  // Retraits (par type de compte)
  "WITHDRAWAL_SAVINGS",
  "WITHDRAWAL_CURRENT",
  "WITHDRAWAL_BLOCKED",
  // Crédit
  "CREDIT_REPAYMENT",
  "ENGAGEMENT_FEE",
  "CREDIT_DISBURSEMENT",
  // Aliases crédit (robustesse front/agent)
  "LOAN_REPAYMENT",
  "LOAN_DISBURSEMENT",
  // Tontine
  "TONTINE_CONTRIBUTION",
  "TONTINE_WITHDRAWAL",
  // Coffre
  "SAFE_SUPPLY",
  "SAFE_DEPOSIT",
  // Transferts Auto & Virement
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "INITIAL_DEPOSIT",
  "INTERNAL_TRANSFER",
  // Ajustements & Opérations spéciales
  "ADJUSTMENT",
  "INTEREST_PAYMENT",
  "LIQUIDATION",
  // PR-0: Coffre / Sessions / RH
  "COFFRE_TO_CAISSE",
  "CAISSE_TO_COFFRE",
  "COFFRE_TRANSIT_OUT",
  "COFFRE_TRANSIT_IN",
  "SESSION_OPENING_FLOAT",
  "SESSION_CLOSING_TRANSFER",
  "SESSION_DEFICIT",
  "SESSION_SURPLUS",
  "PAYROLL_ENGAGEMENT",
  "PAYROLL_PAYMENT",
  "SALARY_ADVANCE",
  "FINANCIAL_PENALTY",
  // Primes prospection
  "PROSPECTION_PRIME",
  // Opérations diverses
  "MISC_COLLECTION",
  "MISC_DISBURSEMENT",
  "FEE",
  "BANK_FEE",
  "CASH_TRANSFER",
  // Composantes remboursement crédit (GL split)
  "CREDIT_REPAYMENT_INTEREST",
  "CREDIT_REPAYMENT_PENALTY",
  "CREDIT_FEE",
  // Cycle de vie crédit (pénalités, provisions, radiation)
  "CREDIT_LATE_PENALTY",
  "CREDIT_PROVISION",
  "CREDIT_PROVISION_REVERSAL",
  "CREDIT_WRITEOFF",
  // Clôture de compte
  "CLOSURE_PAYOUT",
  // Frais ouverture / clôture (GL split)
  "OPENING_FEE",
  "CLOSING_FEE",
  // Frais clôture par type de compte (pour routing GL)
  "CLOSING_FEE_SAVINGS",
  "CLOSING_FEE_CURRENT",
  "CLOSING_FEE_BLOCKED",
  // Restitution clôture par type de compte (pour routing GL)
  "CLOSURE_PAYOUT_SAVINGS",
  "CLOSURE_PAYOUT_CURRENT",
  "CLOSURE_PAYOUT_BLOCKED",
  // Retraits agent terrain (GL routing: Débit 4111/4112, Crédit 573)
  "AGENT_WITHDRAWAL_SAVINGS",
  "AGENT_WITHDRAWAL_CURRENT",
  // Provisionnement agent terrain (GL routing: Débit 573, Crédit 571)
  "AGENT_PROVISIONING",
  // Restitution de frais (Caisse Queue)
  "FEE_REFUND",
  // Paiement salaire (Caisse Queue)
  "SALARY_PAYMENT",
]);

// ============================================
// REMISE TERRAIN (Settlement Status)
// ============================================

export const statutRemiseTerrainEnum = pgEnum("statut_remise_terrain_enum", [
  "DRAFT",
  "PENDING",
  "VALIDATED",
  "SETTLED",
  "REJECTED",
  "CANCELLED",
]);
