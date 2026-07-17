/**
 * Types partagés du service RH (congés + audit).
 */

export interface LeaveValidationResult {
  valid: boolean;
  error?: string;
  code?: 'OVERLAP' | 'INSUFFICIENT_BALANCE' | 'INVALID_DATES' | 'EMPLOYEE_NOT_FOUND';
  details?: any;
}

export interface AuditContext {
  userId?: string;
  userName?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  agenceId?: string;
}
