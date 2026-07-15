import {
  agentObjectifs,
  agentsTerrain,
  avantagesEmployes,
  insertAgentObjectifSchema,
  paiementsTerrain,
  prospections,
  visitesTerrain
} from "@shared/schema";
import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { calculateObjectifPrize } from "../../services/objectif-recalculation-service";
import { getWsInstance } from "../../ws-server";

const logger = createLogger("Routes:AgentModules");

export function registerAgentObjectifsRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // OBJECTIFS

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
      // Contraindre les champs numériques en chaînes (les colonnes numériques Drizzle attendent des chaînes)
      const body = { ...req.body };
      if (typeof body.recompense === 'number') body.recompense = String(body.recompense);
      if (typeof body.valeurObjectif === 'number') body.valeurObjectif = String(body.valeurObjectif);
      if (typeof body.valeurRealisee === 'number') body.valeurRealisee = String(body.valeurRealisee);

      const parsed = insertAgentObjectifSchema.parse(body);

      // Calcul automatique de la prime à partir de la configuration de l'avantage lié
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

      // Si l'ID de l'avantage change, recalculer la prime
      if (updates.avantageId !== undefined) {
        // Besoin de l'ID de l'agent de l'objectif pour le calcul
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
   * Calculer la valeur réelle d'un objectif à partir de données opérationnelles.
   * Fonction pure sans effets de bord - interroge simplement et renvoie la valeur.
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
   * Appliquer la valeur calculée à un objectif : mettre à jour la BDD + déduire le statut + gérer l'éligibilité à la prime.
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

    // Transition : non-atteint → atteint avec prime liée
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

    // Transition inverse (correction de données) : atteint → non-atteint
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
   * Calcul automatique de valeur_realisee à partir des données opérationnelles réelles basé sur le type_objectif.
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
        statut: updated!.statut,
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
   * Recalcul en lot de tous les objectifs pour un agent + période donné.
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

      // Recalculer chaque objectif en utilisant l'aide partagée (non-Performance en premier, puis Performance)
      const nonPerformance = objectifs.filter(o => o.typeObjectif !== "Performance");
      const performance = objectifs.filter(o => o.typeObjectif === "Performance");

      const results: any[] = [];

      // Premier passage : tous les objectifs non-Performance
      for (const objectif of nonPerformance) {
        const valeurRealisee = await computeObjectifValue(agentId, objectif.typeObjectif, periode);
        const updated = await applyRecalculation(objectif.id, valeurRealisee, Number(objectif.valeurObjectif));
        results.push(updated);
      }

      // Deuxième passage : objectifs Performance (dépend des valeurs non-Performance mises à jour)
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
}
