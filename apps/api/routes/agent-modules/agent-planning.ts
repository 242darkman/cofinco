import {
  agentPlannings,
  insertAgentPlanningSchema
} from "@shared/schema";
import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";

const logger = createLogger("Routes:AgentModules");

export function registerAgentPlanningRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // PLANNING

  app.get("/api/agent-planning", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agentId, date, dateStart, dateEnd } = req.query;
      const conditions = [isNull(agentPlannings.deletedAt)];

      if (agentId && typeof agentId === "string") {
        conditions.push(eq(agentPlannings.agentId, agentId));
      }
      if (date && typeof date === "string") {
        conditions.push(eq(agentPlannings.datePlanning, date));
      }
      if (dateStart && typeof dateStart === "string") {
        conditions.push(gte(agentPlannings.datePlanning, dateStart));
      }
      if (dateEnd && typeof dateEnd === "string") {
        conditions.push(sql`${agentPlannings.datePlanning} <= ${dateEnd}`);
      }

      const rows = await db.select().from(agentPlannings)
        .where(and(...conditions))
        .orderBy(desc(agentPlannings.datePlanning));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Aide à la détection de conflits de planning
  // ────────────────────────────────────────────────────────────────────────────

  async function detectPlanningConflicts(
    agentId: string,
    datePlanning: string,
    heureDebut: string,
    heureFin: string,
    excludeId?: string,
  ): Promise<Array<{ id: string; type_activite: string; heure_debut: string; heure_fin: string }>> {
    const conditions = [
      isNull(agentPlannings.deletedAt),
      eq(agentPlannings.agentId, agentId),
      eq(agentPlannings.datePlanning, datePlanning),
      ne(agentPlannings.statut, "CANCELLED"),
      // Chevauchement : existant.début < nouveau.fin ET existant.fin > nouveau.début
      sql`${agentPlannings.heureDebut} < ${heureFin}`,
      sql`${agentPlannings.heureFin} > ${heureDebut}`,
    ];
    if (excludeId) {
      conditions.push(ne(agentPlannings.id, excludeId));
    }

    const conflicts = await db.select({
      id: agentPlannings.id,
      type_activite: agentPlannings.typeActivite,
      heure_debut: agentPlannings.heureDebut,
      heure_fin: agentPlannings.heureFin,
    }).from(agentPlannings).where(and(...conditions));

    return conflicts;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Aide à la récurrence de planning : générer des dates à partir des règles de récurrence
  // ────────────────────────────────────────────────────────────────────────────

  function generateRecurrenceDates(
    startDate: string,
    recurrence: { type: string; endDate: string; days?: number[] },
  ): string[] {
    const dates: string[] = [startDate];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(recurrence.endDate + "T23:59:59");
    const maxDates = 90; // limite de sécurité

    if (recurrence.type === "daily") {
      const d = new Date(start);
      d.setDate(d.getDate() + 1);
      while (d <= end && dates.length < maxDates) {
        dates.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
    } else if (recurrence.type === "weekly") {
      // Répéter le même jour de la semaine chaque semaine (ou des jours spécifiques si fournis)
      const targetDays = recurrence.days && recurrence.days.length > 0
        ? recurrence.days
        : [start.getDay()];
      const d = new Date(start);
      d.setDate(d.getDate() + 1);
      while (d <= end && dates.length < maxDates) {
        if (targetDays.includes(d.getDay())) {
          const ds = d.toISOString().slice(0, 10);
          if (ds !== startDate) dates.push(ds);
        }
        d.setDate(d.getDate() + 1);
      }
    } else if (recurrence.type === "biweekly") {
      const d = new Date(start);
      d.setDate(d.getDate() + 14);
      while (d <= end && dates.length < maxDates) {
        dates.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 14);
      }
    } else if (recurrence.type === "monthly") {
      const dayOfMonth = start.getDate();
      let m = start.getMonth() + 1;
      let y = start.getFullYear();
      while (dates.length < maxDates) {
        if (m > 11) { m = 0; y++; }
        const d = new Date(y, m, dayOfMonth);
        if (d > end) break;
        dates.push(d.toISOString().slice(0, 10));
        m++;
      }
    }

    return dates;
  }

  app.post("/api/agent-planning", requireAuth, async (req: Request, res: Response) => {
    try {
      const { recurrence, ...planningData } = req.body;
      const parsed = insertAgentPlanningSchema.parse(planningData);

      const heureDebut = parsed.heureDebut || "08:00";
      const heureFin = parsed.heureFin || "17:00";

      // Détecter les conflits pour la date principale
      const conflicts = await detectPlanningConflicts(
        parsed.agentId, parsed.datePlanning, heureDebut, heureFin
      );

      // Générer des dates de récurrence si demandé
      const dates = recurrence && recurrence.type && recurrence.type !== "none"
        ? generateRecurrenceDates(parsed.datePlanning, recurrence)
        : [parsed.datePlanning];

      // Collecter tous les conflits sur les dates de récurrence
      const allConflicts: Array<{ date: string; conflicts: any[] }> = [];
      if (conflicts.length > 0) {
        allConflicts.push({ date: parsed.datePlanning, conflicts });
      }
      for (const d of dates.slice(1)) {
        const dc = await detectPlanningConflicts(parsed.agentId, d, heureDebut, heureFin);
        if (dc.length > 0) allConflicts.push({ date: d, conflicts: dc });
      }

      // Si force=false et des conflits existent, renvoyer les conflits comme avertissement
      if (allConflicts.length > 0 && req.body.force !== true) {
        return res.status(409).json({
          error: "Conflits détectés",
          conflicts: allConflicts,
          message: `${allConflicts.length} date(s) ont des chevauchements. Renvoyez avec force=true pour créer malgré les conflits.`,
        });
      }

      // Créer des plannings pour toutes les dates
      const created: any[] = [];
      for (const d of dates) {
        const [row] = await db.insert(agentPlannings)
          .values({ ...parsed, datePlanning: d })
          .returning();
        created.push(row);
      }

      logAudit(req, "CREATE", "agent_planning", created[0].id, {
        agentId: parsed.agentId,
        date: parsed.datePlanning,
        recurrence: recurrence?.type || "none",
        totalCreated: created.length,
      });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "planning", action: "created", count: created.length } });

      res.status(201).json(created.length === 1 ? created[0] : created);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-planning/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentPlannings)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentPlannings.id, id), isNull(agentPlannings.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Planning non trouvé" });

      logAudit(req, "UPDATE", "agent_planning", id, updates);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
