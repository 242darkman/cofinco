/**
 * Routes finance — segment /factures (partie factures).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/factures
 *   GET    /api/factures/:id
 *   POST   /api/factures
 */
import type { Express } from "express";
import { insertFactureSchema } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { logger } from "./shared";

export function registerFacturesRoutes(app: Express) {
  // Factures - Basic logic
  /**
   * GET /api/factures
   */
  app.get("/api/factures", requireAuth, async (req, res) => {
      const factures = await storage.getAllFactures();
      res.json(factures);
  });

  // Get single facture with lines and client info
  /**
   * GET /api/factures/:id
   */
  app.get("/api/factures/:id", requireAuth, async (req, res) => {
    try {
      const facture = await storage.getFacture(req.params.id);
      if (!facture) {
        return res.status(404).json({ message: "Facture non trouvée" });
      }

      // Get invoice lines
      const lignes = await storage.getLignesByFacture(facture.id);
      
      // Get client info if available
      let client = null;
      if (facture.clientId) {
        client = await storage.getClient(facture.clientId);
      }

      // Get modele info if available
      let modele = null;
      if (facture.modeleId) {
        modele = await storage.getModeleFacture(facture.modeleId);
      }

      res.json({
        ...facture,
        lignes,
        client,
        modele
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération facture');
      res.status(500).json({ message: error.message || "Erreur lors de la récupération de la facture" });
    }
  });

  // Create facture (roles: admin, chef, comptable)
  /**
   * POST /api/factures
   */
  app.post("/api/factures", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.INVOICE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertFactureSchema.parse(data);
      const facture = await storage.createFacture(parsed);
      res.json(facture);
  });
}
