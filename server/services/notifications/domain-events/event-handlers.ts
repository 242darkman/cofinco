import { db } from "../../../db";
import { clients, users, employes, credits, membresTontine, comptes, virementsProgrammes } from "@shared/schema";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { emitNotificationEvent } from "../notification-service";
import { logNotificationEvent } from "../audit/notification-audit";
import type {
  CreditRequestCreatedData,
  CreditApprovedData,
  CreditRejectedData,
  CreditDisbursedData,
  CreditOverdueData,
  CreditInvestigationAssignedData,
  CreditPaidOffData,
  CreditRefundApprovedData,
  CreditRefundPaidData,
  TontineMemberJoinedData,
  TontineContributionReceivedData,
  TontineContributionOverdueData,
  TontinePenaltyAppliedData,
  TontineDistributionApprovedData,
  TontineDistributionPaidData,
  TontineCycleStartedData,
  TransferRequestedData,
  TransferValidatedData,
  TransferRejectedData,
  TransferExecutedData,
  ScheduledTransferExecutedData,
  ScheduledTransferFailedData,
  AccountCreatedData,
  AccountActivatedData,
  AccountDepositData,
  AccountWithdrawalData,
  AccountBlockedData,
  AccountUnblockedData,
  AccountClosedData,
  InterestCapitalizedData,
  HrLeaveRequestedData,
  HrLeaveApprovedData,
  HrLeaveRejectedData,
  UserPasswordResetData,
  SessionForceClosedData,
  ClientCreatedData,
  UserRegisteredData,
  UserPasswordChangedData,
  EmployeeCreatedData,
  ProspectionCreatedData,
  PaiementTerrainValidatedData,
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
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    amount: data.montantDemande.toLocaleString("fr-FR"),
    creditNumber: data.numeroDemande,
    agenceName: "COFIN&CO-M",
  };

  await emitNotificationEvent("CREDIT_REQUEST_CREATED", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_APPLICATION_RECEIVED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_APPLICATION_RECEIVED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    inAppRecipients: [],
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
  if (!data.creditIds || data.creditIds.length === 0) return;

  // Look up each overdue credit and send per-client notification
  try {
    const overdueCredits = await db
      .select({
        creditId: credits.id,
        numeroCredit: credits.numeroCredit,
        clientId: credits.clientId,
        soldeRestant: credits.soldeRestant,
        prochaineEcheance: credits.prochaineEcheance,
      })
      .from(credits)
      .where(inArray(credits.id, data.creditIds));

    for (const credit of overdueCredits) {
      if (!credit.clientId) continue;

      const client = await getClientContact(credit.clientId);
      if (!client) continue;

      const dueDate = credit.prochaineEcheance
        ? new Date(credit.prochaineEcheance).toLocaleDateString("fr-FR")
        : "N/A";
      const daysOverdue = credit.prochaineEcheance
        ? Math.floor(
            (Date.now() - new Date(credit.prochaineEcheance).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      const payload = {
        clientName: client.name,
        amount: Number(credit.soldeRestant || 0).toLocaleString("fr-FR"),
        dueDate,
        daysOverdue: String(daysOverdue),
        creditNumber: credit.numeroCredit || "",
      };

      await emitNotificationEvent("CREDIT_OVERDUE", {} as any, {
        smsRecipients: client.phone
          ? [
              {
                phone: client.phone,
                templateCode: "CREDIT_OVERDUE",
                payload,
              },
            ]
          : [],
        emailRecipients: client.email
          ? [
              {
                email: client.email,
                templateCode: "CREDIT_OVERDUE",
                payload,
              },
            ]
          : [],
      });
    }
  } catch (error: any) {
    console.error("[CreditOverdue] Error sending overdue notifications:", error.message);
  }

  logNotificationEvent("warn", "Domain event: CREDIT_OVERDUE", {
    status: "DISPATCHED",
    correlationId: `credit-overdue-batch-${Date.now()}`,
  });
}

export async function handleCreditInvestigationAssigned(
  data: CreditInvestigationAssignedData
) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    creditNumber: data.numeroDemande,
    agentName: data.agentName || "un agent",
  };

  await emitNotificationEvent("CREDIT_INVESTIGATION_ASSIGNED", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_INVESTIGATION_ASSIGNED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_INVESTIGATION_ASSIGNED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: CREDIT_INVESTIGATION_ASSIGNED", {
    correlationId: `credit-investigation-${data.demandeId}`,
    status: "DISPATCHED",
  });
}

