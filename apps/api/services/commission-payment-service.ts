/**
 * Commission Payment Service — GL posting, caisse debit, HR integration, and Mobile Money
 *
 * Handles 3 payment methods for agent commissions:
 * - CASH: debit caisse session, post GL (D 6615 / C 521)
 * - PAYROLL: post GL (D 6615 / C 421), assign HR benefit for next payslip
 * - MOBILE_MONEY: initiate pawaPay payout, finalized via webhook callback
 */

import {
  mouvementsFinanciers,
  agentCommissions,
  agentsTerrain,
  employes,
  avantages,
  avantagesEmployes,
  sessionsCaisse,
} from "@shared/schema";
import type { AgentCommission } from "@shared/schema";
import { StatutTransaction } from "@shared/enum/status-constants";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { postGlForMouvement } from "./accounting-posting-service";
import { generateReference, updateSessionSolde } from "./ledger";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { createLogger } from "../lib/logger";

const logger = createLogger("CommissionPayment");

export interface CommissionPaymentResult {
  mouvementId: string | null;
  ecritureId: string | null;
  glPostingStatus: string;
  avantageEmployeId: number | null;
  intentId?: string; // For mobile money
}

// ────────────────────────────────────────────────────────────────────────────
// Shared: resolve agent employee info
// ────────────────────────────────────────────────────────────────────────────

async function resolveAgentEmployee(
  tx: PgTransaction<any, any, any>,
  agentId: string
): Promise<{ employeId: string | null; employeNom: string }> {
  let employeNom = "Agent";
  let employeId: string | null = null;

  const [agentRow] = await tx
    .select({ employeId: agentsTerrain.employeId })
    .from(agentsTerrain)
    .where(eq(agentsTerrain.id, agentId))
    .limit(1);

  if (agentRow?.employeId) {
    employeId = agentRow.employeId;

    const { users } = await import("@shared/schema");
    const [empUser] = await tx
      .select({ nom: users.nom, prenom: users.prenom })
      .from(employes)
      .innerJoin(users, eq(employes.userId, users.id))
      .where(eq(employes.id, agentRow.employeId))
      .limit(1);

    if (empUser) {
      employeNom = `${empUser.prenom || ""} ${empUser.nom}`.trim();
    }
  }

  return { employeId, employeNom };
}

// ────────────────────────────────────────────────────────────────────────────
// Method 1: CASH — Debit caisse session
// ────────────────────────────────────────────────────────────────────────────

export async function payCommissionCash(
  tx: PgTransaction<any, any, any>,
  commission: AgentCommission,
  sessionCaisseId: string,
  agenceId: string,
  userId: string
): Promise<CommissionPaymentResult> {
  const montantNet = Number(commission.montantNet || 0);
  if (montantNet <= 0) throw new Error("Montant net de la commission invalide");

  const { employeId, employeNom } = await resolveAgentEmployee(tx, commission.agentId);

  // Verify session exists and is open
  const [session] = await tx
    .select()
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionCaisseId))
    .for("update");

  if (!session || session.statut !== "OPEN") {
    throw new Error("Session caisse non trouvée ou fermée");
  }

  const reference = generateReference("RH_PAYROLL");

  // 1. Create financial movement
  const [mouvement] = await tx
    .insert(mouvementsFinanciers)
    .values({
      montant: commission.montantNet,
      sens: "DEBIT",
      sourceModule: "RH_PAYROLL",
      typePaiement: "AGENT_COMMISSION",
      methodePaiement: "CASH",
      sessionCaisseId,
      agenceId,
      agentId: commission.agentId,
      reference,
      idempotencyKey: `commission-cash-${commission.id}`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
      requiresGlPosting: true,
      glPostingStatus: "PENDING",
      createdBy: userId,
      metadata: {
        commissionId: commission.id,
        agentId: commission.agentId,
        employeNom,
        periode: commission.periode,
        type: "AGENT_COMMISSION",
      },
    } as any)
    .returning();

  // 2. Debit caisse session balance
  await updateSessionSolde(tx, sessionCaisseId, -montantNet);

  // 3. Post GL entry
  let ecritureId: string | null = null;
  let glPostingStatus = "PENDING";

  try {
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
      commissionId: commission.id,
      employeNom,
      periode: commission.periode,
      type: "AGENT_COMMISSION",
    });
    if (glResult) {
      ecritureId = glResult.ecritureId;
      glPostingStatus = "POSTED";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GL error";
    logger.error({ commissionId: commission.id, error: message }, "GL posting failed for commission cash payment");
    glPostingStatus = "FAILED";

    await tx
      .update(mouvementsFinanciers)
      .set({ glPostingStatus: "FAILED", glPostingError: message })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  // 4. Update commission status
  await tx
    .update(agentCommissions)
    .set({
      statutPaiement: "PAID",
      datePaiement: new Date(),
      methodePaiement: "Espèces",
      mouvementId: mouvement.id,
      updatedAt: new Date(),
    })
    .where(eq(agentCommissions.id, commission.id));

  logger.info(
    { commissionId: commission.id, mouvementId: mouvement.id, montantNet, sessionCaisseId },
    "Commission paid via cash"
  );

  return { mouvementId: mouvement.id, ecritureId, glPostingStatus, avantageEmployeId: null };
}

