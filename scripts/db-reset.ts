/**
 * COFINCO - Database Reset Script
 *
 * Drops ALL tables, re-pushes the schema, and re-seeds.
 *
 * Usage:
 *   npm run db:reset              # Interactive confirmation
 *   npm run db:reset -- --force   # Skip confirmation (CI / dev)
 */

import { pool } from "../server/db";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

async function confirm(message: string): Promise<boolean> {
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${YELLOW}${message} (yes/no): ${RESET}`, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  console.log(`\n${RED}========================================${RESET}`);
  console.log(`${RED}   COFINCO - DATABASE RESET${RESET}`);
  console.log(`${RED}========================================${RESET}\n`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  // Show which database will be affected
  const dbName = new URL(dbUrl).pathname.replace("/", "");
  console.log(`  Database: ${RED}${dbName}${RESET}`);
  console.log(`  Host:     ${new URL(dbUrl).hostname}\n`);

  if (!force) {
    console.log(
      `${YELLOW}This will PERMANENTLY DELETE all data in the database.${RESET}`
    );
    const ok = await confirm('Type "yes" to continue');
    if (!ok) {
      console.log("\nAborted.");
      process.exit(0);
    }
  }

  console.log(`\n${YELLOW}[1/3] Dropping all tables...${RESET}`);

  const client = await pool.connect();
  try {
    // Drop the public schema entirely and recreate it (cleanest approach)
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO PUBLIC;
    `);

    // Also drop drizzle's internal schema if it exists
    await client.query(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
    `);

    console.log(`${GREEN}   All tables dropped.${RESET}`);
  } finally {
    client.release();
  }

  // Close the pool before running child processes
  await pool.end();

  console.log(`\n${YELLOW}[2/3] Pushing schema (drizzle-kit push)...${RESET}`);

  const { execSync } = await import("child_process");
  const cwd = new URL("..", import.meta.url).pathname;

  try {
    execSync("node --env-file=.env node_modules/drizzle-kit/bin.cjs push", {
      cwd,
      stdio: "inherit",
    });
    console.log(`${GREEN}   Schema pushed.${RESET}`);
  } catch {
    console.error(`${RED}   Schema push failed. Aborting.${RESET}`);
    process.exit(1);
  }

  console.log(`\n${YELLOW}[3/3] Seeding database...${RESET}`);

  try {
    execSync("node --env-file=.env --import tsx seeds/seed-prod.ts", {
      cwd,
      stdio: "inherit",
    });
    console.log(`${GREEN}   Seed completed.${RESET}`);
  } catch {
    console.error(
      `${RED}   Seed failed. Database has schema but no data.${RESET}`
    );
    process.exit(1);
  }

  console.log(`\n${GREEN}========================================${RESET}`);
  console.log(`${GREEN}   Database reset complete!${RESET}`);
  console.log(`${GREEN}========================================${RESET}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
