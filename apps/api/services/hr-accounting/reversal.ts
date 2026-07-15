import { db } from "../../db";
import { type PayrollRun } from "@shared/schema";
import { sql } from "drizzle-orm";
import { reverseEntry } from "../accounting-posting-service";
import { createLogger } from "../../lib/logger";

const logger = createLogger("HrAccounting:Reversal");

/**
 * Contrepasse toutes les écritures comptables associées à une paie.
 * Appelée lorsqu'une paie doit être relancée (annulée + remplacée).
 *
 * Trouve les écritures par le modèle de sourceId `run-{runId}-*` et contrepasse chacune d'elles.
 * 
 * @param run - La paie à contrepasser.
 * @param reason - La raison de la contrepassation des écritures.
 * @param agenceId - L'identifiant de l'agence.
 * @param userId - L'identifiant de l'utilisateur qui exécute l'action.
 * @returns Le nombre d'écritures contrepassées avec succès et les erreurs éventuelles.
 */
export async function reverseRunGL(
  run: PayrollRun,
  reason: string,
  agenceId: string,
  userId: string
): Promise<{ reversedCount: number; errors: string[] }> {
  const { ecritures: ecrituresTable } = await import("@shared/schema");
  const { like, and } = await import("drizzle-orm");

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
