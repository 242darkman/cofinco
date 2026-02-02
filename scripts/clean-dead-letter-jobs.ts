/**
 * COFINCO - Clean Dead Letter Jobs
 *
 * Removes notification jobs that are in DEAD_LETTER status
 * (jobs that failed repeatedly and are no longer retryable)
 *
 * Usage:
 *   npm run db:clean-dead-letters              # Interactive confirmation
 *   npm run db:clean-dead-letters -- --force   # Skip confirmation
 */

import { pool } from "../server/db";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

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

  console.log(`\n${CYAN}${"═".repeat(68)}${RESET}`);
  console.log(`${CYAN}${BOLD}   COFINCO - NETTOYAGE DES JOBS EN DEAD_LETTER${RESET}`);
  console.log(`${CYAN}${"═".repeat(68)}${RESET}\n`);

  const client = await pool.connect();
  try {
    // Count dead letter jobs
    const countResult = await client.query(`
      SELECT COUNT(*) as count
      FROM notification_jobs
      WHERE status = 'DEAD_LETTER'
    `);

    const count = parseInt(countResult.rows[0].count);

    if (count === 0) {
      console.log(`${GREEN}✓ Aucun job en DEAD_LETTER à nettoyer.${RESET}\n`);
      return;
    }

    console.log(`${YELLOW}${count} jobs en DEAD_LETTER trouvés.${RESET}\n`);

    // Show sample of jobs
    const sampleResult = await client.query(`
      SELECT
        id,
        channel,
        recipient,
        template_code,
        attempts,
        last_error,
        created_at
      FROM notification_jobs
      WHERE status = 'DEAD_LETTER'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`${BOLD}Exemples de jobs:${RESET}\n`);
    sampleResult.rows.forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.channel} → ${job.recipient}`);
      console.log(`     Template: ${job.template_code || 'N/A'}`);
      console.log(`     Tentatives: ${job.attempts}`);
      console.log(`     Erreur: ${(job.last_error || 'N/A').substring(0, 60)}...`);
      console.log(`     Date: ${job.created_at}\n`);
    });

    if (!force) {
      console.log(
        `${YELLOW}Ces jobs ont échoué définitivement et ne peuvent plus être relancés.${RESET}`
      );
      console.log(
        `${YELLOW}Ils peuvent être supprimés pour nettoyer la base de données.${RESET}\n`
      );
      const ok = await confirm(`Supprimer ${count} jobs en DEAD_LETTER ?`);
      if (!ok) {
        console.log(`\n${YELLOW}Opération annulée.${RESET}`);
        return;
      }
    }

    console.log(`\n${YELLOW}Suppression des jobs...${RESET}`);

    const deleteResult = await client.query(`
      DELETE FROM notification_jobs
      WHERE status = 'DEAD_LETTER'
    `);

    console.log(`\n${GREEN}${"═".repeat(68)}${RESET}`);
    console.log(`${GREEN}${BOLD}   ✓ ${deleteResult.rowCount} JOBS SUPPRIMÉS AVEC SUCCÈS${RESET}`);
    console.log(`${GREEN}${"═".repeat(68)}${RESET}\n`);

  } catch (error: any) {
    console.error(`\n${RED}${"═".repeat(68)}${RESET}`);
    console.error(`${RED}${BOLD}   ✗ ERREUR LORS DU NETTOYAGE${RESET}`);
    console.error(`${RED}${"═".repeat(68)}${RESET}\n`);
    console.error(`${RED}Détails:${RESET}`, error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${RED}Erreur fatale:${RESET}`, err);
  process.exit(1);
});
