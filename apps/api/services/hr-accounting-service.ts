/**
 * HR Accounting Service — Ventilated GL posting for payroll (OHADA-compliant)
 *
 * Replaces legacy 2-entry global posting with N-line ventilated entries:
 *
 * VALIDATION (engagement):
 *   Entry 1 — Charges de personnel:
 *     D 6611 Rémunérations personnel         [brut]
 *     C 4211 Personnel rémun. dues            [net]
 *     C 4311 CNSS cotisations                 [cnss salariale]
 *     C 4421 État — IRPP                      [irpp]
 *     C 4212 Avances personnel déduit         [avances déduites]
 *
 *   Entry 2 — Charges patronales:
 *     D 6641 Charges sociales                 [cnss patronale + atmp]
 *     D 6651 Formation professionnelle        [cfc + tap]
 *     C 4311 CNSS cotisations                 [cnss patronale + atmp]
 *     C 4471 Formation professionnelle        [cfc + tap]
 *
 * PAYMENT (décaissement):
 *   Entry 3 — Décaissement salaires:
 *     D 4211 Personnel rémun. dues            [net total]
 *     C 521  Caisse / 512 Banque              [net total]
 *
 * Uses payrollGlMapping table for account resolution.
 */

import { db } from "../db";
import {
  bulletinsPaie,
  payslipLines,
  payrollRuns,
  payrollGlMapping,
  PayrollRunStatus,
  BulletinStatus,
  type BulletinPaie,
  type PayrollRun,
  type PayrollGlMappingEntry,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { postEntry, reverseEntry } from "./accounting-posting-service";
import type { PostEntryLine, PostEntryResult } from "@shared/schema";
import { createLogger } from "../lib/logger";

const logger = createLogger("HrAccounting");

// ============================================================================
// TYPES
// ============================================================================

export interface RunGlResult {
  engagementEcritureIds: string[];
  patronalEcritureId: string | null;
  paiementEcritureId: string | null;
  errors: string[];
}

// ============================================================================
// GL MAPPING LOADER
// ============================================================================

async function loadGlMappings(): Promise<PayrollGlMappingEntry[]> {
  return db
    .select()
    .from(payrollGlMapping)
    .where(eq(payrollGlMapping.active, true));
}

function findMapping(
  mappings: PayrollGlMappingEntry[],
  sourceType: string,
  sourceCode: string,
  side: string
): PayrollGlMappingEntry | undefined {
  return mappings.find(
    (m) => m.sourceType === sourceType && m.sourceCode === sourceCode && m.side === side
  );
}

// ============================================================================
// ACCOUNT RESOLUTION (from plan_comptable via mapping)
// ============================================================================

async function resolveAccount(
  accountNumber: string
): Promise<{ id: string; numeroCompte: string } | null> {
  const { planComptable } = await import("@shared/schema");
  const [account] = await db
    .select({ id: planComptable.id, numeroCompte: planComptable.numeroCompte })
    .from(planComptable)
    .where(eq(planComptable.numeroCompte, accountNumber))
    .limit(1);
  return account || null;
}

// ============================================================================
// VENTILATED GL POSTING — ENGAGEMENT (run validation)
// ============================================================================

/**
 * Post ventilated GL entries when a payroll run is VALIDATED.
 *
 * Creates one multi-line entry per bulletin:
 *   D 6611 = brut
 *   C 4211 = net
 *   C 4311 = CNSS salariale
 *   C 4421 = IRPP
 *   C 4212 = avances déduites (if any)
 *
 * Plus one aggregate entry for patronal charges.
 */
export async function postRunEngagement(
  run: PayrollRun,
  agenceId: string,
  userId: string
): Promise<RunGlResult> {
  const mappings = await loadGlMappings();
  const errors: string[] = [];
  const ecritureIds: string[] = [];

  // Get all bulletins for this run
  const bulletins = await db
    .select()
    .from(bulletinsPaie)
    .where(
      and(
        eq(bulletinsPaie.payrollRunId, run.id),
        eq(bulletinsPaie.cancelled, false)
      )
    );

  if (bulletins.length === 0) {
    return { engagementEcritureIds: [], patronalEcritureId: null, paiementEcritureId: null, errors: ["No bulletins found"] };
  }

  // Aggregate totals
  let totalBrut = 0;
  let totalNet = 0;
  let totalCnssSalariale = 0;
  let totalIrpp = 0;
  let totalAvances = 0;
  let totalCnssPatronale = 0;
  let totalFormation = 0; // CFC + TAP

  for (const b of bulletins) {
    totalBrut += Number(b.salaireBrut);
    totalNet += Number(b.salaireNet);
    totalCnssSalariale += Number(b.totalChargesSalariales);
    totalIrpp += Number(b.irpp);
    totalCnssPatronale += Number(b.totalChargesPatronales);

    // Compute avance deduction from payslip lines
    const lines = await db
      .select()
      .from(payslipLines)
      .where(
        and(
          eq(payslipLines.bulletinId, b.id),
          eq(payslipLines.code, "4500")
        )
      );
    totalAvances += lines.reduce((s, l) => s + (l.montantRetenue || 0), 0);

    // Compute formation (CFC + TAP) from patronal lines
    const formationLines = await db
      .select()
      .from(payslipLines)
      .where(
        and(
          eq(payslipLines.bulletinId, b.id),
          sql`${payslipLines.code} IN ('CFC_P', 'TAP_P')`
        )
      );
    totalFormation += formationLines.reduce((s, l) => s + (l.montantPatronal || 0), 0);
  }

  // Patronal CNSS (excluding CFC/TAP which go to 6651)
  const totalCnssPatronalePure = totalCnssPatronale - totalFormation;

  // ---- ENTRY 1: Charges de personnel (aggregate) ----
  try {
    const debitAccount = await resolveAccount("6611");
    const creditNetAccount = await resolveAccount("4211");
    const creditCnssAccount = await resolveAccount("4311");
    const creditIrppAccount = await resolveAccount("4421");
    const creditAvanceAccount = await resolveAccount("4212");

    if (!debitAccount || !creditNetAccount || !creditCnssAccount || !creditIrppAccount) {
      errors.push("Missing GL accounts for personnel charges (6611, 4211, 4311, 4421)");
    } else {
      const entryLines: PostEntryLine[] = [
        {
          compteId: debitAccount.id,
          numeroCompte: "6611",
          libelle: `Rémunérations du personnel - ${run.period}`,
          debit: totalBrut,
          credit: 0,
        },
        {
          compteId: creditNetAccount.id,
          numeroCompte: "4211",
          libelle: `Personnel rémunérations dues - ${run.period}`,
          debit: 0,
          credit: totalNet,
        },
      ];

      if (totalCnssSalariale > 0) {
        entryLines.push({
          compteId: creditCnssAccount.id,
          numeroCompte: "4311",
          libelle: `CNSS cotisations salariales - ${run.period}`,
          debit: 0,
          credit: totalCnssSalariale,
        });
      }

      if (totalIrpp > 0) {
        entryLines.push({
          compteId: creditIrppAccount.id,
          numeroCompte: "4421",
          libelle: `IRPP retenu sur salaires - ${run.period}`,
          debit: 0,
          credit: totalIrpp,
        });
      }

      if (totalAvances > 0 && creditAvanceAccount) {
        entryLines.push({
          compteId: creditAvanceAccount.id,
          numeroCompte: "4212",
          libelle: `Avances déduites sur salaires - ${run.period}`,
          debit: 0,
          credit: totalAvances,
        });
      }

      const result = await postEntry({
        agenceId,
        sourceType: "PAYROLL_ENGAGEMENT",
        sourceId: `run-${run.id}-engagement`,
        journalCode: "OD",
        entryDate: new Date(),
        description: `Engagement charges personnel - Paie ${run.period} v${run.version}`,
        lines: entryLines,
        metadata: {
          payrollRunId: run.id,
          period: run.period,
          version: run.version,
          type: "ENGAGEMENT",
          totalBrut,
          totalNet,
          totalCnssSalariale,
          totalIrpp,
          totalAvances,
        },
        userId,
      });

      ecritureIds.push(result.ecritureId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ runId: run.id, error: msg }, "Failed to post engagement GL");
    errors.push(`Engagement GL: ${msg}`);
  }

  // ---- ENTRY 2: Charges patronales ----
  let patronalEcritureId: string | null = null;
  if (totalCnssPatronale > 0) {
    try {
      const debitChargesAccount = await resolveAccount("6641");
      const debitFormationAccount = await resolveAccount("6651");
      const creditCnssAccount = await resolveAccount("4311");
      const creditFormationAccount = await resolveAccount("4471");

      if (!debitChargesAccount || !creditCnssAccount) {
        errors.push("Missing GL accounts for patronal charges (6641, 4311)");
      } else {
        const entryLines: PostEntryLine[] = [];

        if (totalCnssPatronalePure > 0) {
          entryLines.push(
            {
              compteId: debitChargesAccount.id,
              numeroCompte: "6641",
              libelle: `Charges sociales patronales - ${run.period}`,
              debit: totalCnssPatronalePure,
              credit: 0,
            },
            {
              compteId: creditCnssAccount.id,
              numeroCompte: "4311",
              libelle: `CNSS patronales à reverser - ${run.period}`,
              debit: 0,
              credit: totalCnssPatronalePure,
            }
          );
        }

        if (totalFormation > 0 && debitFormationAccount && creditFormationAccount) {
          entryLines.push(
            {
              compteId: debitFormationAccount.id,
              numeroCompte: "6651",
              libelle: `Formation professionnelle - ${run.period}`,
              debit: totalFormation,
              credit: 0,
            },
            {
              compteId: creditFormationAccount.id,
              numeroCompte: "4471",
              libelle: `CFC + TAP à reverser - ${run.period}`,
              debit: 0,
              credit: totalFormation,
            }
          );
        }

        if (entryLines.length > 0) {
          const result = await postEntry({
            agenceId,
            sourceType: "PAYROLL_PATRONAL",
            sourceId: `run-${run.id}-patronal`,
            journalCode: "OD",
            entryDate: new Date(),
            description: `Charges patronales - Paie ${run.period} v${run.version}`,
            lines: entryLines,
            metadata: {
              payrollRunId: run.id,
              period: run.period,
              version: run.version,
              type: "PATRONAL",
              totalCnssPatronalePure,
              totalFormation,
            },
            userId,
          });
          patronalEcritureId = result.ecritureId;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error({ runId: run.id, error: msg }, "Failed to post patronal GL");
      errors.push(`Patronal GL: ${msg}`);
    }
  }

  return {
    engagementEcritureIds: ecritureIds,
    patronalEcritureId,
    paiementEcritureId: null,
    errors,
  };
}

// ============================================================================
// VENTILATED GL POSTING — PAYMENT (run payment)
// ============================================================================

/**
 * Post GL payment entry when a payroll run is PAID.
 *
 *   D 4211 Personnel rémun. dues     [net total]
 *   C 521  Caisse                     [net total]
 */
export async function postRunPayment(
  run: PayrollRun,
  agenceId: string,
  userId: string
): Promise<{ ecritureId: string | null; error: string | null }> {
  const totalNet = Number(run.totalNet);
  if (totalNet <= 0) {
    return { ecritureId: null, error: "Total net is 0" };
  }

  try {
    const debitAccount = await resolveAccount("4211");
    const creditAccount = await resolveAccount("521");

    if (!debitAccount || !creditAccount) {
      return { ecritureId: null, error: "Missing GL accounts 4211 or 521" };
    }

    const result = await postEntry({
      agenceId,
      sourceType: "PAYROLL_PAYMENT",
      sourceId: `run-${run.id}-payment`,
      journalCode: "CAI",
      entryDate: new Date(),
      description: `Paiement salaires - Paie ${run.period} v${run.version}`,
      lines: [
        {
          compteId: debitAccount.id,
          numeroCompte: "4211",
          libelle: `Personnel rémun. dues - ${run.period}`,
          debit: totalNet,
          credit: 0,
        },
        {
          compteId: creditAccount.id,
          numeroCompte: "521",
          libelle: `Caisse - Paiement salaires ${run.period}`,
          debit: 0,
          credit: totalNet,
        },
      ],
      metadata: {
        payrollRunId: run.id,
        period: run.period,
        version: run.version,
        type: "PAIEMENT",
        totalNet,
      },
      userId,
    });

    return { ecritureId: result.ecritureId, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ runId: run.id, error: msg }, "Failed to post payment GL");
    return { ecritureId: null, error: msg };
  }
}

// ============================================================================
// CONTREPASSATION (REVERSAL) FOR RE-RUN
// ============================================================================

/**
 * Reverse all GL entries associated with a payroll run.
 * Called when a run is being re-run (cancelled + replaced).
 *
 * Finds entries by sourceId pattern `run-{runId}-*` and reverses each.
 */
export async function reverseRunGL(
  run: PayrollRun,
  reason: string,
  agenceId: string,
  userId: string
): Promise<{ reversedCount: number; errors: string[] }> {
  const { ecritures: ecrituresTable } = await import("@shared/schema");
  const { like } = await import("drizzle-orm");

  const errors: string[] = [];
  let reversedCount = 0;

  // Find all entries linked to this run
  const entries = await db
    .select()
    .from(ecrituresTable)
    .where(
      and(
        like(ecrituresTable.sourceId, `run-${run.id}-%`),
        sql`${ecrituresTable.statut} != 'REVERSED'`
      )
    );

  for (const entry of entries) {
    try {
      await reverseEntry({
        ecritureId: entry.id,
        reason: `Contrepassation run ${run.id}: ${reason}`,
        userId,
        agenceId,
      });
      reversedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Failed to reverse entry ${entry.numeroPiece}: ${msg}`);
    }
  }

  logger.info({ runId: run.id, reversedCount, errors: errors.length }, "Run GL reversal complete");
  return { reversedCount, errors };
}

// ============================================================================
// SALARY ADVANCE GL POSTING (kept for backward compat with advance workflow)
// ============================================================================

/**
 * Post GL entry when a salary advance is PAID outside of payroll run.
 *
 * D 4212 (Personnel - Avances) / C 521 (Caisse)
 */
export async function postAdvancePaymentGL(
  avanceId: string,
  montant: number,
  employeNom: string,
  agenceId: string,
  userId: string
): Promise<{ ecritureId: string | null; error: string | null }> {
  try {
    const debitAccount = await resolveAccount("4212");
    const creditAccount = await resolveAccount("521");

    if (!debitAccount || !creditAccount) {
      return { ecritureId: null, error: "Missing GL accounts 4212 or 521" };
    }

    const result = await postEntry({
      agenceId,
      sourceType: "SALARY_ADVANCE",
      sourceId: `advance-${avanceId}`,
      journalCode: "CAI",
      entryDate: new Date(),
      description: `Avance sur salaire - ${employeNom}`,
      lines: [
        {
          compteId: debitAccount.id,
          numeroCompte: "4212",
          libelle: `Avance versée - ${employeNom}`,
          debit: montant,
          credit: 0,
        },
        {
          compteId: creditAccount.id,
          numeroCompte: "521",
          libelle: `Caisse - Avance ${employeNom}`,
          debit: 0,
          credit: montant,
        },
      ],
      metadata: { avanceId, employeNom, type: "PAIEMENT_AVANCE" },
      userId,
    });

    return { ecritureId: result.ecritureId, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ecritureId: null, error: msg };
  }
}
