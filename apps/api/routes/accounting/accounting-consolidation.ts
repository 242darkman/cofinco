import type { Express } from "express";
import { createLogger } from "../../lib/logger";

// @ts-ignore
const logger = createLogger('Routes:Accounting:Consolidation');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { generateConsolidatedBilan, generateConsolidatedCompteResultat, generateConsolidationReport } from "../../services/consolidation-service";

import { AuthenticatedRequest } from "./accounting-types";

export function registerAccountingConsolidationRoutes(app: Express) {

  // ======================================================================
  // CONSOLIDATION MULTI-AGENCES (F11)
  // ======================================================================

  // Bilan Consolidé
  app.get("/api/comptabilite/consolidation/bilan", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const result = await generateConsolidatedBilan(dateFin);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Compte de Résultat Consolidé
  app.get("/api/comptabilite/consolidation/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const year = parseInt(req.query.exercice as string) || new Date().getFullYear();
      const dateDebut = req.query.dateDebut as string || `${year}-01-01`;
      const dateFin = req.query.dateFin as string || `${year}-12-31`;
      const result = await generateConsolidatedCompteResultat(dateDebut, dateFin);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Rapport de consolidation complet (bilan + CR + balance)
  app.get("/api/comptabilite/consolidation/report", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const year = parseInt(req.query.exercice as string) || new Date().getFullYear();
      const dateFin = req.query.dateFin as string || `${year}-12-31`;
      const result = await generateConsolidationReport(dateFin);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
