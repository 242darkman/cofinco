/**
 * Enums Drizzle — domaine « finance ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// TRANSACTIONS
// ============================================

export const typeTransactionEpargneEnum = pgEnum("type_transaction_epargne_enum", [
  "DEPOSIT",
  "WITHDRAWAL",
  "INTEREST",
  "FEE",
  "ADJUSTMENT",
]);

export const statutTransactionEnum = pgEnum("statut_transaction_enum", [
  "PENDING",
  "PENDING_SETTLEMENT", // For field payments awaiting REMISE settlement
  "POSTED",
  "CANCELLED",
  "REVERSED",
]);

// ============================================
// MOUVEMENTS FINANCIERS
// ============================================

export const sensMouvementEnum = pgEnum("sens_mouvement_enum", ["DEBIT", "CREDIT"]);

export const sourceModuleEnum = pgEnum("source_module_enum", [
  "CAISSE",
  "EPARGNE",
  "CREDIT",
  "TONTINE",
  "TERRAIN",
  "TRANSFERT",
  "SYSTEME",
  "CAISSE_AGENT",
  "VERSEMENT_AUTO",
  "DECAISSEMENT_PROGRAMME",
  "COMPTE",
  "COFFRE",
  "MOBILE_MONEY",
  // PR-0: Nouveaux modules pour GL wiring
  "RH_PAYROLL",
  "COFFRE_TRANSFER",
  "INTER_COFFRE",
  "EVACUATION_COFFRE",
  "FRAIS",
  // Caisse agent settlements
  "REMISE",
  "CONTRIBUTION",
]);

export const typeEvenementEnum = pgEnum("type_evenement_enum", [
  "MOUVEMENT_CREE",
  "MOUVEMENT_STATUT_CHANGE",
  "SOLDE_COMPTE_CHANGE",
  "CREDIT_SOLDE_CHANGE",
  "SESSION_CAISSE_CHANGE",
  "TRANSFERT_CAISSE_CHANGE",
  // Compte-specific events
  "COMPTE_CREE",
  "COMPTE_BLOQUE",
  "COMPTE_DEBLOQUE",
  "COMPTE_TRANSFERE_AGENCE",
  // Caisse Agent events
  "CAISSE_AGENT_SOLDE_CHANGE",
  "OPERATION_TERRAIN_CREATED",
  "OPERATION_TERRAIN_SUBMITTED",
  "OPERATION_TERRAIN_APPROVED",
  "OPERATION_TERRAIN_REJECTED",
  "OPERATION_TERRAIN_SETTLED",
  // Caisse Admin events
  "SESSION_FORCE_CLOSED",
  "CAISSE_STATUS_CHANGED",
  "CAISSE_LIQUIDATED",
  // Remise terrain events
  "REMISE_CREATED",
  "REMISE_SETTLED",
  "REMISE_REJECTED",
  // Ecart approval events
  "ECART_APPROVAL_REQUEST",
  "ECART_APPROVAL_DECISION",
  // GL Posting events (PR-0)
  "GL_POSTING_FAILED",
  // Liquidity & GL events
  "LIQUIDITY_CHANGED",
  "GL_ENTRY_POSTED",
]);
