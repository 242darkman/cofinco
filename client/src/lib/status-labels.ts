/**
 * Labels et couleurs de traduction pour les statuts (EN → FR)
 *
 * Ce fichier centralise tous les mappings de traduction pour afficher
 * les statuts techniques en anglais avec des labels en français dans l'UI.
 *
 * CONVENTION:
 * - Les clés sont les valeurs stockées en base (ANGLAIS, SCREAMING_SNAKE_CASE)
 * - Les valeurs sont les labels affichés à l'utilisateur (Français)
 * - Les labels sont définis dans @shared/enum/status-constants.ts (source unique)
 * - Les couleurs sont définies ici (frontend only)
 *
 * UTILISATION:
 *   import { getStatusLabel, ALL_STATUS_LABELS } from '@/lib/status-labels';
 *   const label = getStatusLabel(status, ALL_STATUS_LABELS);
 */

// ============================================
// IMPORTS — Labels depuis status-constants.ts (source unique de vérité)
// ============================================

import {
  // Statuts & labels
  STATUT_AGENCE_LABELS,
  STATUT_CLIENT_LABELS,
  STATUT_DEMANDE_LABELS,
  STATUT_SESSION_CAISSE_LABELS,
  STATUT_OPERATION_TERRAIN_LABELS,
  STATUT_OBJECTIF_LABELS,
  STATUT_RUN_VIREMENT_LABELS,
  STATUT_TACHE_REGULARISATION_LABELS,
  STATUT_ECHEANCE_CREDIT_LABELS,
  STATUT_DOSSIER_CREDIT_LABELS,
  STATUT_REMISE_TERRAIN_LABELS,
  STATUT_REEVALUATION_LABELS,
  STATUT_CONGE_LABELS,
  STATUT_CANDIDATURE_LABELS,
  STATUT_CONTRIBUTION_TONTINE_LABELS,
  STATUT_TONTINE_LABELS,
  STATUT_MEMBRE_TONTINE_LABELS,
  STATUT_ALERTE_TONTINE_LABELS,
  STATUT_PENALITE_TONTINE_LABELS,
  STATUT_ECHEANCE_TONTINE_LABELS,
  STATUT_ENQUETE_CREDIT_LABELS,
  STATUT_VISITE_TERRAIN_LABELS,
  STATUT_PAIEMENT_TERRAIN_LABELS,
  STATUT_FACTURE_LABELS,
  STATUT_PRESENCE_LABELS,
  STATUT_BULLETIN_LABELS,
  STATUT_PAIEMENT_COMMISSION_LABELS,
  STATUT_SUIVI_FORMATION_LABELS,
  STATUT_PLANNING_LABELS,
  STATUT_VALIDATION_DEPENSE_LABELS,
  STATUT_DECLARATION_TVA_LABELS,
  STATUT_ARCHIVE_LABELS,
  STATUT_OTP_LABELS,
  STATUT_AUDIT_VIREMENT_LABELS,
  PRIORITE_LABELS,
  // Types & labels
  TYPE_OPERATION_TERRAIN_LABELS,
  TYPE_VISITE_TERRAIN_LABELS,
  TYPE_TACHE_REGULARISATION_LABELS,
  TYPE_MOUVEMENT_COFFRE_LABELS,
  TYPE_DOCUMENT_LABELS,
  TYPE_CREDIT_LABELS,
  TYPE_DISTRIBUTION_TONTINE_LABELS,
  MODE_DISTRIBUTION_TONTINE_LABELS,
  TYPE_ALERTE_TONTINE_LABELS,
  TYPE_REGLE_TONTINE_LABELS,
  TYPE_CAISSE_LABELS,
  DISBURSEMENT_CHANNEL_LABELS,
  MOTIF_BLOCAGE_LABELS,
  DUREE_UNITE_LABELS,
  FREQUENCE_VIREMENT_LABELS,
  FREQUENCE_TONTINE_LABELS,
  FREQUENCE_REMBOURSEMENT_LABELS,
  DECISION_COMITE_LABELS,
  AVIS_ENQUETEUR_LABELS,
  NIVEAU_RISQUE_LABELS,
  MODE_CALCUL_PAIE_LABELS,
  PRIORITE_ALERTE_TONTINE_LABELS,
  METHODE_PAIEMENT_LABELS as SC_METHODE_PAIEMENT_LABELS,
} from '@shared/enum/status-constants';

