import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { calculateProvisions, getProvisionSummary } from "../../services/provision-service";

import { createEngagement, getEtatEngagements, listEngagements, syncEngagementsFromCredits, updateEngagement } from "../../services/engagements-hors-bilan-service";

import { provisionsCredits } from "@shared/schema";
import { db } from "../../db";

import { desc, eq } from "drizzle-orm";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingEngagementsProvisionsRoutes(app: Express) {

  // ======================================================================
  // PROVISIONS
  // ======================================================================

  // Lister les provisions avec filtres
  app.get("/api/comptabilite/provisions", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { periodeDate, categorie, page = '1', limit = '50' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      let query = db.select().from(provisionsCredits).where(eq(provisionsCredits.agenceId, agenceId)).$dynamic();

      if (periodeDate) {
        query = query.where(eq(provisionsCredits.periodeDate, periodeDate as string));
      }
      if (categorie) {
        query = query.where(eq(provisionsCredits.categorie, categorie as string));
      }

      const provisions = await query
        .orderBy(desc(provisionsCredits.periodeDate))
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum);

      res.json({ data: provisions, page: pageNum, limit: limitNum });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Calculer les provisions manuellement
  app.post("/api/comptabilite/provisions/calculate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.body.periodeDate ? new Date(req.body.periodeDate) : new Date();
      const result = await calculateProvisions(agenceId, periodeDate, req.user?.id);

      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Résumé des provisions (rapport PAR)
  app.get("/api/comptabilite/provisions/summary", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.query.periodeDate as string | undefined;
      const result = await getProvisionSummary(agenceId, periodeDate);

      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // ======================================================================
  // ENGAGEMENTS HORS BILAN
  // ======================================================================

  // Synchroniser depuis les crédits
  app.post("/api/comptabilite/engagements/sync", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await syncEngagementsFromCredits(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Lister les engagements
  app.get("/api/comptabilite/engagements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const filters = {
        sousClasse: req.query.sousClasse as string | undefined,
        statut: req.query.statut as string | undefined,
        creditId: req.query.creditId as string | undefined,
      };

      const result = await listEngagements(agenceId, filters);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Créer un engagement manuellement
  app.post("/api/comptabilite/engagements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await createEngagement({
        ...req.body,
        agenceId,
        createdBy: req.user?.id,
      });
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Mettre à jour l'engagement
  app.patch("/api/comptabilite/engagements/:id", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await updateEngagement(req.params.id, req.body);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // État des engagements hors bilan
  app.get("/api/comptabilite/engagements/etat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateRef = req.query.dateReference as string | undefined;
      const result = await getEtatEngagements(agenceId, dateRef);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
