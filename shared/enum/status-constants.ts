/**
 * Constantes de statut standardisées (ANGLAIS)
 *
 * Ce fichier définit les valeurs canoniques des statuts en ANGLAIS.
 * Les enums PostgreSQL dans enums.ts utilisent les mêmes valeurs EN (SCREAMING_SNAKE_CASE).
 *
 * CONVENTION:
 * - Valeurs en base: SCREAMING_SNAKE_CASE en anglais
 * - Labels UI: Mappés via status-labels.ts ou *_LABELS records (français)
 */

// ============================================
// TYPE AGENCE
// ============================================

export const TypeAgence = {
  MAIN: "MAIN",
  SECONDARY: "SECONDARY",
  KIOSK: "KIOSK",
} as const;

export type TypeAgenceType = (typeof TypeAgence)[keyof typeof TypeAgence];

// ============================================
// STATUT AGENCE
// ============================================

export const StatutAgence = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  CLOSED: "CLOSED",
} as const;

export type StatutAgenceType = (typeof StatutAgence)[keyof typeof StatutAgence];

/** Labels FR pour l'UI des statuts d'agence */
export const STATUT_AGENCE_LABELS: Record<StatutAgenceType, string> = {
  [StatutAgence.ACTIVE]: "Actif",
  [StatutAgence.INACTIVE]: "Inactif",
  [StatutAgence.CLOSED]: "Fermé",
};

// ============================================
// STATUT COMPTE (Comptes bancaires)
// ============================================

export const StatutCompte = {
  ACTIVE: "ACTIVE",
  PENDING_ACTIVATION: "PENDING_ACTIVATION",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutCompteType = (typeof StatutCompte)[keyof typeof StatutCompte];



// ============================================
// STATUT CLIENT
// ============================================

export const StatutClient = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  DELETED: "DELETED",
} as const;

export type StatutClientType = (typeof StatutClient)[keyof typeof StatutClient];

/** Labels FR pour l'UI des statuts client */
export const STATUT_CLIENT_LABELS: Record<StatutClientType, string> = {
  [StatutClient.ACTIVE]: "Actif",
  [StatutClient.INACTIVE]: "Inactif",
  [StatutClient.SUSPENDED]: "Suspendu",
  [StatutClient.DELETED]: "Supprimé",
};



// ============================================
// STATUT CREDIT (Prêts actifs)
// ============================================

export const StatutCredit = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  LATE: "LATE",
  PAID: "PAID",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutCreditType = (typeof StatutCredit)[keyof typeof StatutCredit];

// ============================================
// TYPE CREDIT (Catégorie de crédit)
// ============================================

export const TypeCredit = {
  PERSONAL: "PERSONAL",
  REAL_ESTATE: "REAL_ESTATE",
  COMMERCIAL: "COMMERCIAL",
} as const;

export type TypeCreditType = (typeof TypeCredit)[keyof typeof TypeCredit];

/** Labels FR pour l'UI des types de crédit */
export const TYPE_CREDIT_LABELS: Record<TypeCreditType, string> = {
  [TypeCredit.PERSONAL]: "Personnel",
  [TypeCredit.REAL_ESTATE]: "Immobilier",
  [TypeCredit.COMMERCIAL]: "Accompagnement (Commercial)",
};

/** Options de type crédit pour les selects de l'UI */
export const TYPE_CREDIT_OPTIONS = Object.entries(TYPE_CREDIT_LABELS).map(
  ([value, label]) => ({ value, label })
);

// ============================================
// STATUT DEMANDE CREDIT (Workflow demande)
// ============================================

export const StatutDemande = {
  PENDING_FEES: "PENDING_FEES",
  READY_FOR_INVESTIGATION: "READY_FOR_INVESTIGATION",
  UNDER_INVESTIGATION: "UNDER_INVESTIGATION",
  INVESTIGATION_COMPLETE: "INVESTIGATION_COMPLETE",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  DISBURSED: "DISBURSED",
  CLOSED: "CLOSED",
  // Réévaluation
  REEVALUATION_IN_PROGRESS: "REEVALUATION_IN_PROGRESS",
  APPROVED_AFTER_REEVALUATION: "APPROVED_AFTER_REEVALUATION",
  DEFINITIVELY_REJECTED: "DEFINITIVELY_REJECTED",
  DELETED: "DELETED",
} as const;

export type StatutDemandeType = (typeof StatutDemande)[keyof typeof StatutDemande];

/** Labels FR pour l'UI des statuts de demande de crédit */
export const STATUT_DEMANDE_LABELS: Record<StatutDemandeType, string> = {
  [StatutDemande.PENDING_FEES]: "En attente des frais",
  [StatutDemande.READY_FOR_INVESTIGATION]: "Prêt pour enquête",
  [StatutDemande.UNDER_INVESTIGATION]: "En cours d'enquête",
  [StatutDemande.INVESTIGATION_COMPLETE]: "Enquête terminée",
  [StatutDemande.APPROVED]: "Approuvée",
  [StatutDemande.REJECTED]: "Rejetée",
  [StatutDemande.CANCELLED]: "Annulée",
  [StatutDemande.DISBURSED]: "Décaissée",
  [StatutDemande.CLOSED]: "Clôturée",
  [StatutDemande.REEVALUATION_IN_PROGRESS]: "Réévaluation en cours",
  [StatutDemande.APPROVED_AFTER_REEVALUATION]: "Approuvée après réévaluation",
  [StatutDemande.DEFINITIVELY_REJECTED]: "Rejetée définitivement",
  [StatutDemande.DELETED]: "Supprimée",
};



// ============================================
// STATUT TRANSACTION
// ============================================

export const StatutTransaction = {
  PENDING: "PENDING",
  POSTED: "POSTED",
  CANCELLED: "CANCELLED",
  REVERSED: "REVERSED",
} as const;

export type StatutTransactionType = (typeof StatutTransaction)[keyof typeof StatutTransaction];



// ============================================
// STATUT TRANSFERT CAISSE
// ============================================

export const StatutTransfertCaisse = {
  PENDING: "PENDING",
  VALIDATED: "VALIDATED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  RECEIVED: "RECEIVED",
} as const;

export type StatutTransfertCaisseType = (typeof StatutTransfertCaisse)[keyof typeof StatutTransfertCaisse];



// ============================================
// STATUT TRANSFERT COFFRE
// ============================================

export const StatutTransfertCoffre = {
  REQUESTED: "REQUESTED",
  VALIDATED: "VALIDATED",
  EXECUTED: "EXECUTED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutTransfertCoffreType = (typeof StatutTransfertCoffre)[keyof typeof StatutTransfertCoffre];



// ============================================
// STATUT TRANSFERT INTER-COFFRE
// ============================================

export const StatutTransfertInterCoffre = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED_L1: "APPROVED_L1",
  APPROVED_L2: "APPROVED_L2",
  IN_TRANSIT: "IN_TRANSIT",
  RECEIVED: "RECEIVED",
  RECEIVED_WITH_DISCREPANCY: "RECEIVED_WITH_DISCREPANCY",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutTransfertInterCoffreType = (typeof StatutTransfertInterCoffre)[keyof typeof StatutTransfertInterCoffre];



// ============================================
// STATUT COFFRE
// ============================================

export const StatutCoffre = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
} as const;