import type {
  StatutCompteType,
  StatutCreditType,
  StatutTransactionType,
  StatutTransfertCaisseType,
  StatutTransfertCoffreType,
  StatutTransfertInterCoffreType,
  StatutCoffreType,
  StatutUserType,
  TypeAgenceType,
} from '@shared/enum/status-constants';

// ============================================
// COULEURS — Définies ici (frontend only)
// ============================================

// --- Statut Compte ---
export const ACCOUNT_STATUS_LABELS: Record<StatutCompteType, string> = {
  ACTIVE: "Actif",
  PENDING_ACTIVATION: "En attente d'activation",
  SUSPENDED: "Suspendu",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
};

export const ACCOUNT_STATUS_COLORS: Record<StatutCompteType, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  PENDING_ACTIVATION: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  SUSPENDED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CLOSED: "bg-slate-700 text-slate-400 border-transparent",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Statut Client ---
export const CLIENT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  INACTIVE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  SUSPENDED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DELETED: "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Segment Client ---
export const CLIENT_SEGMENT_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  PREMIUM: "Premium",
  VIP: "VIP",
  RISQUE: "Risqué",
  RISKY: "Risqué",
};

export const CLIENT_SEGMENT_COLORS: Record<string, string> = {
  STANDARD: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  PREMIUM: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  VIP: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  RISQUE: "bg-red-500/20 text-red-400 border-red-500/30",
  RISKY: "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Statut Crédit ---
export const CREDIT_STATUS_LABELS: Record<StatutCreditType, string> = {
  PENDING: "En attente",
  ACTIVE: "Actif",
  LATE: "En retard",
  PAID: "Soldé",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
  WAITING_DISBURSEMENT: "En attente décaissement",
};

export const CREDIT_STATUS_COLORS: Record<StatutCreditType, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ACTIVE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  LATE: "bg-red-500/20 text-red-400 border-red-500/30",
  PAID: "bg-green-500/20 text-green-400 border-green-500/30",
  CLOSED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  WAITING_DISBURSEMENT: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

// --- Statut Demande Crédit ---
export const CREDIT_REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING_FEES: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  READY_FOR_INVESTIGATION: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  UNDER_INVESTIGATION: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  INVESTIGATION_COMPLETE: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  PENDING_APPROVAL: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  DISBURSED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CLOSED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  REEVALUATION_IN_PROGRESS: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  APPROVED_AFTER_REEVALUATION: "bg-green-500/20 text-green-400 border-green-500/30",
  DEFINITIVELY_REJECTED: "bg-red-600/20 text-red-500 border-red-600/30",
  DELETED: "bg-red-500/10 text-red-500 border-red-500/20",
};

// --- Statut Transaction ---
export const TRANSACTION_STATUS_LABELS: Record<StatutTransactionType, string> = {
  PENDING: "En attente",
  PENDING_SETTLEMENT: "En attente de remise",
  POSTED: "Posté",
  CANCELLED: "Annulé",
  REVERSED: "Reversé",
};

export const TRANSACTION_STATUS_COLORS: Record<StatutTransactionType, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  PENDING_SETTLEMENT: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  POSTED: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
  REVERSED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

// --- Statut Transfert Caisse ---
export const TRANSFER_CAISSE_STATUS_LABELS: Record<StatutTransfertCaisseType, string> = {
  PENDING: "En attente",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  CANCELLED: "Annulé",
  RECEIVED: "Reçu",
};

export const TRANSFER_CAISSE_STATUS_COLORS: Record<StatutTransfertCaisseType, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  RECEIVED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

// --- Statut Transfert Coffre ---
export const TRANSFER_COFFRE_STATUS_LABELS: Record<StatutTransfertCoffreType, string> = {
  REQUESTED: "Demandé",
  VALIDATED: "Validé",
  EXECUTED: "Exécuté",
  REJECTED: "Rejeté",
  CANCELLED: "Annulé",
};

