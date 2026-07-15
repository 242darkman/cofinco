import {
  agentObjectifs,
  agentsTerrain,
  employes,
  paiementsTerrain,
  prospections,
  userRoles,
  users,
  visitesTerrain
} from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Routes:AgentModules");

export function registerAgentClassementRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // CLASSEMENT — Server-computed agent rankings

  app.get("/api/agent-classement", requireAuth, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as string) || "mois";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));

      // Calculer la limite de date
      const dateFrom = new Date();
      if (period === "semaine") dateFrom.setDate(dateFrom.getDate() - 7);
      else if (period === "annee") dateFrom.setFullYear(dateFrom.getFullYear() - 1);
      else dateFrom.setMonth(dateFrom.getMonth() - 1); // default: mois

      const currentPeriode = new Date().toISOString().slice(0, 7); // YYYY-MM

      // 1. Obtenir tous les agents actifs avec le rôle AGENT_TERRAIN
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

      // 2. Collectes: nombre + montant par agent (approved paiements in period)
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

      // 3. Visites: nombre de visites terminées dans la période
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

      // 4. Prospections: nombre dans la période
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

      // 5. Objectifs: % de complétion moyen pour le mois en cours
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

      // Construire les cartes de recherche
      const collectesMap = new Map(collectesAgg.map(r => [r.agentId, r]));
      const visitesMap = new Map(visitesAgg.map(r => [r.agentId, r]));
      const prospectionsMap = new Map(prospectionsAgg.map(r => [r.agentId, r]));
      const objectifsMap = new Map(objectifsAgg.map(r => [r.agentId, r]));

      // 6. Calculer le score composite par agent
      //
      // Pondérations du score :
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

        // Déduire le niveau du score
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

      // Trier par score décroissant
      rankings.sort((a, b) => b.score - a.score);

      // Paginer
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
      logger.error({ err: error }, "Erreur classement");
      res.status(500).json({ error: "Erreur lors du calcul du classement" });
    }
  });
}
