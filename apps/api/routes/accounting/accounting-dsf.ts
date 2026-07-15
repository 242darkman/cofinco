import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { generateDsf, getDsf, listDsf, validateDsf } from "../../services/dsf-service";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingDsfRoutes(app: Express) {

  // ======================================================================
  // DSF (Déclaration Statistique et Fiscale)
  // ======================================================================

  // Générer la DSF
  app.post("/api/comptabilite/dsf/generate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { exerciceId } = req.body;
      if (!exerciceId) return res.status(400).json({ message: "exerciceId requis" });

      const result = await generateDsf(agenceId, exerciceId, req.user?.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Lister les déclarations DSF
  app.get("/api/comptabilite/dsf", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await listDsf(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Obtenir les détails de la DSF
  app.get("/api/comptabilite/dsf/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getDsf(req.params.id);
      if (!result) return res.status(404).json({ message: "DSF non trouvée" });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Valider la DSF
  app.post("/api/comptabilite/dsf/:id/validate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await validateDsf(req.params.id, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
