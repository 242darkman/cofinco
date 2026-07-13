import {
  agentCommunications,
  insertAgentCommunicationSchema
} from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";

const logger = createLogger("Routes:AgentModules");

export function registerAgentCommunicationsRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // COMMUNICATIONS

  app.get("/api/agent-communications", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id } = req.query;
      const conditions = [isNull(agentCommunications.deletedAt)];

      if (agent_id && typeof agent_id === "string") {
        conditions.push(eq(agentCommunications.destinataireId, agent_id));
      }

      const rows = await db.select().from(agentCommunications)
        .where(and(...conditions))
        .orderBy(desc(agentCommunications.createdAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-communications", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentCommunicationSchema.parse(req.body);
      const [row] = await db.insert(agentCommunications).values(parsed).returning();

      logAudit(req, "CREATE", "agent_communication", row.id, { dest: parsed.destinataireId, type: parsed.typeMessage });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "communication", action: "created", id: row.id } });

      res.status(201).json(row);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-communications/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentCommunications)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentCommunications.id, id), isNull(agentCommunications.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Communication non trouvée" });

      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
