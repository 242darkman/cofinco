/**
 * Labels de traduction pour les statuts (EN → FR)
 *
 * Ce fichier centralise tous les mappings de traduction pour afficher
 * les statuts techniques en anglais avec des labels en français dans l'UI.
 *
 * CONVENTION:
 * - Les clés sont les valeurs stockées en base (ANGLAIS, SCREAMING_SNAKE_CASE)
 * - Les valeurs sont les labels affichés à l'utilisateur (Français)
 *
 * UTILISATION:
 *   import { getStatusLabel, ACCOUNT_STATUS_LABELS } from '@/lib/status-labels';
 *   const label = getStatusLabel(status, ACCOUNT_STATUS_LABELS);
 *
 * TYPES STRICTS:
 *   Les constantes de statut sont définies dans @shared/enum/status-constants.ts
 *   Importez-les pour les comparaisons dans la logique métier.
 */

import type {
  StatutCompteType,
  StatutClientType,
  StatutCreditType,
  StatutDemandeType,
  StatutTransactionType,
  StatutTransfertCaisseType,
  StatutTransfertCoffreType,
  StatutTransfertInterCoffreType,
  StatutCoffreType,
  StatutUserType,
  PrioriteType,
  TypeAgenceType,
  StatutAgenceType,
} from '@shared/enum/status-constants';

// ============================================
// STATUT COMPTE
// ============================================

/** Labels pour les statuts de compte - Clés EN uniquement */
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

// ============================================
// STATUT CLIENT
// ============================================

export const CLIENT_STATUS_LABELS: Record<StatutClientType, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  SUSPENDED: "Suspendu",
  DELETED: "Supprimé",
};

export const CLIENT_STATUS_COLORS: Record<StatutClientType, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  INACTIVE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  SUSPENDED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DELETED: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ============================================
// SEGMENT CLIENT
// ============================================

export const CLIENT_SEGMENT_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  PREMIUM: "Premium",
  VIP: "VIP",
  RISQUE: "Risqué",
  RISKY: "Risqué", // Fallback if english is used
};

export const CLIENT_SEGMENT_COLORS: Record<string, string> = {
  STANDARD: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  PREMIUM: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  VIP: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  RISQUE: "bg-red-500/20 text-red-400 border-red-500/30",
  RISKY: "bg-red-500/20 text-red-400 border-red-500/30",
};


// ============================================
// STATUT CREDIT
// ============================================

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

// ============================================
// STATUT DEMANDE CREDIT
// ============================================

export const CREDIT_REQUEST_STATUS_LABELS: Record<StatutDemandeType, string> = {
  PENDING_FEES: "En attente des frais",
  READY_FOR_INVESTIGATION: "Prêt pour enquête",
  UNDER_INVESTIGATION: "En cours d'enquête",
  INVESTIGATION_COMPLETE: "Enquête terminée",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
  CANCELLED: "Annulée",
  DISBURSED: "Décaissée",
  CLOSED: "Clôturée",
  REEVALUATION_IN_PROGRESS: "Réévaluation en cours",
  APPROVED_AFTER_REEVALUATION: "Approuvée (réévaluation)",
  DEFINITIVELY_REJECTED: "Rejetée définitivement",
  DELETED: "Supprimée",
};

