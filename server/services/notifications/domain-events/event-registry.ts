import type { DomainEvent, DomainEventType } from "./event-types";
import {
  handleCreditRequestCreated,
  handleCreditApproved,
  handleCreditRejected,
  handleCreditDisbursed,
  handleCreditOverdue,
  handleCreditInvestigationAssigned,
  handleCreditPaidOff,
  handleCreditRefundApproved,
  handleCreditRefundPaid,
  handleTontineMemberJoined,
  handleTontineContributionReceived,
  handleTontineContributionOverdue,
  handleTontinePenaltyApplied,
  handleTontineDistributionApproved,
  handleTontineDistributionPaid,
  handleTontineCycleStarted,
  handleTransferRequested,
  handleTransferValidated,
  handleTransferRejected,
  handleTransferExecuted,
  handleScheduledTransferExecuted,
  handleScheduledTransferFailed,
  handleHrLeaveRequested,
  handleHrLeaveApproved,
  handleHrLeaveRejected,
  handleAccountCreated,
  handleAccountActivated,
  handleAccountDeposit,
  handleAccountWithdrawal,
  handleAccountBlocked,
  handleAccountUnblocked,
  handleAccountClosed,
  handleInterestCapitalized,
  handleUserPasswordReset,
  handleSessionForceClosed,
  handleClientCreated,
  handleUserRegistered,
  handleUserPasswordChanged,
  handleEmployeeCreated,
  handleProspectionCreated,
  handlePaiementTerrainValidated,
} from "./event-handlers";

// ============================================================================
// HANDLER REGISTRY
// ============================================================================

type EventHandler = (data: any) => Promise<void>;

const handlerRegistry: Record<DomainEventType, EventHandler> = {
  CREDIT_REQUEST_CREATED: handleCreditRequestCreated,
  CREDIT_APPROVED: handleCreditApproved,
  CREDIT_REJECTED: handleCreditRejected,
  CREDIT_DISBURSED: handleCreditDisbursed,
  CREDIT_OVERDUE: handleCreditOverdue,
  CREDIT_INVESTIGATION_ASSIGNED: handleCreditInvestigationAssigned,
  CREDIT_PAID_OFF: handleCreditPaidOff,
  CREDIT_REFUND_APPROVED: handleCreditRefundApproved,
  CREDIT_REFUND_PAID: handleCreditRefundPaid,
  TONTINE_MEMBER_JOINED: handleTontineMemberJoined,
  TONTINE_CONTRIBUTION_RECEIVED: handleTontineContributionReceived,
  TONTINE_CONTRIBUTION_OVERDUE: handleTontineContributionOverdue,
  TONTINE_PENALTY_APPLIED: handleTontinePenaltyApplied,
  TONTINE_DISTRIBUTION_APPROVED: handleTontineDistributionApproved,
  TONTINE_DISTRIBUTION_PAID: handleTontineDistributionPaid,
  TONTINE_CYCLE_STARTED: handleTontineCycleStarted,
  TRANSFER_REQUESTED: handleTransferRequested,
  TRANSFER_VALIDATED: handleTransferValidated,
  TRANSFER_REJECTED: handleTransferRejected,
  TRANSFER_EXECUTED: handleTransferExecuted,
  SCHEDULED_TRANSFER_EXECUTED: handleScheduledTransferExecuted,
  SCHEDULED_TRANSFER_FAILED: handleScheduledTransferFailed,
  HR_LEAVE_REQUESTED: handleHrLeaveRequested,
  HR_LEAVE_APPROVED: handleHrLeaveApproved,
  HR_LEAVE_REJECTED: handleHrLeaveRejected,
  ACCOUNT_CREATED: handleAccountCreated,
  ACCOUNT_ACTIVATED: handleAccountActivated,
  ACCOUNT_DEPOSIT: handleAccountDeposit,
  ACCOUNT_WITHDRAWAL: handleAccountWithdrawal,
  ACCOUNT_BLOCKED: handleAccountBlocked,
  ACCOUNT_UNBLOCKED: handleAccountUnblocked,
  ACCOUNT_CLOSED: handleAccountClosed,
  INTEREST_CAPITALIZED: handleInterestCapitalized,
  USER_PASSWORD_RESET: handleUserPasswordReset,
  SESSION_FORCE_CLOSED: handleSessionForceClosed,
  CLIENT_CREATED: handleClientCreated,
  USER_REGISTERED: handleUserRegistered,
  USER_PASSWORD_CHANGED: handleUserPasswordChanged,
  EMPLOYEE_CREATED: handleEmployeeCreated,
  PROSPECTION_CREATED: handleProspectionCreated,
  PAIEMENT_TERRAIN_VALIDATED: handlePaiementTerrainValidated,
};

// ============================================================================
// DISPATCH
// ============================================================================

/**
 * Dispatch a domain event to its registered handler.
 * Non-blocking: errors are logged but don't propagate (fire-and-forget).
 *
 * Usage:
 * ```ts
 * dispatchDomainEvent({
 *   type: "CREDIT_APPROVED",
 *   data: { demandeId, clientId, montantApprouve, ... },
 *   timestamp: new Date(),
 * });
 * ```
 */
export function dispatchDomainEvent(event: DomainEvent): void {
  const handler = handlerRegistry[event.type];
  if (!handler) {
    console.warn(
      `[DomainEvents] No handler registered for event type: ${event.type}`
    );
    return;
  }

  // Fire-and-forget: don't block the caller
  handler(event.data).catch((error) => {
    console.error(
      `[DomainEvents] Error handling ${event.type}:`,
      error.message || error
    );
  });
}
