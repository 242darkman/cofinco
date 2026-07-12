/**
 * Variables de rendu pour les notifications liées aux crédits.
 */
export interface CreditApprovalVars {
  clientName: string;
  amount: string;
  creditNumber?: string;
  appName?: string;
}

export interface CreditRejectionVars {
  clientName: string;
  creditNumber?: string;
  reason?: string;
}

export interface CreditDisbursementVars {
  clientName: string;
  amount: string;
  creditNumber?: string;
  channel?: string;
}

export interface CreditOverdueVars {
  clientName: string;
  amount: string;
  dueDate: string;
  daysOverdue?: string;
  creditNumber?: string;
}

export interface CreditApplicationReceivedVars {
  clientName: string;
  amount: string;
  creditNumber: string;
  appName?: string;
}

export interface CreditInvestigationAssignedVars {
  clientName: string;
  creditNumber: string;
  agentName?: string;
}

export interface CreditPaymentReminderVars {
  clientName: string;
  amount: string;
  dueDate: string;
  creditNumber: string;
}

export interface CreditPaidOffVars {
  clientName: string;
  creditNumber: string;
  totalPaid: string;
}

export interface CreditRefundApprovedVars {
  clientName: string;
  amount: string;
  reference: string;
}

export interface CreditRefundPaidVars {
  clientName: string;
  amount: string;
  reference: string;
}
