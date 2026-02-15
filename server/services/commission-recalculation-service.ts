/**
 * Commission Recalculation Service
 *
 * Auto-creates/updates agent commissions when operational data changes
 * (collecte approved, settlement posted, etc.).
 *
 * Fire-and-forget: errors are logged but never propagate to the caller.
 */

import { db } from "../db";
import { agentCommissions, paiementsTerrain, agentsTerrain } from "@shared/schema";
import { eq, and, isNull, gte, lt, ne, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";

const logger = createLogger("commission-recalc");

const DEFAULT_TAUX_COMMISSION = 5.0;

/**
 * Compute total collected amount for an agent in a given period.
 * Excludes CANCELLED and REVERSED payments.
 */
async function computeCollecte(agentId: string, periode: string): Promise<number> {
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

/**
 * Recalculate commission amounts from collecte, taux, primes, and avances.
 */
function recalcAmounts(montantCollecte: number, tauxCommission: number, primes: number, avances: number) {
  const montantCommission = (montantCollecte * tauxCommission) / 100;
  const montantNet = montantCommission + primes - avances;
  return { montantCommission, montantNet };
}

/**
 * Auto-create or update the commission for the current period of an agent.
 *
 * Fire-and-forget — safe to call without awaiting.
 */
export async function recalculateAgentCommission(agentId: string): Promise<void> {
  try {
    const now = new Date();
    const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get agent's agenceId
    const [agent] = await db
      .select({ agenceId: agentsTerrain.agenceId })
      .from(agentsTerrain)
      .where(eq(agentsTerrain.id, agentId))
      .limit(1);

    if (!agent) return;

    // Find existing commission for this period
    const [existing] = await db
      .select()
      .from(agentCommissions)
      .where(and(
        eq(agentCommissions.agentId, agentId),
        eq(agentCommissions.periode, periode),
        isNull(agentCommissions.deletedAt),
      ))
      .limit(1);

    const montantCollecte = await computeCollecte(agentId, periode);

    if (existing) {
      // Don't recalculate if already paid
      if (existing.statutPaiement === "PAID") return;

      const taux = Number(existing.tauxCommission || DEFAULT_TAUX_COMMISSION);
      const primes = Number(existing.primes || 0);
      const avances = Number(existing.avances || 0);
      const { montantCommission, montantNet } = recalcAmounts(montantCollecte, taux, primes, avances);

      await db.update(agentCommissions)
        .set({
          montantCollecte: String(montantCollecte),
          montantCommission: String(montantCommission),
          montantNet: String(montantNet),
          updatedAt: new Date(),
        })
        .where(eq(agentCommissions.id, existing.id));
    } else {
      // Auto-create commission for current period
      const { montantCommission, montantNet } = recalcAmounts(montantCollecte, DEFAULT_TAUX_COMMISSION, 0, 0);

      await db.insert(agentCommissions).values({
        agentId,
        agenceId: agent.agenceId,
        periode,
        montantCollecte: String(montantCollecte),
        tauxCommission: String(DEFAULT_TAUX_COMMISSION),
        montantCommission: String(montantCommission),
        primes: "0",
        avances: "0",
        montantNet: String(montantNet),
        statutPaiement: "PENDING",
      });
    }

    // Broadcast to frontend
    try {
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({
          type: "AGENT_MODULES_UPDATE",
          payload: { entity: "commission", action: "auto_recalculated", agentId },
        });
      }
    } catch {
      // WebSocket broadcast is non-critical
    }

    logger.info({ agentId, periode, montantCollecte }, "Auto-recalculated agent commission");
  } catch (error) {
    logger.error({ err: error, agentId }, "Failed to auto-recalculate agent commission");
  }
}
