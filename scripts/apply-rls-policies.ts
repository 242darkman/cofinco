/**
 * Script d'application des politiques RLS (Row Level Security)
 *
 * Ce script applique les politiques RLS définies dans database/rls-policies.sql
 * à la base de données PostgreSQL.
 *
 * USAGE:
 *   # Mode test (dry-run)
 *   npx tsx scripts/apply-rls-policies.ts --dry-run
 *
 *   # Mode réel
 *   npx tsx scripts/apply-rls-policies.ts
 *
 *   # Vérifier le statut RLS
 *   npx tsx scripts/apply-rls-policies.ts --status
 *
 * PRÉREQUIS:
 *   - DATABASE_URL doit être défini
 *   - L'utilisateur PostgreSQL doit avoir les droits SUPERUSER ou ALTER TABLE
 */

import fs from "fs";
import path from "path";
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

// Configuration
const SQL_FILE = path.join(process.cwd(), "database", "rls-policies.sql");
const isDryRun = process.argv.includes("--dry-run");
const isStatusOnly = process.argv.includes("--status");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL non défini");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Mode status uniquement
    if (isStatusOnly) {
      await showRLSStatus(pool);
      return;
    }

    // Vérifier que le fichier SQL existe
    if (!fs.existsSync(SQL_FILE)) {
      console.error(`❌ Fichier SQL non trouvé: ${SQL_FILE}`);
      process.exit(1);
    }

    // Lire le fichier SQL
    const sqlContent = fs.readFileSync(SQL_FILE, "utf-8");

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║       COFIN Platform - Application des politiques RLS        ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");

    if (isDryRun) {
      console.log("🔍 Mode DRY-RUN: Aucune modification ne sera effectuée");
      console.log("");
      console.log("📄 Contenu du fichier SQL:");
      console.log("─".repeat(60));
      // Afficher les premières lignes significatives
      const lines = sqlContent.split("\n");
      let displayCount = 0;
      for (const line of lines) {
        if (line.trim() && !line.startsWith("--")) {
          console.log(line);
          displayCount++;
          if (displayCount > 50) {
            console.log("... (tronqué pour la lisibilité)");
            break;
          }
        }
      }
      console.log("─".repeat(60));
      console.log("");
      console.log("✅ Dry-run terminé. Utilisez sans --dry-run pour appliquer.");
      return;
    }

    // Appliquer les politiques RLS
    console.log("📜 Application des politiques RLS...");
    console.log("");

    // Exécuter le script SQL complet
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Exécuter le script SQL
      await client.query(sqlContent);

      await client.query("COMMIT");
      console.log("✅ Politiques RLS appliquées avec succès!");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    console.log("");

    // Afficher le statut final
    await showRLSStatus(pool);

  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function showRLSStatus(pool: pg.Pool): Promise<void> {
  console.log("📊 Statut RLS des tables:");
  console.log("─".repeat(60));

  const result = await pool.query(`
    SELECT
      t.tablename,
      t.rowsecurity as rls_enabled,
      COALESCE(p.policy_count, 0) as policy_count
    FROM pg_tables t
    LEFT JOIN (
      SELECT tablename, COUNT(*) as policy_count
      FROM pg_policies
      GROUP BY tablename
    ) p ON t.tablename = p.tablename
    WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'clients', 'comptes', 'credits', 'demandes_credit', 'mouvements_financiers',
      'employes', 'caisses', 'sessions_caisse', 'tontines', 'paiements_terrain',
      'coffres_forts', 'transferts_coffre', 'transferts_inter_coffres',
      'agents_terrain', 'caisses_agent', 'operations_terrain', 'operations_caisse',
      'remises_terrain', 'membres_tontine', 'contributions_tontine'
    )
    ORDER BY t.tablename
  `);

  console.log(
    "Table".padEnd(35) +
    "RLS Activé".padEnd(15) +
    "Politiques"
  );
  console.log("─".repeat(60));

  let enabledCount = 0;
  let totalPolicies = 0;

  for (const row of result.rows) {
    const status = row.rls_enabled ? "✅ Oui" : "❌ Non";
    console.log(
      row.tablename.padEnd(35) +
      status.padEnd(15) +
      row.policy_count
    );
    if (row.rls_enabled) enabledCount++;
    totalPolicies += parseInt(row.policy_count || "0", 10);
  }

  console.log("─".repeat(60));
  console.log(`Total: ${enabledCount} tables avec RLS activé, ${totalPolicies} politiques`);
  console.log("");

  // Afficher les fonctions RLS créées
  const functionsResult = await pool.query(`
    SELECT proname
    FROM pg_proc
    WHERE proname IN ('current_agency_id', 'is_admin_context', 'has_agency_access', 'has_any_agency_access')
  `);

  if (functionsResult.rows.length > 0) {
    console.log("🔧 Fonctions RLS disponibles:");
    for (const row of functionsResult.rows) {
      console.log(`   - ${row.proname}()`);
    }
    console.log("");
  }
}

main();
