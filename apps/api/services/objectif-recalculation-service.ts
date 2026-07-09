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
  type AgentObjectif,
  paiementsTerrain,
  visitesTerrain,
  prospections,
  avantages,
  avantagesEmployes,
  agentsTerrain,
  employes,
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
 * Calculate the prize amount from a linked avantage config.
 * Exported for use by routes.
 */
export async function calculateObjectifPrize(avantageId: number, agentId: string): Promise<number> {
  const [av] = await db.select().from(avantages)
    .where(and(eq(avantages.id, avantageId), eq(avantages.actif, true)));
  if (!av) return 0;

  if (av.modeCalcul === "POURCENTAGE") {
    const [agent] = await db.select().from(agentsTerrain).where(eq(agentsTerrain.id, agentId));
    if (!agent?.employeId) return Number(av.montantParDefaut || 0);
    const [emp] = await db.select().from(employes).where(eq(employes.id, agent.employeId));
    if (!emp) return 0;
    const pct = Number(av.pourcentage) || 0;
    let montant = Math.round((pct / 100) * Number(emp.salaireBase || 0));
    if (av.plafond && montant > Number(av.plafond)) montant = Number(av.plafond);
    return montant;
  }
  return Number(av.montantParDefaut || 0);
}

/**
 * Create an avantagesEmployes record so the payroll engine picks up the prize.
 * Uses PONCTUEL frequency + dateAttribution matching for correct month targeting.
 */
async function createPrizeEligibility(objectif: AgentObjectif): Promise<number | null> {
  if (!objectif.avantageId) return null;
  const montant = Number(objectif.recompense) || 0;
  if (montant <= 0) return null;

  const [agent] = await db.select().from(agentsTerrain).where(eq(agentsTerrain.id, objectif.agentId));
  if (!agent?.employeId) {
    logger.warn({ agentId: objectif.agentId }, "Agent sans employeId, prime non applicable au salaire");
    return null;
  }

  const dateAttribution = `${objectif.periode}-01`;

  const [assigned] = await db.insert(avantagesEmployes).values({
    employeId: agent.employeId,
    avantageId: objectif.avantageId,
    montant,
    statut: "ACTIVE",
    dateAttribution,
  }).returning();

  return assigned.id;
}

/**
 * Apply a computed value to an objective: update DB + derive status + handle prize eligibility.
 */
async function applyRecalculation(objectifId: string, valeurRealisee: number, valeurObjectif: number) {
  const target = Number(valeurObjectif || 1);
  const pct = (valeurRealisee / target) * 100;
  let statut = "IN_PROGRESS";
  if (pct >= 110) statut = "Depasse";
  else if (pct >= 100) statut = "Atteint";

  const [currentObj] = await db.select().from(agentObjectifs).where(eq(agentObjectifs.id, objectifId));
  if (!currentObj) return;

  const wasAchieved = currentObj.statut === "Atteint" || currentObj.statut === "Depasse";
  const isNowAchieved = statut === "Atteint" || statut === "Depasse";

  let primeStatut = currentObj.primeStatut || "NONE";
  let avantageEmployeId = currentObj.avantageEmployeId;

  // Transition: non-achieved → achieved with linked prize
  if (!wasAchieved && isNowAchieved && currentObj.avantageId && primeStatut === "PENDING") {
    const aeId = await createPrizeEligibility(currentObj);
    if (aeId) {
      avantageEmployeId = aeId;
      primeStatut = "ELIGIBLE";
    }
  }

  // Reverse transition (data correction): achieved → not achieved
  if (wasAchieved && !isNowAchieved && primeStatut === "ELIGIBLE" && avantageEmployeId) {
    await db.update(avantagesEmployes)
      .set({ statut: "SUSPENDED" })
      .where(eq(avantagesEmployes.id, avantageEmployeId));
    primeStatut = "PENDING";
  }
  // If PAID: never revert (salary already paid)

  await db.update(agentObjectifs)
    .set({
      valeurRealisee: String(valeurRealisee),
      statut,
      primeStatut,
      avantageEmployeId,
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
