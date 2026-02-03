/**
 * TypeScript interfaces for template variables per notification type.
 * These ensure type safety when calling notification services.
 */

// ============================================================================
// CREDIT
// ============================================================================

export interface CreditApprovalVars {
  clientName: string;
  amount: string;
  creditNumber?: string;
  agenceName?: string;
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
  agenceName?: string;
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

// ============================================================================
// OTP
// ============================================================================

export interface OtpCodeVars {
  otpCode: string;
  expiryMinutes: number;
  purpose?: string;
  userName?: string;
}

// ============================================================================
// TRANSFER
// ============================================================================

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

// ============================================================================
// HR
// ============================================================================

export interface HrLeaveStatusVars {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  approverName?: string;
}

export interface PayslipAvailableVars {
  employeeName: string;
  month: string;
  year: string;
}

export interface HrSanctionCreatedVars {
  employeeName: string;
  sanctionType: string;
  gravite: string;
  motif: string;
}

export interface HrSanctionNotifiedVars {
  employeeName: string;
  sanctionType: string;
  gravite: string;
}

export interface HrSanctionFinalizedVars {
  employeeName: string;
  sanctionType: string;
  gravite: string;
}

// ============================================================================
// TEMPORARY PERMISSIONS
// ============================================================================

export interface TempPermissionGrantedVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  expiresAt: string;
  reason: string;
  grantedBy: string;
}

export interface TempPermissionExpiringVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  expiresAt: string;
  timeRemaining: string;
}

export interface TempPermissionExpiredVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  expiredAt: string;
}

export interface TempPermissionRevokedVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  revokedBy: string;
  reason?: string;
}

// ============================================================================
// GENERAL
// ============================================================================

export interface WelcomeVars {
  clientName: string;
  agenceName?: string;
}

export interface PasswordResetVars {
  userName: string;
  otpCode: string;
  expiryMinutes: number;
}

export interface PaymentReminderVars {
  clientName: string;
  amount: string;
  dueDate: string;
}

export interface SavingsConfirmedVars {
  clientName: string;
  amount: string;
  balance: string;
}

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

// ============================================================================
// OPERATIONS / SECURITY
// ============================================================================

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

export interface HrLeaveRequestedVars {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysRequested: string;
}

export interface SessionForceClosedVars {
  sessionsCount: string;
  details: string;
}

// ============================================================================
// ACCOUNTS / SAVINGS
// ============================================================================

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

// ============================================================================
// CLIENT / USER / EMPLOYEE LIFECYCLE
// ============================================================================

export interface ClientWelcomeVars {
  clientName: string;
  agenceName?: string;
  accountNumber?: string;
}

export interface UserRegisteredVars {
  userName: string;
  username: string;
}

export interface UserPasswordChangedVars {
  userName: string;
}

export interface EmployeeWelcomeVars {
  employeeName: string;
  matricule: string;
  username?: string;
  agenceName?: string;
}

// ============================================================================
// OPERATIONS TERRAIN
// ============================================================================

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

// ============================================================================
// RECEIPTS (Email/SMS)
// ============================================================================

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

// ============================================================================
// UNION TYPE for all template variables
// ============================================================================

export type TemplateVariables =
  | CreditApprovalVars
  | CreditRejectionVars
  | CreditDisbursementVars
  | CreditOverdueVars
  | CreditApplicationReceivedVars
  | CreditInvestigationAssignedVars
  | CreditPaymentReminderVars
  | CreditPaidOffVars
  | CreditRefundApprovedVars
  | CreditRefundPaidVars
  | OtpCodeVars
  | TransferScheduledVars
  | TransferExecutedVars
  | HrLeaveStatusVars
  | PayslipAvailableVars
  | WelcomeVars
  | PasswordResetVars
  | PaymentReminderVars
  | SavingsConfirmedVars
  | TontineReminderVars
  | TontineMemberJoinedVars
  | TontineContributionReceivedVars
  | TontineContributionOverdueVars
  | TontinePenaltyAppliedVars
  | TontineDistributionApprovedVars
  | TontineDistributionPaidVars
  | TontineCycleStartedVars
  | AccountCreatedVars
  | AccountActivatedVars
  | AccountDepositVars
  | AccountWithdrawalVars
  | AccountBlockedVars
  | AccountUnblockedVars
  | AccountClosedVars
  | InterestCapitalizedVars
  | TransferRequestedVars
  | TransferRejectedVars
  | ScheduledTransferExecutedVars
  | ScheduledTransferFailedVars
  | HrLeaveRequestedVars
  | SessionForceClosedVars
  | ClientWelcomeVars
  | UserRegisteredVars
  | UserPasswordChangedVars
  | EmployeeWelcomeVars
  | ProspectionCreatedVars
  | PaiementTerrainValidatedVars
  | ReceiptDepositVars
  | ReceiptWithdrawalVars
  | HrSanctionCreatedVars
  | HrSanctionNotifiedVars
  | HrSanctionFinalizedVars
  | TempPermissionGrantedVars
  | TempPermissionExpiringVars
  | TempPermissionExpiredVars
  | TempPermissionRevokedVars;
