import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { autoMatch, completeRapprochement, createRapprochement, getRapprochementDetail, importBankLines, listRapprochements, manualMatch, unmatch } from "../../services/rapprochement-bancaire-service";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingRapprochementRoutes(app: Express) {

  // ======================================================================
  // RAPPROCHEMENT BANCAIRE
  // ======================================================================

  // Lister les sessions de rapprochement
  app.get("/api/comptabilite/rapprochements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await listRapprochements(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Créer une session de rapprochement
  app.post("/api/comptabilite/rapprochements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { compteGl, period, soldeBanqueDebut, soldeBanqueFin } = req.body;
      if (!compteGl || !period) return res.status(400).json({ message: "compteGl et period requis" });

      const result = await createRapprochement({
        agenceId,
        compteGl,
        period,
        soldeBanqueDebut: parseFloat(soldeBanqueDebut || '0'),
        soldeBanqueFin: parseFloat(soldeBanqueFin || '0'),
        userId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Obtenir les détails du rapprochement
  app.get("/api/comptabilite/rapprochements/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getRapprochementDetail(req.params.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Importer les lignes du relevé bancaire
  app.post("/api/comptabilite/rapprochements/:id/import", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { lines, fileName } = req.body;
      if (!lines || !Array.isArray(lines)) return res.status(400).json({ message: "lines (array) requis" });

      const result = await importBankLines(req.params.id, lines, fileName);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Auto-match
  app.post("/api/comptabilite/rapprochements/:id/auto-match", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await autoMatch(req.params.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Manual match
  app.post("/api/comptabilite/rapprochements/:id/match", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { glLineId, bankLineId } = req.body;
      if (!glLineId || !bankLineId) return res.status(400).json({ message: "glLineId et bankLineId requis" });

      await manualMatch(glLineId, bankLineId);
      res.json({ success: true });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Unmatch
  app.post("/api/comptabilite/rapprochements/:id/unmatch", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { lineId } = req.body;
      if (!lineId) return res.status(400).json({ message: "lineId requis" });

      await unmatch(lineId);
      res.json({ success: true });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Terminer le rapprochement
  app.post("/api/comptabilite/rapprochements/:id/complete", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      await completeRapprochement(req.params.id, req.user!.id);
      res.json({ success: true });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
