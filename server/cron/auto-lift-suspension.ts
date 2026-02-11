/**
 * Cron Job: Levée automatique des suspensions de comptes
 * =======================================================
 *
 * Ce job s'exécute toutes les 5 minutes pour lever automatiquement
 * les suspensions dont la date de fin est dépassée.
 *
 * Critères d'éligibilité:
 * - statut = SUSPENDED
 * - autoLift = true
 * - suspendedEndDate <= now()
 * - suspendedReviewRequired = false
 */

import { db } from "../db";
import { comptes } from "@shared/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { unsuspendCompte } from "../services/comptes";
import { createLogger } from "../lib/logger";

const logger = createLogger("Cron:AutoLiftSuspension");

const CHECK_INTERVAL_MS = parseInt(
  process.env.AUTO_LIFT_SUSPENSION_INTERVAL_MS || String(5 * 60 * 1000),
  10
);

let intervalId: NodeJS.Timeout | null = null;

async function runAutoLiftCheck(): Promise<void> {
  try {
    // Find all accounts eligible for auto-lift
    const eligible = await db
      .select({
        id: comptes.id,
        numeroCompte: comptes.numeroCompte,
        suspendedEndDate: comptes.suspendedEndDate,
      })
      .from(comptes)
      .where(
        and(
          eq(comptes.statut, "SUSPENDED"),
          eq(comptes.autoLift, true),
          eq(comptes.suspendedReviewRequired, false),
          lte(comptes.suspendedEndDate, sql`now()`)
        )
      );

    if (eligible.length === 0) return;

    logger.info(
      { count: eligible.length },
      `${eligible.length} compte(s) éligible(s) à la levée automatique`
    );

    let lifted = 0;
    let errors = 0;

    for (const account of eligible) {
      try {
        await unsuspendCompte(
          account.id,
          "Levée automatique — fin de période de suspension",
          undefined,
          true // isAutoLift
        );
        lifted++;
        logger.info(
          { compteId: account.id, numeroCompte: account.numeroCompte },
          `Suspension levée automatiquement`
        );
      } catch (err) {
        errors++;
        logger.error(
          { compteId: account.id, err },
          `Erreur lors de la levée automatique`
        );
      }
    }

    if (lifted > 0 || errors > 0) {
      logger.info(
        { lifted, errors, total: eligible.length },
        `Auto-lift terminé: ${lifted} levée(s), ${errors} erreur(s)`
      );
    }
  } catch (err) {
    logger.error({ err }, "Erreur lors de la vérification auto-lift");
  }
}

export function startAutoLiftSuspensionCron(): void {
  logger.info(
    { intervalMs: CHECK_INTERVAL_MS },
    "Démarrage du job de levée automatique des suspensions"
  );

  // Run immediately on startup
  runAutoLiftCheck();

  // Schedule periodic checks
  intervalId = setInterval(runAutoLiftCheck, CHECK_INTERVAL_MS);
}

export function stopAutoLiftSuspensionCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  logger.info("Job de levée automatique des suspensions arrêté");
}
