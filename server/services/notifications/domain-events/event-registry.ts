import type { DomainEvent, DomainEventType } from "./event-types";
import { getWsInstance, type GlobalMessage } from "../../../ws-server";
import { createLogger } from "../../../lib/logger";
import {
  handleCreditRequestCreated,
  handleCreditApproved,
  handleCreditRejected,
  handleCreditDisbursed,
  handleCreditOverdue,
  handleCreditInvestigationAssigned,
  handleCreditInvestigationSubmitted,
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
  handleTontineStatusChanged,
  handleTontineMemberExit,
  handleTransferRequested,
  handleTransferValidated,
  handleTransferRejected,
  handleTransferExecuted,
  handleTransferCancelled,
  handleTransferReversed,
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
  handleProspectConverted,
  handlePaiementTerrainValidated,
  handleHrSanctionCreated,
  handleHrSanctionNotified,
  handleHrSanctionFinalized,
  handleCreditInstallmentLate,
  handleSystemJobFailed,
  handleClientSegmentChanged,
  handleAccountSuspended,
  handleAccountUnsuspended,
  handleClosureInitiated,
  handleClosureApproved,
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
  CREDIT_INVESTIGATION_SUBMITTED: handleCreditInvestigationSubmitted,
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
  TONTINE_STATUS_CHANGED: handleTontineStatusChanged,
  TONTINE_MEMBER_EXIT: handleTontineMemberExit,
  TRANSFER_REQUESTED: handleTransferRequested,
  TRANSFER_VALIDATED: handleTransferValidated,
  TRANSFER_REJECTED: handleTransferRejected,
  TRANSFER_EXECUTED: handleTransferExecuted,
  TRANSFER_CANCELLED: handleTransferCancelled,
  TRANSFER_REVERSED: handleTransferReversed,
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
  HR_SANCTION_CREATED: handleHrSanctionCreated,
  HR_SANCTION_NOTIFIED: handleHrSanctionNotified,
  HR_SANCTION_FINALIZED: handleHrSanctionFinalized,
  PROSPECTION_CREATED: handleProspectionCreated,
  PROSPECT_CONVERTED: handleProspectConverted,
  PAIEMENT_TERRAIN_VALIDATED: handlePaiementTerrainValidated,
  CREDIT_INSTALLMENT_LATE: handleCreditInstallmentLate,
  SYSTEM_JOB_FAILED: handleSystemJobFailed,
  CLIENT_SEGMENT_CHANGED: handleClientSegmentChanged,
  ACCOUNT_SUSPENDED: handleAccountSuspended,
  ACCOUNT_UNSUSPENDED: handleAccountUnsuspended,
  CLOSURE_INITIATED: handleClosureInitiated,
  CLOSURE_APPROVED: handleClosureApproved,
};

const logger = createLogger('DomainEvents');

// ============================================================================
// WS BRIDGE: Map domain events to WebSocket message types
// ============================================================================

