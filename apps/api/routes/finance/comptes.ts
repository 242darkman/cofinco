/**
 * Routes finance — segment /comptes (partie comptes).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/:id/mouvements
 */
import type { Express } from "express";
import { comptes } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";

export function registerComptesRoutes(app: Express) {
  /**
   * GET /api/comptes/:id/mouvements - Movements for a specific savings account
   */
  /**
   * GET /api/comptes/:id/mouvements
   */
  app.get("/api/comptes/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        compteId: req.params.id,
        limit: 100
      });
      res.json(mouvements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
