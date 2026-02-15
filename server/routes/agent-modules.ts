/**
 * Agent Sub-Modules Routes
 *
 * CRUD endpoints for agent commissions, objectives, planning, reports,
 * incidents, equipment, communications, and training.
 */

import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../db";
import {
  agentCommissions,
  agentObjectifs,
  agentPlannings,
  agentRapports,
  agentIncidents,
  agentMateriel,
  agentCommunications,
  formations,
  formationParticipants,
  formationCertificates,
  employes,
  agentsTerrain,
  users,
  userRoles,
  insertAgentCommissionSchema,
  insertAgentObjectifSchema,
  insertAgentPlanningSchema,
  insertAgentRapportSchema,
  insertAgentIncidentSchema,
  insertAgentMaterielSchema,
  insertAgentCommunicationSchema,
  insertFormationSchema,
} from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { eq, and, isNull, desc, sql, gte, lte, lt, ne } from "drizzle-orm";
import { z } from "zod";
import {
  paiementsTerrain,
  visitesTerrain,
  prospections,
  avantages,
  avantagesEmployes,
  type AgentObjectif,
} from "@shared/schema";
import { getWsInstance } from "../ws-server";
import { logAudit } from "../audit";
import { calculateObjectifPrize } from "../services/objectif-recalculation-service";

// Helper to get user from request
function getUser(req: Request): { id: string; agenceId?: string } | null {
  return (req as any).user || null;
}

// Helper to join agent name
async function withAgentName(rows: any[]) {
  if (rows.length === 0) return rows;
  const agentIds = Array.from(new Set(rows.map(r => r.agentId).filter(Boolean)));

  if (agentIds.length === 0) return rows;

  const agents = await db.select({
    id: agentsTerrain.id,
  }).from(agentsTerrain).where(
    sql`${agentsTerrain.id} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`
  );

  // We can't easily get names from agentsTerrain alone (they're in employes->users)
  // Return rows with agent id; frontend already handles display
  return rows;
}

