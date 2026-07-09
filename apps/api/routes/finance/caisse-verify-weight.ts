/**
 * Routes finance — segment /caisse (partie caisse-verify-weight).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/caisse/verify-weight
 *   POST   /api/caisse/expected-weight
 *   GET    /api/caisse/denomination-weights
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { logger } from "./shared";

export function registerCaisseVerifyWeightRoutes(app: Express) {
  // ============================================
  // WEIGHT VERIFICATION (Vérification poids billets)
  // ============================================

  /**
   * POST /api/caisse/verify-weight
   * Verify cash denomination breakdown against actual weight
   */
  /**
   * POST /api/caisse/verify-weight
   */
  app.post("/api/caisse/verify-weight", requireAuth, async (req, res) => {
    try {
      const { billetage, actualWeightGrams } = req.body;

      if (!billetage || typeof billetage !== 'object') {
        return res.status(400).json({ error: "Billetage requis" });
      }
      if (typeof actualWeightGrams !== 'number' || actualWeightGrams < 0) {
        return res.status(400).json({ error: "Poids réel requis (en grammes)" });
      }

      const { verifyBilletageWeight } = await import("@shared/config/denomination-weights");
      const result = verifyBilletageWeight(billetage, actualWeightGrams);

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Weight verification error');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/caisse/expected-weight
   * Calculate expected weight for a billetage breakdown (no actual weight needed)
   */
  /**
   * POST /api/caisse/expected-weight
   */
  app.post("/api/caisse/expected-weight", requireAuth, async (req, res) => {
    try {
      const { billetage } = req.body;

      if (!billetage || typeof billetage !== 'object') {
        return res.status(400).json({ error: "Billetage requis" });
      }

      const { calculateExpectedWeight, DENOMINATION_VALUES, ALL_DENOMINATION_WEIGHTS } = await import("@shared/config/denomination-weights");
      const expectedWeight = calculateExpectedWeight(billetage);

      // Also calculate total value
      let totalValue = 0;
      const breakdown: Array<{ denomination: string; count: number; weight: number; value: number }> = [];
      for (const [denom, count] of Object.entries(billetage)) {
        const c = count as number;
        if (c <= 0) continue;
        const normalizedKey = denom.replace(/[^a-z0-9_]/gi, '');
        const val = DENOMINATION_VALUES[normalizedKey] || DENOMINATION_VALUES[denom] || 0;
        const wt = ALL_DENOMINATION_WEIGHTS[normalizedKey] || ALL_DENOMINATION_WEIGHTS[denom] || 0;
        totalValue += val * c;
        breakdown.push({ denomination: denom, count: c, weight: Math.round(wt * c * 100) / 100, value: val * c });
      }

      res.json({
        expectedWeightGrams: expectedWeight,
        totalValue,
        breakdown,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Expected weight calculation error');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/denomination-weights
   * Returns the reference weight table for all denominations
   */
  /**
   * GET /api/caisse/denomination-weights
   */
  app.get("/api/caisse/denomination-weights", requireAuth, async (_req, res) => {
    const { ALL_DENOMINATION_WEIGHTS, DENOMINATION_VALUES } = await import("@shared/config/denomination-weights");
    const entries = Object.keys(DENOMINATION_VALUES).map(key => ({
      denomination: key,
      value: DENOMINATION_VALUES[key],
      weightGrams: ALL_DENOMINATION_WEIGHTS[key] || 0,
      type: key.startsWith('billets_') ? 'billet' : 'piece',
    }));
    res.json({ denominations: entries });
  });
}