export const CREDIT_REQUEST_STATUS_COLORS: Record<StatutDemandeType, string> = {
  PENDING_FEES: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  READY_FOR_INVESTIGATION: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  UNDER_INVESTIGATION: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  INVESTIGATION_COMPLETE: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
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

// ============================================
// STATUT TRANSACTION
// ============================================

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

// ============================================
// STATUT TRANSFERT CAISSE
// ============================================

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

// ============================================
// STATUT TRANSFERT COFFRE
// ============================================

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

// ============================================
// STATUT TRANSFERT INTER-COFFRE
// ============================================

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

// ============================================
// STATUT COFFRE
// ============================================

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

// ============================================
// STATUT USER
// ============================================

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

// ============================================
// PRIORITÉ
// ============================================

export const PRIORITY_LABELS: Record<PrioriteType, string> = {
  LOW: "Basse",
  NORMAL: "Normale",
  HIGH: "Haute",
  CRITICAL: "Critique",
};

export const PRIORITY_COLORS: Record<PrioriteType, string> = {
  LOW: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  NORMAL: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ============================================
// STATUT OPERATION CAISSE (for TransactionsList)
// ============================================

/** Type for operation status (used in TransactionsList) */
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

// ============================================
// SENS MOUVEMENT
// ============================================

/** Type for movement direction */
export type SensMouvementType = 'DEBIT' | 'CREDIT';

export const SENS_MOUVEMENT_LABELS: Record<SensMouvementType, string> = {
  DEBIT: "Débit",
  CREDIT: "Crédit",
};

export const SENS_MOUVEMENT_COLORS: Record<SensMouvementType, string> = {
  DEBIT: "bg-red-500/20 text-red-400 border-red-500/30",
  CREDIT: "bg-green-500/20 text-green-400 border-green-500/30",
};

// ============================================
// METHODE DE PAIEMENT
// ============================================

export type MethodePaiementType = 'CASH' | 'MOBILE_MONEY' | 'TRANSFER' | 'CARD' | 'CHECK' | 'OTHER';

export const METHODE_PAIEMENT_LABELS: Record<MethodePaiementType, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  TRANSFER: "Virement",
  CARD: "Carte",
  CHECK: "Chèque",
  OTHER: "Autre",
};

export const METHODE_PAIEMENT_COLORS: Record<MethodePaiementType, string> = {
  CASH: "bg-green-500/20 text-green-400 border-green-500/30",
  MOBILE_MONEY: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  TRANSFER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  CARD: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  CHECK: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  OTHER: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ============================================
// TYPE TRANSACTION EPARGNE
// ============================================

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

// ============================================
// TYPE OPERATION CAISSE
// ============================================

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

// ============================================
// TYPE PAIEMENT TERRAIN
// ============================================

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

// ============================================
// TYPE AGENCE
// ============================================

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

// ============================================
// STATUT AGENCE
// ============================================

export const AGENCY_STATUS_LABELS: Record<StatutAgenceType, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  CLOSED: "Fermé",
};

export const AGENCY_STATUS_COLORS: Record<StatutAgenceType, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
  INACTIVE: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  CLOSED: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ============================================
// TYPE COMPTE (Labels FR pour types de compte)
// ============================================

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

/**
 * Mapping universel pour détection automatique du type de statut
 * Utile pour un composant StatusBadge générique
 */
export const ALL_STATUS_LABELS: Record<string, string> = {
  ...ACCOUNT_STATUS_LABELS,
  ...CLIENT_STATUS_LABELS,
  ...CREDIT_STATUS_LABELS,
  ...CREDIT_REQUEST_STATUS_LABELS,
  ...TRANSACTION_STATUS_LABELS,
  ...TRANSFER_CAISSE_STATUS_LABELS,
  ...TRANSFER_COFFRE_STATUS_LABELS,
  ...TRANSFER_INTER_COFFRE_STATUS_LABELS,
  ...COFFRE_STATUS_LABELS,
  ...USER_STATUS_LABELS,
  ...CLIENT_SEGMENT_LABELS,
  ...PRIORITY_LABELS,
  ...SENS_MOUVEMENT_LABELS,
  ...OPERATION_STATUS_LABELS,
  ...METHODE_PAIEMENT_LABELS,
  ...TYPE_TRANSACTION_EPARGNE_LABELS,
  ...TYPE_OPERATION_CAISSE_LABELS,
  ...TYPE_PAIEMENT_TERRAIN_LABELS,
  ...AGENCY_TYPE_LABELS,
  ...AGENCY_STATUS_LABELS,
};

export const ALL_STATUS_COLORS: Record<string, string> = {
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
};
