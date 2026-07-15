import type { Express } from "express";
import { insertTontineSchema, employes } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess } from "../../middleware";
import { normalizeKeysDeep } from "../utils";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:TontinesCore');

export function registerTontineCoreRoutes(app: Express) {
  app.get("/api/tontines", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const filter = agenceFilter ? { agence: agenceFilter.agenceId } : {};
      const tontines = await storage.getAllTontines(filter);
      res.json(tontines);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement tontines');
      res.status(500).json({ message: error.message || "Erreur chargement tontines" });
    }
  });

  // Create tontine (roles: admin, chef, superviseur)
  app.post("/api/tontines", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), requireAgenceAccess("agenceId"), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontineSchema.parse(data);

      // Auto-inject agenceId from user session if not provided
      if (!parsed.agenceId && req.user?.agenceId) {
        (parsed as any).agenceId = req.user.agenceId;
      }

      // Le gestionnaire doit être de la même agence (sauf admin)
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

      if (agenceFilter && parsed.gestionnaireId) {
        const [employe] = await db.select({ agenceId: employes.agenceId })
          .from(employes)
          .where(eq(employes.userId, parsed.gestionnaireId));
        if (!employe) {
          return res.status(403).json({ message: "Gestionnaire introuvable dans la table employes" });
        }
        if (agenceFilter.agenceId && employe.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Le gestionnaire n'appartient pas a cette agence" });
        }
      }

      const tontine = await storage.createTontine(parsed);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'tontine_new', id: tontine.id } });
      }

      res.json(tontine);
  });

  app.get("/api/tontines/:id", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter && tontine.gestionnaireId) {
        const [employe] = await db.select({ agenceId: employes.agenceId })
          .from(employes)
          .where(eq(employes.userId, tontine.gestionnaireId));
        if (employe && agenceFilter.agenceId && employe.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Acces refuse : gestionnaire d'une autre agence" });
        }
      }

      res.json(tontine);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement tontine');
      res.status(500).json({ message: error.message || "Erreur chargement tontine" });
    }
  });

  // Update tontine (roles: admin, chef, superviseur)
  app.patch("/api/tontines/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      // Convert date strings to Date objects for timestamp columns
      const updateData: Record<string, any> = { ...(data as Record<string, any>) };
      if (updateData.dateDebut && typeof updateData.dateDebut === 'string') {
        updateData.dateDebut = new Date(updateData.dateDebut);
      }
      if (updateData.dateFin && typeof updateData.dateFin === 'string') {
        updateData.dateFin = new Date(updateData.dateFin);
      }
      if (updateData.prochainTour && typeof updateData.prochainTour === 'string') {
        updateData.prochainTour = new Date(updateData.prochainTour);
      }

      const updated = await storage.updateTontine(req.params.id, updateData);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'tontine_updated', id: req.params.id } });
      }

      res.json(updated);
  });

  // Delete tontine (roles: admin, chef)
  app.delete("/api/tontines/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE), async (req, res) => {
    try {
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const success = await storage.deleteTontine(req.params.id);

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'tontine_deleted', id: req.params.id } });
      }

      res.json({ success });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur suppression tontine');
      res.status(500).json({ message: error.message || "Erreur suppression tontine" });
    }
  });
}
