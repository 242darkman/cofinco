import type { Express, Request, Response } from "express";
import { insertTontinePlanSchema } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { createLogger } from "../../lib/logger";
import { copyPlanToTontineValues } from "../../storage/tontines";
import { z } from "zod";
import { insertTontineSchema } from "@shared/schema";

const logger = createLogger('Routes:TontinePlans');

export function registerTontinePlansRoutes(app: Express) {
  app.get("/api/tontine-plans", requireAuth, async (req, res) => {
    try {
      let plans = await storage.getAllTontinePlans();
      if (req.query.actif === 'true') {
        plans = plans.filter((p: any) => p.actif !== false);
      } else if (req.query.actif === 'false') {
        plans = plans.filter((p: any) => p.actif === false);
      }
      res.json(plans);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Erreur chargement des plans" });
    }
  });

  app.get("/api/tontine-plans/:id", requireAuth, async (req, res) => {
    try {
      const plan = await storage.getTontinePlan(req.params.id);
      if (!plan) return res.status(404).json({ message: "Plan introuvable" });
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Erreur chargement du plan" });
    }
  });

  app.post("/api/tontine-plans", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontinePlanSchema.parse(data);
      const plan = await storage.createTontinePlan(parsed);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Erreur de validation",
          errors: error.errors
        });
      }
      res.status(500).json({ message: "Erreur interne du serveur lors de la création du plan" });
    }
  });

  app.patch("/api/tontine-plans/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const updated = await storage.updateTontinePlan(req.params.id, data as any);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Erreur mise à jour du plan" });
    }
  });

  app.delete("/api/tontine-plans/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE), async (req, res) => {
    try {
      const success = await storage.deleteTontinePlan(req.params.id);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Erreur suppression du plan" });
    }
  });

  // Create a tontine group pre-filled from a plan template
  app.post("/api/tontines/from-plan/:planId", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const plan = await storage.getTontinePlan(req.params.planId);
      if (!plan) return res.status(404).json({ message: "Modele introuvable" });

      const planValues = copyPlanToTontineValues(plan);
      const overrides = normalizeKeysDeep(req.body);
      const merged = { ...(planValues as Record<string, unknown>), ...(overrides as Record<string, unknown>) };

      const parsed = insertTontineSchema.parse(merged);
      const tontine = await storage.createTontine(parsed);
      res.json(tontine);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Erreur de validation", errors: error.errors });
      }
      logger.error({ err: error }, 'Erreur creation tontine depuis plan');
      res.status(500).json({ message: error.message || "Erreur interne" });
    }
  });

  // ============================================================================
  // PRODUCTION-READY TONTINE ENDPOINTS
  // ============================================================================

  // --- CYCLES ---

  // List cycles for a tontine
}