export type StatutCoffreType = (typeof StatutCoffre)[keyof typeof StatutCoffre];

// ============================================
// TYPE MOUVEMENT COFFRE (Opérations sur coffre-fort)
// ============================================

export const TypeMouvementCoffre = {
  SORTIE_COFFRE: "SORTIE_COFFRE",
  ENTREE_COFFRE: "ENTREE_COFFRE",
  SORTIE_CAISSE: "SORTIE_CAISSE",
  ENTREE_CAISSE: "ENTREE_CAISSE",
  SORTIE_COFFRE_TRANSIT: "SORTIE_COFFRE_TRANSIT",
  ENTREE_COFFRE_RECEPTION: "ENTREE_COFFRE_RECEPTION",
  SAFE_SUPPLY: "SAFE_SUPPLY",
  SAFE_DEPOSIT: "SAFE_DEPOSIT",
  CREDIT_DISBURSEMENT: "CREDIT_DISBURSEMENT",
  TRANSFER_OUT: "TRANSFER_OUT",
  TRANSFER_IN: "TRANSFER_IN",
} as const;

export type TypeMouvementCoffreType = (typeof TypeMouvementCoffre)[keyof typeof TypeMouvementCoffre];

/** Labels FR pour l'UI des types de mouvement coffre */
export const TYPE_MOUVEMENT_COFFRE_LABELS: Record<string, string> = {
  [TypeMouvementCoffre.SORTIE_COFFRE]: "Sortie Coffre",
  [TypeMouvementCoffre.ENTREE_COFFRE]: "Entrée Coffre",
  [TypeMouvementCoffre.SORTIE_CAISSE]: "Sortie Caisse",
  [TypeMouvementCoffre.ENTREE_CAISSE]: "Entrée Caisse",
  [TypeMouvementCoffre.SORTIE_COFFRE_TRANSIT]: "Transit Sortant",
  [TypeMouvementCoffre.ENTREE_COFFRE_RECEPTION]: "Réception Transit",
  [TypeMouvementCoffre.SAFE_SUPPLY]: "Approvisionnement Coffre",
  [TypeMouvementCoffre.SAFE_DEPOSIT]: "Dépôt Coffre",
  [TypeMouvementCoffre.CREDIT_DISBURSEMENT]: "Décaissement Crédit",
  [TypeMouvementCoffre.TRANSFER_OUT]: "Transfert Sortant",
  [TypeMouvementCoffre.TRANSFER_IN]: "Transfert Entrant",
};

/**
 * Obtient le label FR pour un type de mouvement coffre
 */
export function getMouvementCoffreLabel(type: string | null | undefined): string {
  if (!type) return "Opération";
  return TYPE_MOUVEMENT_COFFRE_LABELS[type] || type;
}

// ============================================
// STATUT CAISSE (Caisses principales)
// ============================================

export const StatutCaisse = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

export type StatutCaisseType = (typeof StatutCaisse)[keyof typeof StatutCaisse];



// ============================================
// STATUT CAISSE AGENT
// ============================================

export const StatutCaisseAgent = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
  /** Statut calculé (computed) - non persisté en DB, utilisé pour filtrer les sessions ouvertes */
  OPEN: "OPEN",
} as const;

export type StatutCaisseAgentType = (typeof StatutCaisseAgent)[keyof typeof StatutCaisseAgent];



// ============================================
// STATUT OPÉRATION TERRAIN (Agent collecte)
// ============================================

export const StatutOperationTerrain = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SETTLED: "SETTLED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutOperationTerrainType = (typeof StatutOperationTerrain)[keyof typeof StatutOperationTerrain];



// ============================================
// TYPE OPÉRATION TERRAIN (Agent collecte)
// ============================================

export const TypeOperationTerrain = {
  TONTINE_CONTRIBUTION: "TONTINE_CONTRIBUTION",
  LOAN_REPAYMENT: "LOAN_REPAYMENT",
  SAVINGS_DEPOSIT: "SAVINGS_DEPOSIT",
  DEPOSIT_CURRENT: "DEPOSIT_CURRENT",
  ENGAGEMENT_FEE: "ENGAGEMENT_FEE",
  MISC_COLLECTION: "MISC_COLLECTION",
} as const;

export type TypeOperationTerrainType = (typeof TypeOperationTerrain)[keyof typeof TypeOperationTerrain];

/** Labels FR pour l'UI des opérations terrain */
export const TYPE_OPERATION_TERRAIN_LABELS: Record<TypeOperationTerrainType, string> = {
  [TypeOperationTerrain.TONTINE_CONTRIBUTION]: "Cotisation Tontine",
  [TypeOperationTerrain.LOAN_REPAYMENT]: "Remboursement Crédit",
  [TypeOperationTerrain.SAVINGS_DEPOSIT]: "Dépôt Épargne",
  [TypeOperationTerrain.DEPOSIT_CURRENT]: "Dépôt Compte Courant",
  [TypeOperationTerrain.ENGAGEMENT_FEE]: "Frais Engagement Crédit",
  [TypeOperationTerrain.MISC_COLLECTION]: "Encaissement Divers",
};



// ============================================
// STATUT USER
// ============================================

export const StatutUser = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type StatutUserType = (typeof StatutUser)[keyof typeof StatutUser];



// ============================================
// STATUT RECONCILIATION
// ============================================

export const StatutReconciliation = {
  PENDING: "PENDING",
  RECONCILED: "RECONCILED",
  DISCREPANCY_DETECTED: "DISCREPANCY_DETECTED",
} as const;

export type StatutReconciliationType = (typeof StatutReconciliation)[keyof typeof StatutReconciliation];



// ============================================
// STATUT TACHE REGULARISATION
// ============================================

export const StatutTacheRegularisation = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  ESCALATED: "ESCALATED",
} as const;

export type StatutTacheRegularisationType = (typeof StatutTacheRegularisation)[keyof typeof StatutTacheRegularisation];



// ============================================
// STATUT ENQUETE CREDIT
// ============================================

export const StatutEnquete = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REDUCED: "REDUCED",
} as const;

export type StatutEnqueteType = (typeof StatutEnquete)[keyof typeof StatutEnquete];



// ============================================
// PRIORITE
// ============================================

export const Priorite = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;

export type PrioriteType = (typeof Priorite)[keyof typeof Priorite];



// ============================================
// STATUT PARTICIPATION TONTINE
// ============================================

export const StatutParticipationTontine = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  DROPPED: "DROPPED",
  PENDING: "PENDING",
} as const;

export type StatutParticipationTontineType = (typeof StatutParticipationTontine)[keyof typeof StatutParticipationTontine];



// ============================================
// MÉTHODES DE PAIEMENT
// ============================================

export const MethodePaiement = {
  CASH: "CASH",
  CHECK: "CHECK",
  TRANSFER: "TRANSFER",
  MOBILE_MONEY: "MOBILE_MONEY",
} as const;

export type MethodePaiementType = (typeof MethodePaiement)[keyof typeof MethodePaiement];

