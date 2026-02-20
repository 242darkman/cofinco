// ============================================================================
// DOMAIN EVENT TYPES
// ============================================================================

export type DomainEventType =
  // Credit lifecycle
  | "CREDIT_REQUEST_CREATED"
  | "CREDIT_APPROVED"
  | "CREDIT_REJECTED"
  | "CREDIT_DISBURSED"
  | "CREDIT_OVERDUE"
  | "CREDIT_INVESTIGATION_ASSIGNED"
  | "CREDIT_PAID_OFF"
  | "CREDIT_REFUND_APPROVED"
  | "CREDIT_REFUND_PAID"
  // Transfer lifecycle
  | "TRANSFER_REQUESTED"
  | "TRANSFER_VALIDATED"
  | "TRANSFER_REJECTED"
  | "TRANSFER_EXECUTED"
  | "TRANSFER_CANCELLED"
  | "TRANSFER_REVERSED"
  // Scheduled transfers
  | "SCHEDULED_TRANSFER_EXECUTED"
  | "SCHEDULED_TRANSFER_FAILED"
  // HR
  | "HR_LEAVE_REQUESTED"
  | "HR_LEAVE_APPROVED"
  | "HR_LEAVE_REJECTED"
  // HR Sanctions
  | "HR_SANCTION_CREATED"
  | "HR_SANCTION_NOTIFIED"
  | "HR_SANCTION_FINALIZED"
  // Tontine lifecycle
  | "TONTINE_MEMBER_JOINED"
  | "TONTINE_CONTRIBUTION_RECEIVED"
  | "TONTINE_CONTRIBUTION_OVERDUE"
  | "TONTINE_PENALTY_APPLIED"
  | "TONTINE_DISTRIBUTION_APPROVED"
  | "TONTINE_DISTRIBUTION_PAID"
  | "TONTINE_CYCLE_STARTED"
  // Accounts / Savings
  | "ACCOUNT_CREATED"
  | "ACCOUNT_ACTIVATED"
  | "ACCOUNT_DEPOSIT"
  | "ACCOUNT_WITHDRAWAL"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_UNBLOCKED"
  | "ACCOUNT_CLOSED"
  | "INTEREST_CAPITALIZED"
  // Auth / Security
  | "USER_PASSWORD_RESET"
  | "SESSION_FORCE_CLOSED"
  // Client lifecycle
  | "CLIENT_CREATED"
  // User / Employee lifecycle
  | "USER_REGISTERED"
  | "USER_PASSWORD_CHANGED"
  | "EMPLOYEE_CREATED"
  // Operations terrain
  | "PROSPECTION_CREATED"
  | "PROSPECT_CONVERTED"
  | "PAIEMENT_TERRAIN_VALIDATED"
  | "CREDIT_INSTALLMENT_LATE"
  | "SYSTEM_JOB_FAILED"
  // Scoring
  | "CLIENT_SEGMENT_CHANGED"
  // Account lifecycle (suspension / closure)
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_UNSUSPENDED"
  | "CLOSURE_INITIATED"
  | "CLOSURE_APPROVED";

// ============================================================================
// EVENT DATA INTERFACES
// ============================================================================

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
  channel: string; // ACCOUNT, CASH, MOBILE_MONEY
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

// Tontine

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

// Transfer

export interface TransferRequestedData {
  transfertId: string;
  reference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  requestedByUserId: string;
}

export interface TransferValidatedData {
  transfertId: string;
  reference: string;
  montant: number;
  agenceId: string;
  validatedByUserId: string;
}

export interface TransferRejectedData {
  transfertId: string;
  reference: string;
  montant: number;
  reason?: string;
  agenceId: string;
  rejectedByUserId: string;
}

export interface TransferExecutedData {
  transfertId: string;
  reference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  executedByUserId: string;
}

export interface TransferCancelledData {
  transfertId: string;
  reference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  reason: string;
  cancelledByUserId: string;
}

export interface TransferReversedData {
  originalTransfertId: string;
  originalReference: string;
  reversalTransfertId: string;
  reversalReference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  reversedByUserId: string;
  reason: string;
}

export interface ScheduledTransferExecutedData {
  scheduleId: string;
  montant: number;
  compteSourceId: string;
  compteDestId: string;
  executionKey: string;
}

export interface ScheduledTransferFailedData {
  scheduleId: string;
  montant: number;
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
  disabled: boolean;
}

// HR Sanctions

export interface HrSanctionCreatedData {
  sanctionId: number;
  employeId: string;
  employeNom: string;
  type: string;
  gravite: string;
  motif: string;
  emetteurId?: string;
  agenceId?: string;
}

export interface HrSanctionNotifiedData {
  sanctionId: number;
  employeId: string;
  employeNom: string;
  type: string;
  gravite: string;
  agenceId?: string;
}

export interface HrSanctionFinalizedData {
  sanctionId: number;
  employeId: string;
  employeNom: string;
  type: string;
  gravite: string;
  finalizedBy?: string;
  agenceId?: string;
}

export interface HrLeaveRequestedData {
  congeId: number;
  employeId: string;
  employeNom: string;
  type: string;
  dateDebut: string;
  dateFin: string;
  daysRequested: number;
  agenceId?: string;
}

export interface HrLeaveApprovedData {
  congeId: number;
  employeId: string;
  employeNom: string;
  approvedByName?: string;
  agenceId?: string;
}

export interface HrLeaveRejectedData {
  congeId: number;
  employeId: string;
  employeNom: string;
  rejectedByName?: string;
  reason?: string;
  agenceId?: string;
}

export interface UserPasswordResetData {
  userId: string;
  resetByUserId?: string;
}

// Accounts / Savings

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

export interface SessionForceClosedData {
  sessions: Array<{
    sessionId: string;
    caisseId: string;
    caissierId?: string;
    hoursInactive: number;
  }>;
}

// Client lifecycle

export interface ClientCreatedData {
  clientId: string;
  clientNom: string;
  clientPrenom?: string;
  telephone?: string;
  email?: string;
  agenceId?: string;
  agenceNom?: string;
  numeroCompte?: string;
}

// User / Employee lifecycle

export interface UserRegisteredData {
  userId: string;
  username: string;
  nom: string;
  prenom?: string;
  email?: string;
  agenceId?: string;
}

export interface UserPasswordChangedData {
  userId: string;
  userName: string;
  email?: string;
}

export interface EmployeeCreatedData {
  employeId: string;
  userId: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  matricule: string;
  username?: string;
  agenceId?: string;
  agenceNom?: string;
}

// Operations terrain

export interface ProspectionCreatedData {
  prospectionId: string;
  agentId: string;
  agentNom?: string;
  userId?: string;
  nomProspect: string;
  telephone?: string;
  localisation?: string;
  agenceId?: string;
}

export interface PaiementTerrainValidatedData {
  paiementId: string;
  clientId?: string;
  agentId?: string;
  montant: string;
  typePaiement: string;
  methodePaiement: string;
  reference?: string;
  creditId?: string;
  compteId?: string;
  agenceId?: string;
}

// ============================================================================
// DOMAIN EVENT (Union)
// ============================================================================

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

export interface SystemJobFailedData {
  jobName: string;
  jobId?: string;
  error: string;
  timestamp: string;
}

// Scoring

export interface ClientSegmentChangedData {
  clientId: string;
  clientName?: string;
  previousSegment: string;
  newSegment: string;
  scoreGlobal: number;
  agenceId?: string;
}

// Account lifecycle (suspension / closure)

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

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  data: T;
  timestamp: Date;
  agenceId?: string;
  userId?: string;
}
