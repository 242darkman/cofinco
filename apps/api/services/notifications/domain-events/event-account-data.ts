/**
 * Payloads des événements de comptes, épargne et clôtures.
 */
export interface AccountCreatedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  montantInitial: number;
  modePaiement: string;
  agenceId?: string;
  createdByUserId?: string;
}

export interface AccountActivatedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  montantDepose: number;
  agenceId?: string;
}

export interface AccountDepositData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  montant: number;
  nouveauSolde: string;
  agenceId?: string;
}

export interface AccountWithdrawalData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  montant: number;
  nouveauSolde: string;
  agenceId?: string;
}

export interface AccountBlockedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  motif: string;
  dateFin?: string;
  agenceId?: string;
}

export interface AccountUnblockedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  agenceId?: string;
}

export interface AccountClosedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  agenceId?: string;
}

export interface InterestCapitalizedData {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montantInteret: number;
  nouveauSolde: string;
  agenceId?: string;
}

export interface AccountSuspendedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  reasonCode: string;
  agenceId?: string;
}

export interface AccountUnsuspendedData {
  compteId: string;
  numeroCompte: string;
  typeCompte: string;
  clientId: string;
  agenceId?: string;
}

export interface ClosureInitiatedData {
  compteId: string;
  requestId: string;
  payoutMethod: string;
  payoutAmount: string;
}

export interface ClosureApprovedData {
  compteId: string;
  requestId: string;
  approvedBy: string;
}