export async function handleCreditPaidOff(data: CreditPaidOffData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    creditNumber: data.numeroCredit,
    totalPaid: data.totalPaid.toLocaleString("fr-FR"),
  };

  await emitNotificationEvent("CREDIT_PAID_OFF", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_PAID_OFF",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_PAID_OFF",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: CREDIT_PAID_OFF", {
    correlationId: `credit-paidoff-${data.creditId}`,
    status: "DISPATCHED",
  });
}

export async function handleCreditRefundApproved(data: CreditRefundApprovedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
  };

  await emitNotificationEvent("CREDIT_REFUND_APPROVED", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_REFUND_APPROVED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_REFUND_APPROVED",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: CREDIT_REFUND_APPROVED", {
    correlationId: `refund-approved-${data.refundId}`,
    status: "DISPATCHED",
  });
}

export async function handleCreditRefundPaid(data: CreditRefundPaidData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
  };

  await emitNotificationEvent("CREDIT_REFUND_PAID", data as any, {
    smsRecipients: client.phone
      ? [
          {
            phone: client.phone,
            templateCode: "CREDIT_REFUND_PAID",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
    emailRecipients: client.email
      ? [
          {
            email: client.email,
            templateCode: "CREDIT_REFUND_PAID",
            payload,
            agenceId: data.agenceId,
          },
        ]
      : [],
  });

  logNotificationEvent("info", "Domain event: CREDIT_REFUND_PAID", {
    correlationId: `refund-paid-${data.refundId}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// TONTINE EVENT HANDLERS
// ============================================================================

export async function handleTontineMemberJoined(data: TontineMemberJoinedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    tontineName: data.tontineName,
    amount: data.montantCotisation.toLocaleString("fr-FR"),
    frequence: data.frequence,
    position: data.position ? String(data.position) : undefined,
  };

  await emitNotificationEvent("TONTINE_MEMBER_JOINED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "TONTINE_MEMBER_JOINED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "TONTINE_MEMBER_JOINED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: TONTINE_MEMBER_JOINED", {
    correlationId: `tontine-member-${data.tontineId}-${data.clientId}`,
    status: "DISPATCHED",
  });
}

export async function handleTontineContributionReceived(data: TontineContributionReceivedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    tontineName: data.tontineName,
    amount: data.montant.toLocaleString("fr-FR"),
    tourNumero: data.tourNumero ? String(data.tourNumero) : undefined,
    reference: data.reference,
  };

  await emitNotificationEvent("TONTINE_CONTRIBUTION_RECEIVED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "TONTINE_CONTRIBUTION_RECEIVED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "TONTINE_CONTRIBUTION_RECEIVED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: TONTINE_CONTRIBUTION_RECEIVED", {
    correlationId: `tontine-contrib-${data.tontineId}-${data.clientId}`,
    status: "DISPATCHED",
  });
}

export async function handleTontineContributionOverdue(data: TontineContributionOverdueData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    tontineName: data.tontineName,
    amount: data.montantDu.toLocaleString("fr-FR"),
    dueDate: data.dueDate,
    daysOverdue: String(data.daysOverdue),
  };

  await emitNotificationEvent("TONTINE_CONTRIBUTION_OVERDUE", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "TONTINE_CONTRIBUTION_OVERDUE", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "TONTINE_CONTRIBUTION_OVERDUE", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("warn", "Domain event: TONTINE_CONTRIBUTION_OVERDUE", {
    correlationId: `tontine-overdue-${data.tontineId}-${data.clientId}`,
    status: "DISPATCHED",
  });
}

export async function handleTontinePenaltyApplied(data: TontinePenaltyAppliedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    tontineName: data.tontineName,
    montantPenalite: data.montantPenalite.toLocaleString("fr-FR"),
    motif: data.motif,
  };

  await emitNotificationEvent("TONTINE_PENALTY_APPLIED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "TONTINE_PENALTY_APPLIED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "TONTINE_PENALTY_APPLIED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("warn", "Domain event: TONTINE_PENALTY_APPLIED", {
    correlationId: `tontine-penalty-${data.tontineId}-${data.clientId}`,
    status: "DISPATCHED",
  });
}

export async function handleTontineDistributionApproved(data: TontineDistributionApprovedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    tontineName: data.tontineName,
    amount: data.montant.toLocaleString("fr-FR"),
    payoutMethod: data.payoutMethod,
  };

  await emitNotificationEvent("TONTINE_DISTRIBUTION_APPROVED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "TONTINE_DISTRIBUTION_APPROVED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "TONTINE_DISTRIBUTION_APPROVED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: TONTINE_DISTRIBUTION_APPROVED", {
    correlationId: `tontine-dist-approved-${data.requestId}`,
    status: "DISPATCHED",
  });
}

export async function handleTontineDistributionPaid(data: TontineDistributionPaidData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    tontineName: data.tontineName,
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
    payoutMethod: data.payoutMethod,
  };

  await emitNotificationEvent("TONTINE_DISTRIBUTION_PAID", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "TONTINE_DISTRIBUTION_PAID", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "TONTINE_DISTRIBUTION_PAID", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: TONTINE_DISTRIBUTION_PAID", {
    correlationId: `tontine-dist-paid-${data.tontineId}-${data.clientId}`,
    status: "DISPATCHED",
  });
}

export async function handleTontineCycleStarted(data: TontineCycleStartedData) {
  // Notify all active members of this tontine
  try {
    const members = await db
      .select({ clientId: membresTontine.clientId })
      .from(membresTontine)
      .where(
        and(
          eq(membresTontine.tontineId, data.tontineId),
          eq(membresTontine.statut, "ACTIVE"),
          isNull(membresTontine.deletedAt)
        )
      );

    for (const member of members) {
      if (!member.clientId) continue;

      const client = await getClientContact(member.clientId);
      if (!client) continue;

      const payload = {
        clientName: client.name,
        tontineName: data.tontineName,
        cycleNumber: String(data.cycleNumber),
        startDate: data.startDate,
      };

      await emitNotificationEvent("TONTINE_CYCLE_STARTED", data as any, {
        smsRecipients: client.phone
          ? [{ phone: client.phone, templateCode: "TONTINE_CYCLE_STARTED", payload, agenceId: data.agenceId }]
          : [],
        emailRecipients: client.email
          ? [{ email: client.email, templateCode: "TONTINE_CYCLE_STARTED", payload, agenceId: data.agenceId }]
          : [],
      });
    }
  } catch (error: any) {
    console.error("[TontineCycleStarted] Error notifying members:", error.message);
  }

  logNotificationEvent("info", "Domain event: TONTINE_CYCLE_STARTED", {
    correlationId: `tontine-cycle-${data.tontineId}-${data.cycleNumber}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// ACCOUNT / SAVINGS EVENT HANDLERS
// ============================================================================

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  SAVINGS: "Épargne",
  CURRENT: "Courant",
  BLOCKED: "Bloqué",
};

export async function handleAccountCreated(data: AccountCreatedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    accountType: ACCOUNT_TYPE_LABELS[data.typeCompte] || data.typeCompte,
    amount: data.montantInitial > 0 ? data.montantInitial.toLocaleString("fr-FR") : undefined,
  };

  await emitNotificationEvent("ACCOUNT_CREATED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_CREATED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_CREATED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: ACCOUNT_CREATED", {
    correlationId: `account-created-${data.compteId}`,
    status: "DISPATCHED",
  });
}

export async function handleAccountActivated(data: AccountActivatedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    accountType: ACCOUNT_TYPE_LABELS[data.typeCompte] || data.typeCompte,
    amount: data.montantDepose.toLocaleString("fr-FR"),
  };

  await emitNotificationEvent("ACCOUNT_ACTIVATED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_ACTIVATED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_ACTIVATED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: ACCOUNT_ACTIVATED", {
    correlationId: `account-activated-${data.compteId}`,
    status: "DISPATCHED",
  });
}

export async function handleAccountDeposit(data: AccountDepositData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    amount: data.montant.toLocaleString("fr-FR"),
    balance: Number(data.nouveauSolde).toLocaleString("fr-FR"),
  };

  await emitNotificationEvent("ACCOUNT_DEPOSIT", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_DEPOSIT", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_DEPOSIT", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: ACCOUNT_DEPOSIT", {
    correlationId: `account-deposit-${data.compteId}-${Date.now()}`,
    status: "DISPATCHED",
  });
}