/** Labels FR pour l'affichage UI des méthodes de paiement */
export const METHODE_PAIEMENT_LABELS: Record<MethodePaiementType, string> = {
  [MethodePaiement.CASH]: "Espèces",
  [MethodePaiement.CHECK]: "Chèque",
  [MethodePaiement.TRANSFER]: "Virement",
  [MethodePaiement.MOBILE_MONEY]: "Mobile Money",
};



// ============================================
// MOTIF BLOCAGE COMPTE
// ============================================

export const MotifBlocage = {
  LOAN_GUARANTEE: "LOAN_GUARANTEE",
  TONTINE_GUARANTEE: "TONTINE_GUARANTEE",
  FORCED_SAVINGS: "FORCED_SAVINGS",
  INTERNAL_DECISION: "INTERNAL_DECISION",
  DISPUTE: "DISPUTE",
  OTHER: "OTHER",
} as const;

export type MotifBlocageType = (typeof MotifBlocage)[keyof typeof MotifBlocage];

/** Labels FR pour l'UI des motifs de blocage */
export const MOTIF_BLOCAGE_LABELS: Record<MotifBlocageType, string> = {
  [MotifBlocage.LOAN_GUARANTEE]: "Garantie crédit",
  [MotifBlocage.TONTINE_GUARANTEE]: "Garantie tontine",
  [MotifBlocage.FORCED_SAVINGS]: "Épargne forcée",
  [MotifBlocage.INTERNAL_DECISION]: "Décision interne",
  [MotifBlocage.DISPUTE]: "Litige",
  [MotifBlocage.OTHER]: "Autre",
};

// ============================================
// TYPE COMPTE (Database Values)
// ============================================

export const TypeCompte = {
  CURRENT: "CURRENT",
  SAVINGS: "SAVINGS",
  BLOCKED: "BLOCKED",
} as const;

export type TypeCompteType = (typeof TypeCompte)[keyof typeof TypeCompte];

// ============================================
// DUREE UNITE
// ============================================

export const DureeUnite = {
  DAY: "DAY",
  WEEK: "WEEK",
  MONTH: "MONTH",
} as const;

export type DureeUniteType = (typeof DureeUnite)[keyof typeof DureeUnite];

// ============================================
// TYPES DE TRANSACTION ÉPARGNE
// ============================================

export const TypeTransactionEpargne = {
  // Dépôts (entrées)
  DEPOSIT_SAVINGS: "DEPOSIT_SAVINGS",
  DEPOSIT_CURRENT: "DEPOSIT_CURRENT",
  DEPOSIT_BLOCKED: "DEPOSIT_BLOCKED",
  INITIAL_DEPOSIT: "INITIAL_DEPOSIT",
  SAVINGS_DEPOSIT: "SAVINGS_DEPOSIT",
  // Retraits (sorties)
  WITHDRAWAL_SAVINGS: "WITHDRAWAL_SAVINGS",
  WITHDRAWAL_CURRENT: "WITHDRAWAL_CURRENT",
  WITHDRAWAL_BLOCKED: "WITHDRAWAL_BLOCKED",
  SAVINGS_WITHDRAWAL: "SAVINGS_WITHDRAWAL",
} as const;

export type TypeTransactionEpargneType = (typeof TypeTransactionEpargne)[keyof typeof TypeTransactionEpargne];

/** Types considérés comme des entrées (dépôts) */
export const DEPOSIT_TYPES: TypeTransactionEpargneType[] = [
  TypeTransactionEpargne.DEPOSIT_SAVINGS,
  TypeTransactionEpargne.DEPOSIT_CURRENT,
  TypeTransactionEpargne.DEPOSIT_BLOCKED,
  TypeTransactionEpargne.INITIAL_DEPOSIT,
  TypeTransactionEpargne.SAVINGS_DEPOSIT,
];

/** Types considérés comme des sorties (retraits) */
export const WITHDRAWAL_TYPES: TypeTransactionEpargneType[] = [
  TypeTransactionEpargne.WITHDRAWAL_SAVINGS,
  TypeTransactionEpargne.WITHDRAWAL_CURRENT,
  TypeTransactionEpargne.WITHDRAWAL_BLOCKED,
  TypeTransactionEpargne.SAVINGS_WITHDRAWAL,
];

/**
 * Détermine si un type de transaction est un dépôt
 */
export function isDepositType(type: string | null | undefined): boolean {
  if (!type) return false;
  return (DEPOSIT_TYPES as string[]).includes(type) || type.includes('DEPOSIT') || type.includes('Dépôt');
}

/**
 * Détermine si un type de transaction est un retrait
 */
export function isWithdrawalType(type: string | null | undefined): boolean {
  if (!type) return false;
  return (WITHDRAWAL_TYPES as string[]).includes(type) || 
         type.includes('WITHDRAWAL') || 
         type.includes('Retrait') ||
         type.includes('TRANSFER_OUT') ||
         type.includes('CREDIT_REPAYMENT') ||
         type.includes('TONTINE_CONTRIBUTION') ||
         type.includes('FEE');
}

// ============================================
// TYPES D'OPÉRATIONS CAISSE
// ============================================

/**
 * Types d'opérations caisse standardisés (valeurs EN)
 * Utilisés pour les opérations de guichet/caisse
 */
export const TypeOperationCaisse = {
  // Tontines
  TONTINE_CONTRIBUTION: "TONTINE_CONTRIBUTION",
  TONTINE_WITHDRAWAL: "TONTINE_WITHDRAWAL",
  // Crédits
  LOAN_REPAYMENT: "LOAN_REPAYMENT",
  CREDIT_REPAYMENT: "CREDIT_REPAYMENT",
  LOAN_DISBURSEMENT: "LOAN_DISBURSEMENT",
  CREDIT_DISBURSEMENT: "CREDIT_DISBURSEMENT",
  ENGAGEMENT_FEE: "ENGAGEMENT_FEE",
  // Comptes épargne
  DEPOSIT_SAVINGS: "DEPOSIT_SAVINGS",
  WITHDRAWAL_SAVINGS: "WITHDRAWAL_SAVINGS",
  SAVINGS_DEPOSIT: "SAVINGS_DEPOSIT",
  SAVINGS_WITHDRAWAL: "SAVINGS_WITHDRAWAL",
  // Comptes courants
  DEPOSIT_CURRENT: "DEPOSIT_CURRENT",
  WITHDRAWAL_CURRENT: "WITHDRAWAL_CURRENT",
  // Comptes bloqués
  DEPOSIT_BLOCKED: "DEPOSIT_BLOCKED",
  WITHDRAWAL_BLOCKED: "WITHDRAWAL_BLOCKED",
  // Divers
  MISC_COLLECTION: "MISC_COLLECTION",
  MISC_DISBURSEMENT: "MISC_DISBURSEMENT",
  BANK_FEE: "BANK_FEE",
  FEE: "FEE",
  // Transferts
  CASH_TRANSFER: "CASH_TRANSFER",
  SAFE_SUPPLY: "SAFE_SUPPLY",
  SAFE_DEPOSIT: "SAFE_DEPOSIT",
  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",
  // Autres
  INITIAL_DEPOSIT: "INITIAL_DEPOSIT",
  ADJUSTMENT: "ADJUSTMENT",
} as const;

