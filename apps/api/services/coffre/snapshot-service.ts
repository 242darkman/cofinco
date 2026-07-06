/**
 * Coffre Balance Snapshot Service
 *
 * Captures daily snapshots of coffre-fort balances per coffre, per agency, and consolidated.
 * These snapshots provide a reliable historical audit trail for treasury evolution charts,
 * eliminating the fragile backward-reconstruction from movements.
 *
 * Two capture modes:
 * - `scheduled`: Daily cron job captures end-of-day balances
 * - `event`: Triggered after significant coffre movements for intraday accuracy
 */

import { db } from "../../db";
import { eq, and, sql, gte, lte, desc, asc } from "drizzle-orm";
import {
  coffresForts,
  coffreBalanceSnapshots,
  type CoffreSnapshotPayload,
  agences,
  mouvementsFinanciers,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Service:CoffreSnapshots");

// ============================================================================
// CAPTURE: Take a snapshot of all coffre balances for a given date
// ============================================================================

/**
 * Capture daily snapshots for all coffres, agencies, and consolidated total.
 * Uses UPSERT (ON CONFLICT UPDATE) so re-running is idempotent.
 */
export async function captureBalanceSnapshots(
  dateStr?: string,
  source: "scheduled" | "event" = "scheduled",
): Promise<{ coffreCount: number; agencyCount: number }> {
  const snapshotDate = dateStr || new Date().toISOString().split("T")[0];
  const startTime = Date.now();

  try {
    // 1. Fetch all active coffres with agency info
    const coffres = await db
      .select({
        id: coffresForts.id,
        solde: coffresForts.solde,
        agencyId: coffresForts.ownerId,
      })
      .from(coffresForts);

    if (coffres.length === 0) {
      logger.info("No coffres found, skipping snapshot");
      return { coffreCount: 0, agencyCount: 0 };
    }

    // 2. Fetch movement stats for the snapshot date (for payload)
    const dayStart = new Date(`${snapshotDate}T00:00:00Z`);
    const dayEnd = new Date(`${snapshotDate}T23:59:59.999Z`);
    const coffreIds = coffres.map((c) => c.id);

    const movementStats = await db
      .select({
        sourceId: mouvementsFinanciers.sourceId,
        metadata: mouvementsFinanciers.metadata,
        montant: mouvementsFinanciers.montant,
      })
      .from(mouvementsFinanciers)
      .where(
        and(
          gte(mouvementsFinanciers.dateOperation, dayStart),
          lte(mouvementsFinanciers.dateOperation, dayEnd),
          sql`(${mouvementsFinanciers.sourceId} IN ${coffreIds} OR ${mouvementsFinanciers.metadata}->>'destinationId' IN ${coffreIds.map(String)})`,
        ),
      );

    // Aggregate movements per coffre
    const coffreMovements: Record<
      string,
      { movIn: number; movOut: number; amtIn: number; amtOut: number }
    > = {};
    for (const m of movementStats) {
      const amount = Number(m.montant);
      const destId = (m.metadata as any)?.destinationId;
      const srcId = m.sourceId;

      if (destId && coffreIds.includes(destId)) {
        const s = (coffreMovements[destId] ??= { movIn: 0, movOut: 0, amtIn: 0, amtOut: 0 });
        s.movIn++;
        s.amtIn += amount;
      }
      if (srcId && coffreIds.includes(srcId)) {
        const s = (coffreMovements[srcId] ??= { movIn: 0, movOut: 0, amtIn: 0, amtOut: 0 });
        s.movOut++;
        s.amtOut += amount;
      }
    }

    // 3. Build snapshot rows
    const rows: Array<{
      snapshotDate: string;
      scopeType: string;
      coffreId: string | null;
      agencyId: string | null;
      balance: string;
      payload: CoffreSnapshotPayload;
      source: string;
    }> = [];

    // Per-coffre snapshots
    for (const c of coffres) {
      const mv = coffreMovements[c.id] || { movIn: 0, movOut: 0, amtIn: 0, amtOut: 0 };
      rows.push({
        snapshotDate,
        scopeType: "COFFRE",
        coffreId: c.id,
        agencyId: c.agencyId,
        balance: String(c.solde),
        payload: {
          balance: Number(c.solde),
          movementsIn: mv.movIn,
          movementsOut: mv.movOut,
          amountIn: mv.amtIn,
          amountOut: mv.amtOut,
        },
        source,
      });
    }

    // Per-agency snapshots (aggregate coffres by agency)
    const agencyBalances: Record<
      string,
      { balance: number; movIn: number; movOut: number; amtIn: number; amtOut: number }
    > = {};
    for (const c of coffres) {
      const agId = c.agencyId || "__CONSOLIDATED__";
      const agg = (agencyBalances[agId] ??= { balance: 0, movIn: 0, movOut: 0, amtIn: 0, amtOut: 0 });
      agg.balance += Number(c.solde);
      const mv = coffreMovements[c.id] || { movIn: 0, movOut: 0, amtIn: 0, amtOut: 0 };
      agg.movIn += mv.movIn;
      agg.movOut += mv.movOut;
      agg.amtIn += mv.amtIn;
      agg.amtOut += mv.amtOut;
    }

    let agencyCount = 0;
    for (const [agId, agg] of Object.entries(agencyBalances)) {
      if (agId === "__CONSOLIDATED__") continue;
      agencyCount++;
      rows.push({
        snapshotDate,
        scopeType: "AGENCY",
        coffreId: null,
        agencyId: agId,
        balance: String(agg.balance),
        payload: {
          balance: agg.balance,
          movementsIn: agg.movIn,
          movementsOut: agg.movOut,
          amountIn: agg.amtIn,
          amountOut: agg.amtOut,
        },
        source,
      });
    }

    // Consolidated snapshot
    const totalBalance = coffres.reduce((acc, c) => acc + Number(c.solde), 0);
    const totalMov = Object.values(coffreMovements).reduce(
      (acc, m) => ({
        movIn: acc.movIn + m.movIn,
        movOut: acc.movOut + m.movOut,
        amtIn: acc.amtIn + m.amtIn,
        amtOut: acc.amtOut + m.amtOut,
      }),
      { movIn: 0, movOut: 0, amtIn: 0, amtOut: 0 },
    );
    rows.push({
      snapshotDate,
      scopeType: "CONSOLIDATED",
      coffreId: null,
      agencyId: null,
      balance: String(totalBalance),
      payload: {
        balance: totalBalance,
        movementsIn: totalMov.movIn,
        movementsOut: totalMov.movOut,
        amountIn: totalMov.amtIn,
        amountOut: totalMov.amtOut,
      },
      source,
    });

    // 4. Upsert all rows
    for (const row of rows) {
      await db
        .insert(coffreBalanceSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: [
            coffreBalanceSnapshots.snapshotDate,
            coffreBalanceSnapshots.scopeType,
            coffreBalanceSnapshots.coffreId,
            coffreBalanceSnapshots.agencyId,
          ],
          set: {
            balance: sql`EXCLUDED.balance`,
            payload: sql`EXCLUDED.payload`,
            source: sql`EXCLUDED.source`,
          },
        });
    }

    const duration = Date.now() - startTime;
    logger.info(
      { snapshotDate, coffreCount: coffres.length, agencyCount, totalBalance, rowsUpserted: rows.length, durationMs: duration },
      "Balance snapshots captured",
    );

    return { coffreCount: coffres.length, agencyCount };
  } catch (err) {
    logger.error({ err, snapshotDate }, "Failed to capture balance snapshots");
    throw err;
  }
}

