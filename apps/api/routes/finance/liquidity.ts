/**
 * Routes finance — segment /liquidity (partie liquidity).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/liquidity/check
 */
import type { Express } from "express";
import { DecaissementInsufficientFundsError, InsufficientFundsError } from "../../storage/errors";
import { requireAuth } from "../../auth";
import { logger } from "./shared";

export function registerLiquidityRoutes(app: Express) {
  // =====================================================
  // LIQUIDITY CHECK — Double validation UI+Backend
  // =====================================================

  /**
   * GET /api/liquidity/check
   * Pré-vérifie la liquidité avant une opération financière.
   * Permet à l'UI de désactiver les boutons si liquidité insuffisante.
   *
   * Query params:
   * - entityType: "compte" | "session" | "coffre" | "mobile_money"
   * - entityId: UUID de l'entité
   * - amount: Montant à vérifier
   * - operator: "MTN" | "AIRTEL" (requis si entityType=mobile_money)
   * - agenceId: UUID de l'agence (requis si entityType=mobile_money)
   *
   * For cash operations with coffre fallback:
   * - entityType: "cash_availability"
   * - sessionId: UUID de la session caisse
   * - coffreId: UUID du coffre
   * - amount: Montant à vérifier
   */
  /**
   * GET /api/liquidity/check
   */
  app.get("/api/liquidity/check", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, amount, sessionId, coffreId, operator, agenceId } = req.query as Record<string, string>;

      const montant = parseFloat(amount);
      if (!amount || isNaN(montant) || montant <= 0) {
        return res.status(400).json({ message: "Le montant doit être un nombre positif." });
      }

      const { liquidityGuard } = await import("../../services/liquidity-guard");

      // Cash availability check (caisse → coffre cascade)
      if (entityType === "cash_availability") {
        if (!sessionId || !coffreId) {
          return res.status(400).json({ message: "sessionId et coffreId sont requis pour cash_availability." });
        }
        const result = await liquidityGuard.checkCashAvailability(sessionId, coffreId, montant);
        return res.json(result);
      }

      // Mobile Money check
      if (entityType === "mobile_money") {
        if (!operator || !agenceId) {
          return res.status(400).json({ message: "operator et agenceId sont requis pour mobile_money." });
        }
        const result = await liquidityGuard.checkMobileMoneyLiquidity(operator as "MTN" | "AIRTEL", agenceId, montant);
        return res.json(result);
      }

      // Standard entity checks
      if (!entityType || !entityId) {
        return res.status(400).json({ message: "entityType et entityId sont requis." });
      }

      const validTypes = ["compte", "session", "coffre"];
      if (!validTypes.includes(entityType)) {
        return res.status(400).json({ message: `entityType invalide. Valeurs acceptées: ${validTypes.join(", ")}, mobile_money, cash_availability` });
      }

      const result = await liquidityGuard.requireLiquidity(entityType as any, entityId, montant);
      res.json(result);
    } catch (error: any) {
      if (error instanceof InsufficientFundsError) {
        return res.status(200).json({
          allowed: false,
          ...error.toJSON(),
        });
      }
      logger.error({ err: error }, "Erreur vérification liquidité");
      res.status(500).json({ message: error.message || "Erreur lors de la vérification de liquidité" });
    }
  });
}
