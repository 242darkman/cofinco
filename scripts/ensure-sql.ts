/**
 * Ensure all custom SQL objects (views, functions, triggers) exist.
 *
 * Called by db-init after drizzle-kit push, before seeding.
 * The app itself skips ensureCustomFunctions() when running through
 * pgbouncer (transaction mode), so this script fills that gap.
 *
 * Usage: node --import tsx scripts/ensure-sql.ts
 */

import { ensureCustomFunctions, pool } from "../server/db";

try {
  await ensureCustomFunctions();
  console.log("[ensure-sql] Done.");
} finally {
  await pool.end();
}