export async function handleAccountWithdrawal(data: AccountWithdrawalData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    amount: data.montant.toLocaleString("fr-FR"),
    balance: Number(data.nouveauSolde).toLocaleString("fr-FR"),
  };

  await emitNotificationEvent("ACCOUNT_WITHDRAWAL", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_WITHDRAWAL", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_WITHDRAWAL", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: ACCOUNT_WITHDRAWAL", {
    correlationId: `account-withdrawal-${data.compteId}-${Date.now()}`,
    status: "DISPATCHED",
  });
}

export async function handleAccountBlocked(data: AccountBlockedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const motifLabels: Record<string, string> = {
    LOAN_GUARANTEE: "Garantie de crédit",
    TONTINE_GUARANTEE: "Garantie de tontine",
    FORCED_SAVINGS: "Épargne forcée",
    INTERNAL_DECISION: "Décision interne",
    DISPUTE: "Litige",
    OTHER: "Autre",
  };

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    motif: motifLabels[data.motif] || data.motif,
    dateFin: data.dateFin || undefined,
  };

  await emitNotificationEvent("ACCOUNT_BLOCKED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_BLOCKED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_BLOCKED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("warn", "Domain event: ACCOUNT_BLOCKED", {
    correlationId: `account-blocked-${data.compteId}`,
    status: "DISPATCHED",
  });
}

