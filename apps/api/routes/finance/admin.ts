/**
 * Routes finance — segment /admin (partie admin).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/admin/mark-late-installments
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logger } from "./shared";

export function registerAdminRoutes(app: Express) {
  // Marquer manuellement les échéances en retard (pour tests/admin)
  /**
   * POST /api/admin/mark-late-installments
   */
  app.post("/api/admin/mark-late-installments", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SYSTEM), async (req, res) => {
      try {
        const { markLateInstallments } = await import("../../services/repayment-allocation-service");
        const result = await markLateInstallments();
        
        res.json({
          success: true,
          message: `${result.markedCount} échéance(s) marquée(s) en retard`,
          markedCount: result.markedCount,
          affectedCredits: result.creditIds.length
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error marking late installments');
        res.status(500).json({ message: error.message || 'Erreur lors du marquage des échéances en retard' });
      }
  });
}
