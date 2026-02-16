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
  STATUT_PROSPECTION_LABELS,
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
  PENDING_VALIDATION: "En attente de validation",
  PENDING_PAYMENT: "En attente de paiement",
  PENDING_APPROVAL: "En attente de validation",
  PENDING_PAYMENT_AND_APPROVAL: "En attente paiement & validation",
  SUSPENDED: "Suspendu",
  CLOSED: "Clôturé",
  CANCELLED: "Annulé",
  CLOSURE_PENDING: "Clôture en cours",
};

export const ACCOUNT_STATUS_COLORS: Record<StatutCompteType, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/20",
  PENDING_ACTIVATION: "bg-status-warning-bg text-status-warning border-status-warning/20",
  PENDING_VALIDATION: "bg-status-info-bg text-status-info border-status-info/20",
  PENDING_PAYMENT: "bg-status-warning-bg text-status-warning border-status-warning/20",
  PENDING_APPROVAL: "bg-status-info-bg text-status-info border-status-info/20",
  PENDING_PAYMENT_AND_APPROVAL: "bg-status-warning-bg text-status-warning border-status-warning/20",
  SUSPENDED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CLOSED: "bg-surface-elevated text-content-muted border-transparent",
  CANCELLED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CLOSURE_PENDING: "bg-status-info-bg text-status-info border-status-info/30",
};

// --- Statut Client ---
export const CLIENT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/30",
  INACTIVE: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  SUSPENDED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  DELETED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

// --- Statut Prospection ---
export const PROSPECTION_STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-status-info-bg text-status-info border-status-info/30',
  INTERESTED: 'bg-status-success-bg text-status-success border-status-success/30',
  REFUSED: 'bg-status-danger-bg text-status-danger border-status-danger/30',
  TO_FOLLOW_UP: 'bg-status-warning-bg text-status-warning border-status-warning/30',
  CONVERTED_TO_CLIENT: 'bg-status-info-bg text-status-info border-status-info/30',
};

// --- Segment Client ---
export const CLIENT_SEGMENT_LABELS: Record<string, string> = {
  Standard: "Standard",
  Premium: "Premium",
  VIP: "VIP",
  Risque: "Risqué",
  // Legacy uppercase fallbacks
  STANDARD: "Standard",
  PREMIUM: "Premium",
  RISQUE: "Risqué",
  RISKY: "Risqué",
};

export const CLIENT_SEGMENT_COLORS: Record<string, string> = {
  Standard: "bg-surface-subtle/30 text-content-muted border-edge-strong/20",
  Premium: "bg-status-info-bg text-status-info border-status-info/30",
  VIP: "bg-status-warning-bg text-status-warning border-status-warning/30",
  Risque: "bg-status-danger-bg text-status-danger border-status-danger/30",
  // Legacy uppercase fallbacks
  STANDARD: "bg-surface-subtle/30 text-content-muted border-edge-strong/20",
  PREMIUM: "bg-status-info-bg text-status-info border-status-info/30",
  RISQUE: "bg-status-danger-bg text-status-danger border-status-danger/30",
  RISKY: "bg-status-danger-bg text-status-danger border-status-danger/30",
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
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  ACTIVE: "bg-status-info-bg text-status-info border-status-info/30",
  LATE: "bg-status-danger-bg text-status-danger border-status-danger/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  CLOSED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  WAITING_DISBURSEMENT: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

// --- Statut Demande Crédit ---
export const CREDIT_REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING_FEES: "bg-status-warning-bg text-status-warning border-status-warning/30",
  READY_FOR_INVESTIGATION: "bg-status-info-bg text-status-info border-status-info/30",
  UNDER_INVESTIGATION: "bg-status-info-bg text-status-info border-status-info/30",
  INVESTIGATION_COMPLETE: "bg-accent/10 text-accent border-accent/30",
  PENDING_APPROVAL: "bg-status-warning-bg text-status-warning border-status-warning/30",
  APPROVED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  DISBURSED: "bg-status-success-bg text-status-success border-status-success/30",
  CLOSED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  REEVALUATION_IN_PROGRESS: "bg-status-warning-bg text-status-warning border-status-warning/30",
  APPROVED_AFTER_REEVALUATION: "bg-status-success-bg text-status-success border-status-success/30",
  DEFINITIVELY_REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  DELETED: "bg-status-danger-bg text-status-danger border-status-danger/20",
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
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  PENDING_SETTLEMENT: "bg-status-info-bg text-status-info border-status-info/30",
  POSTED: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  REVERSED: "bg-status-warning-bg text-status-warning border-status-warning/30",
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
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  RECEIVED: "bg-status-info-bg text-status-info border-status-info/30",
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
  REQUESTED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  VALIDATED: "bg-status-info-bg text-status-info border-status-info/30",
  EXECUTED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
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
  DRAFT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  SUBMITTED: "bg-status-info-bg text-status-info border-status-info/30",
  APPROVED_L1: "bg-accent/10 text-accent border-accent/30",
  APPROVED_L2: "bg-accent/10 text-accent border-accent/30",
  IN_TRANSIT: "bg-status-info-bg text-status-info border-status-info/30",
  RECEIVED: "bg-status-success-bg text-status-success border-status-success/30",
  RECEIVED_WITH_DISCREPANCY: "bg-status-warning-bg text-status-warning border-status-warning/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

// --- Statut Coffre ---
export const COFFRE_STATUS_LABELS: Record<StatutCoffreType, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  CLOSED: "Fermé",
};

