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

// ============================================================================
// UNION TYPE for all template variables
// ============================================================================

export type TemplateVariables =
  | CreditApprovalVars
  | CreditRejectionVars
  | CreditDisbursementVars
  | CreditOverdueVars
  | OtpCodeVars
  | TransferScheduledVars
  | TransferExecutedVars
  | HrLeaveStatusVars
  | PayslipAvailableVars
  | WelcomeVars
  | PasswordResetVars
  | PaymentReminderVars
  | SavingsConfirmedVars
  | TontineReminderVars;