export const TRANSFER_COFFRE_STATUS_COLORS: Record<StatutTransfertCoffreType, string> = {
  REQUESTED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  VALIDATED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  EXECUTED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// --- Statut Transfert Inter-Coffre ---
export const TRANSFER_INTER_COFFRE_STATUS_LABELS: Record<StatutTransfertInterCoffreType, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumis",
  APPROVED_L1: "Approuvé N1",
  APPROVED_L2: "Approuvé N2",
  IN_TRANSIT: "En transit",
  RECEIVED: "Reçu",
  RECEIVED_WITH_DISCREPANCY: "Reçu avec écart",
  REJECTED: "Rejeté",
  CANCELLED: "Annulé",
};

export const TRANSFER_INTER_COFFRE_STATUS_COLORS: Record<StatutTransfertInterCoffreType, string> = {
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  SUBMITTED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  APPROVED_L1: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  APPROVED_L2: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  IN_TRANSIT: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  RECEIVED: "bg-green-500/20 text-green-400 border-green-500/30",
  RECEIVED_WITH_DISCREPANCY: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// --- Statut Coffre ---
export const COFFRE_STATUS_LABELS: Record<StatutCoffreType, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  CLOSED: "Fermé",
};

export const COFFRE_STATUS_COLORS: Record<StatutCoffreType, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  SUSPENDED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CLOSED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// --- Statut User ---
export const USER_STATUS_LABELS: Record<StatutUserType, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  SUSPENDED: "Suspendu",
};

export const USER_STATUS_COLORS: Record<StatutUserType, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  INACTIVE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  SUSPENDED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

// --- Priorité ---
export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  NORMAL: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Statut Opération (success/fail générique) ---
export type OperationStatusType = 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';

export const OPERATION_STATUS_LABELS: Record<OperationStatusType, string> = {
  SUCCESS: "Succès",
  FAILED: "Échec",
  PENDING: "En attente",
  CANCELLED: "Annulé",
};

export const OPERATION_STATUS_COLORS: Record<OperationStatusType, string> = {
  SUCCESS: "bg-green-500/20 text-green-400 border-green-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// --- Sens Mouvement ---
export type SensMouvementType = 'DEBIT' | 'CREDIT';

export const SENS_MOUVEMENT_LABELS: Record<SensMouvementType, string> = {
  DEBIT: "Débit",
  CREDIT: "Crédit",
};

export const SENS_MOUVEMENT_COLORS: Record<SensMouvementType, string> = {
  DEBIT: "bg-red-500/20 text-red-400 border-red-500/30",
  CREDIT: "bg-green-500/20 text-green-400 border-green-500/30",
};

// --- Méthode de Paiement (étendu par rapport à status-constants) ---
export type MethodePaiementExtendedType = 'CASH' | 'MOBILE_MONEY' | 'TRANSFER' | 'CARD' | 'CHECK' | 'OTHER';

export const METHODE_PAIEMENT_LABELS: Record<MethodePaiementExtendedType, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  TRANSFER: "Virement",
  CARD: "Carte",
  CHECK: "Chèque",
  OTHER: "Autre",
};