export type TypeOperationCaisseType = (typeof TypeOperationCaisse)[keyof typeof TypeOperationCaisse];

/**
 * Configuration des opérations pour l'UI de caisse
 * - value: Valeur enum EN (stockée en base)
 * - label: Label affiché à l'utilisateur (FR)
 * - isEntree: true = entrée d'argent en caisse, false = sortie
 */
export const TYPES_OPERATIONS_CAISSE = [
  { value: TypeOperationCaisse.TONTINE_CONTRIBUTION, label: "Cotisation Tontine", isEntree: true },
  { value: TypeOperationCaisse.TONTINE_WITHDRAWAL, label: "Retrait Tontine", isEntree: false },
  { value: TypeOperationCaisse.LOAN_REPAYMENT, label: "Remboursement Prêt", isEntree: true },
  { value: TypeOperationCaisse.CREDIT_DISBURSEMENT, label: "Décaissement Prêt", isEntree: false },
  { value: TypeOperationCaisse.DEPOSIT_SAVINGS, label: "Versement Compte Épargne", isEntree: true },
  { value: TypeOperationCaisse.WITHDRAWAL_SAVINGS, label: "Retrait Compte Épargne", isEntree: false },
  { value: TypeOperationCaisse.DEPOSIT_CURRENT, label: "Versement Compte Courant", isEntree: true },
  { value: TypeOperationCaisse.WITHDRAWAL_CURRENT, label: "Retrait Compte Courant", isEntree: false },
  { value: TypeOperationCaisse.DEPOSIT_BLOCKED, label: "Versement Compte Bloqué", isEntree: true },
  { value: TypeOperationCaisse.WITHDRAWAL_BLOCKED, label: "Retrait Compte Bloqué", isEntree: false },
  { value: TypeOperationCaisse.MISC_COLLECTION, label: "Encaissement Divers", isEntree: true },
  { value: TypeOperationCaisse.MISC_DISBURSEMENT, label: "Décaissement Divers", isEntree: false },
  { value: TypeOperationCaisse.BANK_FEE, label: "Frais Bancaires", isEntree: true },
] as const;

/** Mapping label FR -> value EN pour rétrocompatibilité */


/**
 * Obtient le label FR pour un type d'opération EN
 */
export function getOperationCaisseLabel(value: string): string {
  const found = TYPES_OPERATIONS_CAISSE.find(t => t.value === value);
  return found?.label || value;
}

/**
 * Vérifie si un type d'opération est une entrée d'argent en caisse
 */
export function isOperationCaisseEntree(value: string): boolean {
  // Vérifier par valeur EN
  const found = TYPES_OPERATIONS_CAISSE.find(t => t.value === value);
  if (found) return found.isEntree;

  return true; // Par défaut entrée
}



/**
 * Vérifie si un statut correspond à ACTIVE
 */
export function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === StatutClient.ACTIVE ||
         status === StatutCompte.ACTIVE ||
         status === StatutParticipationTontine.ACTIVE;
}



// ============================================
// STATUT VISITE TERRAIN
// ============================================

