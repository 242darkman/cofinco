/**
 * Routes finance — segment /access (partie access).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/access/status/caisse
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { accessControlService } from "../../services/caisse/access-control-service";
import { logger } from "./shared";

export function registerAccessRoutes(app: Express) {
  // ============================================================================
  // CAISSE ACCESS CONTROL API
  // ============================================================================

  /**
   * GET /api/access/status/caisse
   * Vérifie si la caisse est accessible selon les horaires d'ouverture
   */
  /**
   * GET /api/access/status/caisse
   */
  app.get("/api/access/status/caisse", requireAuth, async (req, res) => {
    try {
      const caisseId = req.query.caisseId as string | undefined;
      const agenceId = req.query.agenceId as string | undefined;

      const status = await accessControlService.checkCaisseAccess(caisseId, agenceId);
      res.json(status);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking caisse access');
      res.status(500).json({ message: error.message });
    }
  });
}
