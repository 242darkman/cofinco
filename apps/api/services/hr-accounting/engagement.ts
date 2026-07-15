import { db } from "../../db";
import { bulletinsPaie, payslipLines, type PayrollRun } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { postEntry } from "../accounting-posting-service";
import type { PostEntryLine } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { resolveAccount } from "./resolvers";
import type { RunGlResult } from "./types";

const logger = createLogger("HrAccounting:Engagement");

/**
 * Publie les écritures comptables ventilées lorsqu'une paie est VALIDÉE.
 *
 * Crée une écriture multi-lignes par bulletin :
 *   D 6611 = brut
 *   C 4211 = net
 *   C 4311 = CNSS salariale
 *   C 4421 = IRPP
 *   C 4212 = avances déduites (le cas échéant)
 *
 * Et une écriture agrégée pour les charges patronales.
 * 
 * @param run - La paie (payroll run) à engager.
 * @param agenceId - L'identifiant de l'agence.
 * @param userId - L'identifiant de l'utilisateur qui exécute l'action.
 * @returns Les identifiants des écritures comptables générées et les erreurs éventuelles.
 */
export async function postRunEngagement(
  run: PayrollRun,
  agenceId: string,
  userId: string
): Promise<RunGlResult> {
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
