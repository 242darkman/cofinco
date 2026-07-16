/**
 * Enums Drizzle — domaine « comptes ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// COMPTES
// ============================================

export const typeCompteEnum = pgEnum("type_compte_enum", [
  "SAVINGS",
  "CURRENT",
  "BLOCKED",
]);

/**
 * Statut des comptes
 * Convention:
 * - Valeurs en base: ANGLAIS (SCREAMING_SNAKE_CASE)
 * - Labels UI: Mappings côté client (français)
 */
export const statutCompteEnum = pgEnum("statut_compte_enum", [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
  "PENDING_ACTIVATION",
  "PENDING_VALIDATION",
  "CANCELLED",
  "CLOSURE_PENDING",
  "PENDING_PAYMENT",
  "PENDING_APPROVAL",
  "PENDING_PAYMENT_AND_APPROVAL",
]);

// Motifs de suspension (lifecycle)
export const suspensionReasonEnum = pgEnum("suspension_reason_enum", [
  "KYC",
  "FRAUD",
  "INTERNAL",
  "CLIENT_REQUEST",
  "DISPUTE",
  "OTHER",
]);

// Statuts demande de clôture (maker-checker)
export const closureRequestStatusEnum = pgEnum("closure_request_status_enum", [
  "PENDING",
  "APPROVED",
  "CANCELLED",
  "COMPLETED",
]);

// Statuts demande d'ouverture (maker-checker chef d'agence)
export const openingRequestStatusEnum = pgEnum("opening_request_status_enum", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

// Statuts du payout de clôture
export const closurePayoutStatusEnum = pgEnum("closure_payout_status_enum", [
  "PENDING",
  "PROCESSING",
  "SUCCESS",
  "FAILED",
]);

// Méthode de payout de clôture
export const closurePayoutMethodEnum = pgEnum("closure_payout_method_enum", [
  "CASH",
  "MOBILE_MONEY",
]);

export const motifBlocageEnum = pgEnum("motif_blocage_enum", [
  "LOAN_GUARANTEE",
  "TONTINE_GUARANTEE",
  "FORCED_SAVINGS",
  "INTERNAL_DECISION",
  "DISPUTE",
  "OTHER",
]);

// ========== CAISSE PAYMENT REQUESTS ENUMS ==========

export const caisseRequestCategoryEnum = pgEnum("caisse_request_category_enum", [
  "ENGAGEMENT_FEE",
  "FEE_REFUND",
  "SALARY_PAYMENT",
  "ACCOUNT_ACTIVATION",
]);

export const caisseRequestStatusEnum = pgEnum("caisse_request_status_enum", [
  "PENDING",
  "COMPLETED",
  "CANCELLED",
]);

// ========== CAISSE AGENT ENUMS ==========

export const statutCaisseAgentEnum = pgEnum("statut_caisse_agent_enum", [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
]);

export const typeOperationTerrainEnum = pgEnum("type_operation_terrain_enum", [
  "COLLECT_CASH",
  "SETTLEMENT_CASH",
  "PROVISIONING",
  "SESSION_CLOSE",
]);

export const statutSessionAgentEnum = pgEnum("statut_session_agent_enum", [
  "REQUESTING_FUNDS",
  "ACTIVE",
  "CLOSING",
  "CLOSED",
]);

export const statutOperationTerrainEnum = pgEnum("statut_operation_terrain_enum", [
  "SUBMITTED",
  "APPROVED",
  "PENDING_SETTLEMENT", // Approved but awaiting REMISE settlement
  "REJECTED",
  "CANCELLED",
  "SETTLED",
]);

// ========== TRANSFERTS INTER-COFFRES ENUMS ==========

export const ownerTypeCoffreEnum = pgEnum("owner_type_coffre_enum", [
  "AGENCE",
  "SIEGE",
]);

export const statutCoffreEnum = pgEnum("statut_coffre_enum", [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
]);

export const typeTransfertInterCoffreEnum = pgEnum("type_transfert_inter_coffre_enum", [
  "AGENCE_VERS_SIEGE",
  "AGENCE_VERS_AGENCE",
  "SIEGE_VERS_AGENCE",
]);

export const statutTransfertInterCoffreEnum = pgEnum("statut_transfert_inter_coffre_enum", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED_L1",
  "APPROVED_L2",
  "IN_TRANSIT",
  "RECEIVED",
  "RECEIVED_WITH_DISCREPANCY",
  "REJECTED",
  "CANCELLED",
]);

export const typeConditionnementEnum = pgEnum("type_conditionnement_enum", [
  "SAC_SCELLE",
  "MALLETTE",
  "ENVELOPPE",
  "AUTRE",
]);

export const typeDocumentTransfertEnum = pgEnum("type_document_transfert_enum", [
  "BON_TRANSFERT",
  "BON_SORTIE",
  "BON_ENTREE",
]);

export const statutReconciliationEnum = pgEnum("statut_reconciliation_enum", [
  "PENDING",
  "RECONCILED",
  "DISCREPANCY_DETECTED",
]);

export const typeTacheRegularisationEnum = pgEnum("type_tache_regularisation_enum", [
  "ECART_RECEPTION",
  "RECONCILIATION_EN_ATTENTE",
  "VIREMENT_PROG_ECHEC",
  "VIREMENT_AUTO_ECHEC",
  "ECART_COFFRE_CAISSE",
]);

export const statutTacheRegularisationEnum = pgEnum("statut_tache_regularisation_enum", [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "ESCALATED",
]);

export const prioriteTacheEnum = pgEnum("priorite_tache_enum", [
  "LOW",
  "NORMAL",
  "HIGH",
  "CRITICAL",
]);

export const actionAuditTransfertEnum = pgEnum("action_audit_transfert_enum", [
  "CREATED",
  "SUBMITTED",
  "APPROVED_L1",
  "APPROVED_L2",
  "REJECTED",
  "DISPATCHED",
  "RECEIVED",
  "RECEIVED_WITH_DISCREPANCY",
  "CANCELLED",
]);
export const typeAgenceEnum = pgEnum("type_agence_enum", [
  "MAIN",
  "SECONDARY",
  "KIOSK",
]);

export const statutAgenceEnum = pgEnum("statut_agence_enum", [
  "ACTIVE",
  "INACTIVE",
  "CLOSED",
]);
