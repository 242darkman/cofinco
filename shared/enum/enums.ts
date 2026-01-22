import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// TRANSFERT COFFRE
// ============================================

export const statutTransfertCoffreEnum = pgEnum("statut_transfert_coffre_enum", [
  "REQUESTED",
  "VALIDATED",
  "EXECUTED",
  "REJECTED",
  "CANCELLED",
]);

export const typeTransfertCoffreEnum = pgEnum("type_transfert_coffre_enum", [
  "COFFRE_VERS_CAISSE",
  "CAISSE_VERS_COFFRE",
]);

// ============================================
// CREDIT
// ============================================

export const frequenceRemboursementEnum = pgEnum("frequence_remboursement_enum", [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "BI_MONTHLY",
  "QUARTERLY",
]);

export const dureeUniteEnum = pgEnum("duree_unite_enum", [
  "DAY",
  "WEEK",
  "MONTH",
]);

export const statutDemandeEnum = pgEnum("statut_demande_enum", [
  "PENDING_FEES",
  "READY_FOR_INVESTIGATION",
  "UNDER_INVESTIGATION",
  "INVESTIGATION_COMPLETE",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "DISBURSED",
  "CLOSED",
  "REEVALUATION_IN_PROGRESS",
  "APPROVED_AFTER_REEVALUATION",
  "DEFINITIVELY_REJECTED",
  "DELETED",
]);

// ========== REEVALUATION WORKFLOW ENUMS ==========

export const statutReevaluationEnum = pgEnum("statut_reevaluation_enum", [
  "REQUESTED",
  "ELIGIBILITY_CHECK",
  "AUTHORIZED",
  "REFUSED",
  "ADDITIONAL_INVESTIGATION",
  "INVESTIGATION_COMPLETE",
  "IN_COMMITTEE",
  "APPROVED",
  "DEFINITIVELY_REJECTED",
  "CANCELLED",
]);

export const typeElementNouveauEnum = pgEnum("type_element_nouveau_enum", [
  "ADDITIONAL_COLLATERAL",
  "CO_BORROWER",
  "INCOME_PROOF",
  "AMOUNT_REDUCTION",
  "DURATION_ADJUSTMENT",
  "SITUATION_IMPROVEMENT",
  "MISSING_DOCUMENT",
  "OTHER",
]);

export const typeRevenuEnum = pgEnum("type_revenu_enum", [
  "MONTHLY",
  "DAILY",
]);

export const typeCreditEnum = pgEnum("type_credit_enum", [
  "PERSONAL",
  "REAL_ESTATE",
  "COMMERCIAL",
]);

export const methodePaiementEnum = pgEnum("methode_paiement_enum", [
  "CASH",
  "MOBILE_MONEY",
  "TRANSFER",
  "CARD",
  "CHECK",
  "OTHER",
]);

export const statutCreditEnum = pgEnum("statut_credit_enum", [
  "PENDING",
  "ACTIVE",
  "LATE",
  "PAID",
  "CLOSED",
  "CANCELLED",
]);

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
  "POSTED",
  "CANCELLED",
  "REVERSED",
]);

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
  "INITIAL_DEPOSIT"
]);

export const statutTransfertCaisseEnum = pgEnum("statut_transfert_caisse_enum", [
  "PENDING",
  "VALIDATED",
  "REJECTED",
  "CANCELLED",
  "RECEIVED",
]);

// ============================================
// TAUX D'INTÉRÊT
// ============================================

export const interestRateTypeEnum = pgEnum("interest_rate_type_enum", [
  "credit",
  "epargne",
  "autre",
]);

export const typeTauxInteretEnum = pgEnum("type_taux_interet_enum", [
  "credit",
  "epargne",
  "autre",
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
  "OPERATION_TERRAIN_SUBMITTED",
  "OPERATION_TERRAIN_APPROVED",
  "OPERATION_TERRAIN_REJECTED",
  "OPERATION_TERRAIN_SETTLED",
  // Caisse Admin events
  "SESSION_FORCE_CLOSED",
  "CAISSE_STATUS_CHANGED",
  "CAISSE_LIQUIDATED",
]);

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
]);

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
  "CANCELLED",
]);

export const motifBlocageEnum = pgEnum("motif_blocage_enum", [
  "LOAN_GUARANTEE",
  "TONTINE_GUARANTEE",
  "FORCED_SAVINGS",
  "INTERNAL_DECISION",
  "DISPUTE",
  "OTHER",
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
]);

export const statutOperationTerrainEnum = pgEnum("statut_operation_terrain_enum", [
  "SUBMITTED",
  "APPROVED",
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
  "Sac scellé",
  "Mallette",
  "Enveloppe",
  "Autre",
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
  "OPEN",
  "CLOSED",
]);

// ============================================
// ENQUETE CREDIT
// ============================================

export const statutEnqueteCreditEnum = pgEnum("statut_enquete_credit_enum", [
  "PENDING",
  "IN_PROGRESS",
  "APPROVED",
  "REJECTED",
  "REDUCED",
]);

// ============================================
// PLAN EPARGNE
// ============================================

export const statutPlanEpargneEnum = pgEnum("statut_plan_epargne_enum", [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

// ============================================
// OBJECTIF EPARGNE
// ============================================

export const statutObjectifEpargneEnum = pgEnum("statut_objectif_epargne_enum", [
  "IN_PROGRESS",
  "ACHIEVED",
  "ABANDONED",
]);

// ============================================
// VERSEMENT AUTOMATIQUE
// ============================================

export const statutVersementAutoEnum = pgEnum("statut_versement_auto_enum", [
  "PENDING",
  "SUCCESS",
  "FAILED",
]);

// ============================================
// DECAISSEMENT PROGRAMME
// ============================================

export const statutDecaissementProgEnum = pgEnum("statut_decaissement_prog_enum", [
  "PENDING",
  "SUCCESS",
  "FAILED",
]);

// ============================================
// FREQUENCE VIREMENT PROGRAMME
// ============================================

export const frequenceVirementEnum = pgEnum("frequence_virement_enum", [
  "ONCE",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
]);

// ============================================
// STATUT AUDIT VIREMENT
// ============================================

export const statutAuditVirementEnum = pgEnum("statut_audit_virement_enum", [
  "SUCCESS",
  "FAILED",
]);

// ============================================
// ENQUETE COMPLEMENTAIRE
// ============================================

export const statutEnqueteComplementaireEnum = pgEnum("statut_enquete_complementaire_enum", [
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

// ============================================
// CREDIT REFUND REQUEST
// ============================================

export const statutRefundRequestEnum = pgEnum("statut_refund_request_enum", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PAID",
  "CANCELLED",
]);
