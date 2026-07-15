import type { Express, Request, Response } from "express";
import { createLogger } from "../../lib/logger";

import { Actions, Subjects } from "@shared/ability";
import { insertDeclarationTvaSchema, insertJournalSchema } from "@shared/schema";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { storage } from "../../storage";
import { getWsInstance } from "../../ws-server";
import { normalizeKeysDeep, toHttpError } from "../utils";

const logger = createLogger('Routes:Accounting');







export function registerAccountingCoreRoutes(app: Express) {

  // 1. Plan Comptable (roles: admin, chef, comptable)
  app.get("/api/comptabilite/comptes", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const comptes = await storage.getAllComptesComptables();
    res.json(comptes);
  });

  app.get("/api/comptabilite/plan-ohada", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    // Retourne les comptes avec les soldes calculés en temps réel
    const comptes = await storage.getAllComptesComptablesWithBalances();
    res.json(comptes);
  });

  // 2. Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const journaux = await storage.getAllJournaux();
    res.json(journaux);
  });

  // Créer un journal (rôles: admin, comptable)
  app.post("/api/comptabilite/journaux", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req, res) => {
    try {
      const data = insertJournalSchema.parse(normalizeKeysDeep(req.body));
      const journal = await storage.createJournal(data);

      // Notification
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'journal_new', id: journal.id } });
      }

      res.json(journal);
    } catch (error: unknown) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // 3. TVA (roles: admin, chef, comptable)
  app.get("/api/comptabilite/declarations-tva", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const declarations = await storage.getDeclarationsTva();
    res.json(declarations);
  });

  // Créer une déclaration TVA (rôles: admin, comptable)
  app.post("/api/comptabilite/declarations-tva", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req, res) => {
    try {
      const data = insertDeclarationTvaSchema.parse(normalizeKeysDeep(req.body));
      const declaration = await storage.createDeclarationTva(data);

      // Notification
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'tva_new', id: declaration.id } });
      }

      res.json(declaration);
    } catch (error: unknown) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
  });

  // 4. Stats Journaux (roles: admin, chef, comptable)
  app.get("/api/comptabilite/journaux-stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    const stats = await storage.getJournauxStats();
    res.json(stats);
  });



  // ============================================================================
  // ROUTES OBSOLÈTES — Points d'accès supprimés, retourne 410 Gone
  // ============================================================================




  // ======================================================================
  // OBSOLESCENCE
  // ======================================================================

  const legacyTombstone = (_req: Request, res: Response) => {
    res.set("Deprecation", "true");
    res.set("Sunset", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
    logger.warn({ method: _req.method, url: _req.originalUrl }, 'Route obsolète appelée');
    res.status(410).json({
      code: "ENDPOINT_DEPRECATED",
      message: "Cette route est supprimée. Utilisez /api/comptabilite/v2/ecritures pour les écritures.",
    });
  };

  app.post("/api/comptabilite/ecritures", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/ecritures", requireAuth, legacyTombstone);
  app.post("/api/comptabilite/comptes", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/grand-livre/:compteId", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/balance", requireAuth, legacyTombstone);
  app.get("/api/comptabilite/bilan-synthetique", requireAuth, legacyTombstone);


}
