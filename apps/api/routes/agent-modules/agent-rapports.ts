import {
  agentRapports,
  insertAgentRapportSchema
} from "@shared/schema";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Routes:AgentModules");

export function registerAgentRapportsRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // RAPPORTS

  app.get("/api/agent-rapports", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, type_rapport, periode_du, periode_au } = req.query;
      const conditions = [isNull(agentRapports.deletedAt)];

      if (agent_id && typeof agent_id === "string") {
        conditions.push(eq(agentRapports.agentId, agent_id));
      }
      if (type_rapport && typeof type_rapport === "string" && type_rapport !== "all") {
        conditions.push(eq(agentRapports.typeRapport, type_rapport));
      }
      if (periode_du && typeof periode_du === "string") {
        conditions.push(gte(agentRapports.periodeDebut, periode_du));
      }
      if (periode_au && typeof periode_au === "string") {
        conditions.push(lte(agentRapports.periodeFin, periode_au));
      }

      const rows = await db.select().from(agentRapports)
        .where(and(...conditions))
        .orderBy(desc(agentRapports.createdAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-rapports", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      // Contraindre les champs numériques en chaînes (les colonnes numériques Drizzle sont mappées à z.string())
      if (typeof body.montantTotalCollecte === 'number') body.montantTotalCollecte = String(body.montantTotalCollecte);
      if (typeof body.tauxReussite === 'number') body.tauxReussite = String(body.tauxReussite);
      if (typeof body.kmParcourus === 'number') body.kmParcourus = String(body.kmParcourus);
      const parsed = insertAgentRapportSchema.parse(body);
      const [row] = await db.insert(agentRapports).values(parsed).returning();

      logAudit(req, "CREATE", "agent_rapport", row.id, { agentId: parsed.agentId, type: parsed.typeRapport });

      res.status(201).json(row);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