export const COFFRE_STATUS_COLORS: Record<StatutCoffreType, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/30",
  SUSPENDED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CLOSED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

// --- Statut User ---
export const USER_STATUS_LABELS: Record<StatutUserType, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  SUSPENDED: "Suspendu",
};

export const USER_STATUS_COLORS: Record<StatutUserType, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/30",
  INACTIVE: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  SUSPENDED: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

// --- Priorité ---
export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  NORMAL: "bg-status-info-bg text-status-info border-status-info/30",
  HIGH: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CRITICAL: "bg-status-danger-bg text-status-danger border-status-danger/30",
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
  SUCCESS: "bg-status-success-bg text-status-success border-status-success/30",
  FAILED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

// --- Sens Mouvement ---
export type SensMouvementType = 'DEBIT' | 'CREDIT';

export const SENS_MOUVEMENT_LABELS: Record<SensMouvementType, string> = {
  DEBIT: "Débit",
  CREDIT: "Crédit",
};

export const SENS_MOUVEMENT_COLORS: Record<SensMouvementType, string> = {
  DEBIT: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CREDIT: "bg-status-success-bg text-status-success border-status-success/30",
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
  CASH: "bg-status-success-bg text-status-success border-status-success/30",
  MOBILE_MONEY: "bg-status-info-bg text-status-info border-status-info/30",
  TRANSFER: "bg-status-info-bg text-status-info border-status-info/30",
  CARD: "bg-accent/10 text-accent border-accent/30",
  CHECK: "bg-status-warning-bg text-status-warning border-status-warning/30",
  OTHER: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
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
  DEPOSIT: "bg-status-success-bg text-status-success border-status-success/30",
  WITHDRAWAL: "bg-status-danger-bg text-status-danger border-status-danger/30",
  INTEREST: "bg-status-info-bg text-status-info border-status-info/30",
  FEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  ADJUSTMENT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
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
  | 'INITIAL_DEPOSIT' | 'OPENING_FEE';

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
  OPENING_FEE: "Frais d'ouverture",
};

export const TYPE_OPERATION_CAISSE_COLORS: Record<TypeOperationCaisseType, string> = {
  SAVINGS_DEPOSIT: "bg-status-success-bg text-status-success border-status-success/30",
  SAVINGS_WITHDRAWAL: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CREDIT_DISBURSEMENT: "bg-status-info-bg text-status-info border-status-info/30",
  CREDIT_REPAYMENT: "bg-status-info-bg text-status-info border-status-info/30",
  ENGAGEMENT_FEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  FEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  ADJUSTMENT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  CASH_TRANSFER: "bg-accent/10 text-accent border-accent/30",
  SAFE_SUPPLY: "bg-accent/10 text-accent border-accent/30",
  SAFE_DEPOSIT: "bg-accent/10 text-accent border-accent/30",
  DEPOSIT_SAVINGS: "bg-status-success-bg text-status-success border-status-success/30",
  DEPOSIT_CURRENT: "bg-status-success-bg text-status-success border-status-success/30",
  WITHDRAWAL_CURRENT: "bg-status-danger-bg text-status-danger border-status-danger/30",
  DEPOSIT_BLOCKED: "bg-accent/10 text-accent border-accent/30",
  WITHDRAWAL_BLOCKED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  MISC_COLLECTION: "bg-status-success-bg text-status-success border-status-success/30",
  MISC_DISBURSEMENT: "bg-status-danger-bg text-status-danger border-status-danger/30",
  BANK_FEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  TONTINE_CONTRIBUTION: "bg-accent/10 text-accent border-accent/30",
  TONTINE_WITHDRAWAL: "bg-accent/10 text-accent border-accent/30",
  LOAN_REPAYMENT: "bg-status-info-bg text-status-info border-status-info/30",
  LOAN_DISBURSEMENT: "bg-status-info-bg text-status-info border-status-info/30",
  WITHDRAWAL_SAVINGS: "bg-status-danger-bg text-status-danger border-status-danger/30",
  INITIAL_DEPOSIT: "bg-status-success-bg text-status-success border-status-success/30",
  OPENING_FEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
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
  DEPOSIT_SAVINGS: "bg-status-success-bg text-status-success border-status-success/30",
  DEPOSIT_CURRENT: "bg-status-success-bg text-status-success border-status-success/30",
  DEPOSIT_BLOCKED: "bg-accent/10 text-accent border-accent/30",
  WITHDRAWAL_SAVINGS: "bg-status-danger-bg text-status-danger border-status-danger/30",
  WITHDRAWAL_CURRENT: "bg-status-danger-bg text-status-danger border-status-danger/30",
  WITHDRAWAL_BLOCKED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CREDIT_REPAYMENT: "bg-status-info-bg text-status-info border-status-info/30",
  ENGAGEMENT_FEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CREDIT_DISBURSEMENT: "bg-status-info-bg text-status-info border-status-info/30",
  TONTINE_CONTRIBUTION: "bg-accent/10 text-accent border-accent/30",
  TONTINE_WITHDRAWAL: "bg-accent/10 text-accent border-accent/30",
  SAFE_SUPPLY: "bg-accent/10 text-accent border-accent/30",
  SAFE_DEPOSIT: "bg-accent/10 text-accent border-accent/30",
  TRANSFER_IN: "bg-accent/10 text-accent border-accent/30",
  TRANSFER_OUT: "bg-status-warning-bg text-status-warning border-status-warning/30",
  INITIAL_DEPOSIT: "bg-status-success-bg text-status-success border-status-success/30",
  INTERNAL_TRANSFER: "bg-status-info-bg text-status-info border-status-info/30",
};