export const StatutVisiteTerrain = {
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutVisiteTerrainType = (typeof StatutVisiteTerrain)[keyof typeof StatutVisiteTerrain];

/** Labels FR pour l'UI des statuts de visite terrain */
export const STATUT_VISITE_TERRAIN_LABELS: Record<StatutVisiteTerrainType, string> = {
  [StatutVisiteTerrain.PLANNED]: "Planifiée",
  [StatutVisiteTerrain.IN_PROGRESS]: "En cours",
  [StatutVisiteTerrain.COMPLETED]: "Effectuée",
  [StatutVisiteTerrain.CANCELLED]: "Annulée",
};

/** Options de statut pour les selects de l'UI */
export const STATUT_VISITE_TERRAIN_OPTIONS = Object.entries(STATUT_VISITE_TERRAIN_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// TYPE VISITE TERRAIN
// ============================================

export const TypeVisiteTerrain = {
  LOAN_RECOVERY: "LOAN_RECOVERY",
  SAVINGS_COLLECTION: "SAVINGS_COLLECTION",
  TONTINE_COLLECTION: "TONTINE_COLLECTION",
  PROSPECTION: "PROSPECTION",
  FOLLOW_UP: "FOLLOW_UP",
  TRAINING: "TRAINING",
  OTHER: "OTHER",
} as const;

export type TypeVisiteTerrainType = (typeof TypeVisiteTerrain)[keyof typeof TypeVisiteTerrain];

/** Labels FR pour l'UI des types de visite terrain */
export const TYPE_VISITE_TERRAIN_LABELS: Record<TypeVisiteTerrainType, string> = {
  [TypeVisiteTerrain.LOAN_RECOVERY]: "Recouvrement prêt",
  [TypeVisiteTerrain.SAVINGS_COLLECTION]: "Collecte épargne",
  [TypeVisiteTerrain.TONTINE_COLLECTION]: "Collecte ristourne",
  [TypeVisiteTerrain.PROSPECTION]: "Prospection",
  [TypeVisiteTerrain.FOLLOW_UP]: "Suivi",
  [TypeVisiteTerrain.TRAINING]: "Formation",
  [TypeVisiteTerrain.OTHER]: "Autre",
};

/** Options de type pour les selects de l'UI */
export const TYPE_VISITE_TERRAIN_OPTIONS = Object.entries(TYPE_VISITE_TERRAIN_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT TONTINE (Groupe de cotisation)
// ============================================

export const StatutTontine = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  SUSPENDED: "SUSPENDED",
} as const;

export type StatutTontineType = (typeof StatutTontine)[keyof typeof StatutTontine];

/** Labels FR pour l'UI des statuts de tontine */
export const STATUT_TONTINE_LABELS: Record<StatutTontineType, string> = {
  [StatutTontine.ACTIVE]: "Active",
  [StatutTontine.COMPLETED]: "Terminée",
  [StatutTontine.SUSPENDED]: "Suspendue",
};

/** Options de statut pour les selects de l'UI */
export const STATUT_TONTINE_OPTIONS = Object.entries(STATUT_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// FREQUENCE TONTINE (Périodicité des cotisations)
// ============================================

export const FrequenceTontine = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MONTHLY: "MONTHLY",
} as const;

export type FrequenceTontineType = (typeof FrequenceTontine)[keyof typeof FrequenceTontine];

/** Labels FR pour l'UI des fréquences de tontine */
export const FREQUENCE_TONTINE_LABELS: Record<FrequenceTontineType, string> = {
  [FrequenceTontine.DAILY]: "Journalier",
  [FrequenceTontine.WEEKLY]: "Hebdomadaire",
  [FrequenceTontine.BIWEEKLY]: "Bimensuel",
  [FrequenceTontine.MONTHLY]: "Mensuel",
};

/** Options de fréquence pour les selects de l'UI */
export const FREQUENCE_TONTINE_OPTIONS = Object.entries(FREQUENCE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT CONTRIBUTION TONTINE (Paiements individuels)
// ============================================

export const StatutContributionTontine = {
  VALIDATED: "VALIDATED",
  PENDING: "PENDING",
  REJECTED: "REJECTED",
  LATE: "LATE",
} as const;

export type StatutContributionTontineType = (typeof StatutContributionTontine)[keyof typeof StatutContributionTontine];

/** Labels FR pour l'UI des statuts de contribution */
export const STATUT_CONTRIBUTION_TONTINE_LABELS: Record<StatutContributionTontineType, string> = {
  [StatutContributionTontine.VALIDATED]: "Validée",
  [StatutContributionTontine.PENDING]: "En attente",
  [StatutContributionTontine.REJECTED]: "Rejetée",
  [StatutContributionTontine.LATE]: "En retard",
};

/** Options de statut contribution pour les selects de l'UI */
export const STATUT_CONTRIBUTION_TONTINE_OPTIONS = Object.entries(STATUT_CONTRIBUTION_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// TYPE DISTRIBUTION TONTINE (Méthode d'attribution du bénéfice)
// ============================================

export const TypeDistributionTontine = {
  ORDER: "ORDER",         // Attribution par ordre de position
  RANDOM: "RANDOM",       // Attribution aléatoire
  FIXED: "FIXED",         // Attribution fixe/prédéfinie
  ROTATING: "ROTATING",   // Attribution rotative
} as const;

export type TypeDistributionTontineType = (typeof TypeDistributionTontine)[keyof typeof TypeDistributionTontine];

/** Labels FR pour l'UI des types de distribution */
export const TYPE_DISTRIBUTION_TONTINE_LABELS: Record<TypeDistributionTontineType, string> = {
  [TypeDistributionTontine.ORDER]: "Par ordre",
  [TypeDistributionTontine.RANDOM]: "Aléatoire",
  [TypeDistributionTontine.FIXED]: "Fixe",
  [TypeDistributionTontine.ROTATING]: "Rotatif",
};

/** Options de type distribution pour les selects de l'UI */
export const TYPE_DISTRIBUTION_TONTINE_OPTIONS = Object.entries(TYPE_DISTRIBUTION_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);

// ============================================
// MODE DISTRIBUTION TONTINE (Canal de versement gain)
// ============================================

export const ModeDistributionTontine = {
  CASH_WITHDRAWAL: "CASH_WITHDRAWAL",
  ACCOUNT_TRANSFER: "ACCOUNT_TRANSFER",
} as const;

export type ModeDistributionTontineType = (typeof ModeDistributionTontine)[keyof typeof ModeDistributionTontine];

/** Labels FR pour l'UI des modes de distribution */
export const MODE_DISTRIBUTION_TONTINE_LABELS: Record<ModeDistributionTontineType, string> = {
  [ModeDistributionTontine.CASH_WITHDRAWAL]: "Retrait espèces",
  [ModeDistributionTontine.ACCOUNT_TRANSFER]: "Virement sur compte",
};

/** Options de mode distribution pour les selects de l'UI */
export const MODE_DISTRIBUTION_TONTINE_OPTIONS = Object.entries(MODE_DISTRIBUTION_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT MEMBRE TONTINE (État d'un membre dans un groupe)
// ============================================

export const StatutMembreTontine = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  EXCLUDED: "EXCLUDED",
} as const;

export type StatutMembreTontineType = (typeof StatutMembreTontine)[keyof typeof StatutMembreTontine];

/** Labels FR pour l'UI des statuts de membre */
export const STATUT_MEMBRE_TONTINE_LABELS: Record<StatutMembreTontineType, string> = {
  [StatutMembreTontine.ACTIVE]: "Actif",
  [StatutMembreTontine.INACTIVE]: "Inactif",
  [StatutMembreTontine.EXCLUDED]: "Exclu",
};

/** Options de statut membre pour les selects de l'UI */
export const STATUT_MEMBRE_TONTINE_OPTIONS = Object.entries(STATUT_MEMBRE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// PRIORITE ALERTE TONTINE
// ============================================

export const PrioriteAlerteTontine = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

export type PrioriteAlerteTontineType = (typeof PrioriteAlerteTontine)[keyof typeof PrioriteAlerteTontine];

/** Labels FR pour l'UI des priorités d'alerte */
export const PRIORITE_ALERTE_TONTINE_LABELS: Record<PrioriteAlerteTontineType, string> = {
  [PrioriteAlerteTontine.LOW]: "Basse",
  [PrioriteAlerteTontine.NORMAL]: "Normale",
  [PrioriteAlerteTontine.HIGH]: "Haute",
  [PrioriteAlerteTontine.URGENT]: "Urgente",
};

/** Options de priorité pour les selects de l'UI */
export const PRIORITE_ALERTE_TONTINE_OPTIONS = Object.entries(PRIORITE_ALERTE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT ALERTE TONTINE
// ============================================

export const StatutAlerteTontine = {
  ACTIVE: "ACTIVE",
  RESOLVED: "RESOLVED",
  IGNORED: "IGNORED",
} as const;

export type StatutAlerteTontineType = (typeof StatutAlerteTontine)[keyof typeof StatutAlerteTontine];

/** Labels FR pour l'UI des statuts d'alerte */
export const STATUT_ALERTE_TONTINE_LABELS: Record<StatutAlerteTontineType, string> = {
  [StatutAlerteTontine.ACTIVE]: "Active",
  [StatutAlerteTontine.RESOLVED]: "Résolue",
  [StatutAlerteTontine.IGNORED]: "Ignorée",
};

/** Options de statut alerte pour les selects de l'UI */
export const STATUT_ALERTE_TONTINE_OPTIONS = Object.entries(STATUT_ALERTE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// TYPE ALERTE TONTINE (Catégories d'alertes)
// ============================================

export const TypeAlerteTontine = {
  PAYMENT_LATE: "PAYMENT_LATE",
  DEADLINE_NEAR: "DEADLINE_NEAR",
  CYCLE_COMPLETE: "CYCLE_COMPLETE",
  MEMBER_DROPOUT: "MEMBER_DROPOUT",
  DISTRIBUTION_DUE: "DISTRIBUTION_DUE",
} as const;

export type TypeAlerteTontineType = (typeof TypeAlerteTontine)[keyof typeof TypeAlerteTontine];

/** Labels FR pour l'UI des types d'alerte */
export const TYPE_ALERTE_TONTINE_LABELS: Record<TypeAlerteTontineType, string> = {
  [TypeAlerteTontine.PAYMENT_LATE]: "Retard de paiement",
  [TypeAlerteTontine.DEADLINE_NEAR]: "Échéance proche",
  [TypeAlerteTontine.CYCLE_COMPLETE]: "Tour complété",
  [TypeAlerteTontine.MEMBER_DROPOUT]: "Membre inactif",
  [TypeAlerteTontine.DISTRIBUTION_DUE]: "Distribution requise",
};

/** Options de type alerte pour les selects de l'UI */
export const TYPE_ALERTE_TONTINE_OPTIONS = Object.entries(TYPE_ALERTE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT PENALITE TONTINE
// ============================================

export const StatutPenaliteTontine = {
  PENDING: "PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  WAIVED: "WAIVED",
} as const;

export type StatutPenaliteTontineType = (typeof StatutPenaliteTontine)[keyof typeof StatutPenaliteTontine];

/** Labels FR pour l'UI des statuts de pénalité */
export const STATUT_PENALITE_TONTINE_LABELS: Record<StatutPenaliteTontineType, string> = {
  [StatutPenaliteTontine.PENDING]: "En attente",
  [StatutPenaliteTontine.PAID]: "Payée",
  [StatutPenaliteTontine.CANCELLED]: "Annulée",
  [StatutPenaliteTontine.WAIVED]: "Exonérée",
};

/** Options de statut pénalité pour les selects de l'UI */
export const STATUT_PENALITE_TONTINE_OPTIONS = Object.entries(STATUT_PENALITE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// TYPE REGLE TONTINE (Types de règles/frais)
// ============================================

export const TypeRegleTontine = {
  LATE_PENALTY: "LATE_PENALTY",
  MEMBERSHIP_FEE: "MEMBERSHIP_FEE",
  EXIT_FEE: "EXIT_FEE",
  FINE: "FINE",
} as const;

export type TypeRegleTontineType = (typeof TypeRegleTontine)[keyof typeof TypeRegleTontine];

/** Labels FR pour l'UI des types de règles */
export const TYPE_REGLE_TONTINE_LABELS: Record<TypeRegleTontineType, string> = {
  [TypeRegleTontine.LATE_PENALTY]: "Pénalité de retard",
  [TypeRegleTontine.MEMBERSHIP_FEE]: "Frais d'adhésion",
  [TypeRegleTontine.EXIT_FEE]: "Frais de sortie",
  [TypeRegleTontine.FINE]: "Amende",
};

/** Options de type règle pour les selects de l'UI */
export const TYPE_REGLE_TONTINE_OPTIONS = Object.entries(TYPE_REGLE_TONTINE_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT ECHEANCE TONTINE (État d'un tour/cycle)
// ============================================

export const StatutEcheanceTontine = {
  COMPLETED: "COMPLETED",
  IN_PROGRESS: "IN_PROGRESS",
  UPCOMING: "UPCOMING",
} as const;

export type StatutEcheanceTontineType = (typeof StatutEcheanceTontine)[keyof typeof StatutEcheanceTontine];

/** Labels FR pour l'UI des statuts d'échéance */
export const STATUT_ECHEANCE_TONTINE_LABELS: Record<StatutEcheanceTontineType, string> = {
  [StatutEcheanceTontine.COMPLETED]: "Terminé",
  [StatutEcheanceTontine.IN_PROGRESS]: "En cours",
  [StatutEcheanceTontine.UPCOMING]: "À venir",
};



// ============================================
// FREQUENCE VIREMENT (Périodicité des virements programmés)
// ============================================

export const FrequenceVirement = {
  ONCE: "ONCE",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;

export type FrequenceVirementType = (typeof FrequenceVirement)[keyof typeof FrequenceVirement];

/** Labels FR pour l'UI des fréquences de virement */
export const FREQUENCE_VIREMENT_LABELS: Record<FrequenceVirementType, string> = {
  [FrequenceVirement.ONCE]: "Une fois",
  [FrequenceVirement.DAILY]: "Journalier",
  [FrequenceVirement.WEEKLY]: "Hebdomadaire",
  [FrequenceVirement.MONTHLY]: "Mensuel",
};

/** Options de fréquence pour les selects de l'UI */
export const FREQUENCE_VIREMENT_OPTIONS = Object.entries(FREQUENCE_VIREMENT_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT AUDIT VIREMENT (Résultat d'exécution)
// ============================================

export const StatutAuditVirement = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;

export type StatutAuditVirementType = (typeof StatutAuditVirement)[keyof typeof StatutAuditVirement];

/** Labels FR pour l'UI des statuts d'audit */
export const STATUT_AUDIT_VIREMENT_LABELS: Record<StatutAuditVirementType, string> = {
  [StatutAuditVirement.SUCCESS]: "Succès",
  [StatutAuditVirement.FAILED]: "Échec",
};



// ============================================
// TYPE TACHE REGULARISATION
// ============================================

export const TypeTacheRegularisation = {
  ECART_RECEPTION: "ECART_RECEPTION",
  RECONCILIATION_EN_ATTENTE: "RECONCILIATION_EN_ATTENTE",
  VIREMENT_PROG_ECHEC: "VIREMENT_PROG_ECHEC",
  VIREMENT_AUTO_ECHEC: "VIREMENT_AUTO_ECHEC",
  ECART_COFFRE_CAISSE: "ECART_COFFRE_CAISSE",
} as const;

export type TypeTacheRegularisationType = (typeof TypeTacheRegularisation)[keyof typeof TypeTacheRegularisation];

/** Labels FR pour l'UI des types de tâches */
export const TYPE_TACHE_REGULARISATION_LABELS: Record<TypeTacheRegularisationType, string> = {
  [TypeTacheRegularisation.ECART_RECEPTION]: "Écart à la réception",
  [TypeTacheRegularisation.RECONCILIATION_EN_ATTENTE]: "Réconciliation en attente",
  [TypeTacheRegularisation.VIREMENT_PROG_ECHEC]: "Virement programmé échoué",
  [TypeTacheRegularisation.VIREMENT_AUTO_ECHEC]: "Virement automatique échoué",
  [TypeTacheRegularisation.ECART_COFFRE_CAISSE]: "Écart coffre-caisse",
};

/** Labels FR pour l'UI des statuts de tâches de régularisation */
export const STATUT_TACHE_REGULARISATION_LABELS: Record<StatutTacheRegularisationType, string> = {
  [StatutTacheRegularisation.OPEN]: "Ouverte",
  [StatutTacheRegularisation.IN_PROGRESS]: "En cours",
  [StatutTacheRegularisation.RESOLVED]: "Résolue",
  [StatutTacheRegularisation.ESCALATED]: "Escaladée",
};

/** Labels FR pour l'UI des priorités */
export const PRIORITE_LABELS: Record<PrioriteType, string> = {
  [Priorite.LOW]: "Basse",
  [Priorite.NORMAL]: "Normale",
  [Priorite.HIGH]: "Haute",
  [Priorite.CRITICAL]: "Critique",
};




// ============================================
// STATUT REEVALUATION (Workflow réévaluation crédit)
// ============================================

export const StatutReevaluation = {
  REQUESTED: "REQUESTED",
  ELIGIBILITY_CHECK: "ELIGIBILITY_CHECK",
  AUTHORIZED: "AUTHORIZED",
  REFUSED: "REFUSED",
  ADDITIONAL_INVESTIGATION: "ADDITIONAL_INVESTIGATION",
  INVESTIGATION_COMPLETE: "INVESTIGATION_COMPLETE",
  IN_COMMITTEE: "IN_COMMITTEE",
  APPROVED: "APPROVED",
  DEFINITIVELY_REJECTED: "DEFINITIVELY_REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutReevaluationType = (typeof StatutReevaluation)[keyof typeof StatutReevaluation];

/** Labels FR pour l'UI des statuts de réévaluation */
export const STATUT_REEVALUATION_LABELS: Record<StatutReevaluationType, string> = {
  [StatutReevaluation.REQUESTED]: "Demandée",
  [StatutReevaluation.ELIGIBILITY_CHECK]: "Éligibilité en cours",
  [StatutReevaluation.AUTHORIZED]: "Autorisée",
  [StatutReevaluation.REFUSED]: "Refusée",
  [StatutReevaluation.ADDITIONAL_INVESTIGATION]: "Enquête complémentaire",
  [StatutReevaluation.INVESTIGATION_COMPLETE]: "Enquête terminée",
  [StatutReevaluation.IN_COMMITTEE]: "En comité",
  [StatutReevaluation.APPROVED]: "Approuvée",
  [StatutReevaluation.DEFINITIVELY_REJECTED]: "Rejetée définitivement",
  [StatutReevaluation.CANCELLED]: "Annulée",
};



// ============================================
// DECISION COMITE REEVALUATION
// ============================================

export const DecisionComite = {
  APPROVED: "APPROVED",
  REDUCED_AMOUNT: "REDUCED_AMOUNT",
  REJECTED: "REJECTED",
} as const;

export type DecisionComiteType = (typeof DecisionComite)[keyof typeof DecisionComite];

/** Labels FR pour l'UI des décisions comité */
export const DECISION_COMITE_LABELS: Record<DecisionComiteType, string> = {
  [DecisionComite.APPROVED]: "Approuvée",
  [DecisionComite.REDUCED_AMOUNT]: "Montant réduit",
  [DecisionComite.REJECTED]: "Rejetée",
};



// ============================================
// FREQUENCE REMBOURSEMENT (Périodicité des échéances)
// ============================================

export const FrequenceRemboursement = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  BI_MONTHLY: "BI_MONTHLY",
  QUARTERLY: "QUARTERLY",
} as const;

export type FrequenceRemboursementType = (typeof FrequenceRemboursement)[keyof typeof FrequenceRemboursement];

/** Labels FR pour l'UI des fréquences de remboursement */
export const FREQUENCE_REMBOURSEMENT_LABELS: Record<FrequenceRemboursementType, string> = {
  [FrequenceRemboursement.DAILY]: "Journalier",
  [FrequenceRemboursement.WEEKLY]: "Hebdomadaire",
  [FrequenceRemboursement.MONTHLY]: "Mensuel",
  [FrequenceRemboursement.BI_MONTHLY]: "Bimestriel (60j)",
  [FrequenceRemboursement.QUARTERLY]: "Trimestriel",
};

/** Options de fréquence pour les selects de l'UI */
export const FREQUENCE_REMBOURSEMENT_OPTIONS = Object.entries(FREQUENCE_REMBOURSEMENT_LABELS).map(
  ([value, label]) => ({ value, label })
);



// ============================================
// STATUT CONGE (Demandes de congés HR)
// ============================================

export const StatutConge = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutCongeType = (typeof StatutConge)[keyof typeof StatutConge];

/** Labels FR pour l'UI des statuts de congé */
export const STATUT_CONGE_LABELS: Record<StatutCongeType, string> = {
  [StatutConge.PENDING]: "En attente",
  [StatutConge.APPROVED]: "Approuvé",
  [StatutConge.REJECTED]: "Refusé",
  [StatutConge.CANCELLED]: "Annulé",
};



// ============================================
// STATUT CANDIDATURE (Recrutement HR)
// ============================================

export const StatutCandidature = {
  PENDING: "PENDING",
  INTERVIEW: "INTERVIEW",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export type StatutCandidatureType = (typeof StatutCandidature)[keyof typeof StatutCandidature];

/** Labels FR pour l'UI des statuts de candidature */
export const STATUT_CANDIDATURE_LABELS: Record<StatutCandidatureType, string> = {
  [StatutCandidature.PENDING]: "En attente",
  [StatutCandidature.INTERVIEW]: "Entretien",
  [StatutCandidature.ACCEPTED]: "Accepté",
  [StatutCandidature.REJECTED]: "Refusé",
};


// ============================================
// STATUT ECHEANCE CREDIT (État des échéances de prêt)
// ============================================

export const StatutEcheanceCredit = {
  UPCOMING: "UPCOMING",
  PAID: "PAID",
  LATE: "LATE",
  SETTLED: "SETTLED",
} as const;

export type StatutEcheanceCreditType = (typeof StatutEcheanceCredit)[keyof typeof StatutEcheanceCredit];

/** Labels FR pour l'UI des statuts d'échéance */
export const STATUT_ECHEANCE_CREDIT_LABELS: Record<StatutEcheanceCreditType, string> = {
  [StatutEcheanceCredit.UPCOMING]: "A venir",
  [StatutEcheanceCredit.PAID]: "Payé",
  [StatutEcheanceCredit.LATE]: "Retard",
  [StatutEcheanceCredit.SETTLED]: "Soldé",
};



// ============================================
// STATUT ARCHIVE (Archivage HR)
// ============================================

export const StatutArchive = {
  PENDING: "PENDING",
  VALIDATED: "VALIDATED",
} as const;

export type StatutArchiveType = (typeof StatutArchive)[keyof typeof StatutArchive];

/** Labels FR pour l'UI des statuts d'archive */
export const STATUT_ARCHIVE_LABELS: Record<StatutArchiveType, string> = {
  [StatutArchive.PENDING]: "En attente",
  [StatutArchive.VALIDATED]: "Validé",
};



// ============================================
// STATUT OTP (Validation OTP)
// ============================================

export const StatutOtp = {
  PENDING: "PENDING",
  VALIDATED: "VALIDATED",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
} as const;

export type StatutOtpType = (typeof StatutOtp)[keyof typeof StatutOtp];

/** Labels FR pour l'UI des statuts OTP */
export const STATUT_OTP_LABELS: Record<StatutOtpType, string> = {
  [StatutOtp.PENDING]: "En attente",
  [StatutOtp.VALIDATED]: "Validé",
  [StatutOtp.EXPIRED]: "Expiré",
  [StatutOtp.FAILED]: "Échoué",
};



// ============================================
// STATUT PAIEMENT TERRAIN (Paiements collectés sur le terrain)
// ============================================

export const StatutPaiementTerrain = {
  PENDING: "PENDING",
  POSTED: "POSTED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutPaiementTerrainType = (typeof StatutPaiementTerrain)[keyof typeof StatutPaiementTerrain];

/** Labels FR pour l'UI des statuts de paiement terrain */
export const STATUT_PAIEMENT_TERRAIN_LABELS: Record<StatutPaiementTerrainType, string> = {
  [StatutPaiementTerrain.PENDING]: "En attente",
  [StatutPaiementTerrain.POSTED]: "Posté",
  [StatutPaiementTerrain.CANCELLED]: "Annulé",
};



// ============================================
// STATUT FACTURE
// ============================================

export const StatutFacture = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export type StatutFactureType = (typeof StatutFacture)[keyof typeof StatutFacture];

/** Labels FR pour l'UI des statuts de facture */
export const STATUT_FACTURE_LABELS: Record<StatutFactureType, string> = {
  [StatutFacture.DRAFT]: "Brouillon",
  [StatutFacture.PENDING]: "En attente",
  [StatutFacture.PAID]: "Payée",
  [StatutFacture.CANCELLED]: "Annulée",
};



// ============================================
// TYPE DOCUMENT (Facturation)
// ============================================

export const TypeDocument = {
  INVOICE: "INVOICE",
  RECEIPT: "RECEIPT",
  QUOTE: "QUOTE",
} as const;

export type TypeDocumentType = (typeof TypeDocument)[keyof typeof TypeDocument];

/** Labels FR pour l'UI des types de document */
export const TYPE_DOCUMENT_LABELS: Record<TypeDocumentType, string> = {
  [TypeDocument.INVOICE]: "Facture",
  [TypeDocument.RECEIPT]: "Reçu",
  [TypeDocument.QUOTE]: "Devis",
};



// ============================================
// STATUT PRESENCE (Pointage HR)
// ============================================

export const StatutPresence = {
  PRESENT: "PRESENT",
  LATE: "LATE",
  ABSENT: "ABSENT",
  ON_LEAVE: "ON_LEAVE",
} as const;

export type StatutPresenceType = (typeof StatutPresence)[keyof typeof StatutPresence];

/** Labels FR pour l'UI des statuts de présence */
export const STATUT_PRESENCE_LABELS: Record<StatutPresenceType, string> = {
  [StatutPresence.PRESENT]: "Présent",
  [StatutPresence.LATE]: "Retard",
  [StatutPresence.ABSENT]: "Absent",
  [StatutPresence.ON_LEAVE]: "En congé",
};



// ============================================
// STATUT BULLETIN PAIE
// ============================================

export const StatutBulletin = {
  DRAFT: "DRAFT",
  VALIDATED: "VALIDATED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export type StatutBulletinType = (typeof StatutBulletin)[keyof typeof StatutBulletin];

/** Labels FR pour l'UI des statuts de bulletin */
export const STATUT_BULLETIN_LABELS: Record<StatutBulletinType, string> = {
  [StatutBulletin.DRAFT]: "Brouillon",
  [StatutBulletin.VALIDATED]: "Validé",
  [StatutBulletin.PAID]: "Payé",
  [StatutBulletin.CANCELLED]: "Annulé",
};



// ============================================
// MODE CALCUL PAIE
// ============================================

// ============================================
// STATUT PAIEMENT COMMISSION (Commissions agents)
// ============================================

export const StatutPaiementCommission = {
  PENDING: "PENDING",
  PAID: "PAID",
  PROCESSING: "PROCESSING",
} as const;

export type StatutPaiementCommissionType = (typeof StatutPaiementCommission)[keyof typeof StatutPaiementCommission];

/** Labels FR pour l'UI des statuts de paiement commission */
export const STATUT_PAIEMENT_COMMISSION_LABELS: Record<StatutPaiementCommissionType, string> = {
  [StatutPaiementCommission.PENDING]: "En attente",
  [StatutPaiementCommission.PAID]: "Payé",
  [StatutPaiementCommission.PROCESSING]: "En traitement",
};



// ============================================
// STATUT SUIVI FORMATION (Progression formation agent)
// ============================================

export const StatutSuiviFormation = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export type StatutSuiviFormationType = (typeof StatutSuiviFormation)[keyof typeof StatutSuiviFormation];

/** Labels FR pour l'UI des statuts de suivi formation */
export const STATUT_SUIVI_FORMATION_LABELS: Record<StatutSuiviFormationType, string> = {
  [StatutSuiviFormation.PENDING]: "Non commencé",
  [StatutSuiviFormation.IN_PROGRESS]: "En cours",
  [StatutSuiviFormation.COMPLETED]: "Complété",
};



// ============================================
// STATUT PLANNING AGENT
// ============================================

export const StatutPlanning = {
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type StatutPlanningType = (typeof StatutPlanning)[keyof typeof StatutPlanning];

/** Labels FR pour l'UI des statuts de planning */
export const STATUT_PLANNING_LABELS: Record<StatutPlanningType, string> = {
  [StatutPlanning.PLANNED]: "Planifié",
  [StatutPlanning.IN_PROGRESS]: "En cours",
  [StatutPlanning.COMPLETED]: "Complété",
  [StatutPlanning.CANCELLED]: "Annulé",
};



// ============================================
// STATUT VALIDATION DEPENSE
// ============================================

export const StatutValidationDepense = {
  PENDING: "PENDING",
  VALIDATED: "VALIDATED",
  REJECTED: "REJECTED",
} as const;

export type StatutValidationDepenseType = (typeof StatutValidationDepense)[keyof typeof StatutValidationDepense];

/** Labels FR pour l'UI des statuts de validation dépense */
export const STATUT_VALIDATION_DEPENSE_LABELS: Record<StatutValidationDepenseType, string> = {
  [StatutValidationDepense.PENDING]: "En attente",
  [StatutValidationDepense.VALIDATED]: "Validée",
  [StatutValidationDepense.REJECTED]: "Rejetée",
};



// ============================================
// STATUT DECLARATION TVA
// ============================================

export const StatutDeclarationTVA = {
  DRAFT: "DRAFT",
  VALIDATED: "VALIDATED",
  PAID: "PAID",
  LATE: "LATE",
} as const;

export type StatutDeclarationTVAType = (typeof StatutDeclarationTVA)[keyof typeof StatutDeclarationTVA];

/** Labels FR pour l'UI des statuts de déclaration TVA */
export const STATUT_DECLARATION_TVA_LABELS: Record<StatutDeclarationTVAType, string> = {
  [StatutDeclarationTVA.DRAFT]: "Brouillon",
  [StatutDeclarationTVA.VALIDATED]: "Validé",
  [StatutDeclarationTVA.PAID]: "Payé",
  [StatutDeclarationTVA.LATE]: "En retard",
};



// ============================================
// STATUT OBJECTIF (Agent Objectifs & Savings Goals)
// ============================================

export const StatutObjectif = {
  IN_PROGRESS: "IN_PROGRESS",
  ACHIEVED: "ACHIEVED",
  ABANDONED: "ABANDONED",
} as const;

export type StatutObjectifType = (typeof StatutObjectif)[keyof typeof StatutObjectif];

/** Labels FR pour l'UI des statuts d'objectif */
export const STATUT_OBJECTIF_LABELS: Record<StatutObjectifType, string> = {
  [StatutObjectif.IN_PROGRESS]: "En cours",
  [StatutObjectif.ACHIEVED]: "Atteint",
  [StatutObjectif.ABANDONED]: "Abandonné",
};



export const ModeCalculPaie = {
  MONTHLY: "MONTHLY",
  HOURLY: "HOURLY",
  DAILY: "DAILY",
} as const;

export type ModeCalculPaieType = (typeof ModeCalculPaie)[keyof typeof ModeCalculPaie];

/** Labels FR pour l'UI des modes de calcul */
export const MODE_CALCUL_PAIE_LABELS: Record<ModeCalculPaieType, string> = {
  [ModeCalculPaie.MONTHLY]: "Mensuel",
  [ModeCalculPaie.HOURLY]: "Horaire",
  [ModeCalculPaie.DAILY]: "Journalier",
};
