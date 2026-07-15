/**
 * Variables de rendu pour les notifications de comptes et d'épargne.
 */
export interface SavingsConfirmedVars {
  clientName: string;
  amount: string;
  balance: string;
}

export interface AccountCreatedVars {
  clientName: string;
  accountNumber: string;
  accountType: string;
  amount?: string;
}

export interface AccountActivatedVars {
  clientName: string;
  accountNumber: string;
  accountType: string;
  amount: string;
}

export interface AccountDepositVars {
  clientName: string;
  accountNumber: string;
  amount: string;
  balance: string;
}

export interface AccountWithdrawalVars {
  clientName: string;
  accountNumber: string;
  amount: string;
  balance: string;
}

export interface AccountBlockedVars {
  clientName: string;
  accountNumber: string;
  motif: string;
  dateFin?: string;
}

export interface AccountUnblockedVars {
  clientName: string;
  accountNumber: string;
}

export interface AccountClosedVars {
  clientName: string;
  accountNumber: string;
  accountType: string;
}

export interface InterestCapitalizedVars {
  clientName: string;
  accountNumber: string;
  interestAmount: string;
  newBalance: string;
}
