/**
 * Variables de rendu pour les opérations, transferts et reçus.
 */
export interface TransferScheduledVars {
  clientName: string;
  amount: string;
  fromAccount?: string;
  toAccount?: string;
  scheduledDate?: string;
}

export interface TransferExecutedVars {
  clientName: string;
  amount: string;
  fromAccount?: string;
  toAccount?: string;
  reference?: string;
}

export interface PaymentReminderVars {
  clientName: string;
  amount: string;
  dueDate: string;
}

export interface TransferRequestedVars {
  userName: string;
  amount: string;
  reference: string;
  typeTransfert: string;
}

export interface TransferRejectedVars {
  userName: string;
  amount: string;
  reference: string;
  reason?: string;
}

export interface ScheduledTransferExecutedVars {
  clientName: string;
  amount: string;
  fromAccount: string;
  toAccount: string;
}

export interface ScheduledTransferFailedVars {
  clientName: string;
  amount: string;
  fromAccount: string;
  errorMessage: string;
  retryInfo: string;
}

export interface ProspectionCreatedVars {
  agentName: string;
  prospectName: string;
  location?: string;
}

export interface PaiementTerrainValidatedVars {
  clientName: string;
  amount: string;
  paymentType: string;
  reference?: string;
}

export interface ReceiptDepositVars {
  clientName: string;
  accountNumber: string;
  amount: string;
  balance: string;
  reference: string;
  date: string;
  agentName?: string;
}

export interface ReceiptWithdrawalVars {
  clientName: string;
  accountNumber: string;
  amount: string;
  balance: string;
  reference: string;
  date: string;
  agentName?: string;
}