export const METHODE_PAIEMENT_COLORS: Record<MethodePaiementExtendedType, string> = {
  CASH: "bg-green-500/20 text-green-400 border-green-500/30",
  MOBILE_MONEY: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  TRANSFER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  CARD: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  CHECK: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  OTHER: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// --- Type Transaction Épargne ---
export type TypeTransactionEpargneType = 'DEPOSIT' | 'WITHDRAWAL' | 'INTEREST' | 'FEE' | 'ADJUSTMENT';

export const TYPE_TRANSACTION_EPARGNE_LABELS: Record<TypeTransactionEpargneType, string> = {
  DEPOSIT: "Dépôt",
  WITHDRAWAL: "Retrait",
  INTEREST: "Intérêt",
  FEE: "Frais",
  ADJUSTMENT: "Ajustement",
};

export const TYPE_TRANSACTION_EPARGNE_COLORS: Record<TypeTransactionEpargneType, string> = {
  DEPOSIT: "bg-green-500/20 text-green-400 border-green-500/30",
  WITHDRAWAL: "bg-red-500/20 text-red-400 border-red-500/30",
  INTEREST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FEE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  ADJUSTMENT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// --- Type Opération Caisse ---
export type TypeOperationCaisseType =
  | 'SAVINGS_DEPOSIT' | 'SAVINGS_WITHDRAWAL'
  | 'CREDIT_DISBURSEMENT' | 'CREDIT_REPAYMENT'
  | 'ENGAGEMENT_FEE' | 'FEE' | 'ADJUSTMENT'
  | 'CASH_TRANSFER' | 'SAFE_SUPPLY' | 'SAFE_DEPOSIT'
  | 'DEPOSIT_SAVINGS' | 'DEPOSIT_CURRENT' | 'WITHDRAWAL_CURRENT'
  | 'DEPOSIT_BLOCKED' | 'WITHDRAWAL_BLOCKED'
  | 'MISC_COLLECTION' | 'MISC_DISBURSEMENT' | 'BANK_FEE'
  | 'TONTINE_CONTRIBUTION' | 'TONTINE_WITHDRAWAL'
  | 'LOAN_REPAYMENT' | 'LOAN_DISBURSEMENT' | 'WITHDRAWAL_SAVINGS'
  | 'INITIAL_DEPOSIT';

export const TYPE_OPERATION_CAISSE_LABELS: Record<TypeOperationCaisseType, string> = {
  SAVINGS_DEPOSIT: "Dépôt épargne",
  SAVINGS_WITHDRAWAL: "Retrait épargne",
  CREDIT_DISBURSEMENT: "Décaissement crédit",
  CREDIT_REPAYMENT: "Remboursement crédit",
  ENGAGEMENT_FEE: "Frais Engagement",
  FEE: "Frais",
  ADJUSTMENT: "Ajustement",
  CASH_TRANSFER: "Transfert caisse",
  SAFE_SUPPLY: "Approvisionnement coffre",
  SAFE_DEPOSIT: "Versement coffre",
  DEPOSIT_SAVINGS: "Versement Épargne",
  DEPOSIT_CURRENT: "Versement Courant",
  WITHDRAWAL_CURRENT: "Retrait Courant",
  DEPOSIT_BLOCKED: "Versement Bloqué",
  WITHDRAWAL_BLOCKED: "Retrait Bloqué",
  MISC_COLLECTION: "Encaissement Divers",
  MISC_DISBURSEMENT: "Décaissement Divers",
  BANK_FEE: "Frais Bancaires",
  TONTINE_CONTRIBUTION: "Cotisation Tontine",
  TONTINE_WITHDRAWAL: "Retrait Tontine",
  LOAN_REPAYMENT: "Remboursement Prêt",
  LOAN_DISBURSEMENT: "Décaissement Prêt",
  WITHDRAWAL_SAVINGS: "Retrait Épargne",
  INITIAL_DEPOSIT: "Dépôt Initial",
};

export const TYPE_OPERATION_CAISSE_COLORS: Record<TypeOperationCaisseType, string> = {
  SAVINGS_DEPOSIT: "bg-green-500/20 text-green-400 border-green-500/30",
  SAVINGS_WITHDRAWAL: "bg-red-500/20 text-red-400 border-red-500/30",
  CREDIT_DISBURSEMENT: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  CREDIT_REPAYMENT: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ENGAGEMENT_FEE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  FEE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  ADJUSTMENT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  CASH_TRANSFER: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  SAFE_SUPPLY: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  SAFE_DEPOSIT: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  DEPOSIT_SAVINGS: "bg-green-500/20 text-green-400 border-green-500/30",
  DEPOSIT_CURRENT: "bg-green-500/20 text-green-400 border-green-500/30",
  WITHDRAWAL_CURRENT: "bg-red-500/20 text-red-400 border-red-500/30",
  DEPOSIT_BLOCKED: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  WITHDRAWAL_BLOCKED: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  MISC_COLLECTION: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  MISC_DISBURSEMENT: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  BANK_FEE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  TONTINE_CONTRIBUTION: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  TONTINE_WITHDRAWAL: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
  LOAN_REPAYMENT: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  LOAN_DISBURSEMENT: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  WITHDRAWAL_SAVINGS: "bg-red-500/20 text-red-400 border-red-500/30",
  INITIAL_DEPOSIT: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

// --- Type Paiement Terrain ---
export type TypePaiementTerrainType =
  | 'DEPOSIT_SAVINGS' | 'DEPOSIT_CURRENT' | 'DEPOSIT_BLOCKED'
  | 'WITHDRAWAL_SAVINGS' | 'WITHDRAWAL_CURRENT' | 'WITHDRAWAL_BLOCKED'
  | 'CREDIT_REPAYMENT' | 'ENGAGEMENT_FEE' | 'CREDIT_DISBURSEMENT'
  | 'TONTINE_CONTRIBUTION' | 'TONTINE_WITHDRAWAL'
  | 'SAFE_SUPPLY' | 'SAFE_DEPOSIT'
  | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'INITIAL_DEPOSIT' | 'INTERNAL_TRANSFER';

export const TYPE_PAIEMENT_TERRAIN_LABELS: Record<TypePaiementTerrainType, string> = {
  DEPOSIT_SAVINGS: "Dépôt Épargne",
  DEPOSIT_CURRENT: "Dépôt Courant",
  DEPOSIT_BLOCKED: "Dépôt Bloqué",
  WITHDRAWAL_SAVINGS: "Retrait Épargne",
  WITHDRAWAL_CURRENT: "Retrait Courant",
  WITHDRAWAL_BLOCKED: "Retrait Bloqué",
  CREDIT_REPAYMENT: "Remboursement Crédit",
  ENGAGEMENT_FEE: "Frais Engagement",
  CREDIT_DISBURSEMENT: "Décaissement Crédit",
  TONTINE_CONTRIBUTION: "Versement Tontine",
  TONTINE_WITHDRAWAL: "Retrait Tontine",
  SAFE_SUPPLY: "Approvisionnement coffre",
  SAFE_DEPOSIT: "Versement coffre",
  TRANSFER_IN: "Transfert Entrant",
  TRANSFER_OUT: "Transfert Sortant",
  INITIAL_DEPOSIT: "Dépôt Initial",
  INTERNAL_TRANSFER: "Virement Interne",
};

export const TYPE_PAIEMENT_TERRAIN_COLORS: Record<TypePaiementTerrainType, string> = {
  DEPOSIT_SAVINGS: "bg-green-500/20 text-green-400 border-green-500/30",
  DEPOSIT_CURRENT: "bg-green-500/20 text-green-400 border-green-500/30",
  DEPOSIT_BLOCKED: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  WITHDRAWAL_SAVINGS: "bg-red-500/20 text-red-400 border-red-500/30",
  WITHDRAWAL_CURRENT: "bg-red-500/20 text-red-400 border-red-500/30",
  WITHDRAWAL_BLOCKED: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  CREDIT_REPAYMENT: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ENGAGEMENT_FEE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  CREDIT_DISBURSEMENT: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  TONTINE_CONTRIBUTION: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  TONTINE_WITHDRAWAL: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
  SAFE_SUPPLY: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  SAFE_DEPOSIT: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  TRANSFER_IN: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  TRANSFER_OUT: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  INITIAL_DEPOSIT: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  INTERNAL_TRANSFER: "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

// --- Type Agence ---
export const AGENCY_TYPE_LABELS: Record<TypeAgenceType, string> = {
  MAIN: "Agence Principale",
  SECONDARY: "Agence Secondaire",
  KIOSK: "Kiosque",
};

export const AGENCY_TYPE_COLORS: Record<TypeAgenceType, string> = {
  MAIN: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SECONDARY: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  KIOSK: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

// --- Statut Agence (couleurs) ---
export const AGENCY_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  INACTIVE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  CLOSED: "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Type Compte ---
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CURRENT: "Courant",
  SAVINGS: "Épargne",
  BLOCKED: "Bloqué",
};

export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  CURRENT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  SAVINGS: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
};

// ============================================
// COULEURS pour les maps importées de status-constants.ts
// ============================================

export const SESSION_CAISSE_STATUS_COLORS: Record<string, string> = {
  REQUESTING_FUNDS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FUNDS_DISPATCHED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  OPEN: "bg-green-500/20 text-green-400 border-green-500/30",
  CLOSING_COUNT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  CLOSING_VALIDATION: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CLOSED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const ENQUETE_CREDIT_STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  COMPLETED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  REDUCED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export const OPERATION_TERRAIN_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SUBMITTED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  PENDING_SETTLEMENT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  SETTLED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const OBJECTIF_STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ACHIEVED: "bg-green-500/20 text-green-400 border-green-500/30",
  ABANDONED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const RUN_VIREMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  RUNNING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SUCCESS: "bg-green-500/20 text-green-400 border-green-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
  SKIPPED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const TACHE_REGULARISATION_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  IN_PROGRESS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  RESOLVED: "bg-green-500/20 text-green-400 border-green-500/30",
  ESCALATED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const ECHEANCE_CREDIT_STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PAID: "bg-green-500/20 text-green-400 border-green-500/30",
  LATE: "bg-red-500/20 text-red-400 border-red-500/30",
  SETTLED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export const DOSSIER_CREDIT_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  SUBMITTED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PENDING_FEES: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  READY_FOR_INVESTIGATION: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  UNDER_INVESTIGATION: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  INVESTIGATION_COMPLETE: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  IN_COMMITTEE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const REMISE_TERRAIN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  SETTLED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const REEVALUATION_STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ELIGIBILITY_CHECK: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  AUTHORIZED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  REFUSED: "bg-red-500/20 text-red-400 border-red-500/30",
  ADDITIONAL_INVESTIGATION: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  INVESTIGATION_COMPLETE: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  IN_COMMITTEE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  DEFINITIVELY_REJECTED: "bg-red-600/20 text-red-500 border-red-600/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const CONGE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const CANDIDATURE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  INTERVIEW: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ACCEPTED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const CONTRIBUTION_TONTINE_STATUS_COLORS: Record<string, string> = {
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  LATE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export const TONTINE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  COMPLETED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SUSPENDED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export const MEMBRE_TONTINE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  INACTIVE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  EXCLUDED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const ALERTE_TONTINE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-red-500/20 text-red-400 border-red-500/30",
  RESOLVED: "bg-green-500/20 text-green-400 border-green-500/30",
  IGNORED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const PENALITE_TONTINE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  PAID: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  WAIVED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export const ECHEANCE_TONTINE_STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-500/20 text-green-400 border-green-500/30",
  IN_PROGRESS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  UPCOMING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export const VISITE_TERRAIN_STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  COMPLETED: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const PAIEMENT_TERRAIN_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  POSTED: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const FACTURE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  PAID: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const PRESENCE_STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-green-500/20 text-green-400 border-green-500/30",
  LATE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  ABSENT: "bg-red-500/20 text-red-400 border-red-500/30",
  ON_LEAVE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export const BULLETIN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  PAID: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const PAIEMENT_COMMISSION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  PAID: "bg-green-500/20 text-green-400 border-green-500/30",
  PROCESSING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export const SUIVI_FORMATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  IN_PROGRESS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  COMPLETED: "bg-green-500/20 text-green-400 border-green-500/30",
};

export const PLANNING_STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  COMPLETED: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export const VALIDATION_DEPENSE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const DECLARATION_TVA_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  PAID: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  LATE: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const ARCHIVE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
};

export const OTP_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  VALIDATED: "bg-green-500/20 text-green-400 border-green-500/30",
  EXPIRED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const AUDIT_VIREMENT_STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-500/20 text-green-400 border-green-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ============================================
// HELPERS
// ============================================

/**
 * Récupère le label traduit pour un statut donné
 * @param status - La valeur du statut (EN ou FR legacy)
 * @param labels - Le mapping de labels à utiliser
 * @param fallback - Valeur par défaut si non trouvé (par défaut: la valeur originale)
 */
export function getStatusLabel(
  status: string | null | undefined,
  labels: Record<string, string>,
  fallback?: string
): string {
  if (!status) return fallback || "-";
  return labels[status] || fallback || status;
}

/**
 * Récupère la classe CSS de couleur pour un statut donné
 * @param status - La valeur du statut (EN ou FR legacy)
 * @param colors - Le mapping de couleurs à utiliser
 * @param fallback - Classe par défaut si non trouvé
 */
export function getStatusColor(
  status: string | null | undefined,
  colors: Record<string, string>,
  fallback = "bg-gray-500/20 text-gray-400 border-gray-500/30"
): string {
  if (!status) return fallback;
  return colors[status] || fallback;
}

// ============================================
// AGRÉGATS UNIVERSELS — utilisés par Badge auto-detect
// ============================================

/**
 * Mapping universel de tous les labels EN → FR
 * Utilisé par le composant Badge pour la traduction automatique
 */
export const ALL_STATUS_LABELS: Record<string, string> = {
  // --- Labels définis localement (pas d'équivalent dans status-constants.ts) ---
  ...ACCOUNT_STATUS_LABELS,
  ...CREDIT_STATUS_LABELS,
  ...TRANSACTION_STATUS_LABELS,
  ...TRANSFER_CAISSE_STATUS_LABELS,
  ...TRANSFER_COFFRE_STATUS_LABELS,
  ...TRANSFER_INTER_COFFRE_STATUS_LABELS,
  ...COFFRE_STATUS_LABELS,
  ...USER_STATUS_LABELS,
  ...CLIENT_SEGMENT_LABELS,
  ...OPERATION_STATUS_LABELS,
  ...SENS_MOUVEMENT_LABELS,
  ...METHODE_PAIEMENT_LABELS,
  ...TYPE_TRANSACTION_EPARGNE_LABELS,
  ...TYPE_OPERATION_CAISSE_LABELS,
  ...TYPE_PAIEMENT_TERRAIN_LABELS,
  ...AGENCY_TYPE_LABELS,
  ...ACCOUNT_TYPE_LABELS,

  // --- Labels importés de status-constants.ts ---
  ...STATUT_CLIENT_LABELS,
  ...STATUT_AGENCE_LABELS,
  ...STATUT_DEMANDE_LABELS,
  ...PRIORITE_LABELS,
  ...STATUT_SESSION_CAISSE_LABELS,
  ...STATUT_ENQUETE_CREDIT_LABELS,
  ...STATUT_OPERATION_TERRAIN_LABELS,
  ...STATUT_OBJECTIF_LABELS,
  ...STATUT_RUN_VIREMENT_LABELS,
  ...STATUT_TACHE_REGULARISATION_LABELS,
  ...STATUT_ECHEANCE_CREDIT_LABELS,
  ...STATUT_DOSSIER_CREDIT_LABELS,
  ...STATUT_REMISE_TERRAIN_LABELS,
  ...STATUT_REEVALUATION_LABELS,
  ...STATUT_CONGE_LABELS,
  ...STATUT_CANDIDATURE_LABELS,
  ...STATUT_CONTRIBUTION_TONTINE_LABELS,
  ...STATUT_TONTINE_LABELS,
  ...STATUT_MEMBRE_TONTINE_LABELS,
  ...STATUT_ALERTE_TONTINE_LABELS,
  ...STATUT_PENALITE_TONTINE_LABELS,
  ...STATUT_ECHEANCE_TONTINE_LABELS,
  ...STATUT_VISITE_TERRAIN_LABELS,
  ...STATUT_PAIEMENT_TERRAIN_LABELS,
  ...STATUT_FACTURE_LABELS,
  ...STATUT_PRESENCE_LABELS,
  ...STATUT_BULLETIN_LABELS,
  ...STATUT_PAIEMENT_COMMISSION_LABELS,
  ...STATUT_SUIVI_FORMATION_LABELS,
  ...STATUT_PLANNING_LABELS,
  ...STATUT_VALIDATION_DEPENSE_LABELS,
  ...STATUT_DECLARATION_TVA_LABELS,
  ...STATUT_ARCHIVE_LABELS,
  ...STATUT_OTP_LABELS,
  ...STATUT_AUDIT_VIREMENT_LABELS,
  ...TYPE_OPERATION_TERRAIN_LABELS,
  ...TYPE_VISITE_TERRAIN_LABELS,
  ...TYPE_TACHE_REGULARISATION_LABELS,
  ...TYPE_MOUVEMENT_COFFRE_LABELS,
  ...TYPE_DOCUMENT_LABELS,
  ...TYPE_CREDIT_LABELS,
  ...TYPE_DISTRIBUTION_TONTINE_LABELS,
  ...MODE_DISTRIBUTION_TONTINE_LABELS,
  ...TYPE_ALERTE_TONTINE_LABELS,
  ...TYPE_REGLE_TONTINE_LABELS,
  ...TYPE_CAISSE_LABELS,
  ...DISBURSEMENT_CHANNEL_LABELS,
  ...MOTIF_BLOCAGE_LABELS,
  ...DUREE_UNITE_LABELS,
  ...FREQUENCE_VIREMENT_LABELS,
  ...FREQUENCE_TONTINE_LABELS,
  ...FREQUENCE_REMBOURSEMENT_LABELS,
  ...DECISION_COMITE_LABELS,
  ...AVIS_ENQUETEUR_LABELS,
  ...NIVEAU_RISQUE_LABELS,
  ...MODE_CALCUL_PAIE_LABELS,
  ...PRIORITE_ALERTE_TONTINE_LABELS,
  ...SC_METHODE_PAIEMENT_LABELS,

  // --- Labels lowercase (alertes sécurité, audit, etc.) ---
  active: "Actif",
  resolved: "Résolu",
  success: "Succès",
  failure: "Échec",
  pending: "En attente",
  cancelled: "Annulé",
  critical: "Critique",
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
};

/**
 * Mapping universel de toutes les couleurs par statut
 */
export const ALL_STATUS_COLORS: Record<string, string> = {
  // --- Couleurs locales ---
  ...ACCOUNT_STATUS_COLORS,
  ...CLIENT_STATUS_COLORS,
  ...CREDIT_STATUS_COLORS,
  ...CREDIT_REQUEST_STATUS_COLORS,
  ...TRANSACTION_STATUS_COLORS,
  ...TRANSFER_CAISSE_STATUS_COLORS,
  ...TRANSFER_COFFRE_STATUS_COLORS,
  ...TRANSFER_INTER_COFFRE_STATUS_COLORS,
  ...COFFRE_STATUS_COLORS,
  ...USER_STATUS_COLORS,
  ...CLIENT_SEGMENT_COLORS,
  ...PRIORITY_COLORS,
  ...SENS_MOUVEMENT_COLORS,
  ...OPERATION_STATUS_COLORS,
  ...METHODE_PAIEMENT_COLORS,
  ...TYPE_TRANSACTION_EPARGNE_COLORS,
  ...TYPE_OPERATION_CAISSE_COLORS,
  ...TYPE_PAIEMENT_TERRAIN_COLORS,
  ...AGENCY_TYPE_COLORS,
  ...AGENCY_STATUS_COLORS,
  ...ACCOUNT_TYPE_COLORS,

  // --- Couleurs pour les maps importées ---
  ...SESSION_CAISSE_STATUS_COLORS,
  ...ENQUETE_CREDIT_STATUS_COLORS,
  ...OPERATION_TERRAIN_STATUS_COLORS,
  ...OBJECTIF_STATUS_COLORS,
  ...RUN_VIREMENT_STATUS_COLORS,
  ...TACHE_REGULARISATION_STATUS_COLORS,
  ...ECHEANCE_CREDIT_STATUS_COLORS,
  ...DOSSIER_CREDIT_STATUS_COLORS,
  ...REMISE_TERRAIN_STATUS_COLORS,
  ...REEVALUATION_STATUS_COLORS,
  ...CONGE_STATUS_COLORS,
  ...CANDIDATURE_STATUS_COLORS,
  ...CONTRIBUTION_TONTINE_STATUS_COLORS,
  ...TONTINE_STATUS_COLORS,
  ...MEMBRE_TONTINE_STATUS_COLORS,
  ...ALERTE_TONTINE_STATUS_COLORS,
  ...PENALITE_TONTINE_STATUS_COLORS,
  ...ECHEANCE_TONTINE_STATUS_COLORS,
  ...VISITE_TERRAIN_STATUS_COLORS,
  ...PAIEMENT_TERRAIN_STATUS_COLORS,
  ...FACTURE_STATUS_COLORS,
  ...PRESENCE_STATUS_COLORS,
  ...BULLETIN_STATUS_COLORS,
  ...PAIEMENT_COMMISSION_STATUS_COLORS,
  ...SUIVI_FORMATION_STATUS_COLORS,
  ...PLANNING_STATUS_COLORS,
  ...VALIDATION_DEPENSE_STATUS_COLORS,
  ...DECLARATION_TVA_STATUS_COLORS,
  ...ARCHIVE_STATUS_COLORS,
  ...OTP_STATUS_COLORS,
  ...AUDIT_VIREMENT_STATUS_COLORS,

  // --- Couleurs lowercase (alertes sécurité, audit, etc.) ---
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  resolved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  success: "bg-green-500/20 text-green-400 border-green-500/30",
  failure: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  critical: "bg-red-600/20 text-red-500 border-red-600/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};
