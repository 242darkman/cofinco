/**
 * Bulk Scoring Migration / Recalculation Script
 *
 * Without --force: Creates initial scores for clients who don't yet have
 * a client_score_state entry. Safe to run multiple times (idempotent).
 *
 * With --force: Recalculates ALL client scores from scratch, regardless
 * of existing state. Use after algorithm changes or data corrections.
 *
 * Usage:
 *   docker compose exec app npx tsx server/scripts/seed-scoring.ts
 *   docker compose exec app npx tsx server/scripts/seed-scoring.ts --force
 */

import { db } from "../db";
import { clients, clientScoreState } from "@shared/schema";
import { sql } from "drizzle-orm";
import { recordScoreEvent } from "../services/scoring-engine";
import { createLogger } from "../lib/logger";

const logger = createLogger("SeedScoring");

const isForce = process.argv.includes("--force");

async function seedScoring() {
  console.log(`=== Bulk Scoring ${isForce ? "RECALCULATION (--force)" : "Migration"} ===\n`);

  let targetClients: { id: string; agenceId: string | null }[];

  if (isForce) {
    // Force mode: recalculate ALL clients
    targetClients = await db
      .select({ id: clients.id, agenceId: clients.agenceId })
      .from(clients);
    console.log(`Found ${targetClients.length} total clients to recalculate.\n`);
  } else {
    // Normal mode: only clients without score state
    targetClients = await db
      .select({ id: clients.id, agenceId: clients.agenceId })
      .from(clients)
      .where(
        sql`${clients.id} NOT IN (SELECT client_id FROM client_score_state)`
      );
    console.log(`Found ${targetClients.length} clients without a score state.\n`);
  }

  if (targetClients.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let success = 0;
  let errors = 0;
  const batchSize = 20;
  const total = targetClients.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = targetClients.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (client) => {
        try {
          if (isForce) {
            // Force: record RECALCUL_COMPLET event + full recalculation
            await recordScoreEvent({
              clientId: client.id,
              agenceId: client.agenceId || undefined,
              eventType: "RECALCUL_COMPLET",
              refId: `force-recalc-${client.id}-${Date.now()}`,
              refType: "script",
              reason: "Recalcul forcé via seed-scoring --force",
            });
          } else {
            // Normal: record INITIAL_SCORE event (idempotent via refId)
            await recordScoreEvent({
              clientId: client.id,
              agenceId: client.agenceId || undefined,
              eventType: "INITIAL_SCORE",
              refId: `initial-${client.id}`,
              refType: "client",
            });
          }
          success++;
        } catch (err) {
          errors++;
          logger.error({ err, clientId: client.id }, "Failed to seed score");
        }
      })
    );

    const progress = Math.min(i + batchSize, total);
    const pct = Math.round((progress / total) * 100);
    process.stdout.write(`\r  Progress: ${progress}/${total} (${pct}%) — ${success} OK, ${errors} errors`);
  }

  console.log(`\n\n=== Done ===`);
  console.log(`  Mode:    ${isForce ? "Force recalculation" : "Initial seeding"}`);
  console.log(`  Total:   ${total}`);
  console.log(`  Success: ${success}`);
  console.log(`  Errors:  ${errors}`);
}

seedScoring()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