// --- Type Agence ---
export const AGENCY_TYPE_LABELS: Record<TypeAgenceType, string> = {
  MAIN: "Agence Principale",
  SECONDARY: "Agence Secondaire",
  KIOSK: "Kiosque",
};

export const AGENCY_TYPE_COLORS: Record<TypeAgenceType, string> = {
  MAIN: "bg-status-info-bg text-status-info border-status-info/30",
  SECONDARY: "bg-surface-subtle/40 text-content-muted border-edge-strong/30",
  KIOSK: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

// --- Statut Agence (couleurs) ---
export const AGENCY_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/30",
  INACTIVE: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  CLOSED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

// --- Type Compte ---
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CURRENT: "Courant",
  SAVINGS: "Épargne",
  BLOCKED: "Bloqué",
};

export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  CURRENT: "bg-status-success-bg text-status-success border-status-success/30",
  SAVINGS: "bg-status-warning-bg text-status-warning border-status-warning/30",
  BLOCKED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

// ============================================
// COULEURS pour les maps importées de status-constants.ts
// ============================================

export const SESSION_CAISSE_STATUS_COLORS: Record<string, string> = {
  REQUESTING_FUNDS: "bg-status-info-bg text-status-info border-status-info/30",
  FUNDS_DISPATCHED: "bg-accent/10 text-accent border-accent/30",
  OPEN: "bg-status-success-bg text-status-success border-status-success/30",
  CLOSING_COUNT: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CLOSING_VALIDATION: "bg-status-warning-bg text-status-warning border-status-warning/30",
  CLOSED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const ENQUETE_CREDIT_STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "bg-status-info-bg text-status-info border-status-info/30",
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  COMPLETED: "bg-accent/10 text-accent border-accent/30",
  APPROVED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  REDUCED: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

export const OPERATION_TERRAIN_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  SUBMITTED: "bg-status-info-bg text-status-info border-status-info/30",
  APPROVED: "bg-status-success-bg text-status-success border-status-success/30",
  PENDING_SETTLEMENT: "bg-status-warning-bg text-status-warning border-status-warning/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  SETTLED: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const OBJECTIF_STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  ACHIEVED: "bg-status-success-bg text-status-success border-status-success/30",
  ABANDONED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const RUN_VIREMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  RUNNING: "bg-status-info-bg text-status-info border-status-info/30",
  SUCCESS: "bg-status-success-bg text-status-success border-status-success/30",
  FAILED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  SKIPPED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const TACHE_REGULARISATION_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-status-warning-bg text-status-warning border-status-warning/30",
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  RESOLVED: "bg-status-success-bg text-status-success border-status-success/30",
  ESCALATED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const ECHEANCE_CREDIT_STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-status-info-bg text-status-info border-status-info/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  LATE: "bg-status-danger-bg text-status-danger border-status-danger/30",
  SETTLED: "bg-status-success-bg text-status-success border-status-success/30",
};

