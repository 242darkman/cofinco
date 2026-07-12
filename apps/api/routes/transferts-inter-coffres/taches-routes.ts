import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { tachesRegularisation } from "@shared/schema";
import { StatutTacheRegularisation } from "@shared/enum/status-constants";
import { eq, and, desc } from "drizzle-orm";
import { broadcastTransfertUpdate } from "./utils";

const logger = createLogger('Routes:TachesRegularisation');

export const tachesRouter = Router();

// GET /taches - Liste des tâches de régularisation
tachesRouter.get("/", async (req, res) => {
  try {
    const { statut, type, priorite } = req.query;

    let query = db.select().from(tachesRegularisation);

    const conditions = [];
    if (statut && statut !== "all") {
      conditions.push(eq(tachesRegularisation.statut, statut as any));
    }
    if (type && type !== "all") {
      conditions.push(eq(tachesRegularisation.type, type as any));
    }
    if (priorite && priorite !== "all") {
      conditions.push(eq(tachesRegularisation.priorite, priorite as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const taches = await query.orderBy(desc(tachesRegularisation.createdAt));

    res.json({ success: true, taches });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /taches');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /taches/stats - Statistiques des tâches
tachesRouter.get("/stats", async (req, res) => {
  try {
    const taches = await db.select().from(tachesRegularisation);
    const stats = {
      total: taches.length,
      open: taches.filter(t => t.statut === StatutTacheRegularisation.OPEN).length,
      inProgress: taches.filter(t => t.statut === 'IN_PROGRESS').length,
      resolved: taches.filter(t => t.statut === StatutTacheRegularisation.RESOLVED).length,
      escalated: taches.filter(t => t.statut === 'ESCALATED').length,
      critical: taches.filter(t => t.priorite === 'CRITICAL').length,
      high: taches.filter(t => t.priorite === 'HIGH').length,
    };
    res.json({ success: true, data: stats });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /taches/stats');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /taches/:id/resolve - Résoudre une tâche
tachesRouter.post("/:id/resolve", attachAbility, requireAbility(Actions.APPROVE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const schema = z.object({
      resolution: z.string().min(10),
    });

    const { resolution } = schema.parse(req.body);

    const [updated] = await db
      .update(tachesRegularisation)
      .set({
        statut: StatutTacheRegularisation.RESOLVED,
        resolution,
        resolvedBy: userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tachesRegularisation.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: "Tâche introuvable" });
    }

    res.json({ success: true, tache: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /taches/:id/resolve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /taches/:id/escalate - Escalader une tâche
tachesRouter.post("/:id/escalate", attachAbility, requireAbility(Actions.APPROVE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;

    const [updated] = await db
      .update(tachesRegularisation)
      .set({
        statut: 'ESCALATED' as any,
        priorite: 'CRITICAL' as any,
        updatedAt: new Date(),
      })
      .where(eq(tachesRegularisation.id, id))
      .returning();

    if (!updated) return res.status(404).json({ success: false, error: "Tâche introuvable" });

    broadcastTransfertUpdate('TASK_ESCALATED', id, { tacheId: id });
    res.json({ success: true, tache: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /taches/:id/escalate');
    res.status(400).json({ success: false, error: error.message });
  }
});
