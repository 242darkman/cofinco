
// Import standardized status constants
import {
  StatutCompte as StatutCompteConst,
  type MotifBlocageType,
  type StatutCompteType,
  type SuspensionReasonType,
  type TypeCompteType
} from "@shared/enum/status-constants";


// Types - Ré-export des constantes de statut pour cohérence
export type TypeCompte = TypeCompteType;

export type StatutCompte = StatutCompteType;

export type MotifBlocage = MotifBlocageType;

// Transitions de la machine d'états (using EN constants)
// ACTIVE -> SUSPENDED (suspension) | CLOSURE_PENDING (clôture)
// SUSPENDED -> ACTIVE (levée) | CLOSURE_PENDING (clôture)
// CLOSURE_PENDING -> ACTIVE (annulation) | CLOSED (finalisation)
// PENDING_PAYMENT -> ACTIVE (paiement complet) | CANCELLED (annulation)
// PENDING_APPROVAL -> ACTIVE (validation) | CANCELLED (rejet)
// PENDING_PAYMENT_AND_APPROVAL -> PENDING_PAYMENT | PENDING_APPROVAL | ACTIVE | CANCELLED

export const VALID_TRANSITIONS: Record<string, string[]> = {
  [StatutCompteConst.ACTIVE]: [StatutCompteConst.SUSPENDED, StatutCompteConst.CLOSURE_PENDING],
  [StatutCompteConst.SUSPENDED]: [StatutCompteConst.ACTIVE, StatutCompteConst.CLOSURE_PENDING],
  [StatutCompteConst.CLOSURE_PENDING]: [StatutCompteConst.ACTIVE, StatutCompteConst.CLOSED],
  [StatutCompteConst.CLOSED]: [], // État terminal
  [StatutCompteConst.CANCELLED]: [], // État terminal
  // Nouveaux statuts
  [StatutCompteConst.PENDING_PAYMENT]: [StatutCompteConst.ACTIVE, StatutCompteConst.CANCELLED],
  [StatutCompteConst.PENDING_APPROVAL]: [StatutCompteConst.ACTIVE, StatutCompteConst.CANCELLED],
  [StatutCompteConst.PENDING_PAYMENT_AND_APPROVAL]: [
    StatutCompteConst.PENDING_PAYMENT,
    StatutCompteConst.PENDING_APPROVAL,
    StatutCompteConst.ACTIVE,
    StatutCompteConst.CANCELLED,
  ],
  // Legacy (kept for existing data)
  [StatutCompteConst.PENDING_ACTIVATION]: [StatutCompteConst.ACTIVE, StatutCompteConst.CLOSED],
  [StatutCompteConst.PENDING_VALIDATION]: [StatutCompteConst.PENDING_ACTIVATION, StatutCompteConst.CANCELLED],
};

// ============================================================================
// Opening Snapshot Type & recomputeAccountStatus
// ============================================================================

export interface OpeningSnapshot {
  openingFee: number;
  minInitialDeposit: number;
  initialDepositRequired: boolean;
  requiresApproval: boolean;
  maintenanceFee: number;
  closingFee: number;
  produitCode: string;
  produitNom: string;
}

export interface CreateCompteData {
  clientId: string;
  typeCompte: TypeCompte;
  agenceId: string;
  produitId?: string;
  soldeInitial?: number;
  blocageActif?: boolean;
  blocageMotif?: MotifBlocage;
  blocageReference?: string;
}

export interface DepotRetraitData {
  compteId: string;
  montant: number;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}

export interface TransfertAgenceData {
  compteId: string;
  nouvelleAgenceId: string;
  motif?: string;
}

export interface DeblocageData {
  compteId: string;
  motif?: string;
}

// Errors
export class CompteError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "CompteError";
  }
}

// ============================================================================
// SUSPENSION / UNSUSPENSION (Account Lifecycle)
// ============================================================================

export interface SuspendCompteData {
  compteId: string;
  reasonCode: SuspensionReasonType;
  reasonText?: string;
  autoLift?: boolean;
  endDate?: Date;
  reviewRequired?: boolean;
}

