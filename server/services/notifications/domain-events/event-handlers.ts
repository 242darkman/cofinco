import { db } from "../../../db";
import { clients, users, employes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { emitNotificationEvent } from "../notification-service";
import { logNotificationEvent } from "../audit/notification-audit";
import type {
  CreditRequestCreatedData,
  CreditApprovedData,
  CreditRejectedData,
  CreditDisbursedData,
  CreditOverdueData,
  TransferRequestedData,
  TransferValidatedData,
  TransferRejectedData,
  TransferExecutedData,
  ScheduledTransferExecutedData,
  ScheduledTransferFailedData,
  HrLeaveRequestedData,
  HrLeaveApprovedData,
  HrLeaveRejectedData,
  UserPasswordResetData,
  SessionForceClosedData,
} from "./event-types";

// ============================================================================
// HELPERS: Recipient Lookup
// ============================================================================

async function getClientContact(clientId: string) {
  const [result] = await db
    .select({
      clientId: clients.id,
      nom: users.nom,
      prenom: users.prenom,
      telephone: users.telephone,
      email: users.email,
    })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!result) return null;
  return {
    phone: result.telephone,
    email: result.email,
    name: `${result.prenom || ""} ${result.nom || "Client"}`.trim(),
  };
}

async function getUserContact(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      nom: users.nom,
      prenom: users.prenom,
      telephone: users.telephone,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;
  return {
    phone: user.telephone,
    email: user.email,
    name: `${user.prenom || ""} ${user.nom || ""}`.trim(),
  };
}

async function getEmployeeContact(employeId: string) {
  const [result] = await db
    .select({
      employeId: employes.id,
      userId: employes.userId,
      nom: users.nom,
      prenom: users.prenom,
      telephone: users.telephone,
      email: users.email,
    })
    .from(employes)
    .leftJoin(users, eq(employes.userId, users.id))
    .where(eq(employes.id, employeId))
    .limit(1);

  if (!result) return null;
  return {
    userId: result.userId,
    phone: result.telephone,
    email: result.email,
    name: `${result.prenom || ""} ${result.nom || ""}`.trim(),
  };
}

// ============================================================================
// CREDIT EVENT HANDLERS
// ============================================================================

export async function handleCreditRequestCreated(data: CreditRequestCreatedData) {
  // Notify admins/gestionnaires in-app only (no SMS for request creation)
  await emitNotificationEvent("CREDIT_REQUEST_CREATED", data as any, {
    inAppRecipients: [], // In-app handled by existing WS broadcast
  });

  logNotificationEvent("info", "Domain event: CREDIT_REQUEST_CREATED", {
    correlationId: `credit-req-${data.demandeId}`,
    status: "DISPATCHED",
  });
}

export async function handleCreditApproved(data: CreditApprovedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    amount: data.montantApprouve.toLocaleString("fr-FR"),
    numeroDemande: data.numeroDemande,
  };

  await emitNotificationEvent("CREDIT_APPROVED", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_APPROVED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_APPROVED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    inAppRecipients: [], // Handled by existing WS broadcast in finance.ts
  });

  logNotificationEvent("info", "Domain event: CREDIT_APPROVED", {
    correlationId: `credit-approved-${data.demandeId}`,
    channel: "SMS",
    recipient: client.phone || undefined,
    status: "DISPATCHED",
  });
}

export async function handleCreditRejected(data: CreditRejectedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    numeroDemande: data.numeroDemande,
    motif: data.motifRejet || "Non spécifié",
  };

  await emitNotificationEvent("CREDIT_REJECTED", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_REJECTED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_REJECTED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: CREDIT_REJECTED", {
    correlationId: `credit-rejected-${data.demandeId}`,
    status: "DISPATCHED",
  });
}

export async function handleCreditDisbursed(data: CreditDisbursedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name || data.clientName,
    amount: data.montant.toLocaleString("fr-FR"),
    numeroCredit: data.numeroCredit,
    channel: data.channel,
  };

  await emitNotificationEvent("CREDIT_DISBURSED", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_DISBURSEMENT",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_DISBURSEMENT",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: CREDIT_DISBURSED", {
    correlationId: `credit-disbursed-${data.creditId}`,
    status: "DISPATCHED",
  });
}

export async function handleCreditOverdue(data: CreditOverdueData) {
  // Overdue credits: emit a summary notification to admin (not per-client SMS)
  logNotificationEvent("warn", "Domain event: CREDIT_OVERDUE", {
    status: "DISPATCHED",
    correlationId: `credit-overdue-batch-${Date.now()}`,
  });
}

// ============================================================================
// TRANSFER EVENT HANDLERS
// ============================================================================

