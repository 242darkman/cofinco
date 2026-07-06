/**
 * Financial Validation Middleware
 *
 * Middleware réutilisable pour valider la liquidité avant les opérations financières critiques.
 * Double validation: l'UI peut pré-vérifier, mais le backend refuse systématiquement
 * si la liquidité est insuffisante (source de vérité = GL).
 */

import type { Request, Response, NextFunction } from "express";
import { liquidityGuard, type LiquidityCheckResult, type CashAvailabilityResult } from "../services/liquidity-guard";
import { InsufficientFundsError, type LiquidityEntityType } from "../storage/errors";
import { createLogger } from "../lib/logger";

const logger = createLogger("Middleware:FinancialValidation");

// Extend Express Request to carry liquidity check results
declare global {
  namespace Express {
    interface Request {
      liquidityCheck?: LiquidityCheckResult;
      cashAvailability?: CashAvailabilityResult;
    }
  }
}

/**
 * Entity resolver: function that extracts entity type, ID, and amount from the request.
 */
export type EntityResolver = (req: Request) => {
  type: LiquidityEntityType;
  id: string;
  amount: number;
} | null;

/**
 * Middleware factory: validates that sufficient funds exist for the operation.
 * Attaches the check result to req.liquidityCheck for the handler.
 *
 * Usage:
 *   app.post("/api/some-route",
 *     requireAuth,
 *     requireSufficientFunds((req) => ({
 *       type: "session",
 *       id: req.body.sessionCaisseId,
 *       amount: parseFloat(req.body.montant),
 *     })),
 *     async (req, res) => { ... }
 *   );
 */
export function requireSufficientFunds(entityResolver: EntityResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entity = entityResolver(req);

      // If resolver returns null, skip validation (entity not yet known)
      if (!entity) {
        return next();
      }

      // Validate amount
      if (!entity.amount || entity.amount <= 0 || isNaN(entity.amount)) {
        return res.status(400).json({
          code: "INVALID_AMOUNT",
          message: "Le montant doit être un nombre positif.",
        });
      }

      // Validate entity ID
      if (!entity.id) {
        return res.status(400).json({
          code: "MISSING_ENTITY",
          message: "L'identifiant de l'entité financière est requis.",
        });
      }

      const check = await liquidityGuard.requireLiquidity(
        entity.type,
        entity.id,
        entity.amount
      );

      // Attach result for the route handler
      req.liquidityCheck = check;
      next();
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        logger.warn({
          entityType: error.entityType,
          entityId: error.entityId,
          available: error.currentBalance,
          requested: error.requestedAmount,
          path: req.path,
        }, "Opération refusée: liquidité insuffisante");

        return res.status(error.httpStatus).json(error.toJSON());
      }

      logger.error({ err: error, path: req.path }, "Erreur validation financière");
      return res.status(500).json({
        code: "VALIDATION_ERROR",
        message: "Erreur lors de la vérification de liquidité.",
      });
    }
  };
}

/**
 * Middleware factory: validates cash availability with coffre fallback.
 * Implements spec §5 Cas 2 (caisse → coffre cascade).
 *
 * Attaches the check result to req.cashAvailability.
 */
export function requireCashAvailability(
  resolver: (req: Request) => { sessionId: string; coffreId: string; amount: number } | null
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = resolver(req);
      if (!params) return next();

      if (!params.amount || params.amount <= 0 || isNaN(params.amount)) {
        return res.status(400).json({
          code: "INVALID_AMOUNT",
          message: "Le montant doit être un nombre positif.",
        });
      }

      const availability = await liquidityGuard.checkCashAvailability(
        params.sessionId,
        params.coffreId,
        params.amount
      );

      req.cashAvailability = availability;

      if (availability.source === "INSUFFICIENT") {
        logger.warn({
          sessionId: params.sessionId,
          coffreId: params.coffreId,
          amount: params.amount,
          caisseBalance: availability.caisseBalance,
          coffreBalance: availability.coffreBalance,
          path: req.path,
        }, "Opération refusée: liquidité caisse+coffre insuffisante");

        return res.status(422).json({
          code: "INSUFFICIENT_FUNDS",
          message: "Liquidité insuffisante pour effectuer cette opération.",
          details: {
            caisseBalance: availability.caisseBalance,
            coffreBalance: availability.coffreBalance,
            requested: params.amount,
            totalAvailable: availability.caisseBalance + availability.coffreBalance,
          },
        });
      }

      next();
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return res.status(error.httpStatus).json(error.toJSON());
      }

      logger.error({ err: error, path: req.path }, "Erreur validation cash availability");
      return res.status(500).json({
        code: "VALIDATION_ERROR",
        message: "Erreur lors de la vérification de liquidité.",
      });
    }
  };
}

/**
 * Error handler helper: formats InsufficientFundsError for API responses.
 * Use in catch blocks of route handlers.
 */
export function handleInsufficientFundsError(error: unknown, res: Response): boolean {
  if (error instanceof InsufficientFundsError) {
    res.status(error.httpStatus).json(error.toJSON());
    return true;
  }
  return false;
}
