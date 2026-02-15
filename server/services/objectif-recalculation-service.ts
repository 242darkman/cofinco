/**
 * Objectif Recalculation Service
 *
 * Automatically recalculates agent objectives when operational data changes
 * (collecte approved, visite completed, prospection created, etc.).
 *
 * Fire-and-forget: errors are logged but never propagate to the caller.
 */

import { db } from "../db";
import {
  agentObjectifs,
  paiementsTerrain,
  visitesTerrain,
  prospections,
} from "@shared/schema";
import { eq, and, isNull, gte, lt, ne, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";
import pino from "pino";

const logger = pino({ name: "objectif-recalc" });

/**
 * Compute the realized value for a given objective type and period.
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
 * Apply a computed value to an objective: update DB + derive status.
 */
async function applyRecalculation(objectifId: string, valeurRealisee: number, valeurObjectif: number) {
  const target = Number(valeurObjectif || 1);
  const pct = (valeurRealisee / target) * 100;
  let statut = "IN_PROGRESS";
  if (pct >= 110) statut = "Depasse";
  else if (pct >= 100) statut = "Atteint";

  await db.update(agentObjectifs)
    .set({
      valeurRealisee: String(valeurRealisee),
      statut,
      updatedAt: new Date(),
    })
    .where(eq(agentObjectifs.id, objectifId));
}

/**
 * Recalculate all objectives for the current period of an agent.
 * Two-phase: non-Performance first, then Performance (which depends on the others).
 *
 * This is fire-and-forget — safe to call without awaiting.
 */
export async function recalculateAgentObjectifs(agentId: string): Promise<void> {
  try {
    const now = new Date();
    const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const objectifs = await db.select().from(agentObjectifs).where(and(
      eq(agentObjectifs.agentId, agentId),
      eq(agentObjectifs.periode, periode),
      isNull(agentObjectifs.deletedAt),
    ));

    if (objectifs.length === 0) return;

    // Phase 1: non-Performance
    const nonPerformance = objectifs.filter(o => o.typeObjectif !== "Performance");
    for (const objectif of nonPerformance) {
      const valeurRealisee = await computeObjectifValue(agentId, objectif.typeObjectif, periode);
      await applyRecalculation(objectif.id, valeurRealisee, Number(objectif.valeurObjectif));
    }

    // Phase 2: Performance (depends on updated non-Performance values)
    const performance = objectifs.filter(o => o.typeObjectif === "Performance");
    for (const objectif of performance) {
      const valeurRealisee = await computeObjectifValue(agentId, objectif.typeObjectif, periode);
      await applyRecalculation(objectif.id, valeurRealisee, Number(objectif.valeurObjectif));
    }

    // Broadcast to frontend
    try {
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({
          type: "AGENT_MODULES_UPDATE",
          payload: { entity: "objectif", action: "auto_recalculated", agentId },
        });
      }
    } catch {
      // WebSocket broadcast is non-critical
    }

    logger.info({ agentId, periode, count: objectifs.length }, "Auto-recalculated agent objectives");
  } catch (error) {
    logger.error({ err: error, agentId }, "Failed to auto-recalculate agent objectives");
  }
}
