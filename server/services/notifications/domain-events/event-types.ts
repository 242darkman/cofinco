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
  // Transfer lifecycle
  | "TRANSFER_REQUESTED"
  | "TRANSFER_VALIDATED"
  | "TRANSFER_REJECTED"
  | "TRANSFER_EXECUTED"
  // Scheduled transfers
  | "SCHEDULED_TRANSFER_EXECUTED"
  | "SCHEDULED_TRANSFER_FAILED"
  // HR
  | "HR_LEAVE_REQUESTED"
  | "HR_LEAVE_APPROVED"
  | "HR_LEAVE_REJECTED"
  // Auth / Security
  | "USER_PASSWORD_RESET"
  | "SESSION_FORCE_CLOSED";

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

export interface SessionForceClosedData {
  sessions: Array<{
    sessionId: string;
    caisseId: string;
    caissierId?: string;
    hoursInactive: number;
  }>;
}

// ============================================================================
// DOMAIN EVENT (Union)
// ============================================================================

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  data: T;
  timestamp: Date;
  agenceId?: string;
  userId?: string;
}
