/**
 * Variables de rendu pour les notifications de tontine.
 */
export interface TontineReminderVars {
  clientName: string;
  tontineName: string;
  meetingDate: string;
  amount: string;
}

export interface TontineMemberJoinedVars {
  clientName: string;
  tontineName: string;
  amount: string;
  frequence: string;
  position?: string;
}

export interface TontineContributionReceivedVars {
  clientName: string;
  tontineName: string;
  amount: string;
  tourNumero?: string;
  reference?: string;
}

export interface TontineContributionOverdueVars {
  clientName: string;
  tontineName: string;
  amount: string;
  dueDate: string;
  daysOverdue: string;
}

export interface TontinePenaltyAppliedVars {
  clientName: string;
  tontineName: string;
  montantPenalite: string;
  motif: string;
}

export interface TontineDistributionApprovedVars {
  clientName: string;
  tontineName: string;
  amount: string;
  payoutMethod: string;
}

export interface TontineDistributionPaidVars {
  clientName: string;
  tontineName: string;
  amount: string;
  reference: string;
  payoutMethod: string;
}

export interface TontineCycleStartedVars {
  clientName: string;
  tontineName: string;
  cycleNumber: string;
  startDate: string;
}
