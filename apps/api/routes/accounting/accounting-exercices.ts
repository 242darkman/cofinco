import type { Express, Request, Response } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import accountingPostingService from "../../services/accounting-posting-service";
import { getWsInstance } from "../../ws-server";
import { toHttpError } from "../utils";

import { clotureExercice, executeClotureStep, getClotureStatus } from "../../services/exercice-cloture-service";

import { glPeriods } from "@shared/schema";
import { db } from "../../db";

import { and, asc, eq } from "drizzle-orm";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingExercicesRoutes(app: Express) {

  // 13. Gestion des périodes (rôles: admin, chef, comptable)
  app.get("/api/comptabilite/periods", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const agenceId = (req as AuthenticatedRequest).user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

      const periods = await db
        .select()
        .from(glPeriods)
        .where(and(eq(glPeriods.agenceId, agenceId), eq(glPeriods.year, year)))
        .orderBy(asc(glPeriods.month));

      res.json(periods);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur récupération périodes');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // 14. Clôturer la période (rôles: admin, comptable)
  app.post("/api/comptabilite/periods/close", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      const agenceId = user?.agenceId;
      const userId = user?.id;

      if (!agenceId || !userId) {
        return res.status(400).json({ message: "Agence ou utilisateur non défini" });
      }

      const { year, month, notes } = req.body;

      if (!year || !month) {
        return res.status(400).json({ message: "Année et mois requis" });
      }

      await accountingPostingService.closePeriod({
        agenceId,
        year: parseInt(year),
        month: parseInt(month),
        userId,
        notes
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "ACCOUNTING_UPDATE", payload: { type: 'period_closed', year, month } });
      }

      res.json({ success: true, message: `Période ${month}/${year} clôturée` });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Erreur clôture période');
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // CLOTURE EXERCICE
  // ======================================================================

  // Lancer la clôture de l'exercice
  app.post("/api/comptabilite/exercices/:id/cloture", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      // Seul un admin peut clôturer l'exercice
      if (!req.ability?.can(Actions.MANAGE, Subjects.COMPTABILITE)) {
        return res.status(403).json({ message: "Seul un administrateur peut clôturer un exercice" });
      }

      const result = await clotureExercice(id, agenceId, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Obtenir le statut de clôture
  app.get("/api/comptabilite/exercices/:id/cloture/status", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const result = await getClotureStatus(id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Exécuter une étape de clôture spécifique (réessai)
  app.post("/api/comptabilite/exercices/:id/cloture/step", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { step } = req.body;
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });
      if (!step) return res.status(400).json({ message: "step requis" });

      const result = await executeClotureStep(id, agenceId, step, req.user!.id);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
