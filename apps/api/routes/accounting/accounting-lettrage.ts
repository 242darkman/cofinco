import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { autoLettrage, delettrerLignes, getBalanceAgee, getLignesNonLettrees, lettrerLignes } from "../../services/lettrage-service";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingLettrageRoutes(app: Express) {

  // ======================================================================
  // LETTRAGE
  // ======================================================================

  // Lettrer lignes
  app.post("/api/comptabilite/lettrage", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { ligneIds } = req.body;
      if (!ligneIds || !Array.isArray(ligneIds) || ligneIds.length < 2) {
        return res.status(400).json({ message: "ligneIds doit contenir au moins 2 IDs" });
      }

      const result = await lettrerLignes(ligneIds, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Dé-lettrer
  app.delete("/api/comptabilite/lettrage/:key", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.params;
      const { compteId } = req.query;
      if (!compteId) return res.status(400).json({ message: "compteId requis" });

      const result = await delettrerLignes(key, compteId as string);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Auto-lettrage
  app.post("/api/comptabilite/lettrage/auto/:compteId", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { compteId } = req.params;
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await autoLettrage(compteId, agenceId, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Lignes non lettrées
  app.get("/api/comptabilite/lettrage/non-lettrees/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { compteId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await getLignesNonLettrees(compteId, agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Balance âgée
  app.get("/api/comptabilite/balance-agee/:compteId", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { compteId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateRef = req.query.dateReference ? new Date(req.query.dateReference as string) : undefined;
      const result = await getBalanceAgee(compteId, agenceId, dateRef);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
