import {
  agentMateriel,
  insertAgentMaterielSchema
} from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Routes:AgentModules");

export function registerAgentMaterielRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // MATERIEL

  app.get("/api/agent-materiel", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, actif } = req.query;
      const conditions = [isNull(agentMateriel.deletedAt)];

      if (agent_id && typeof agent_id === "string") {
        conditions.push(eq(agentMateriel.agentId, agent_id));
      }

      const rows = await db.select().from(agentMateriel)
        .where(and(...conditions))
        .orderBy(desc(agentMateriel.createdAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-materiel", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentMaterielSchema.parse(req.body);
      const [row] = await db.insert(agentMateriel).values(parsed).returning();

      logAudit(req, "CREATE", "agent_materiel", row.id, { agentId: parsed.agentId, type: parsed.typeMateriel });

      res.status(201).json(row);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-materiel/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentMateriel)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentMateriel.id, id), isNull(agentMateriel.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Matériel non trouvé" });

      logAudit(req, "UPDATE", "agent_materiel", id, updates);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
