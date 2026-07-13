import {
  agentCommissions,
  agentsTerrain,
  insertAgentCommissionSchema,
  paiementsTerrain
} from "@shared/schema";
import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";
import { getUser } from "./agent-modules-helpers";

const logger = createLogger("Routes:AgentModules");

export function registerAgentCommissionsRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // COMMISSIONS

  app.get("/api/agent-commissions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, periode } = req.query;
      const conditions = [isNull(agentCommissions.deletedAt)];

      if (agent_id && typeof agent_id === "string") {
        conditions.push(eq(agentCommissions.agentId, agent_id));
      }
      if (periode && typeof periode === "string") {
        conditions.push(eq(agentCommissions.periode, periode));
      }

      const rows = await db.select().from(agentCommissions)
        .where(and(...conditions))
        .orderBy(desc(agentCommissions.createdAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-commissions", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const parsed = insertAgentCommissionSchema.parse(req.body);
      const [row] = await db.insert(agentCommissions).values(parsed).returning();

      if (user) {
        logAudit(req, "CREATE", "agent_commission", row.id, { agentId: parsed.agentId, periode: parsed.periode });
      }

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "commission", action: "created", id: row.id } });

      res.status(201).json(row);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-commissions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentCommissions)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentCommissions.id, id), isNull(agentCommissions.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Commission non trouvée" });

      logAudit(req, "UPDATE", "agent_commission", id, updates);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Point de terminaison du paiement de la commission
  // ────────────────────────────────────────────────────────────────────────────

  const payCommissionSchema = z.object({
    method: z.enum(["CASH", "PAYROLL", "MOBILE_MONEY"]),
    sessionCaisseId: z.string().uuid().optional(),
    phone: z.string().optional(),
    provider: z.string().optional(),
  });

  app.post("/api/agent-commissions/:id/pay", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = getUser(req);
      if (!user) return res.status(401).json({ error: "Non authentifié" });

      const parsed = payCommissionSchema.parse(req.body);

      // 1. Trouver la commission
      const [commission] = await db.select().from(agentCommissions)
        .where(and(eq(agentCommissions.id, id), isNull(agentCommissions.deletedAt)));

      if (!commission) return res.status(404).json({ error: "Commission non trouvée" });

      if (commission.statutPaiement === "PAID") {
        return res.status(400).json({ error: "Commission déjà payée" });
      }
      if (commission.statutPaiement === "PROCESSING") {
        return res.status(400).json({ error: "Paiement déjà en cours (Mobile Money)" });
      }

      const montantNet = Number(commission.montantNet || 0);
      if (montantNet <= 0) {
        return res.status(400).json({ error: "Montant net invalide (doit être > 0)" });
      }

      // Résoudre l'ID de l'agence
      const [agent] = await db.select({ agenceId: agentsTerrain.currentAgenceId })
        .from(agentsTerrain)
        .where(eq(agentsTerrain.id, commission.agentId))
        .limit(1);

      const agenceId = agent?.agenceId || commission.agenceId;
      if (!agenceId) {
        return res.status(400).json({ error: "Agence non trouvée pour cet agent" });
      }

      const { payCommissionCash, payCommissionPayroll, initiateCommissionMobileMoney } =
        await import("../../services/commission-payment-service");

      let result;

      switch (parsed.method) {
        case "CASH": {
          if (!parsed.sessionCaisseId) {
            return res.status(400).json({ error: "sessionCaisseId requis pour paiement en espèces" });
          }
          result = await db.transaction(async (tx) => {
            return payCommissionCash(tx, commission, parsed.sessionCaisseId!, agenceId, user.id);
          });
          break;
        }

        case "PAYROLL": {
          result = await db.transaction(async (tx) => {
            return payCommissionPayroll(tx, commission, agenceId, user.id);
          });
          break;
        }

        case "MOBILE_MONEY": {
          if (!parsed.phone || !parsed.provider) {
            return res.status(400).json({ error: "phone et provider requis pour Mobile Money" });
          }
          result = await initiateCommissionMobileMoney(
            commission, parsed.phone, parsed.provider, agenceId, user.id
          );
          break;
        }
      }

      logAudit(req, "PAY", "agent_commission", id, { method: parsed.method, montantNet, ...result });

      // Diffuser la mise à jour
      const ws = getWsInstance();
      if (ws) ws.broadcast({
        type: "AGENT_MODULES_UPDATE",
        payload: { entity: "commission", action: "paid", id, method: parsed.method },
      });

      // Retourner la commission mise à jour
      const [updated] = await db.select().from(agentCommissions).where(eq(agentCommissions.id, id));
      res.json({ commission: updated, payment: result });
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Aides au calcul automatique de la commission
  // ────────────────────────────────────────────────────────────────────────────

  async function computeCommissionCollecte(agentId: string, periode: string): Promise<number> {
    const [year, month] = periode.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);

    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(${paiementsTerrain.montant}::numeric), 0)` })
      .from(paiementsTerrain)
      .where(and(
        eq(paiementsTerrain.agentId, agentId),
        gte(paiementsTerrain.createdAt, periodStart),
        lt(paiementsTerrain.createdAt, periodEnd),
        ne(paiementsTerrain.statut, "CANCELLED"),
        ne(paiementsTerrain.statut, "REVERSED"),
      ));
    return Number(result?.total || 0);
  }

  function recalcCommissionAmounts(montantCollecte: number, tauxCommission: number, primes: number, avances: number) {
    const montantCommission = (montantCollecte * tauxCommission) / 100;
    const montantNet = montantCommission + primes - avances;
    return { montantCommission, montantNet };
  }

  /**
   * POST /api/agent-commissions/:id/recalculate
   * Calcul automatique du montant collecté à partir des données réelles de paiementsTerrain pour la période.
   */
  app.post("/api/agent-commissions/:id/recalculate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [commission] = await db.select().from(agentCommissions)
        .where(and(eq(agentCommissions.id, id), isNull(agentCommissions.deletedAt)));

      if (!commission) return res.status(404).json({ error: "Commission non trouvée" });

      const montantCollecte = await computeCommissionCollecte(commission.agentId, commission.periode);
      const taux = Number(commission.tauxCommission || 5);
      const primes = Number(commission.primes || 0);
      const avances = Number(commission.avances || 0);
      const { montantCommission, montantNet } = recalcCommissionAmounts(montantCollecte, taux, primes, avances);

      const [updated] = await db.update(agentCommissions)
        .set({
          montantCollecte: String(montantCollecte),
          montantCommission: String(montantCommission),
          montantNet: String(montantNet),
          updatedAt: new Date(),
        })
        .where(eq(agentCommissions.id, id))
        .returning();

      logAudit(req, "RECALCULATE", "agent_commission", id, { montantCollecte, montantCommission, montantNet });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "commission", action: "recalculated", id } });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  /**
   * POST /api/agent-commissions/recalculate-all
   * Recalcul en lot de toutes les commissions pour un agent et/ou une période donnés.
   */
  app.post("/api/agent-commissions/recalculate-all", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, periode } = req.body;
      const conditions = [isNull(agentCommissions.deletedAt)];
      if (agent_id) conditions.push(eq(agentCommissions.agentId, agent_id));
      if (periode) conditions.push(eq(agentCommissions.periode, periode));

      const allCommissions = await db.select().from(agentCommissions).where(and(...conditions));

      const results: any[] = [];
      for (const commission of allCommissions) {
        const montantCollecte = await computeCommissionCollecte(commission.agentId, commission.periode);
        const taux = Number(commission.tauxCommission || 5);
        const primes = Number(commission.primes || 0);
        const avances = Number(commission.avances || 0);
        const { montantCommission, montantNet } = recalcCommissionAmounts(montantCollecte, taux, primes, avances);

        const [updated] = await db.update(agentCommissions)
          .set({
            montantCollecte: String(montantCollecte),
            montantCommission: String(montantCommission),
            montantNet: String(montantNet),
            updatedAt: new Date(),
          })
          .where(eq(agentCommissions.id, commission.id))
          .returning();
        results.push(updated);
      }

      logAudit(req, "RECALCULATE_ALL", "agent_commissions", undefined, { count: results.length, agent_id, periode });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "commission", action: "recalculated-all" } });

      res.json({ updated: results.length, commissions: results });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
