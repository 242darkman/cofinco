/**
 * Routes finance — segment /mouvements (partie mouvements).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/mouvements
 */
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { logger } from "./shared";

export function registerMouvementsRoutes(app: Express) {
  // ============================================================================
  // MOUVEMENTS FINANCIERS API (Phase 3 - Unified Ledger Endpoints)
  // ============================================================================

  /**
   * GET /api/mouvements - Global ledger feed with filtering
   */
  /**
   * GET /api/mouvements
   */
  app.get("/api/mouvements", requireAuth, requireAgenceAccess(), async (req, res) => {
    try {
      const { sourceModule, clientId, compteId, creditId, sessionCaisseId, from, to, limit } = req.query;

      const filter: any = {};
      if (sourceModule) filter.sourceModule = sourceModule as string;
      if (clientId) filter.clientId = clientId as string;
      if (compteId) filter.compteId = compteId as string;
      if (creditId) filter.creditId = creditId as string;
      if (sessionCaisseId) filter.sessionCaisseId = sessionCaisseId as string;
      if (from) filter.from = new Date(from as string);
      if (to) filter.to = new Date(to as string);
      if (limit) filter.limit = parseInt(limit as string, 10);

      const mouvements = await storage.getMouvementsFinanciers(filter);
      res.json(mouvements);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching mouvements');
      res.status(500).json({ message: error.message || 'Erreur serveur' });
    }
  });
}
