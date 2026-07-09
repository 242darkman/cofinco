import { db } from "../db";
import { operationsCaisse, transactionsCompte, mouvementsFinanciers } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('DuplicateDetection');

// ============================================================================
// DUPLICATE TRANSACTION DETECTION MIDDLEWARE
//
// Heuristic-based detection: if the same (amount + account/client + operator)
// combination appears within a configurable time window, warn or block.
//
// Returns 409 with duplicate candidates to let the frontend show a warning.
// The frontend can re-submit with `skipDuplicateCheck: true` to force.
// ============================================================================

interface DuplicateDetectionOptions {
  /** Time window in seconds to check for duplicates (default: 300 = 5 min) */
  windowSeconds?: number;
  /** If true, block the request. If false, return warning but allow override. */
  strict?: boolean;
}

/**
 * Middleware factory for duplicate transaction detection.
 *
 * Checks if a similar operation (same montant + same compteId/clientId + same operator)
 * was recently created within the time window.
 *
 * The request body must contain `montant` and optionally `compteId` or `clientId`.
 * If `skipDuplicateCheck: true` is in the body, the check is bypassed.
 */
export function duplicateDetection(options: DuplicateDetectionOptions = {}) {
  const { windowSeconds = 300, strict = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Allow explicit bypass
      if (req.body.skipDuplicateCheck === true) {
        return next();
      }

      const montant = req.body.montant;
      const compteId = req.params.id || req.body.compteId;
      const userId = (req.session as { user?: { id?: string } })?.user?.id;

      // Need at least montant to check
      if (!montant || !compteId) {
        return next();
      }

      const windowStart = new Date(Date.now() - windowSeconds * 1000);
      const montantStr = String(montant);

      // Check recent mouvements with same amount + account + operator
      const recentDuplicates = await db
        .select({
          id: mouvementsFinanciers.id,
          montant: mouvementsFinanciers.montant,
          reference: mouvementsFinanciers.reference,
          createdAt: mouvementsFinanciers.createdAt,
          sens: mouvementsFinanciers.sens,
        })
        .from(mouvementsFinanciers)
        .where(
          and(
            eq(mouvementsFinanciers.compteId, compteId),
            eq(mouvementsFinanciers.montant, montantStr),
            eq(mouvementsFinanciers.statut, "POSTED"),
            gte(mouvementsFinanciers.createdAt, windowStart),
            userId ? eq(mouvementsFinanciers.createdBy, userId) : sql`true`
          )
        )
        .limit(5);

      if (recentDuplicates.length > 0) {
        const duplicates = recentDuplicates.map((d) => ({
          id: d.id,
          reference: d.reference,
          montant: d.montant,
          sens: d.sens,
          createdAt: d.createdAt,
        }));

        if (strict) {
          return res.status(409).json({
            error: "POTENTIAL_DUPLICATE",
            message: `Une operation similaire (${montantStr} FCFA) a ete effectuee dans les ${Math.round(windowSeconds / 60)} dernieres minutes sur ce compte`,
            duplicates,
            windowSeconds,
            canOverride: false,
          });
        }

        // Non-strict: return warning with override option
        return res.status(409).json({
          error: "POTENTIAL_DUPLICATE",
          message: `Attention: une operation similaire (${montantStr} FCFA) a ete effectuee recemment. Souhaitez-vous continuer ?`,
          duplicates,
          windowSeconds,
          canOverride: true,
        });
      }

      next();
    } catch (error: unknown) {
      // Don't block the request if duplicate check fails
      logger.error({ err: error }, 'Error during duplicate check');
      next();
    }
  };
}
