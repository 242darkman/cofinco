/**
 * Payloads des événements liés aux adhésions, contributions et distributions de tontine.
 */
export interface TontineMemberJoinedData {
  tontineId: string;
  tontineName: string;
  clientId: string;
  montantCotisation: number;
  frequence: string;
  position?: number;
  agenceId?: string;
}

export interface TontineContributionReceivedData {
  tontineId: string;
  tontineName: string;
  clientId: string;
  montant: number;
  tourNumero?: number;
  reference?: string;
  agenceId?: string;
}

export interface TontineContributionOverdueData {
  tontineId: string;
  tontineName: string;
  clientId: string;
  montantDu: number;
  dueDate: string;
  daysOverdue: number;
  agenceId?: string;
}

export interface TontinePenaltyAppliedData {
  tontineId: string;
  tontineName: string;
  clientId: string;
  montantPenalite: number;
  motif: string;
  lateCount: number;
  agenceId?: string;
}

export interface TontineDistributionApprovedData {
  tontineId: string;
  tontineName: string;
  clientId: string;
  montant: number;
  payoutMethod: string;
  requestId: string;
  agenceId?: string;
}

export interface TontineDistributionPaidData {
  tontineId: string;
  tontineName: string;
  clientId: string;
  montant: number;
  reference: string;
  payoutMethod: string;
  agenceId?: string;
}

export interface TontineCycleStartedData {
  tontineId: string;
  tontineName: string;
  cycleNumber: number;
  startDate: string;
  endDate?: string;
  membersCount: number;
  agenceId?: string;
}

export interface TontineStatusChangedData {
  tontineId: string;
  tontineName: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
  agenceId?: string;
}

export interface TontineMemberExitData {
  tontineId: string;
  tontineName: string;
  memberId: string;
  clientId: string;
  exitFeePercent: number;
  agenceId?: string;
}
