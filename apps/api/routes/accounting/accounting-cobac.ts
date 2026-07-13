import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { calculateCobacRatios, getCurrentRatios, getRatiosHistory, getSeuils, updateSeuil } from "../../services/cobac-ratios-service";

import { runCobacReporting } from "../../cron/cobac-reporting-scheduler";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingCobacRoutes(app: Express) {

  // ======================================================================
  // RATIOS PRUDENTIELS COBAC
  // ======================================================================

  // Calculer les ratios COBAC
  app.post("/api/comptabilite/cobac/calculate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.body.periodeDate ? new Date(req.body.periodeDate) : new Date();
      const result = await calculateCobacRatios(agenceId, periodeDate, req.user?.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Obtenir les ratios actuels
  app.get("/api/comptabilite/cobac/current", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await getCurrentRatios(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Obtenir l'historique des ratios
  app.get("/api/comptabilite/cobac/history", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const fromDate = req.query.fromDate as string || `${new Date().getFullYear()}-01-01`;
      const toDate = req.query.toDate as string || new Date().toISOString().split('T')[0];

      const result = await getRatiosHistory(agenceId, fromDate, toDate);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Obtenir les seuils COBAC
  app.get("/api/comptabilite/cobac/seuils", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (_req, res) => {
    try {
      const result = await getSeuils();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Mettre à jour un seuil
  app.patch("/api/comptabilite/cobac/seuils/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { seuilMinimum, seuilWarning, seuilMaximum } = req.body;
      const result = await updateSeuil(req.params.id, { seuilMinimum, seuilWarning, seuilMaximum });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // COBAC AUTO-REPORTING TRIGGER (F13)
  // ======================================================================

  // Déclencher manuellement le calcul des ratios COBAC pour toutes les agences
  app.post("/api/comptabilite/cobac/run-all", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (_req: AuthenticatedRequest, res) => {
    try {
      const result = await runCobacReporting();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