export async function handleTransferRequested(data: TransferRequestedData) {
  // Transfer requested - notify via in-app (handled by existing WS broadcast)
  logNotificationEvent("info", "Domain event: TRANSFER_REQUESTED", {
    correlationId: `transfer-req-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

export async function handleTransferValidated(data: TransferValidatedData) {
  logNotificationEvent("info", "Domain event: TRANSFER_VALIDATED", {
    correlationId: `transfer-val-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

export async function handleTransferRejected(data: TransferRejectedData) {
  // Notify requester that their transfer was rejected
  const user = await getUserContact(data.rejectedByUserId);

  logNotificationEvent("warn", "Domain event: TRANSFER_REJECTED", {
    correlationId: `transfer-rej-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

export async function handleTransferExecuted(data: TransferExecutedData) {
  const user = await getUserContact(data.executedByUserId);

  const payload = {
    reference: data.reference,
    montant: data.montant.toLocaleString("fr-FR"),
    typeTransfert: data.typeTransfert,
  };

  await emitNotificationEvent("TRANSFER_EXECUTED", data as any, {
    smsRecipients: [], // Transfers are internal - no SMS needed
    emailRecipients: [], // Transfers are internal - no email needed
    inAppRecipients: [], // Handled by existing WS broadcast
  });

  logNotificationEvent("info", "Domain event: TRANSFER_EXECUTED", {
    correlationId: `transfer-exec-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// SCHEDULED TRANSFER EVENT HANDLERS
// ============================================================================

export async function handleScheduledTransferExecuted(
  data: ScheduledTransferExecutedData
) {
  logNotificationEvent("info", "Domain event: SCHEDULED_TRANSFER_EXECUTED", {
    correlationId: `sched-transfer-${data.executionKey}`,
    status: "DISPATCHED",
  });
}

export async function handleScheduledTransferFailed(
  data: ScheduledTransferFailedData
) {
  logNotificationEvent("error", "Domain event: SCHEDULED_TRANSFER_FAILED", {
    correlationId: `sched-transfer-fail-${data.scheduleId}`,
    status: "DISPATCHED",
    error: data.errorMessage,
  });
}

// ============================================================================
// HR EVENT HANDLERS
// ============================================================================

export async function handleHrLeaveRequested(data: HrLeaveRequestedData) {
  // Leave request: notify managers in-app (existing WS handles this)
  logNotificationEvent("info", "Domain event: HR_LEAVE_REQUESTED", {
    correlationId: `hr-leave-req-${data.congeId}`,
    status: "DISPATCHED",
  });
}

export async function handleHrLeaveApproved(data: HrLeaveApprovedData) {
  const employee = await getEmployeeContact(data.employeId);
  if (!employee) return;

  const payload = {
    employeNom: data.employeNom,
    approvedBy: data.approvedByName || "Direction",
  };

  await emitNotificationEvent("HR_LEAVE_APPROVED", data as any, {
    smsRecipients: employee.phone
      ? [
          {
            phone: employee.phone,
            templateCode: "HR_LEAVE_APPROVED",
            payload,
            userId: employee.userId || undefined,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: HR_LEAVE_APPROVED", {
    correlationId: `hr-leave-approved-${data.congeId}`,
    status: "DISPATCHED",
  });
}

export async function handleHrLeaveRejected(data: HrLeaveRejectedData) {
  const employee = await getEmployeeContact(data.employeId);
  if (!employee) return;

  const payload = {
    employeNom: data.employeNom,
    rejectedBy: data.rejectedByName || "Direction",
    reason: data.reason || "Non spécifié",
  };

  await emitNotificationEvent("HR_LEAVE_REJECTED", data as any, {
    smsRecipients: employee.phone
      ? [
          {
            phone: employee.phone,
            templateCode: "HR_LEAVE_REJECTED",
            payload,
            userId: employee.userId || undefined,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: HR_LEAVE_REJECTED", {
    correlationId: `hr-leave-rejected-${data.congeId}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// AUTH / SECURITY EVENT HANDLERS
// ============================================================================

export async function handleUserPasswordReset(data: UserPasswordResetData) {
  const user = await getUserContact(data.userId);
  if (!user) return;

  const payload = {
    userName: user.name,
  };

  await emitNotificationEvent("USER_PASSWORD_RESET", data as any, {
    smsRecipients: user.phone
      ? [
          {
            phone: user.phone,
            templateCode: "PASSWORD_RESET",
            payload,
          },
        ]
      : [],
    emailRecipients: user.email
      ? [
          {
            email: user.email,
            templateCode: "PASSWORD_RESET",
            payload,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: USER_PASSWORD_RESET", {
    correlationId: `pwd-reset-${data.userId}`,
    status: "DISPATCHED",
  });
}

export async function handleSessionForceClosed(data: SessionForceClosedData) {
  // Session force close is already handled by WebSocket broadcast in the cron
  logNotificationEvent("warn", "Domain event: SESSION_FORCE_CLOSED", {
    correlationId: `session-cleanup-${Date.now()}`,
    status: "DISPATCHED",
  });
}