export const DOSSIER_CREDIT_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  SUBMITTED: "bg-status-info-bg text-status-info border-status-info/30",
  PENDING_FEES: "bg-status-warning-bg text-status-warning border-status-warning/30",
  READY_FOR_INVESTIGATION: "bg-accent/10 text-accent border-accent/30",
  UNDER_INVESTIGATION: "bg-status-info-bg text-status-info border-status-info/30",
  INVESTIGATION_COMPLETE: "bg-accent/10 text-accent border-accent/30",
  IN_COMMITTEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  APPROVED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const REMISE_TERRAIN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  SETTLED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const REEVALUATION_STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-status-warning-bg text-status-warning border-status-warning/30",
  ELIGIBILITY_CHECK: "bg-status-info-bg text-status-info border-status-info/30",
  AUTHORIZED: "bg-accent/10 text-accent border-accent/30",
  REFUSED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  ADDITIONAL_INVESTIGATION: "bg-status-info-bg text-status-info border-status-info/30",
  INVESTIGATION_COMPLETE: "bg-accent/10 text-accent border-accent/30",
  IN_COMMITTEE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  APPROVED: "bg-status-success-bg text-status-success border-status-success/30",
  DEFINITIVELY_REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const CONGE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  APPROVED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const CANDIDATURE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  INTERVIEW: "bg-status-info-bg text-status-info border-status-info/30",
  ACCEPTED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const CONTRIBUTION_TONTINE_STATUS_COLORS: Record<string, string> = {
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
  LATE: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

export const TONTINE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/30",
  COMPLETED: "bg-status-info-bg text-status-info border-status-info/30",
  SUSPENDED: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

export const MEMBRE_TONTINE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-status-success-bg text-status-success border-status-success/30",
  INACTIVE: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  EXCLUDED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const ALERTE_TONTINE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-status-danger-bg text-status-danger border-status-danger/30",
  RESOLVED: "bg-status-success-bg text-status-success border-status-success/30",
  IGNORED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const PENALITE_TONTINE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  WAIVED: "bg-status-info-bg text-status-info border-status-info/30",
};

export const ECHEANCE_TONTINE_STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-status-success-bg text-status-success border-status-success/30",
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  UPCOMING: "bg-status-warning-bg text-status-warning border-status-warning/30",
};

export const VISITE_TERRAIN_STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-status-info-bg text-status-info border-status-info/30",
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  COMPLETED: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const PAIEMENT_TERRAIN_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  POSTED: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const FACTURE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const PRESENCE_STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-status-success-bg text-status-success border-status-success/30",
  LATE: "bg-status-warning-bg text-status-warning border-status-warning/30",
  ABSENT: "bg-status-danger-bg text-status-danger border-status-danger/30",
  ON_LEAVE: "bg-status-info-bg text-status-info border-status-info/30",
};

export const BULLETIN_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const PAIEMENT_COMMISSION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  PROCESSING: "bg-status-info-bg text-status-info border-status-info/30",
};

export const SUIVI_FORMATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  COMPLETED: "bg-status-success-bg text-status-success border-status-success/30",
};

export const PLANNING_STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-status-info-bg text-status-info border-status-info/30",
  IN_PROGRESS: "bg-status-info-bg text-status-info border-status-info/30",
  COMPLETED: "bg-status-success-bg text-status-success border-status-success/30",
  CANCELLED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};

export const VALIDATION_DEPENSE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  REJECTED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const DECLARATION_TVA_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  PAID: "bg-status-success-bg text-status-success border-status-success/30",
  LATE: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const ARCHIVE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
};

export const OTP_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-status-warning-bg text-status-warning border-status-warning/30",
  VALIDATED: "bg-status-success-bg text-status-success border-status-success/30",
  EXPIRED: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  FAILED: "bg-status-danger-bg text-status-danger border-status-danger/30",
};

export const AUDIT_VIREMENT_STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-status-success-bg text-status-success border-status-success/30",
  FAILED: "bg-status-danger-bg text-status-danger border-status-danger/30",
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
  fallback = "bg-surface-subtle/40 text-content-muted border-edge-subtle"
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
  ...STATUT_PROSPECTION_LABELS,
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
  ...PROSPECTION_STATUS_COLORS,

  // --- Couleurs lowercase (alertes sécurité, audit, etc.) ---
  active: "bg-status-success-bg text-status-success border-status-success/30",
  resolved: "bg-status-info-bg text-status-info border-status-info/30",
  success: "bg-status-success-bg text-status-success border-status-success/30",
  failure: "bg-status-danger-bg text-status-danger border-status-danger/30",
  pending: "bg-status-warning-bg text-status-warning border-status-warning/30",
  cancelled: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
  critical: "bg-status-danger-bg text-status-danger border-status-danger/30",
  high: "bg-status-warning-bg text-status-warning border-status-warning/30",
  medium: "bg-status-warning-bg text-status-warning border-status-warning/30",
  low: "bg-surface-subtle/40 text-content-muted border-edge-subtle",
};