export async function handleAccountUnblocked(data: AccountUnblockedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
  };

  await emitNotificationEvent("ACCOUNT_UNBLOCKED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_UNBLOCKED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_UNBLOCKED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: ACCOUNT_UNBLOCKED", {
    correlationId: `account-unblocked-${data.compteId}`,
    status: "DISPATCHED",
  });
}

export async function handleAccountClosed(data: AccountClosedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    accountType: ACCOUNT_TYPE_LABELS[data.typeCompte] || data.typeCompte,
  };

  await emitNotificationEvent("ACCOUNT_CLOSED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "ACCOUNT_CLOSED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "ACCOUNT_CLOSED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: ACCOUNT_CLOSED", {
    correlationId: `account-closed-${data.compteId}`,
    status: "DISPATCHED",
  });
}

export async function handleInterestCapitalized(data: InterestCapitalizedData) {
  const client = await getClientContact(data.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    accountNumber: data.numeroCompte,
    interestAmount: data.montantInteret.toLocaleString("fr-FR"),
    newBalance: Number(data.nouveauSolde).toLocaleString("fr-FR"),
  };

  await emitNotificationEvent("INTEREST_CAPITALIZED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "INTEREST_CAPITALIZED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "INTEREST_CAPITALIZED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: INTEREST_CAPITALIZED", {
    correlationId: `interest-cap-${data.compteId}-${Date.now()}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// TRANSFER EVENT HANDLERS
// ============================================================================

const TRANSFER_TYPE_LABELS: Record<string, string> = {
  COFFRE_VERS_CAISSE: "Coffre → Caisse",
  CAISSE_VERS_COFFRE: "Caisse → Coffre",
};

export async function handleTransferRequested(data: TransferRequestedData) {
  const requester = await getUserContact(data.requestedByUserId);

  const payload = {
    userName: requester?.name || "Opérateur",
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
    typeTransfert: TRANSFER_TYPE_LABELS[data.typeTransfert] || data.typeTransfert,
  };

  await emitNotificationEvent("TRANSFER_REQUESTED", data as any, {
    smsRecipients: [],
    emailRecipients: requester?.email
      ? [{ email: requester.email, templateCode: "TRANSFER_REQUESTED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: TRANSFER_REQUESTED", {
    correlationId: `transfer-req-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

export async function handleTransferValidated(data: TransferValidatedData) {
  const validator = await getUserContact(data.validatedByUserId);

  const payload = {
    userName: validator?.name || "Validateur",
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
  };

  await emitNotificationEvent("TRANSFER_VALIDATED", data as any, {
    smsRecipients: [],
    emailRecipients: validator?.email
      ? [{ email: validator.email, templateCode: "TRANSFER_EXECUTED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: TRANSFER_VALIDATED", {
    correlationId: `transfer-val-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

export async function handleTransferRejected(data: TransferRejectedData) {
  // Notify the person who rejected (confirmation email)
  const rejector = await getUserContact(data.rejectedByUserId);

  const payload = {
    userName: rejector?.name || "Opérateur",
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
    reason: data.reason || "Non spécifié",
  };

  await emitNotificationEvent("TRANSFER_REJECTED", data as any, {
    smsRecipients: [],
    emailRecipients: rejector?.email
      ? [{ email: rejector.email, templateCode: "TRANSFER_REJECTED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("warn", "Domain event: TRANSFER_REJECTED", {
    correlationId: `transfer-rej-${data.transfertId}`,
    status: "DISPATCHED",
  });
}

export async function handleTransferExecuted(data: TransferExecutedData) {
  const executor = await getUserContact(data.executedByUserId);

  const payload = {
    userName: executor?.name || "Opérateur",
    amount: data.montant.toLocaleString("fr-FR"),
    reference: data.reference,
    typeTransfert: TRANSFER_TYPE_LABELS[data.typeTransfert] || data.typeTransfert,
  };

  await emitNotificationEvent("TRANSFER_EXECUTED", data as any, {
    smsRecipients: [],
    emailRecipients: executor?.email
      ? [{ email: executor.email, templateCode: "TRANSFER_EXECUTED", payload, agenceId: data.agenceId }]
      : [],
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
  // Look up source and destination accounts to notify the client
  const [sourceCompte] = await db.select().from(comptes).where(eq(comptes.id, data.compteSourceId)).limit(1);
  const [destCompte] = await db.select().from(comptes).where(eq(comptes.id, data.compteDestId)).limit(1);

  if (!sourceCompte) return;

  const client = await getClientContact(sourceCompte.clientId);
  if (!client) return;

  const payload = {
    clientName: client.name,
    amount: data.montant.toLocaleString("fr-FR"),
    fromAccount: sourceCompte.numeroCompte,
    toAccount: destCompte?.numeroCompte || "—",
  };

  await emitNotificationEvent("SCHEDULED_TRANSFER_EXECUTED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "SCHEDULED_TRANSFER_EXECUTED", payload, agenceId: sourceCompte.agenceId || undefined }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "SCHEDULED_TRANSFER_EXECUTED", payload, agenceId: sourceCompte.agenceId || undefined }]
      : [],
  });

  logNotificationEvent("info", "Domain event: SCHEDULED_TRANSFER_EXECUTED", {
    correlationId: `sched-transfer-${data.executionKey}`,
    status: "DISPATCHED",
  });
}

export async function handleScheduledTransferFailed(
  data: ScheduledTransferFailedData
) {
  // Look up the schedule to find the accounts and client
  const [schedule] = await db.select().from(virementsProgrammes).where(eq(virementsProgrammes.id, data.scheduleId)).limit(1);
  if (!schedule) return;

  const [sourceCompte] = await db.select().from(comptes).where(eq(comptes.id, schedule.compteSourceId)).limit(1);
  if (!sourceCompte) return;

  const client = await getClientContact(sourceCompte.clientId);
  if (!client) return;

  const retryInfo = data.disabled
    ? "Virement desactive apres echecs multiples"
    : `Tentative ${data.retryCount}/${data.maxRetries}`;

  const payload = {
    clientName: client.name,
    amount: data.montant.toLocaleString("fr-FR"),
    fromAccount: sourceCompte.numeroCompte,
    errorMessage: data.errorMessage,
    retryInfo,
  };

  await emitNotificationEvent("SCHEDULED_TRANSFER_FAILED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "SCHEDULED_TRANSFER_FAILED", payload, agenceId: sourceCompte.agenceId || undefined }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "SCHEDULED_TRANSFER_FAILED", payload, agenceId: sourceCompte.agenceId || undefined }]
      : [],
  });

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
  // Notify the employee that their leave request was received
  const employee = await getEmployeeContact(data.employeId);
  if (!employee) return;

  const payload = {
    employeeName: data.employeNom,
    leaveType: data.type,
    startDate: data.dateDebut,
    endDate: data.dateFin,
    daysRequested: String(data.daysRequested),
  };

  await emitNotificationEvent("HR_LEAVE_REQUESTED", data as any, {
    smsRecipients: employee.phone
      ? [{ phone: employee.phone, templateCode: "HR_LEAVE_REQUESTED", payload, userId: employee.userId || undefined, agenceId: data.agenceId }]
      : [],
    emailRecipients: employee.email
      ? [{ email: employee.email, templateCode: "HR_LEAVE_REQUESTED", payload, agenceId: data.agenceId }]
      : [],
  });

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
  // Notify each cashier whose session was force-closed
  for (const session of data.sessions) {
    if (!session.caissierId) continue;

    const user = await getUserContact(session.caissierId);
    if (!user || !user.email) continue;

    const payload = {
      userName: user.name,
      hoursInactive: String(session.hoursInactive),
    };

    await emitNotificationEvent("SESSION_FORCE_CLOSED", session as any, {
      smsRecipients: user.phone
        ? [{ phone: user.phone, templateCode: "SESSION_FORCE_CLOSED", payload }]
        : [],
      emailRecipients: [{ email: user.email, templateCode: "SESSION_FORCE_CLOSED", payload }],
    });
  }

  logNotificationEvent("warn", `Domain event: SESSION_FORCE_CLOSED — ${data.sessions.length} sessions closed`, {
    correlationId: `session-cleanup-${Date.now()}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// CLIENT / USER / EMPLOYEE LIFECYCLE HANDLERS
// ============================================================================

export async function handleClientCreated(data: ClientCreatedData) {
  // Send welcome notification to the new client
  const phone = data.telephone;
  const email = data.email;

  if (!phone && !email) return;

  const clientName = [data.clientNom, data.clientPrenom].filter(Boolean).join(" ");

  const payload = {
    clientName,
    agenceName: data.agenceNom || undefined,
    accountNumber: data.numeroCompte || undefined,
  };

  await emitNotificationEvent("CLIENT_CREATED", data as any, {
    smsRecipients: phone
      ? [{ phone, templateCode: "CLIENT_CREATED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: email
      ? [{ email, templateCode: "CLIENT_CREATED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: CLIENT_CREATED", {
    correlationId: `client-created-${data.clientId}`,
    status: "DISPATCHED",
  });
}

export async function handleUserRegistered(data: UserRegisteredData) {
  // Send welcome email to the new user
  if (!data.email) return;

  const payload = {
    userName: [data.nom, data.prenom].filter(Boolean).join(" "),
    username: data.username,
  };

  await emitNotificationEvent("USER_REGISTERED", data as any, {
    smsRecipients: [],
    emailRecipients: [{ email: data.email, templateCode: "USER_REGISTERED", payload, agenceId: data.agenceId }],
  });

  logNotificationEvent("info", "Domain event: USER_REGISTERED", {
    correlationId: `user-registered-${data.userId}`,
    status: "DISPATCHED",
  });
}

export async function handleUserPasswordChanged(data: UserPasswordChangedData) {
  // Send security confirmation email
  if (!data.email) return;

  const payload = {
    userName: data.userName,
  };

  await emitNotificationEvent("USER_PASSWORD_CHANGED", data as any, {
    smsRecipients: [],
    emailRecipients: [{ email: data.email, templateCode: "USER_PASSWORD_CHANGED", payload }],
  });

  logNotificationEvent("info", "Domain event: USER_PASSWORD_CHANGED", {
    correlationId: `pwd-changed-${data.userId}`,
    status: "DISPATCHED",
  });
}

export async function handleEmployeeCreated(data: EmployeeCreatedData) {
  // Send welcome email to the new employee
  if (!data.email) return;

  const payload = {
    employeeName: [data.nom, data.prenom].filter(Boolean).join(" "),
    matricule: data.matricule,
    username: data.username || undefined,
    agenceName: data.agenceNom || undefined,
  };

  await emitNotificationEvent("EMPLOYEE_CREATED", data as any, {
    smsRecipients: data.telephone
      ? [{ phone: data.telephone, templateCode: "EMPLOYEE_CREATED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: [{ email: data.email, templateCode: "EMPLOYEE_CREATED", payload, agenceId: data.agenceId }],
  });

  logNotificationEvent("info", "Domain event: EMPLOYEE_CREATED", {
    correlationId: `employee-created-${data.employeId}`,
    status: "DISPATCHED",
  });
}

// ============================================================================
// OPERATIONS TERRAIN HANDLERS
// ============================================================================

export async function handleProspectionCreated(data: ProspectionCreatedData) {
  // Internal notification — send confirmation email to the agent who created the prospection
  // data.userId is the logged-in user's ID (not agentsTerrain.id)
  if (!data.userId) return;

  const agent = await getUserContact(data.userId);

  const payload = {
    agentName: data.agentNom || agent?.name || "Agent",
    prospectName: data.nomProspect,
    location: data.localisation || "Non spécifiée",
  };

  await emitNotificationEvent("PROSPECTION_CREATED", data as any, {
    smsRecipients: [],
    emailRecipients: agent?.email
      ? [{ email: agent.email, templateCode: "PROSPECTION_CREATED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: PROSPECTION_CREATED", {
    correlationId: `prospection-${data.prospectionId}`,
    status: "DISPATCHED",
  });
}

export async function handlePaiementTerrainValidated(data: PaiementTerrainValidatedData) {
  // Send confirmation to the client whose payment was validated
  if (!data.clientId) return;

  const client = await getClientContact(data.clientId);
  if (!client) return;

  const PAYMENT_TYPE_LABELS: Record<string, string> = {
    "Paiement Crédit": "Remboursement crédit",
    "Dépôt Épargne": "Dépôt épargne",
    "Cotisation Tontine": "Cotisation tontine",
    "Autre": "Paiement",
  };

  const payload = {
    clientName: client.name,
    amount: Number(data.montant).toLocaleString("fr-FR"),
    paymentType: PAYMENT_TYPE_LABELS[data.typePaiement] || data.typePaiement,
    reference: data.reference || undefined,
  };

  await emitNotificationEvent("PAIEMENT_TERRAIN_VALIDATED", data as any, {
    smsRecipients: client.phone
      ? [{ phone: client.phone, templateCode: "PAIEMENT_TERRAIN_VALIDATED", payload, agenceId: data.agenceId }]
      : [],
    emailRecipients: client.email
      ? [{ email: client.email, templateCode: "PAIEMENT_TERRAIN_VALIDATED", payload, agenceId: data.agenceId }]
      : [],
  });

  logNotificationEvent("info", "Domain event: PAIEMENT_TERRAIN_VALIDATED", {
    correlationId: `paiement-terrain-${data.paiementId}`,
    status: "DISPATCHED",
  });
}