// ============================================================================
// QUERY: Retrieve snapshots for chart history
// ============================================================================

export interface SnapshotHistoryPoint {
  date: string;
  balance: number;
  [agencyId: string]: string | number; // per-agency balances
}

/**
 * Get snapshot-based history for a date range.
 * Returns per-agency balances keyed by agencyId, plus total `balance`.
 *
 * @param fromDate  Start date (YYYY-MM-DD)
 * @param toDate    End date (YYYY-MM-DD)
 * @param agencyIds Optional — filter to specific agencies. If omitted, returns all.
 */
export async function getSnapshotHistory(
  fromDate: string,
  toDate: string,
  agencyIds?: string[],
): Promise<SnapshotHistoryPoint[]> {
  // Fetch AGENCY-level snapshots for the date range
  const conditions = [
    eq(coffreBalanceSnapshots.scopeType, "AGENCY"),
    gte(coffreBalanceSnapshots.snapshotDate, fromDate),
    lte(coffreBalanceSnapshots.snapshotDate, toDate),
  ];

  if (agencyIds && agencyIds.length > 0) {
    conditions.push(sql`${coffreBalanceSnapshots.agencyId} IN ${agencyIds}`);
  }

  const rows = await db
    .select({
      date: coffreBalanceSnapshots.snapshotDate,
      agencyId: coffreBalanceSnapshots.agencyId,
      balance: coffreBalanceSnapshots.balance,
    })
    .from(coffreBalanceSnapshots)
    .where(and(...conditions))
    .orderBy(asc(coffreBalanceSnapshots.snapshotDate));

  // Group by date
  const dateMap: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!row.agencyId) continue;
    const d = row.date;
    if (!dateMap[d]) dateMap[d] = {};
    dateMap[d][row.agencyId] = Number(row.balance);
  }

  // Build history points
  const history: SnapshotHistoryPoint[] = [];
  for (const [date, agencies] of Object.entries(dateMap)) {
    const totalBalance = Object.values(agencies).reduce((a, b) => a + b, 0);
    history.push({ date, balance: totalBalance, ...agencies });
  }

  return history.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get the date range of available snapshots.
 */
export async function getSnapshotDateRange(): Promise<{ oldest: string | null; newest: string | null; count: number }> {
  const [result] = await db
    .select({
      oldest: sql<string>`MIN(${coffreBalanceSnapshots.snapshotDate})`,
      newest: sql<string>`MAX(${coffreBalanceSnapshots.snapshotDate})`,
      count: sql<number>`COUNT(DISTINCT ${coffreBalanceSnapshots.snapshotDate})`,
    })
    .from(coffreBalanceSnapshots)
    .where(eq(coffreBalanceSnapshots.scopeType, "AGENCY"));

  return {
    oldest: result.oldest || null,
    newest: result.newest || null,
    count: Number(result.count) || 0,
  };
}

/**
 * Backfill missing daily snapshots from startDate to today.
 * For past dates, uses current balance (approximation) — mainly useful
 * after initial deployment to seed the table.
 * For future accuracy, the daily cron is what matters.
 */
export async function backfillSnapshots(startDate: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  let current = new Date(startDate);
  let count = 0;

  while (current.toISOString().split("T")[0] <= today) {
    const dateStr = current.toISOString().split("T")[0];

    // Check if snapshot exists for this date
    const [existing] = await db
      .select({ id: coffreBalanceSnapshots.id })
      .from(coffreBalanceSnapshots)
      .where(
        and(
          eq(coffreBalanceSnapshots.snapshotDate, dateStr),
          eq(coffreBalanceSnapshots.scopeType, "CONSOLIDATED"),
        ),
      )
      .limit(1);

    if (!existing) {
      await captureBalanceSnapshots(dateStr, "scheduled");
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  logger.info({ startDate, backfilledDays: count }, "Backfill complete");
  return count;
}