// ────────────────────────────────────────────────────────────────────────────
// Method 2: PAYROLL — HR benefit + GL provision
// ────────────────────────────────────────────────────────────────────────────

export async function payCommissionPayroll(
  tx: PgTransaction<any, any, any>,
  commission: AgentCommission,
  agenceId: string,
  userId: string
): Promise<CommissionPaymentResult> {
  const montantNet = Number(commission.montantNet || 0);
  if (montantNet <= 0) throw new Error("Montant net de la commission invalide");

  const { employeId, employeNom } = await resolveAgentEmployee(tx, commission.agentId);

  if (!employeId) {
    throw new Error("Agent non lié à un employé — impossible de payer via fiche de paie");
  }

  const reference = generateReference("RH_PAYROLL");

  // 1. Create financial movement
  const [mouvement] = await tx
    .insert(mouvementsFinanciers)
    .values({
      montant: commission.montantNet,
      sens: "DEBIT",
      sourceModule: "RH_PAYROLL",
      typePaiement: "AGENT_COMMISSION",
      methodePaiement: "PAYROLL",
      agenceId,
      agentId: commission.agentId,
      reference,
      idempotencyKey: `commission-payroll-${commission.id}`,
      statut: StatutTransaction.POSTED,
      dateOperation: new Date(),
      requiresGlPosting: true,
      glPostingStatus: "PENDING",
      createdBy: userId,
      metadata: {
        commissionId: commission.id,
        agentId: commission.agentId,
        employeNom,
        employeId,
        periode: commission.periode,
        type: "AGENT_COMMISSION",
      },
    } as any)
    .returning();

  // 2. Post GL entry (D 6615 / C 421)
  let ecritureId: string | null = null;
  let glPostingStatus = "PENDING";

  try {
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
      commissionId: commission.id,
      employeNom,
      periode: commission.periode,
      type: "AGENT_COMMISSION",
    });
    if (glResult) {
      ecritureId = glResult.ecritureId;
      glPostingStatus = "POSTED";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GL error";
    logger.error({ commissionId: commission.id, error: message }, "GL posting failed for commission payroll");
    glPostingStatus = "FAILED";

    await tx
      .update(mouvementsFinanciers)
      .set({ glPostingStatus: "FAILED", glPostingError: message })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  // 3. HR integration: assign "Commission Agent Terrain" benefit
  let avantageEmployeId: number | null = null;

  try {
    // Find or create benefit catalog entry
    let [commissionAvantage] = await tx
      .select()
      .from(avantages)
      .where(
        and(
          eq(avantages.nom, "Commission Agent Terrain"),
          eq(avantages.type, "Prime")
        )
      )
      .limit(1);

    if (!commissionAvantage) {
      [commissionAvantage] = await tx
        .insert(avantages)
        .values({
          nom: "Commission Agent Terrain",
          type: "Prime",
          montantParDefaut: montantNet,
          description: "Commission mensuelle sur les collectes terrain",
          modeCalcul: "FIXE",
          frequence: "PONCTUEL",
          imposable: true,
          soumisCnss: true,
          actif: true,
        })
        .returning();
    }

    // Assign benefit to employee with specific montant
    const [assignedBenefit] = await tx
      .insert(avantagesEmployes)
      .values({
        employeId,
        avantageId: commissionAvantage.id,
        montant: montantNet,
        statut: "ACTIVE",
      })
      .returning();

    avantageEmployeId = assignedBenefit.id;
  } catch (hrError) {
    logger.error(
      { commissionId: commission.id, employeId, err: hrError },
      "HR benefit assignment failed for commission — payment still goes through"
    );
  }

  // 4. Update commission status
  await tx
    .update(agentCommissions)
    .set({
      statutPaiement: "PAID",
      datePaiement: new Date(),
      methodePaiement: "Fiche de paie",
      mouvementId: mouvement.id,
      updatedAt: new Date(),
    })
    .where(eq(agentCommissions.id, commission.id));

  logger.info(
    { commissionId: commission.id, mouvementId: mouvement.id, avantageEmployeId, montantNet },
    "Commission paid via payroll"
  );

  return { mouvementId: mouvement.id, ecritureId, glPostingStatus, avantageEmployeId };
}

