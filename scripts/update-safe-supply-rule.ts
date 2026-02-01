/**
 * Update SAFE_SUPPLY accounting rule to use Capital account (101) instead of Bank (512)
 *
 * Run: npx tsx scripts/update-safe-supply-rule.ts
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Updating SAFE_SUPPLY accounting rule...");

  const result = await db.execute(sql`
    UPDATE accounting_rules
    SET credit_account = '101',
        description = 'Approvisionnement coffre depuis apport en capital'
    WHERE code = 'SAFE_SUPPLY'
    RETURNING code, credit_account, description
  `);

  if (result.rows.length > 0) {
    console.log("Updated:", result.rows[0]);
  } else {
    console.log("No SAFE_SUPPLY rule found to update.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
