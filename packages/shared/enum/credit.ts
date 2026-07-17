/**
 * Enums Drizzle — domaine « credit ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

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
  "PENDING_APPROVAL",
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
  "WAITING_DISBURSEMENT", // En attente de décaissement physique (caisse)
]);

// ============================================
// ECHEANCES CREDIT
// ============================================

export const statutEcheanceCreditEnum = pgEnum("statut_echeance_credit_enum", [
  "UPCOMING",
  "PAID",
  "LATE",
  "SETTLED",
  "DUE",
  "PARTIALLY_PAID",
  "RESTRUCTURED",
]);

// ============================================
// CANAL DE DÉCAISSEMENT
// ============================================

export const disbursementChannelEnum = pgEnum("disbursement_channel_enum", [
  "ACCOUNT",      // Virement vers compte courant (flux existant)
  "CASH",         // Espèces à la caisse
  "MOBILE_MONEY", // Mobile Money (API externe)
]);

// ============================================
// STATUT DE DÉCAISSEMENT
// ============================================

export const disbursementStatusEnum = pgEnum("disbursement_status_enum", [
  "PENDING",     // En attente (pour CASH: attente du caissier)
  "PROCESSING",  // En cours de traitement
  "COMPLETED",   // Terminé
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
// ENQUETE CREDIT
// ============================================

export const statutEnqueteCreditEnum = pgEnum("statut_enquete_credit_enum", [
  "PENDING_ASSIGNMENT", // En attente d'assignation
  "ASSIGNED",           // Assignée à un agent
  "IN_PROGRESS",        // En cours de traitement
  "SUBMITTED",          // Soumise par l'agent
  "REVIEWED",           // Révisée par le superviseur
  "APPROVED",           // Approuvée
  "REJECTED",           // Rejetée
  "REDUCED",            // Montant réduit
  "CLOSED",             // Clôturée
]);

// ============================================
// CREDIT INVESTIGATION MODULE
// ============================================

// Activity types for agent tasks
export const activityTypeEnum = pgEnum("activity_type_enum", [
  "PROSPECTION",
  "CREDIT_INVESTIGATION",
  "COLLECTION",
  "CLIENT_VISIT",
  "DOCUMENT_PICKUP",
  "OTHER",
]);

// Activity priority levels
export const activityPriorityEnum = pgEnum("activity_priority_enum", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

// Activity status
export const activityStatusEnum = pgEnum("activity_status_enum", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "OVERDUE",
]);

// Agent recommendation levels  
export const agentRecommendationEnum = pgEnum("agent_recommendation_enum", [
  "APPROVE",
  "APPROVE_WITH_CAUTION",
  "REDUCE_AMOUNT",
  "REJECT",
]);

// Risk assessment levels
export const riskLevelEnum = pgEnum("risk_level_enum", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERY_HIGH",
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
  "PENDING_CAISSE",  // En attente de validation caisse (espèces/mobile money)
  "PAID",
  "CANCELLED",
]);

// ============================================
// DOSSIER CREDIT (Loan Application by Field Agent)
// ============================================

export const statutDossierCreditEnum = pgEnum("statut_dossier_credit_enum", [
  "DRAFT",
  "SUBMITTED",
  "PENDING_FEES",
  "READY_FOR_INVESTIGATION",
  "UNDER_INVESTIGATION",
  "INVESTIGATION_COMPLETE",
  "IN_COMMITTEE",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

// ============================================
// ENQUETE CREDIT (Field Investigation for Loan)
// ============================================

export const statutEnqueteCreditAgentEnum = pgEnum("statut_enquete_credit_agent_enum", [
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "APPROVED",
  "REJECTED",
  "REDUCED",
]);

// ============================================
// AVIS ENQUETEUR (Investigation Recommendation)
// ============================================

export const avisEnqueteurEnum = pgEnum("avis_enqueteur_enum", [
  "FAVORABLE",
  "DEFAVORABLE",
  "RESERVE",
]);

// ============================================
// NIVEAU RISQUE (Risk Level)
// ============================================

export const niveauRisqueEnum = pgEnum("niveau_risque_enum", [
  "FAIBLE",
  "MOYEN",
  "ELEVE",
]);

// ============================================
// CREDIT PLAN CONFIGURATION
// ============================================

export const firstDueRuleEnum = pgEnum("first_due_rule_enum", [
  "NEXT_DAY",
  "NEXT_BUSINESS_DAY",
  "AFTER_N_DAYS",
  "NEXT_WEEKDAY",
  "END_OF_WEEK",
  "END_OF_MONTH",
  "CUSTOM_DATE_ALLOWED",
]);

export const calendarModeEnum = pgEnum("calendar_mode_enum", [
  "ALL_DAYS",
  "BUSINESS_DAYS_ONLY",
  "CUSTOM_WEEKDAYS",
]);

export const shiftNonWorkingDayEnum = pgEnum("shift_non_working_day_enum", [
  "NEXT",
  "PREVIOUS",
  "NEAREST",
]);

export const interestMethodEnum = pgEnum("interest_method_enum", [
  "FLAT",
  "DECLINING_BALANCE",
]);

export const interestRatePeriodEnum = pgEnum("interest_rate_period_enum", [
  "DAILY",
  "MONTHLY",
  "ANNUAL",
]);

export const dayCountConventionEnum = pgEnum("day_count_convention_enum", [
  "ACT_365",
  "ACT_360",
  "30_360",
]);

export const roundingModeEnum = pgEnum("rounding_mode_enum", [
  "ROUND",
  "FLOOR",
  "CEIL",
]);

export const amortizationTypeEnum = pgEnum("amortization_type_enum", [
  "EQUAL_INSTALLMENTS",
  "EQUAL_PRINCIPAL",
  "INTEREST_ONLY_THEN_BALLOON",
]);

export const feeTypeEnum = pgEnum("fee_type_enum", [
  "DOSSIER",
  "ASSURANCE",
  "NOTAIRE",
  "TIMBRES",
  "COMMISSION",
  "CUSTOM",
]);

export const feeCalcTypeEnum = pgEnum("fee_calc_type_enum", [
  "FIXED",
  "PERCENTAGE",
]);

export const feeCollectionModeEnum = pgEnum("fee_collection_mode_enum", [
  "UPFRONT",
  "DEDUCTED_FROM_PRINCIPAL",
  "SPREAD",
  "ON_DISBURSEMENT",
]);

export const lateFeeTypeEnum = pgEnum("late_fee_type_enum", [
  "FIXED",
  "PERCENTAGE",
]);

export const penaltyApplicationEnum = pgEnum("penalty_application_enum", [
  "PER_INSTALLMENT",
  "ON_TOTAL_OVERDUE",
  "DAILY_ACCRUAL",
]);

export const prepaymentFeeTypeEnum = pgEnum("prepayment_fee_type_enum", [
  "NONE",
  "FIXED",
  "PERCENTAGE_OF_REMAINING",
  "PERCENTAGE_OF_PREPAID",
]);

export const guaranteeReleaseRuleEnum = pgEnum("guarantee_release_rule_enum", [
  "ON_FULL_REPAYMENT",
  "ON_PERCENTAGE_REPAID",
  "MANUAL",
]);

export const collateralTypeEnum = pgEnum("collateral_type_enum", [
  "IMMOBILIER",
  "VEHICULE",
  "EQUIPEMENT",
  "DEPOT_GARANTIE",
  "CAUTION_SOLIDAIRE",
  "AUTRE",
]);
