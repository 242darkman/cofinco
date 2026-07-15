/**
 * Payloads des événements liés au cycle de vie des crédits.
 */
export interface CreditRequestCreatedData {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  montantDemande: number;
  agenceId?: string;
  createdByUserId?: string;
  createdByName?: string;
}

export interface CreditApprovedData {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  montantApprouve: number;
  agenceId?: string;
  approvedByUserId?: string;
}

export interface CreditRejectedData {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  motifRejet?: string;
  agenceId?: string;
  rejectedByUserId?: string;
}

export interface CreditDisbursedData {
  creditId: string;
  numeroCredit: string;
  clientId: string;
  clientName: string;
  montant: number;
  channel: string;
  agenceId?: string;
  disbursedByUserId?: string;
}

export interface CreditOverdueData {
  creditIds: string[];
  count: number;
}

export interface CreditInvestigationAssignedData {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  agentName: string;
  agenceId?: string;
}

export interface CreditInvestigationSubmittedData {
  demandeId: string;
  numeroDemande: string;
  enqueteId: string;
  clientId: string;
  agentName: string;
  agentRecommendation?: string;
  riskLevel?: string;
  agenceId?: string;
}

export interface CreditPaidOffData {
  creditId: string;
  numeroCredit: string;
  clientId: string;
  totalPaid: number;
  agenceId?: string;
}

export interface CreditRefundApprovedData {
  refundId: string;
  reference: string;
  clientId: string;
  montant: number;
  agenceId?: string;
}

export interface CreditRefundPaidData {
  refundId: string;
  reference: string;
  clientId: string;
  montant: number;
  agenceId?: string;
}

export interface CreditInstallmentLateData {
  creditId: string;
  numeroCredit: string;
  clientId: string;
  clientName: string;
  montantEcheance?: string;
  dateEcheance?: string;
  agenceId?: string;
  metadata?: {
    markedAt: string;
  };
}
