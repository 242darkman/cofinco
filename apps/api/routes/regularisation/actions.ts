/**
 * @module routes/regularisation/actions
 * Routes API pour les actions sur les régularisations (résolution, assignation, priorité).
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { db } from "../../db";
import { tachesRegularisation, users } from "@shared/schema";
import { tachesRegularisationCoffreCaisse } from "@shared/schema/coffre";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { StatutTacheRegularisation } from "@shared/enum/status-constants";

const logger = createLogger('Routes:Regularisation:Actions');

const resolveSchema = z.object({
  resolution: z.string().min(10, "La résolution doit contenir au moins 10 caractères"),
  newStatut: z.enum(["RESOLVED", "ESCALATED"]).optional().default("RESOLVED"),
});

const assignSchema = z.object({
  assignedTo: z.string().uuid("ID utilisateur invalide"),
});

const updatePrioriteSchema = z.object({
  priorite: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
});

/**
 * Enregistre les actions sur les tâches de régularisation.
 */
export function registerRegularisationActionsRoutes(app: Express): void {
  /**
   * POST /api/admin/regularisations/:source/:id/resolve
   * Marquer une tâche comme résolue
   */
  app.post(
    "/api/admin/regularisations/:source/:id/resolve",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.REGULARISATION),
    async (req, res) => {
      try {
        const { source, id } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) return res.status(401).json({ error: "Non authentifié" });
        if (source !== "coffre" && source !== "coffre-caisse") {
          return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
        }

        const parsed = resolveSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const { resolution, newStatut } = parsed.data;

        if (source === "coffre") {
          const [task] = await db.select().from(tachesRegularisation).where(eq(tachesRegularisation.id, id));
          if (!task) return res.status(404).json({ error: "Tâche non trouvée" });
          if (task.statut === StatutTacheRegularisation.RESOLVED || task.statut === StatutTacheRegularisation.ESCALATED) {
            return res.status(400).json({ error: "Cette tâche est déjà résolue" });
          }

          const [updated] = await db
            .update(tachesRegularisation)
            .set({
              statut: newStatut,
              resolution,
              resolvedBy: userId,
              resolvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(tachesRegularisation.id, id))
            .returning();

          res.json({ success: true, task: updated });
        } else {
          const [task] = await db.select().from(tachesRegularisationCoffreCaisse).where(eq(tachesRegularisationCoffreCaisse.id, id));
          if (!task) return res.status(404).json({ error: "Tâche non trouvée" });
          if (task.statut === StatutTacheRegularisation.RESOLVED || task.statut === StatutTacheRegularisation.ESCALATED) {
            return res.status(400).json({ error: "Cette tâche est déjà résolue" });
          }

          const [updated] = await db
            .update(tachesRegularisationCoffreCaisse)
            .set({
              statut: newStatut,
              resolution,
              resolvedBy: userId,
              resolvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(tachesRegularisationCoffreCaisse.id, id))
            .returning();

          res.json({ success: true, task: updated });
        }
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur résolution régularisation');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );

  /**
   * POST /api/admin/regularisations/:source/:id/assign
   * Assigner une tâche à un utilisateur
   */
  app.post(
    "/api/admin/regularisations/:source/:id/assign",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.REGULARISATION),
    async (req, res) => {
      try {
        const { source, id } = req.params;
        if (source !== "coffre" && source !== "coffre-caisse") {
          return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
        }

        const parsed = assignSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const { assignedTo } = parsed.data;
        const [user] = await db.select().from(users).where(eq(users.id, assignedTo));
        if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });

        if (source === "coffre") {
          const [updated] = await db
            .update(tachesRegularisation)
            .set({
              assignedTo,
              statut: StatutTacheRegularisation.IN_PROGRESS,
              updatedAt: new Date(),
            })
            .where(eq(tachesRegularisation.id, id))
            .returning();
          if (!updated) return res.status(404).json({ error: "Tâche non trouvée" });
          res.json({ success: true, task: updated });
        } else {
          const [updated] = await db
            .update(tachesRegularisationCoffreCaisse)
            .set({
              assignedTo,
              statut: StatutTacheRegularisation.IN_PROGRESS,
              updatedAt: new Date(),
            })
            .where(eq(tachesRegularisationCoffreCaisse.id, id))
            .returning();
          if (!updated) return res.status(404).json({ error: "Tâche non trouvée" });
          res.json({ success: true, task: updated });
        }
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur assignation régularisation');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );

  /**
   * PATCH /api/admin/regularisations/:source/:id/priorite
   * Modifier la priorité d'une tâche
   */
  app.patch(
    "/api/admin/regularisations/:source/:id/priorite",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.REGULARISATION),
    async (req, res) => {
      try {
        const { source, id } = req.params;
        if (source !== "coffre" && source !== "coffre-caisse") {
          return res.status(400).json({ error: "Source invalide (coffre ou coffre-caisse)" });
        }

        const parsed = updatePrioriteSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const { priorite } = parsed.data;

        if (source === "coffre") {
          const [updated] = await db
            .update(tachesRegularisation)
            .set({ priorite, updatedAt: new Date() })
            .where(eq(tachesRegularisation.id, id))
            .returning();
          if (!updated) return res.status(404).json({ error: "Tâche non trouvée" });
          res.json({ success: true, task: updated });
        } else {
          const [updated] = await db
            .update(tachesRegularisationCoffreCaisse)
            .set({ priorite, updatedAt: new Date() })
            .where(eq(tachesRegularisationCoffreCaisse.id, id))
            .returning();
          if (!updated) return res.status(404).json({ error: "Tâche non trouvée" });
          res.json({ success: true, task: updated });
        }
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur mise à jour priorité');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
}