export function registerAgentModulesRoutes(app: Express) {

  // ════════════════════════════════════════════════════════════════════════════
  // CLASSEMENT — Server-computed agent rankings
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-classement", requireAuth, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as string) || "mois";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));

      // Compute date boundary
      const dateFrom = new Date();
      if (period === "semaine") dateFrom.setDate(dateFrom.getDate() - 7);
      else if (period === "annee") dateFrom.setFullYear(dateFrom.getFullYear() - 1);
      else dateFrom.setMonth(dateFrom.getMonth() - 1); // default: mois

      const currentPeriode = new Date().toISOString().slice(0, 7); // YYYY-MM

      // 1. Get all active agents with role AGENT_TERRAIN
      const activeAgents = await db
        .select({
          agentId: agentsTerrain.id,
          userId: users.id,
          nom: users.nom,
          prenom: users.prenom,
          photoUrl: users.photoProfile,
        })
        .from(agentsTerrain)
        .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
        .innerJoin(users, eq(employes.userId, users.id))
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .where(
          and(
            isNull(agentsTerrain.deletedAt),
            eq(agentsTerrain.statut, "ACTIVE"),
            eq(userRoles.role, SystemRole.AGENT_TERRAIN),
          )
        );

      if (activeAgents.length === 0) {
        return res.json([]);
      }

      const agentIds = activeAgents.map(a => a.agentId);

      // 2. Collectes: count + montant per agent (approved paiements in period)
      const collectesAgg = await db
        .select({
          agentId: paiementsTerrain.agentId,
          count: sql<number>`count(*)::int`,
          montant: sql<number>`coalesce(sum(${paiementsTerrain.montant}::numeric), 0)::numeric`,
        })
        .from(paiementsTerrain)
        .where(
          and(
            sql`${paiementsTerrain.agentId} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`,
            isNull(paiementsTerrain.deletedAt),
            gte(paiementsTerrain.createdAt, dateFrom),
            sql`${paiementsTerrain.statut} NOT IN ('CANCELLED', 'REVERSED')`,
          )
        )
        .groupBy(paiementsTerrain.agentId);

      // 3. Visites: count of completed visits in period
      const visitesAgg = await db
        .select({
          agentId: visitesTerrain.agentId,
          count: sql<number>`count(*)::int`,
        })
        .from(visitesTerrain)
        .where(
          and(
            sql`${visitesTerrain.agentId} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`,
            isNull(visitesTerrain.deletedAt),
            gte(visitesTerrain.dateVisite, dateFrom),
            ne(visitesTerrain.statut, "PLANNED"),
          )
        )
        .groupBy(visitesTerrain.agentId);

      // 4. Prospections: count in period
      const prospectionsAgg = await db
        .select({
          agentId: prospections.agentId,
          count: sql<number>`count(*)::int`,
          converted: sql<number>`count(*) FILTER (WHERE ${prospections.statut} = 'CONVERTED')::int`,
        })
        .from(prospections)
        .where(
          and(
            sql`${prospections.agentId} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`,
            isNull(prospections.deletedAt),
            gte(prospections.createdAt, dateFrom),
          )
        )
        .groupBy(prospections.agentId);

      // 5. Objectifs: average completion % for current month
      const objectifsAgg = await db
        .select({
          agentId: agentObjectifs.agentId,
          avgPct: sql<number>`coalesce(avg(
            CASE WHEN ${agentObjectifs.valeurObjectif}::numeric > 0
              THEN (${agentObjectifs.valeurRealisee}::numeric / ${agentObjectifs.valeurObjectif}::numeric) * 100
              ELSE 0
            END
          ), 0)::numeric`,
        })
        .from(agentObjectifs)
        .where(
          and(
            sql`${agentObjectifs.agentId} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`,
            isNull(agentObjectifs.deletedAt),
            eq(agentObjectifs.periode, currentPeriode),
          )
        )
        .groupBy(agentObjectifs.agentId);

      // Build lookup maps
      const collectesMap = new Map(collectesAgg.map(r => [r.agentId, r]));
      const visitesMap = new Map(visitesAgg.map(r => [r.agentId, r]));
      const prospectionsMap = new Map(prospectionsAgg.map(r => [r.agentId, r]));
      const objectifsMap = new Map(objectifsAgg.map(r => [r.agentId, r]));

      // 6. Compute composite score per agent
      //
      // Scoring weights:
      //   - Collectes count × 10 pts each  (volume of activity)
      //   - Collecte montant / 100,000      (financial volume, 1 pt per 100K FCFA)
      //   - Visites count × 5 pts each      (field presence)
      //   - Prospections × 8 pts each       (acquisition effort)
      //   - Conversions × 20 pts each       (acquisition result)
      //   - Objectif avg completion          (target alignment, 0-100+)
      //
      const rankings = activeAgents.map(agent => {
        const col = collectesMap.get(agent.agentId);
        const vis = visitesMap.get(agent.agentId);
        const pros = prospectionsMap.get(agent.agentId);
        const obj = objectifsMap.get(agent.agentId);

        const collectesCount = col ? Number(col.count) : 0;
        const collectesMontant = col ? Number(col.montant) : 0;
        const visitesCount = vis ? Number(vis.count) : 0;
        const prospectionsCount = pros ? Number(pros.count) : 0;
        const conversionsCount = pros ? Number(pros.converted) : 0;
        const objectifPct = obj ? Math.round(Number(obj.avgPct)) : 0;

        const score =
          collectesCount * 10 +
          Math.round(collectesMontant / 100000) +
          visitesCount * 5 +
          prospectionsCount * 8 +
          conversionsCount * 20 +
          objectifPct;

        // Derive level from score
        let niveau = 1;
        if (score >= 1000) niveau = 5;
        else if (score >= 600) niveau = 4;
        else if (score >= 300) niveau = 3;
        else if (score >= 100) niveau = 2;

        return {
          agentId: agent.agentId,
          userId: agent.userId,
          nom: agent.nom || "Inconnu",
          prenom: agent.prenom || "",
          photoUrl: agent.photoUrl || null,
          score,
          niveau,
          collectesCount,
          collectesMontant,
          visitesCount,
          prospectionsCount,
          conversionsCount,
          objectifPct,
        };
      });

      // Sort by score descending
      rankings.sort((a, b) => b.score - a.score);

      // Paginate
      const total = rankings.length;
      const totalPages = Math.ceil(total / pageSize);
      const paginatedRankings = rankings.slice((page - 1) * pageSize, page * pageSize);

      res.json({
        data: paginatedRankings,
        total,
        page,
        pageSize,
        totalPages,
      });
    } catch (error) {
      console.error("Erreur classement:", error);
      res.status(500).json({ error: "Erreur lors du calcul du classement" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // COMMISSIONS
  // ════════════════════════════════════════════════════════════════════════════

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
  // Commission payment endpoint
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

      // 1. Find commission
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

      // Resolve agenceId
      const [agent] = await db.select({ agenceId: agentsTerrain.agenceId })
        .from(agentsTerrain)
        .where(eq(agentsTerrain.id, commission.agentId))
        .limit(1);

      const agenceId = agent?.agenceId || commission.agenceId;
      if (!agenceId) {
        return res.status(400).json({ error: "Agence non trouvée pour cet agent" });
      }

      const { payCommissionCash, payCommissionPayroll, initiateCommissionMobileMoney } =
        await import("../services/commission-payment-service");

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

      // Broadcast update
      const ws = getWsInstance();
      if (ws) ws.broadcast({
        type: "AGENT_MODULES_UPDATE",
        payload: { entity: "commission", action: "paid", id, method: parsed.method },
      });

      // Return updated commission
      const [updated] = await db.select().from(agentCommissions).where(eq(agentCommissions.id, id));
      res.json({ commission: updated, payment: result });
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Commission auto-calculation helpers
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
   * Auto-compute montant_collecte from real paiementsTerrain data for the period.
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
   * Batch recalculate all commissions for a given agent and/or period.
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

  // ════════════════════════════════════════════════════════════════════════════
  // OBJECTIFS
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-objectifs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agentId, periode } = req.query;
      const conditions = [isNull(agentObjectifs.deletedAt)];

      if (agentId && typeof agentId === "string") {
        conditions.push(eq(agentObjectifs.agentId, agentId));
      }
      if (periode && typeof periode === "string") {
        conditions.push(eq(agentObjectifs.periode, periode));
      }

      const rows = await db.select().from(agentObjectifs)
        .where(and(...conditions))
        .orderBy(desc(agentObjectifs.createdAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-objectifs", requireAuth, async (req: Request, res: Response) => {
    try {
      // Coerce numeric fields to strings (Drizzle numeric columns expect string)
      const body = { ...req.body };
      if (typeof body.recompense === 'number') body.recompense = String(body.recompense);
      if (typeof body.valeurObjectif === 'number') body.valeurObjectif = String(body.valeurObjectif);
      if (typeof body.valeurRealisee === 'number') body.valeurRealisee = String(body.valeurRealisee);

      const parsed = insertAgentObjectifSchema.parse(body);

      // Auto-calculate prize from linked avantage config
      let recompense = parsed.recompense || "0";
      let primeStatut = "NONE";
      if (parsed.avantageId) {
        const montant = await calculateObjectifPrize(parsed.avantageId, parsed.agentId);
        recompense = String(montant);
        primeStatut = "PENDING";
      }

      const [row] = await db.insert(agentObjectifs).values({
        ...parsed,
        recompense,
        primeStatut,
      }).returning();

      logAudit(req, "CREATE", "agent_objectif", row.id, { agentId: parsed.agentId, periode: parsed.periode, avantageId: parsed.avantageId });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "objectif", action: "created", id: row.id } });

      res.status(201).json(row);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-objectifs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // If avantageId changes, recalculate the prize
      if (updates.avantageId !== undefined) {
        // Need the objective's agentId for calculation
        const [current] = await db.select().from(agentObjectifs)
          .where(and(eq(agentObjectifs.id, id), isNull(agentObjectifs.deletedAt)));
        if (!current) return res.status(404).json({ error: "Objectif non trouvé" });

        if (updates.avantageId) {
          const montant = await calculateObjectifPrize(updates.avantageId, current.agentId);
          updates.recompense = String(montant);
          if (!updates.primeStatut) updates.primeStatut = "PENDING";
        } else {
          updates.recompense = "0";
          updates.primeStatut = "NONE";
        }
      }

      const [row] = await db.update(agentObjectifs)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentObjectifs.id, id), isNull(agentObjectifs.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Objectif non trouvé" });

      logAudit(req, "UPDATE", "agent_objectif", id, updates);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  /**
   * Compute real value for an objectif from operational data.
   * Pure function with no side effects - just queries and returns the value.
   */
  async function computeObjectifValue(
    agentId: string,
    typeObjectif: string,
    periode: string,
  ): Promise<number> {
    const [year, month] = periode.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);

    switch (typeObjectif) {
      case "Collecte": {
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

      case "Visites": {
        const [result] = await db
          .select({ total: sql<number>`COUNT(*)` })
          .from(visitesTerrain)
          .where(and(
            eq(visitesTerrain.agentId, agentId),
            gte(visitesTerrain.dateVisite, periodStart),
            lt(visitesTerrain.dateVisite, periodEnd),
            ne(visitesTerrain.statut, "CANCELLED"),
          ));
        return Number(result?.total || 0);
      }

      case "Clients": {
        const [result] = await db
          .select({ total: sql<number>`COUNT(DISTINCT ${paiementsTerrain.clientId})` })
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

      case "Prospection": {
        const [result] = await db
          .select({ total: sql<number>`COUNT(*)` })
          .from(prospections)
          .where(and(
            eq(prospections.agentId, agentId),
            gte(prospections.createdAt, periodStart),
            lt(prospections.createdAt, periodEnd),
            isNull(prospections.deletedAt),
          ));
        return Number(result?.total || 0);
      }

      case "Performance": {
        const otherObjectifs = await db.select().from(agentObjectifs).where(and(
          eq(agentObjectifs.agentId, agentId),
          eq(agentObjectifs.periode, periode),
          ne(agentObjectifs.typeObjectif, "Performance"),
          isNull(agentObjectifs.deletedAt),
        ));
        if (otherObjectifs.length > 0) {
          const totalPct = otherObjectifs.reduce((s, o) => {
            const target = Number(o.valeurObjectif || 1);
            const current = Number(o.valeurRealisee || 0);
            return s + Math.min((current / target) * 100, 100);
          }, 0);
          return Math.round(totalPct / otherObjectifs.length);
        }
        return 0;
      }

      default:
        return 0;
    }
  }

  /**
   * Apply computed value to an objectif: update DB + derive status + handle prize eligibility.
   */
  async function applyRecalculation(objectifId: string, valeurRealisee: number, valeurObjectif: number) {
    const target = Number(valeurObjectif || 1);
    const pct = (valeurRealisee / target) * 100;
    let statut = "IN_PROGRESS";
    if (pct >= 110) statut = "Depasse";
    else if (pct >= 100) statut = "Atteint";

    const [currentObj] = await db.select().from(agentObjectifs).where(eq(agentObjectifs.id, objectifId));
    if (!currentObj) return null;

    const wasAchieved = currentObj.statut === "Atteint" || currentObj.statut === "Depasse";
    const isNowAchieved = statut === "Atteint" || statut === "Depasse";

    let primeStatut = currentObj.primeStatut || "NONE";
    let avantageEmployeId = currentObj.avantageEmployeId;

    // Transition: non-achieved → achieved with linked prize
    if (!wasAchieved && isNowAchieved && currentObj.avantageId && primeStatut === "PENDING") {
      const montant = Number(currentObj.recompense) || 0;
      if (montant > 0) {
        const [agent] = await db.select().from(agentsTerrain).where(eq(agentsTerrain.id, currentObj.agentId));
        if (agent?.employeId) {
          const dateAttribution = `${currentObj.periode}-01`;
          const [assigned] = await db.insert(avantagesEmployes).values({
            employeId: agent.employeId,
            avantageId: currentObj.avantageId,
            montant,
            statut: "ACTIVE",
            dateAttribution,
          }).returning();
          avantageEmployeId = assigned.id;
          primeStatut = "ELIGIBLE";
        }
      }
    }

    // Reverse transition (data correction): achieved → not achieved
    if (wasAchieved && !isNowAchieved && primeStatut === "ELIGIBLE" && avantageEmployeId) {
      await db.update(avantagesEmployes)
        .set({ statut: "SUSPENDED" })
        .where(eq(avantagesEmployes.id, avantageEmployeId));
      primeStatut = "PENDING";
    }

    const [updated] = await db.update(agentObjectifs)
      .set({
        valeurRealisee: String(valeurRealisee),
        statut,
        primeStatut,
        avantageEmployeId,
        updatedAt: new Date(),
      })
      .where(eq(agentObjectifs.id, objectifId))
      .returning();

    return updated;
  }

  /**
   * POST /api/agent-objectifs/:id/recalculate
   * Auto-calculate valeur_realisee from real operational data based on type_objectif.
   */
  app.post("/api/agent-objectifs/:id/recalculate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [objectif] = await db.select().from(agentObjectifs)
        .where(and(eq(agentObjectifs.id, id), isNull(agentObjectifs.deletedAt)));

      if (!objectif) return res.status(404).json({ error: "Objectif non trouve" });

      const valeurRealisee = await computeObjectifValue(objectif.agentId, objectif.typeObjectif, objectif.periode);
      const updated = await applyRecalculation(id, valeurRealisee, Number(objectif.valeurObjectif));

      logAudit(req, "RECALCULATE", "agent_objectif", id, {
        typeObjectif: objectif.typeObjectif,
        oldValue: Number(objectif.valeurRealisee),
        newValue: valeurRealisee,
        statut: updated.statut,
      });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "objectif", action: "recalculated", id } });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  /**
   * POST /api/agent-objectifs/recalculate-all
   * Batch recalculate all objectifs for a given agent + period.
   */
  app.post("/api/agent-objectifs/recalculate-all", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agentId, periode } = req.body;
      if (!agentId || !periode) {
        return res.status(400).json({ error: "agentId et periode sont requis" });
      }

      const objectifs = await db.select().from(agentObjectifs).where(and(
        eq(agentObjectifs.agentId, agentId),
        eq(agentObjectifs.periode, periode),
        isNull(agentObjectifs.deletedAt),
      ));

      if (objectifs.length === 0) {
        return res.json({ message: "Aucun objectif trouve", results: [] });
      }

      // Recalculate each objectif using the shared helper (non-Performance first, then Performance)
      const nonPerformance = objectifs.filter(o => o.typeObjectif !== "Performance");
      const performance = objectifs.filter(o => o.typeObjectif === "Performance");

      const results: any[] = [];

      // First pass: all non-Performance objectifs
      for (const objectif of nonPerformance) {
        const valeurRealisee = await computeObjectifValue(agentId, objectif.typeObjectif, periode);
        const updated = await applyRecalculation(objectif.id, valeurRealisee, Number(objectif.valeurObjectif));
        results.push(updated);
      }

      // Second pass: Performance objectifs (depends on updated non-Performance values)
      for (const objectif of performance) {
        const valeurRealisee = await computeObjectifValue(agentId, objectif.typeObjectif, periode);
        const updated = await applyRecalculation(objectif.id, valeurRealisee, Number(objectif.valeurObjectif));
        results.push(updated);
      }

      logAudit(req, "RECALCULATE_ALL", "agent_objectifs", agentId, { periode, count: objectifs.length });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "objectif", action: "recalculated_all", agentId } });

      res.json({ message: `${results.length} objectifs recalcules`, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PLANNING
  // ════════════════════════════════════════════════════════════════════════════

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
  // Planning conflict detection helper
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
      // Overlap: existing.start < new.end AND existing.end > new.start
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
  // Planning recurrence helper: generate dates from recurrence rules
  // ────────────────────────────────────────────────────────────────────────────

  function generateRecurrenceDates(
    startDate: string,
    recurrence: { type: string; endDate: string; days?: number[] },
  ): string[] {
    const dates: string[] = [startDate];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(recurrence.endDate + "T23:59:59");
    const maxDates = 90; // safety limit

    if (recurrence.type === "daily") {
      const d = new Date(start);
      d.setDate(d.getDate() + 1);
      while (d <= end && dates.length < maxDates) {
        dates.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
    } else if (recurrence.type === "weekly") {
      // Repeat on same weekday each week (or specific days if provided)
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

      // Detect conflicts for the primary date
      const conflicts = await detectPlanningConflicts(
        parsed.agentId, parsed.datePlanning, heureDebut, heureFin
      );

      // Generate recurrence dates if requested
      const dates = recurrence && recurrence.type && recurrence.type !== "none"
        ? generateRecurrenceDates(parsed.datePlanning, recurrence)
        : [parsed.datePlanning];

      // Collect all conflicts across recurrence dates
      const allConflicts: Array<{ date: string; conflicts: any[] }> = [];
      if (conflicts.length > 0) {
        allConflicts.push({ date: parsed.datePlanning, conflicts });
      }
      for (const d of dates.slice(1)) {
        const dc = await detectPlanningConflicts(parsed.agentId, d, heureDebut, heureFin);
        if (dc.length > 0) allConflicts.push({ date: d, conflicts: dc });
      }

      // If force=false and conflicts exist, return conflicts as warning
      if (allConflicts.length > 0 && req.body.force !== true) {
        return res.status(409).json({
          error: "Conflits détectés",
          conflicts: allConflicts,
          message: `${allConflicts.length} date(s) ont des chevauchements. Renvoyez avec force=true pour créer malgré les conflits.`,
        });
      }

      // Create plannings for all dates
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

  // ════════════════════════════════════════════════════════════════════════════
  // RAPPORTS
  // ════════════════════════════════════════════════════════════════════════════

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
      // Coerce numeric fields to strings (Drizzle numeric columns map to z.string())
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

  // ════════════════════════════════════════════════════════════════════════════
  // INCIDENTS
  // ════════════════════════════════════════════════════════════════════════════

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
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "incident", action: "created", id: row.id } });

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
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  /**
   * POST /api/agent-incidents/:id/escalate
   * Escalate an incident to supervisor level.
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

  // ════════════════════════════════════════════════════════════════════════════
  // MATERIEL
  // ════════════════════════════════════════════════════════════════════════════

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

  // ════════════════════════════════════════════════════════════════════════════
  // COMMUNICATIONS
  // ════════════════════════════════════════════════════════════════════════════

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

  // ════════════════════════════════════════════════════════════════════════════
  // FORMATIONS CATALOGUE (Source: HR Module — read-only for agents)
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-formations", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: formations.id,
          titre: formations.titre,
          description: formations.description,
          typeFormation: formations.typeFormation,
          dureeHeures: formations.dureeHeures,
          contenuUrl: formations.contenuUrl,
          obligatoire: formations.obligatoire,
          statut: formations.statut,
          formateur: formations.formateur,
          dateDebut: formations.dateDebut,
          dateFin: formations.dateFin,
          lieu: formations.lieu,
          programme: formations.programme,
          capaciteMax: formations.capaciteMax,
          createdAt: formations.createdAt,
          participants: sql<number>`coalesce(count(${formationParticipants.id}), 0)::int`,
        })
        .from(formations)
        .leftJoin(formationParticipants, eq(formations.id, formationParticipants.formationId))
        .where(and(
          isNull(formations.deletedAt),
          ne(formations.statut, "CANCELLED"),
        ))
        .groupBy(formations.id)
        .orderBy(desc(formations.dateDebut));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // FORMATIONS SUIVI (Enrollment + Progression + Evaluation + Certificates)
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-formations-suivi", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id } = req.query;

      const rows = await db.select({
        // Participation core
        id: formationParticipants.id,
        agentId: agentsTerrain.id,
        formationId: formationParticipants.formationId,
        dateDebut: formationParticipants.dateDebut,
        dateFin: formationParticipants.dateFin,
        progression: formationParticipants.progression,
        statut: formationParticipants.statut,
        presence: formationParticipants.presence,
        createdAt: formationParticipants.dateInscription,
        // Evaluation from HR
        scoreEvaluation: formationParticipants.scoreEvaluation,
        evaluation: formationParticipants.evaluation,
        competencesAcquises: formationParticipants.competencesAcquises,
        recommandation: formationParticipants.recommandation,
        evaluatedAt: formationParticipants.evaluatedAt,
        // Formation details
        formationTitre: formations.titre,
        formationDescription: formations.description,
        formationType: formations.typeFormation,
        formationDuree: formations.dureeHeures,
        formationObligatoire: formations.obligatoire,
        formationContenuUrl: formations.contenuUrl,
        formationStatut: formations.statut,
        formationDateFin: formations.dateFin,
        // Certificate (LEFT JOIN — may be null)
        certificateId: formationCertificates.id,
        certificateNumero: formationCertificates.numeroCertificat,
        certificateStatut: formationCertificates.statut,
        certificateFichierUrl: formationCertificates.fichierUrl,
        certificateDateExpiration: formationCertificates.dateExpiration,
      })
      .from(formationParticipants)
      .leftJoin(formations, eq(formationParticipants.formationId, formations.id))
      .leftJoin(agentsTerrain, eq(formationParticipants.employeId, agentsTerrain.employeId))
      .leftJoin(formationCertificates, and(
        eq(formationCertificates.formationId, formationParticipants.formationId),
        eq(formationCertificates.employeId, formationParticipants.employeId),
      ))
      .where(agent_id && typeof agent_id === "string" ? eq(agentsTerrain.id, agent_id) : sql`true`)
      .orderBy(desc(formationParticipants.dateInscription));

      const formatted = rows.map(r => ({
        id: r.id,
        agentId: r.agentId,
        formationId: r.formationId,
        dateDebut: r.dateDebut,
        dateFin: r.dateFin,
        progression: r.progression,
        statut: r.statut,
        presence: r.presence,
        createdAt: r.createdAt,
        // Evaluation
        scoreEvaluation: r.scoreEvaluation,
        evaluation: r.evaluation,
        competencesAcquises: r.competencesAcquises,
        recommandation: r.recommandation,
        evaluatedAt: r.evaluatedAt,
        // Formation
        formation: r.formationTitre ? {
          id: r.formationId,
          titre: r.formationTitre,
          description: r.formationDescription,
          typeFormation: r.formationType,
          dureeHeures: r.formationDuree,
          contenuUrl: r.formationContenuUrl,
          obligatoire: r.formationObligatoire,
          statut: r.formationStatut,
          dateFin: r.formationDateFin,
        } : undefined,
        // Certificate
        certificate: r.certificateId ? {
          id: r.certificateId,
          numero: r.certificateNumero,
          statut: r.certificateStatut,
          fichierUrl: r.certificateFichierUrl,
          dateExpiration: r.certificateDateExpiration,
        } : null,
      }));

      res.json(formatted);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-formations-suivi", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, formation_id, date_debut, progression, statut } = req.body;

      if (!agent_id || !formation_id) {
        return res.status(400).json({ error: "Agent ID et Formation ID requis" });
      }

      // Resolve Employe ID
      const [agent] = await db.select().from(agentsTerrain).where(eq(agentsTerrain.id, agent_id));
      if (!agent || !agent.employeId) {
        return res.status(404).json({ error: "Agent ou Employé non trouvé" });
      }

      // Check capacity
      const formId = Number(formation_id);
      const [formation] = await db.select({ capaciteMax: formations.capaciteMax })
        .from(formations).where(eq(formations.id, formId));
      if (formation?.capaciteMax) {
        const [{ count: enrolled }] = await db.select({ count: sql<number>`count(*)::int` })
          .from(formationParticipants).where(eq(formationParticipants.formationId, formId));
        if (enrolled >= formation.capaciteMax) {
          return res.status(400).json({ error: "Formation complète — capacité maximale atteinte" });
        }
      }

      // Get Employe Name
      const [userData] = await db
        .select({ nom: users.nom, prenom: users.prenom })
        .from(employes)
        .innerJoin(users, eq(employes.userId, users.id))
        .where(eq(employes.id, agent.employeId));

      const employeNom = userData ? `${userData.nom} ${userData.prenom}` : "Inconnu";

      const [row] = await db.insert(formationParticipants).values({
        formationId: formId,
        employeId: agent.employeId,
        employeNom,
        dateDebut: date_debut ? new Date(date_debut) : undefined,
        progression: progression || 0,
        statut: statut || "IN_PROGRESS",
        presence: "Non noté",
      }).returning();

      logAudit(req, "CREATE", "agent_formation_suivi_hr", row.id, { agentId: agent_id, formationId: formation_id });

      // Cross-broadcast: HR + Agent
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({ type: "HR_UPDATE", payload: { entity: "formation", action: "updated", id: formId, timestamp: new Date().toISOString() } });
        ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agent_id } });
      }

      res.status(201).json(row);
    } catch (error: any) {
      console.error("Error creating formation suivi:", error);
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-formations-suivi/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updateData: any = {};
      if (updates.progression !== undefined) updateData.progression = updates.progression;
      if (updates.statut !== undefined) updateData.statut = updates.statut;
      if (updates.score !== undefined) updateData.scoreEvaluation = updates.score;
      if (updates.date_fin !== undefined) updateData.dateFin = updates.date_fin ? new Date(updates.date_fin) : null;

      const [row] = await db.update(formationParticipants)
        .set(updateData)
        .where(eq(formationParticipants.id, id))
        .returning();

      if (!row) return res.status(404).json({ error: "Suivi non trouvé" });

      logAudit(req, "UPDATE", "agent_formation_suivi_hr", id, updates);

      // Cross-broadcast: HR + Agent
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({ type: "HR_UPDATE", payload: { entity: "formation", action: "updated", id: row.formationId, timestamp: new Date().toISOString() } });
        // Resolve agentId from employeId
        const [agentRow] = await db.select({ id: agentsTerrain.id })
          .from(agentsTerrain).where(eq(agentsTerrain.employeId, row.employeId));
        if (agentRow) {
          ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });
        }
      }

      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // FORMATIONS COMPLIANCE (Mandatory training tracking)
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-formations-compliance", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id } = req.query;
      if (!agent_id || typeof agent_id !== "string") {
        return res.status(400).json({ error: "agent_id requis" });
      }

      // Resolve employeId
      const [agent] = await db.select({ employeId: agentsTerrain.employeId })
        .from(agentsTerrain).where(eq(agentsTerrain.id, agent_id));
      if (!agent?.employeId) {
        return res.json({ mandatoryNotEnrolled: [], overdue: [], expiringCertificates: [], complianceScore: 100 });
      }

      const now = new Date();
      const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      // 1. All active mandatory formations
      const mandatoryFormations = await db.select({
        id: formations.id,
        titre: formations.titre,
        dateDebut: formations.dateDebut,
        dateFin: formations.dateFin,
        statut: formations.statut,
      })
      .from(formations)
      .where(and(
        isNull(formations.deletedAt),
        eq(formations.obligatoire, true),
        ne(formations.statut, "CANCELLED"),
      ));

      // 2. Agent's enrollments
      const enrollments = await db.select({
        formationId: formationParticipants.formationId,
        statut: formationParticipants.statut,
        progression: formationParticipants.progression,
      })
      .from(formationParticipants)
      .where(eq(formationParticipants.employeId, agent.employeId));

      const enrolledMap = new Map(enrollments.map(e => [e.formationId, e]));

      // Mandatory not enrolled
      const mandatoryNotEnrolled = mandatoryFormations
        .filter(f => !enrolledMap.has(f.id))
        .map(f => ({ id: f.id, titre: f.titre, dateDebut: f.dateDebut, dateFin: f.dateFin }));

      // Overdue: enrolled but not completed and past dateFin
      const overdue = mandatoryFormations
        .filter(f => {
          const enrollment = enrolledMap.get(f.id);
          return enrollment && enrollment.statut !== "COMPLETED" && f.dateFin && new Date(f.dateFin) < now;
        })
        .map(f => ({
          id: f.id,
          titre: f.titre,
          dateFin: f.dateFin,
          progression: enrolledMap.get(f.id)?.progression || 0,
        }));

      // 3. Expiring certificates (within 90 days)
      const expiringCertificates = await db.select({
        id: formationCertificates.id,
        titre: formationCertificates.titre,
        numero: formationCertificates.numeroCertificat,
        dateExpiration: formationCertificates.dateExpiration,
      })
      .from(formationCertificates)
      .where(and(
        eq(formationCertificates.employeId, agent.employeId),
        eq(formationCertificates.statut, "ISSUED"),
        sql`${formationCertificates.dateExpiration} IS NOT NULL`,
        lte(formationCertificates.dateExpiration, in90Days.toISOString()),
        gte(formationCertificates.dateExpiration, now.toISOString()),
      ));

      // Compliance score: % of mandatory formations completed
      const totalMandatory = mandatoryFormations.length;
      const completedMandatory = mandatoryFormations.filter(f => {
        const e = enrolledMap.get(f.id);
        return e && e.statut === "COMPLETED";
      }).length;
      const complianceScore = totalMandatory > 0 ? Math.round((completedMandatory / totalMandatory) * 100) : 100;

      res.json({ mandatoryNotEnrolled, overdue, expiringCertificates, complianceScore });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
