import type { DomainEvent, DomainEventType } from "./event-types";
import {
  handleCreditRequestCreated,
  handleCreditApproved,
  handleCreditRejected,
  handleCreditDisbursed,
  handleCreditOverdue,
  handleTransferRequested,
  handleTransferValidated,
  handleTransferRejected,
  handleTransferExecuted,
  handleScheduledTransferExecuted,
  handleScheduledTransferFailed,
  handleHrLeaveRequested,
  handleHrLeaveApproved,
  handleHrLeaveRejected,
  handleUserPasswordReset,
  handleSessionForceClosed,
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
  TRANSFER_REQUESTED: handleTransferRequested,
  TRANSFER_VALIDATED: handleTransferValidated,
  TRANSFER_REJECTED: handleTransferRejected,
  TRANSFER_EXECUTED: handleTransferExecuted,
  SCHEDULED_TRANSFER_EXECUTED: handleScheduledTransferExecuted,
  SCHEDULED_TRANSFER_FAILED: handleScheduledTransferFailed,
  HR_LEAVE_REQUESTED: handleHrLeaveRequested,
  HR_LEAVE_APPROVED: handleHrLeaveApproved,
  HR_LEAVE_REJECTED: handleHrLeaveRejected,
  USER_PASSWORD_RESET: handleUserPasswordReset,
  SESSION_FORCE_CLOSED: handleSessionForceClosed,
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
