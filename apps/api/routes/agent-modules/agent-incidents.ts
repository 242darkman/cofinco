import {
  agentIncidents,
  insertAgentIncidentSchema
} from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";
import { getUser } from "./agent-modules-helpers";

const logger = createLogger("Routes:AgentModules");

export function registerAgentIncidentsRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // INCIDENTS

  app.get("/api/agent-incidents", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agentId } = req.query;
      const conditions = [isNull(agentIncidents.deletedAt)];

      if (agentId && typeof agentId === "string") {
        conditions.push(eq(agentIncidents.agentId, agentId));
      }

      const rows = await db.select().from(agentIncidents)
        .where(and(...conditions))
        .orderBy(desc(agentIncidents.createdAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-incidents", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentIncidentSchema.parse(req.body);
      const [row] = await db.insert(agentIncidents).values(parsed).returning();

      logAudit(req, "CREATE", "agent_incident", row.id, { agentId: parsed.agentId, type: parsed.typeIncident, gravite: parsed.gravite });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "incident", action: "created", id: row.id, gravite: parsed.gravite } });

      res.status(201).json(row);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-incidents/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentIncidents)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentIncidents.id, id), isNull(agentIncidents.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Incident non trouvé" });

      logAudit(req, "UPDATE", "agent_incident", id, updates);

      const ws = getWsInstance();
      if (ws) ws.broadcast({
        type: "AGENT_MODULES_UPDATE",
        payload: { entity: "incident", action: updates.statut === "RESOLVED" ? "resolved" : "updated", id },
      });

      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  /**
   * POST /api/agent-incidents/:id/escalate
   * Escalader un incident au niveau supérieur.
   */
  app.post("/api/agent-incidents/:id/escalate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = getUser(req);

      const [existing] = await db.select().from(agentIncidents)
        .where(and(eq(agentIncidents.id, id), isNull(agentIncidents.deletedAt)));

      if (!existing) return res.status(404).json({ error: "Incident non trouvé" });
      if (existing.statut === "RESOLVED" || existing.statut === "CLOSED") {
        return res.status(400).json({ error: "Impossible d'escalader un incident résolu ou fermé" });
      }

      const [row] = await db.update(agentIncidents)
        .set({
          statut: "ESCALATED",
          escaladePar: user?.id || "unknown",
          dateEscalade: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentIncidents.id, id))
        .returning();

      logAudit(req, "ESCALATE", "agent_incident", id, {
        previousStatut: existing.statut,
        gravite: existing.gravite,
      });

      const ws = getWsInstance();
      if (ws) ws.broadcast({
        type: "AGENT_MODULES_UPDATE",
        payload: { entity: "incident", action: "escalated", id, gravite: existing.gravite },
      });

      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