// ────────────────────────────────────────────────────────────────────────────
// Method 3: MOBILE MONEY — Initiate pawaPay payout (async)
// ────────────────────────────────────────────────────────────────────────────

export async function initiateCommissionMobileMoney(
  commission: AgentCommission,
  phone: string,
  provider: string,
  agenceId: string,
  userId: string
): Promise<CommissionPaymentResult> {
  const montantNet = Number(commission.montantNet || 0);
  if (montantNet <= 0) throw new Error("Montant net de la commission invalide");

  // Import mobile money service dynamically to avoid circular deps
  const { paymentService: mobileMoneyPaymentService } = await import("./mobile-money/payment-service");

  // Initiate payout via pawaPay
  const intent = await mobileMoneyPaymentService.initiatePayout(
    {
      provider: provider as 'MTN' | 'AIRTEL',
      amount: montantNet,
      phone,
      clientId: commission.agentId,
      agenceId,
      idempotencyKey: `commission-mm-${commission.id}`,
      description: `Commission agent — ${commission.periode}`,
      metadata: {
        useCase: "COMMISSION_PAYOUT",
        commissionId: commission.id,
        agentId: commission.agentId,
        periode: commission.periode,
      },
    },
    userId
  );

  // Mark commission as PROCESSING (finalized by webhook callback)
  await db
    .update(agentCommissions)
    .set({
      statutPaiement: "PROCESSING",
      methodePaiement: "Mobile Money",
      updatedAt: new Date(),
    })
    .where(eq(agentCommissions.id, commission.id));

  logger.info(
    { commissionId: commission.id, intentId: intent.id, phone, provider, montantNet },
    "Commission mobile money payout initiated"
  );

  return {
    mouvementId: null,
    ecritureId: null,
    glPostingStatus: "PENDING",
    avantageEmployeId: null,
    intentId: intent.id,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Callback handler for successful MM payout (called from payment-service.ts)
// ────────────────────────────────────────────────────────────────────────────

export async function finalizeCommissionMobileMoney(
  commissionId: string,
  mouvementId: string
): Promise<void> {
  await db
    .update(agentCommissions)
    .set({
      statutPaiement: "PAID",
      datePaiement: new Date(),
      mouvementId,
      updatedAt: new Date(),
    })
    .where(eq(agentCommissions.id, commissionId));

  logger.info({ commissionId, mouvementId }, "Commission mobile money payout finalized");
}