const domainEventToWsType: Record<string, string> = {
  // Credit events → CREDIT_UPDATE
  CREDIT_REQUEST_CREATED: "CREDIT_UPDATE",
  CREDIT_APPROVED: "CREDIT_UPDATE",
  CREDIT_REJECTED: "CREDIT_UPDATE",
  CREDIT_DISBURSED: "CREDIT_UPDATE",
  CREDIT_OVERDUE: "CREDIT_UPDATE",
  CREDIT_INVESTIGATION_ASSIGNED: "CREDIT_UPDATE",
  CREDIT_INVESTIGATION_SUBMITTED: "CREDIT_UPDATE",
  CREDIT_PAID_OFF: "CREDIT_UPDATE",
  CREDIT_REFUND_APPROVED: "CREDIT_UPDATE",
  CREDIT_REFUND_PAID: "CREDIT_UPDATE",

  // Tontine events → TONTINE_UPDATE
  TONTINE_MEMBER_JOINED: "TONTINE_UPDATE",
  TONTINE_CONTRIBUTION_RECEIVED: "TONTINE_UPDATE",
  TONTINE_CONTRIBUTION_OVERDUE: "TONTINE_UPDATE",
  TONTINE_PENALTY_APPLIED: "TONTINE_UPDATE",
  TONTINE_DISTRIBUTION_APPROVED: "TONTINE_UPDATE",
  TONTINE_DISTRIBUTION_PAID: "TONTINE_UPDATE",
  TONTINE_CYCLE_STARTED: "TONTINE_UPDATE",

  // Account events → COMPTE_UPDATE
  ACCOUNT_CREATED: "COMPTE_UPDATE",
  ACCOUNT_ACTIVATED: "COMPTE_UPDATE",
  ACCOUNT_DEPOSIT: "COMPTE_UPDATE",
  ACCOUNT_WITHDRAWAL: "COMPTE_UPDATE",
  ACCOUNT_BLOCKED: "COMPTE_UPDATE",
  ACCOUNT_UNBLOCKED: "COMPTE_UPDATE",
  ACCOUNT_CLOSED: "COMPTE_UPDATE",
  INTEREST_CAPITALIZED: "COMPTE_UPDATE",

  // Transfer events → CAISSE_UPDATE
  TRANSFER_REQUESTED: "CAISSE_UPDATE",
  TRANSFER_VALIDATED: "CAISSE_UPDATE",
  TRANSFER_REJECTED: "CAISSE_UPDATE",
  TRANSFER_EXECUTED: "CAISSE_UPDATE",
  TRANSFER_CANCELLED: "CAISSE_UPDATE",
  TRANSFER_REVERSED: "CAISSE_UPDATE",
  SCHEDULED_TRANSFER_EXECUTED: "CAISSE_UPDATE",
  SCHEDULED_TRANSFER_FAILED: "CAISSE_UPDATE",

  // HR events → HR_UPDATE
  HR_LEAVE_REQUESTED: "HR_UPDATE",
  HR_LEAVE_APPROVED: "HR_UPDATE",
  HR_LEAVE_REJECTED: "HR_UPDATE",
  HR_SANCTION_CREATED: "HR_UPDATE",
  HR_SANCTION_NOTIFIED: "HR_UPDATE",
  HR_SANCTION_FINALIZED: "HR_UPDATE",

  // Client events → CLIENT_UPDATE
  CLIENT_CREATED: "CLIENT_UPDATE",

  // Employee events → EMPLOYE_UPDATE
  EMPLOYEE_CREATED: "EMPLOYE_UPDATE",

  // Operations terrain → OPERATIONS_UPDATE
  PROSPECTION_CREATED: "OPERATIONS_UPDATE",
  PROSPECT_CONVERTED: "OPERATIONS_UPDATE",
  PAIEMENT_TERRAIN_VALIDATED: "OPERATIONS_UPDATE",

  // System events → SYSTEM_UPDATE
  CREDIT_INSTALLMENT_LATE: "CREDIT_UPDATE",
  SYSTEM_JOB_FAILED: "SYSTEM_UPDATE",
};

function broadcastDomainEvent(event: DomainEvent): void {
  try {
    const ws = getWsInstance();
    if (!ws) return;

    const wsType = domainEventToWsType[event.type];
    if (wsType) {
      ws.broadcast({
        type: wsType as GlobalMessage['type'],
        payload: {
          domainEvent: event.type,
          entity: (event.data as any)?.entity || undefined,
          agenceId: (event.data as any)?.agenceId || undefined,
          timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
        },
      });
    }
  } catch {
    // Non-blocking: WS broadcast failure should never break the event pipeline
  }
}

// ============================================================================
// DISPATCH
// ============================================================================

/**
 * Dispatch a domain event to its registered handler.
 * Non-blocking: errors are logged but don't propagate (fire-and-forget).
 * Also broadcasts the event via WebSocket for real-time UI updates.
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
    logger.warn({ eventType: event.type }, 'No handler registered for event type');
    return;
  }

  // Broadcast via WS immediately (before async handler completes)
  broadcastDomainEvent(event);

  // Fire-and-forget: don't block the caller
  handler(event.data).catch((error) => {
    logger.error({ eventType: event.type, err: error }, 'Error handling event');
  });
}
