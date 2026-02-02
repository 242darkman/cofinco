/**
 * COFINCO - Reset Financial Data Script
 *
 * Removes ALL financial transactions while preserving:
 * - Users & Employees
 * - Clients
 * - Agencies
 * - Reference data (chart of accounts, products, configurations)
 *
 * This is useful for:
 * - Starting fresh with real data after testing
 * - Cleaning up test transactions
 * - Resetting to a clean slate before go-live
 *
 * Usage:
 *   npm run db:reset-financial              # Interactive confirmation
 *   npm run db:reset-financial -- --force   # Skip confirmation (CI / dev)
 */

import { pool } from "../server/db";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
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
  console.log(`${CYAN}${BOLD}   COFINCO - NETTOYAGE DES DONNÉES FINANCIÈRES${RESET}`);
  console.log(`${CYAN}${"═".repeat(68)}${RESET}\n`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(`${RED}DATABASE_URL is not set.${RESET}`);
    process.exit(1);
  }

  // Show which database will be affected
  const dbName = new URL(dbUrl).pathname.replace("/", "");
  console.log(`  ${BOLD}Base de données:${RESET} ${CYAN}${dbName}${RESET}`);
  console.log(`  ${BOLD}Hôte:${RESET}            ${new URL(dbUrl).hostname}\n`);

  console.log(`${BLUE}Ce script va supprimer:${RESET}`);
  console.log(`  ${RED}✗${RESET} Toutes les transactions financières`);
  console.log(`  ${RED}✗${RESET} Tous les mouvements (caisse, coffre, banque)`);
  console.log(`  ${RED}✗${RESET} Toutes les écritures comptables`);
  console.log(`  ${RED}✗${RESET} Tous les crédits et remboursements`);
  console.log(`  ${RED}✗${RESET} Toutes les opérations de tontine`);
  console.log(`  ${RED}✗${RESET} Tous les paiements mobile money`);
  console.log(`  ${RED}✗${RESET} Toutes les sessions de caisse\n`);

  console.log(`${GREEN}Ce script va conserver:${RESET}`);
  console.log(`  ${GREEN}✓${RESET} Utilisateurs et employés`);
  console.log(`  ${GREEN}✓${RESET} Clients et leurs informations`);
  console.log(`  ${GREEN}✓${RESET} Agences et départements`);
  console.log(`  ${GREEN}✓${RESET} Plan comptable et journaux`);
  console.log(`  ${GREEN}✓${RESET} Produits d'épargne et de crédit`);
  console.log(`  ${GREEN}✓${RESET} Tontines et membres (structure)`);
  console.log(`  ${GREEN}✓${RESET} Configurations et paramètres\n`);

  if (!force) {
    console.log(
      `${YELLOW}${BOLD}⚠️  ATTENTION: Cette opération est IRRÉVERSIBLE!${RESET}`
    );
    console.log(
      `${YELLOW}   Assurez-vous d'avoir une sauvegarde avant de continuer.${RESET}\n`
    );
    const ok = await confirm('Tapez "yes" pour confirmer');
    if (!ok) {
      console.log(`\n${YELLOW}Opération annulée.${RESET}`);
      process.exit(0);
    }
  }

  console.log(`\n${YELLOW}Connexion à la base de données...${RESET}`);

  const client = await pool.connect();
  try {
    console.log(`${YELLOW}Exécution du script de nettoyage...${RESET}\n`);

    // Read the SQL script
    const sqlScript = readFileSync(
      join(__dirname, "reset-financial-data.sql"),
      "utf-8"
    );

    // Execute the SQL script
    await client.query(sqlScript);

    console.log(`\n${GREEN}${"═".repeat(68)}${RESET}`);
    console.log(`${GREEN}${BOLD}   ✓ NETTOYAGE TERMINÉ AVEC SUCCÈS${RESET}`);
    console.log(`${GREEN}${"═".repeat(68)}${RESET}\n`);

    console.log(`${CYAN}Prochaines étapes suggérées:${RESET}`);
    console.log(`  1. Vérifier l'intégrité: ${BOLD}npm run audit:integrity${RESET}`);
    console.log(`  2. Créer de nouvelles caisses si nécessaire`);
    console.log(`  3. Ouvrir les sessions de caisse\n`);
  } catch (error: any) {
    console.error(`\n${RED}${"═".repeat(68)}${RESET}`);
    console.error(`${RED}${BOLD}   ✗ ERREUR LORS DU NETTOYAGE${RESET}`);
    console.error(`${RED}${"═".repeat(68)}${RESET}\n`);
    console.error(`${RED}Détails:${RESET}`, error.message);

    if (error.code === "42P01") {
      console.error(
        `\n${YELLOW}Une ou plusieurs tables n'existent pas.${RESET}`
      );
      console.error(
        `${YELLOW}La base de données est peut-être vide ou mal configurée.${RESET}`
      );
    }

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
