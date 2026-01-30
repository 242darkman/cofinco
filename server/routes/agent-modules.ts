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
  agentFormationsCatalogue,
  agentFormationsSuivi,
  agentsTerrain,
  insertAgentCommissionSchema,
  insertAgentObjectifSchema,
  insertAgentPlanningSchema,
  insertAgentRapportSchema,
  insertAgentIncidentSchema,
  insertAgentMaterielSchema,
  insertAgentCommunicationSchema,
  insertAgentFormationCatalogueSchema,
  insertAgentFormationSuiviSchema,
} from "@shared/schema";
import { eq, and, isNull, desc, sql, gte, lt, ne } from "drizzle-orm";
import { z } from "zod";
import {
  paiementsTerrain,
  visitesTerrain,
  prospections,
} from "@shared/schema";
import { getWsInstance } from "../ws-server";
import { logAudit } from "../audit";
import { addSnakeCaseAliasesDeep } from "./utils";

// Helper to get user from request
function getUser(req: Request): { id: string; agenceId?: string } | null {
  return (req as any).user || null;
}

// Helper to join agent name
async function withAgentName(rows: any[]) {
  if (rows.length === 0) return rows;
  const agentIds = [...new Set(rows.map(r => r.agentId).filter(Boolean))];
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

      res.json(addSnakeCaseAliasesDeep(rows));
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

      res.status(201).json(addSnakeCaseAliasesDeep(row));
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
      res.json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
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

      res.json(addSnakeCaseAliasesDeep(updated));
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

      logAudit(req, "RECALCULATE_ALL", "agent_commissions", null, { count: results.length, agent_id, periode });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "commission", action: "recalculated-all" } });

      res.json({ updated: results.length, commissions: addSnakeCaseAliasesDeep(results) });
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

      res.json(addSnakeCaseAliasesDeep(rows));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-objectifs", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentObjectifSchema.parse(req.body);
      const [row] = await db.insert(agentObjectifs).values(parsed).returning();

      logAudit(req, "CREATE", "agent_objectif", row.id, { agentId: parsed.agentId, periode: parsed.periode });

      const ws = getWsInstance();
      if (ws) ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "objectif", action: "created", id: row.id } });

      res.status(201).json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-objectifs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentObjectifs)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentObjectifs.id, id), isNull(agentObjectifs.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Objectif non trouvé" });

      logAudit(req, "UPDATE", "agent_objectif", id, updates);
      res.json(addSnakeCaseAliasesDeep(row));
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
            gte(prospections.dateProspection, periodStart),
            lt(prospections.dateProspection, periodEnd),
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
   * Apply computed value to an objectif: update DB + return updated row.
   */
  async function applyRecalculation(objectifId: string, valeurRealisee: number, valeurObjectif: number) {
    const target = Number(valeurObjectif || 1);
    const pct = (valeurRealisee / target) * 100;
    let statut = "IN_PROGRESS";
    if (pct >= 110) statut = "Depasse";
    else if (pct >= 100) statut = "Atteint";

    const [updated] = await db.update(agentObjectifs)
      .set({
        valeurRealisee: String(valeurRealisee),
        statut,
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

      res.json(addSnakeCaseAliasesDeep(updated));
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
        results.push(addSnakeCaseAliasesDeep(updated));
      }

      // Second pass: Performance objectifs (depends on updated non-Performance values)
      for (const objectif of performance) {
        const valeurRealisee = await computeObjectifValue(agentId, objectif.typeObjectif, periode);
        const updated = await applyRecalculation(objectif.id, valeurRealisee, Number(objectif.valeurObjectif));
        results.push(addSnakeCaseAliasesDeep(updated));
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

      res.json(addSnakeCaseAliasesDeep(rows));
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

      // Detect conflicts for the primary date
      const conflicts = await detectPlanningConflicts(
        parsed.agentId, parsed.datePlanning, parsed.heureDebut, parsed.heureFin
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
        const dc = await detectPlanningConflicts(parsed.agentId, d, parsed.heureDebut, parsed.heureFin);
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

      res.status(201).json(addSnakeCaseAliasesDeep(created.length === 1 ? created[0] : created));
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
      res.json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // RAPPORTS
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-rapports", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, type_rapport } = req.query;
      const conditions = [isNull(agentRapports.deletedAt)];

      if (agent_id && typeof agent_id === "string") {
        conditions.push(eq(agentRapports.agentId, agent_id));
      }
      if (type_rapport && typeof type_rapport === "string" && type_rapport !== "all") {
        conditions.push(eq(agentRapports.typeRapport, type_rapport));
      }

      const rows = await db.select().from(agentRapports)
        .where(and(...conditions))
        .orderBy(desc(agentRapports.createdAt));

      res.json(addSnakeCaseAliasesDeep(rows));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-rapports", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentRapportSchema.parse(req.body);
      const [row] = await db.insert(agentRapports).values(parsed).returning();

      logAudit(req, "CREATE", "agent_rapport", row.id, { agentId: parsed.agentId, type: parsed.typeRapport });

      res.status(201).json(addSnakeCaseAliasesDeep(row));
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

      res.json(addSnakeCaseAliasesDeep(rows));
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

      res.status(201).json(addSnakeCaseAliasesDeep(row));
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
      res.json(addSnakeCaseAliasesDeep(row));
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

      res.json(addSnakeCaseAliasesDeep(row));
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

      res.json(addSnakeCaseAliasesDeep(rows));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-materiel", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentMaterielSchema.parse(req.body);
      const [row] = await db.insert(agentMateriel).values(parsed).returning();

      logAudit(req, "CREATE", "agent_materiel", row.id, { agentId: parsed.agentId, type: parsed.typeMateriel });

      res.status(201).json(addSnakeCaseAliasesDeep(row));
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
      res.json(addSnakeCaseAliasesDeep(row));
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

      res.json(addSnakeCaseAliasesDeep(rows));
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

      res.status(201).json(addSnakeCaseAliasesDeep(row));
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

      res.json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // FORMATIONS CATALOGUE
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-formations", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(agentFormationsCatalogue)
        .where(isNull(agentFormationsCatalogue.deletedAt))
        .orderBy(desc(agentFormationsCatalogue.createdAt));

      res.json(addSnakeCaseAliasesDeep(rows));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-formations", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentFormationCatalogueSchema.parse(req.body);
      const [row] = await db.insert(agentFormationsCatalogue).values(parsed).returning();

      logAudit(req, "CREATE", "agent_formation", row.id, { titre: parsed.titre });

      res.status(201).json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // FORMATIONS SUIVI
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/agent-formations-suivi", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id } = req.query;
      const conditions = [isNull(agentFormationsSuivi.deletedAt)];

      if (agent_id && typeof agent_id === "string") {
        conditions.push(eq(agentFormationsSuivi.agentId, agent_id));
      }

      // Join with formations catalogue for formation details
      const rows = await db.select({
        id: agentFormationsSuivi.id,
        agentId: agentFormationsSuivi.agentId,
        formationId: agentFormationsSuivi.formationId,
        dateDebut: agentFormationsSuivi.dateDebut,
        dateFin: agentFormationsSuivi.dateFin,
        progression: agentFormationsSuivi.progression,
        statut: agentFormationsSuivi.statut,
        score: agentFormationsSuivi.score,
        certificatUrl: agentFormationsSuivi.certificatUrl,
        createdAt: agentFormationsSuivi.createdAt,
        formationTitre: agentFormationsCatalogue.titre,
        formationDescription: agentFormationsCatalogue.description,
        formationType: agentFormationsCatalogue.typeFormation,
        formationDuree: agentFormationsCatalogue.dureeHeures,
        formationObligatoire: agentFormationsCatalogue.obligatoire,
        formationContenuUrl: agentFormationsCatalogue.contenuUrl,
      })
        .from(agentFormationsSuivi)
        .leftJoin(agentFormationsCatalogue, eq(agentFormationsSuivi.formationId, agentFormationsCatalogue.id))
        .where(and(...conditions))
        .orderBy(desc(agentFormationsSuivi.createdAt));

      // Transform to match frontend expected format
      const formatted = rows.map(r => ({
        id: r.id,
        agent_id: r.agentId,
        formation_id: r.formationId,
        date_debut: r.dateDebut,
        date_fin: r.dateFin,
        progression: r.progression,
        statut: r.statut,
        score: r.score,
        certificat_url: r.certificatUrl,
        created_at: r.createdAt,
        formation: r.formationTitre ? {
          id: r.formationId,
          titre: r.formationTitre,
          description: r.formationDescription,
          type_formation: r.formationType,
          duree_heures: r.formationDuree,
          contenu_url: r.formationContenuUrl,
          obligatoire: r.formationObligatoire,
        } : undefined,
      }));

      res.json(formatted);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-formations-suivi", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertAgentFormationSuiviSchema.parse(req.body);
      const [row] = await db.insert(agentFormationsSuivi).values(parsed).returning();

      logAudit(req, "CREATE", "agent_formation_suivi", row.id, { agentId: parsed.agentId, formationId: parsed.formationId });

      res.status(201).json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: "Données invalides", details: error.errors });
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-formations-suivi/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [row] = await db.update(agentFormationsSuivi)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agentFormationsSuivi.id, id), isNull(agentFormationsSuivi.deletedAt)))
        .returning();

      if (!row) return res.status(404).json({ error: "Suivi non trouvé" });

      logAudit(req, "UPDATE", "agent_formation_suivi", id, updates);
      res.json(addSnakeCaseAliasesDeep(row));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
