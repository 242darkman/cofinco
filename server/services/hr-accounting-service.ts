/**
 * HR Accounting Service — GL posting for payroll events
 *
 * Provides transactional GL posting for:
 * - PAYROLL_ENGAGEMENT: when bulletin is VALIDATED (charge salariale → dette personnel)
 * - PAYROLL_PAYMENT: when bulletin is PAID (dette personnel → trésorerie)
 */

import { mouvementsFinanciers, bulletinsPaie } from "@shared/schema";
import { StatutTransaction } from "@shared/enum/status-constants";
import { eq } from "drizzle-orm";
import { postGlForMouvement } from "./accounting-posting-service";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { BulletinPaie } from "@shared/schema";

function generateReference(prefix: string): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${prefix}-${timestamp}${random}`;
}

export interface PayrollGlResult {
  mouvementId: string;
  ecritureId: string | null;
  glPostingStatus: string;
}

/**
 * Post GL engagement entry when a bulletin is VALIDATED.
 *
 * Accounting: Debit 661 (Rémunérations du personnel) / Credit 421 (Personnel rémun. dues)
 * Matched by accounting_rules with eventType = "PAYROLL_ENGAGEMENT"
 */
export async function postPayrollEngagement(
  tx: PgTransaction<any, any, any>,
  bulletin: BulletinPaie,
  agenceId: string,
  userId: string
): Promise<PayrollGlResult> {
  const reference = generateReference("ENG");

  // Create the engagement mouvement (salaire brut)
  const [mouvement] = await tx.insert(mouvementsFinanciers).values({
    montant: bulletin.salaireBrut,
    sens: "DEBIT",
    sourceModule: "RH_PAYROLL" as any,
    typePaiement: "PAYROLL_ENGAGEMENT" as any,
    agenceId,
    reference,
    idempotencyKey: `payroll-eng-${bulletin.id}-${bulletin.mois}`,
    statut: StatutTransaction.POSTED,
    dateOperation: new Date(),
    requiresGlPosting: true,
    glPostingStatus: "PENDING",
    metadata: {
      bulletinId: bulletin.id,
      employeId: bulletin.employeId,
      employeNom: bulletin.employeNom,
      mois: bulletin.mois,
      salaireBrut: bulletin.salaireBrut,
      salaireNet: bulletin.salaireNet,
      totalRetenues: bulletin.totalRetenues,
      type: "ENGAGEMENT_PAIE",
    },
  }).returning();

  // Post GL entry
  let ecritureId: string | null = null;
  let glPostingStatus = "PENDING";

  try {
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
      bulletinId: bulletin.id,
      employeNom: bulletin.employeNom,
      mois: bulletin.mois,
      type: "ENGAGEMENT",
    });
    if (glResult) {
      ecritureId = glResult.ecritureId;
      glPostingStatus = "POSTED";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GL error";
    console.error(`[HrAccounting] GL posting failed for engagement bulletin ${bulletin.id}: ${message}`);
    glPostingStatus = "FAILED";
    await tx.update(mouvementsFinanciers)
      .set({ glPostingStatus: "FAILED", glPostingError: message })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  if (glPostingStatus === "POSTED") {
    await tx.update(mouvementsFinanciers)
      .set({ glPostingStatus: "POSTED", glPostingError: null })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  // Update bulletin with GL tracking references
  await tx.update(bulletinsPaie)
    .set({
      engagementMouvementId: mouvement.id,
      engagementEcritureId: ecritureId,
    })
    .where(eq(bulletinsPaie.id, bulletin.id));

  return { mouvementId: mouvement.id, ecritureId, glPostingStatus };
}

/**
 * Post GL payment entry when a bulletin is PAID.
 *
 * Accounting: Debit 421 (Personnel rémun. dues) / Credit 521 (Caisse)
 * Matched by accounting_rules with eventType = "PAYROLL_PAYMENT"
 */
export async function postPayrollPayment(
  tx: PgTransaction<any, any, any>,
  bulletin: BulletinPaie,
  agenceId: string,
  userId: string
): Promise<PayrollGlResult> {
  const reference = generateReference("PAY");

  // Create the payment mouvement (salaire net — actual cash out)
  const [mouvement] = await tx.insert(mouvementsFinanciers).values({
    montant: bulletin.salaireNet,
    sens: "DEBIT",
    sourceModule: "RH_PAYROLL" as any,
    typePaiement: "PAYROLL_PAYMENT" as any,
    agenceId,
    reference,
    idempotencyKey: `payroll-pay-${bulletin.id}-${bulletin.mois}`,
    statut: StatutTransaction.POSTED,
    dateOperation: new Date(),
    requiresGlPosting: true,
    glPostingStatus: "PENDING",
    metadata: {
      bulletinId: bulletin.id,
      employeId: bulletin.employeId,
      employeNom: bulletin.employeNom,
      mois: bulletin.mois,
      salaireNet: bulletin.salaireNet,
      type: "PAIEMENT_PAIE",
    },
  }).returning();

  // Post GL entry
  let ecritureId: string | null = null;
  let glPostingStatus = "PENDING";

  try {
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, userId, {
      bulletinId: bulletin.id,
      employeNom: bulletin.employeNom,
      mois: bulletin.mois,
      type: "PAIEMENT",
    });
    if (glResult) {
      ecritureId = glResult.ecritureId;
      glPostingStatus = "POSTED";
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GL error";
    console.error(`[HrAccounting] GL posting failed for payment bulletin ${bulletin.id}: ${message}`);
    glPostingStatus = "FAILED";
    await tx.update(mouvementsFinanciers)
      .set({ glPostingStatus: "FAILED", glPostingError: message })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  if (glPostingStatus === "POSTED") {
    await tx.update(mouvementsFinanciers)
      .set({ glPostingStatus: "POSTED", glPostingError: null })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }

  // Update bulletin with GL tracking references
  await tx.update(bulletinsPaie)
    .set({
      paiementMouvementId: mouvement.id,
      paiementEcritureId: ecritureId,
    })
    .where(eq(bulletinsPaie.id, bulletin.id));

  return { mouvementId: mouvement.id, ecritureId, glPostingStatus };
}
