/**
 * Execute migration 0065 - Fix SAFE_SUPPLY Accounting
 *
 * Run: npx tsx scripts/run-migration-0065.ts
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=".repeat(60));
  console.log("  Migration 0065: Fix SAFE_SUPPLY Accounting");
  console.log("=".repeat(60));
  console.log();

  try {
    // Step 1: Create capital account 101 if it doesn't exist
    console.log("1. Creating account 101 (Capital social) if needed...");
    await db.execute(sql`
      INSERT INTO plan_comptable (
        id, numero_compte, intitule, classe, type_compte, sens_normal, niveau, actif, is_system
      ) VALUES (
        gen_random_uuid(),
        '101',
        'Capital social',
        1,
        'Capitaux',
        'Crédit',
        1,
        true,
        true
      )
      ON CONFLICT (numero_compte) DO NOTHING
    `);
    console.log("   Done.");

    // Step 2: Get required IDs
    console.log("\n2. Getting required IDs...");

    let exerciceResult = await db.execute(sql`
      SELECT id FROM exercices_comptables WHERE statut = 'OUVERT' ORDER BY date_debut DESC LIMIT 1
    `);
    let exerciceId = (exerciceResult.rows[0] as any)?.id;

    // If no open exercice, try to find any exercice
    if (!exerciceId) {
      exerciceResult = await db.execute(sql`
        SELECT id FROM exercices_comptables ORDER BY date_debut DESC LIMIT 1
      `);
      exerciceId = (exerciceResult.rows[0] as any)?.id;
    }

    // If still no exercice, create one
    if (!exerciceId) {
      console.log("   No exercice found, creating one...");
      const createExerciceResult = await db.execute(sql`
        INSERT INTO exercices_comptables (id, code, date_debut, date_fin, statut, description, created_at)
        VALUES (gen_random_uuid(), '2026', '2026-01-01', '2026-12-31', 'OUVERT', 'Exercice 2026', NOW())
        RETURNING id
      `);
      exerciceId = (createExerciceResult.rows[0] as any)?.id;
    }
    console.log("   Exercice ID:", exerciceId);

    const journalResult = await db.execute(sql`
      SELECT id FROM journaux_comptables WHERE code = 'OD' LIMIT 1
    `);
    const journalId = (journalResult.rows[0] as any)?.id;
    console.log("   Journal OD ID:", journalId);

    const compte512Result = await db.execute(sql`
      SELECT id FROM plan_comptable WHERE numero_compte = '512' LIMIT 1
    `);
    const compte512Id = (compte512Result.rows[0] as any)?.id;
    console.log("   Compte 512 ID:", compte512Id);

    const compte101Result = await db.execute(sql`
      SELECT id FROM plan_comptable WHERE numero_compte = '101' LIMIT 1
    `);
    const compte101Id = (compte101Result.rows[0] as any)?.id;
    console.log("   Compte 101 ID:", compte101Id);

    if (!exerciceId || !journalId || !compte512Id || !compte101Id) {
      throw new Error("Missing required IDs");
    }

    // Step 3: Check current balance of 512
    console.log("\n3. Checking current balance of 512...");
    const balance512Result = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) as total_debit,
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as total_credit,
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) - COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '512%' AND e.statut = 'POSTED'
    `);
    const balance512 = balance512Result.rows[0] as any;
    console.log("   Debit:", balance512.total_debit);
    console.log("   Credit:", balance512.total_credit);
    console.log("   Solde:", balance512.solde);

    const solde512 = Number(balance512.solde || 0);

    if (solde512 >= 0) {
      console.log("\n   Le compte 512 n'a pas de solde négatif. Pas de correction nécessaire.");
      await pool.end();
      return;
    }

    const montantCorrection = Math.abs(solde512);
    console.log(`\n   Montant à corriger: ${montantCorrection} FCFA`);

    // Step 4: Create correction entry
    console.log("\n4. Creating correction entry...");
    const agenceId = 'b8519d5d-93ac-468f-aed6-335bb9ed9639';
    const numeroPiece = `OD-CORR-SAFESUPPLY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

    const ecritureResult = await db.execute(sql`
      INSERT INTO ecritures_comptables (
        id, numero_piece, date_ecriture, libelle, journal_id, exercice_id,
        statut, source_type, agence_id, created_at
      ) VALUES (
        gen_random_uuid(),
        ${numeroPiece},
        CURRENT_DATE,
        'Correction SAFE_SUPPLY: reclassement Banque vers Capital social',
        ${journalId}::uuid,
        ${exerciceId}::uuid,
        'POSTED',
        'MIGRATION',
        ${agenceId}::uuid,
        NOW()
      ) RETURNING id
    `);
    const ecritureId = (ecritureResult.rows[0] as any).id;
    console.log("   Écriture ID:", ecritureId);
    console.log("   Numéro pièce:", numeroPiece);

    // Step 5: Add debit line for 512 (to cancel the negative balance)
    console.log("\n5. Adding debit line for 512...");
    await db.execute(sql`
      INSERT INTO lignes_ecritures (
        id, ecriture_id, compte_id, numero_compte, libelle, debit, credit, created_at
      ) VALUES (
        gen_random_uuid(),
        ${ecritureId}::uuid,
        ${compte512Id}::uuid,
        '512',
        'Correction: annulation crédit SAFE_SUPPLY sur banque',
        ${montantCorrection},
        0,
        NOW()
      )
    `);
    console.log(`   Debit 512: ${montantCorrection} FCFA`);

    // Step 6: Add credit line for 101 (capital contribution)
    console.log("\n6. Adding credit line for 101...");
    await db.execute(sql`
      INSERT INTO lignes_ecritures (
        id, ecriture_id, compte_id, numero_compte, libelle, debit, credit, created_at
      ) VALUES (
        gen_random_uuid(),
        ${ecritureId}::uuid,
        ${compte101Id}::uuid,
        '101',
        'Apport initial en capital (SAFE_SUPPLY)',
        0,
        ${montantCorrection},
        NOW()
      )
    `);
    console.log(`   Credit 101: ${montantCorrection} FCFA`);

    // Step 7: Verify new balances
    console.log("\n7. Verifying new balances...");
    const newBalance512Result = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)) - SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '512%' AND e.statut = 'POSTED'
    `);
    console.log("   Nouveau solde 512:", (newBalance512Result.rows[0] as any).solde);

    const newBalance101Result = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)) - SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '101%' AND e.statut = 'POSTED'
    `);
    console.log("   Nouveau solde 101:", (newBalance101Result.rows[0] as any).solde);

    console.log("\n" + "=".repeat(60));
    console.log("  Migration 0065 completed successfully!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\nError:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
