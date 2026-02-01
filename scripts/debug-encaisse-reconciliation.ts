/**
 * Debug script pour diagnostiquer l'écart de réconciliation
 *
 * Exécution: npx tsx scripts/debug-encaisse-reconciliation.ts
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { sql, eq, and, or, like, sum } from "drizzle-orm";
import {
  planComptable,
  lignesEcritures,
  ecritures,
  EntryStatus,
} from "@shared/schema/accounting";

const AGENCE_ID = "b8519d5d-93ac-468f-aed6-335bb9ed9639"; // Agence principale

async function main() {
  console.log("=".repeat(60));
  console.log("  Debug Encaisse Réconciliation");
  console.log("=".repeat(60));
  console.log();

  // 1. Test SQL brut - Total général
  console.log("1. SQL BRUT - Total tous comptes 521/531:");
  const rawAllResult = await db.execute(sql`
    SELECT
      SUM(le.debit) as total_debit,
      SUM(le.credit) as total_credit,
      SUM(le.debit) - SUM(le.credit) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE (pc.numero_compte LIKE '521%' OR pc.numero_compte LIKE '531%')
      AND e.statut = 'POSTED'
  `);
  console.log("   Résultat:", rawAllResult.rows[0]);

  // 2. SQL brut - Filtré par agence
  console.log("\n2. SQL BRUT - Filtré par agence_id:");
  const rawAgenceResult = await db.execute(sql`
    SELECT
      SUM(le.debit) as total_debit,
      SUM(le.credit) as total_credit,
      SUM(le.debit) - SUM(le.credit) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE (pc.numero_compte LIKE '521%' OR pc.numero_compte LIKE '531%')
      AND e.statut = 'POSTED'
      AND e.agence_id = ${AGENCE_ID}::uuid
  `);
  console.log("   Résultat:", rawAgenceResult.rows[0]);

  // 3. SQL brut - Écritures avec NULL agence_id
  console.log("\n3. SQL BRUT - Écritures 521/531 avec agence_id NULL:");
  const rawNullAgenceResult = await db.execute(sql`
    SELECT
      e.id,
      e.numero_piece,
      e.libelle,
      e.agence_id,
      SUM(le.debit) as total_debit,
      SUM(le.credit) as total_credit
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE (pc.numero_compte LIKE '521%' OR pc.numero_compte LIKE '531%')
      AND e.statut = 'POSTED'
      AND e.agence_id IS NULL
    GROUP BY e.id, e.numero_piece, e.libelle, e.agence_id
    LIMIT 10
  `);
  console.log("   Écritures trouvées:", rawNullAgenceResult.rows.length);
  for (const row of rawNullAgenceResult.rows as any[]) {
    console.log(`     - ${row.numero_piece}: ${row.libelle} (debit=${row.total_debit}, credit=${row.total_credit})`);
  }

  // 4. Drizzle ORM query - même que encaisse-service.ts
  console.log("\n4. DRIZZLE ORM - Query comme encaisse-service.ts:");
  const prefixes = ["521", "531"];
  const prefixConditions = prefixes.map((p) => like(planComptable.numeroCompte, `${p}%`));

  const drizzleResult = await db
    .select({
      totalDebit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.debit} AS DECIMAL)), 0)`,
      totalCredit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.credit} AS DECIMAL)), 0)`,
    })
    .from(lignesEcritures)
    .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .where(
      and(
        or(...prefixConditions),
        eq(ecritures.statut, EntryStatus.POSTED),
        eq(ecritures.agenceId, AGENCE_ID)
      )
    );

  const totalDebit = Number(drizzleResult[0]?.totalDebit || 0);
  const totalCredit = Number(drizzleResult[0]?.totalCredit || 0);
  const solde = totalDebit - totalCredit;

  console.log("   totalDebit:", totalDebit);
  console.log("   totalCredit:", totalCredit);
  console.log("   solde:", solde);

  // 5. Vérifier détail par compte
  console.log("\n5. DÉTAIL PAR COMPTE:");
  const detailResult = await db.execute(sql`
    SELECT
      pc.numero_compte,
      pc.intitule,
      SUM(le.debit) as total_debit,
      SUM(le.credit) as total_credit,
      SUM(le.debit) - SUM(le.credit) as solde,
      COUNT(*) as nb_lignes
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE (pc.numero_compte LIKE '521%' OR pc.numero_compte LIKE '531%')
      AND e.statut = 'POSTED'
    GROUP BY pc.numero_compte, pc.intitule
    ORDER BY pc.numero_compte
  `);
  for (const row of detailResult.rows as any[]) {
    console.log(`   ${row.numero_compte} (${row.intitule}): debit=${row.total_debit}, credit=${row.total_credit}, solde=${row.solde}, lignes=${row.nb_lignes}`);
  }

  // 6. Vérifier soldes opérationnels
  console.log("\n6. SOLDES OPÉRATIONNELS:");
  const coffresResult = await db.execute(sql`
    SELECT SUM(solde) as total FROM coffres_forts
  `);
  console.log("   Coffres:", (coffresResult.rows[0] as any).total);

  const caissesResult = await db.execute(sql`
    SELECT COALESCE(SUM(solde_reel), 0) as total FROM (
      SELECT DISTINCT ON (c.id)
        COALESCE(
          CAST(s.montant_fermeture_theorique AS DECIMAL),
          CAST(s.montant_ouverture AS DECIMAL),
          0
        ) as solde_reel
      FROM caisses c
      LEFT JOIN sessions_caisse s ON s.caisse_id = c.id
      WHERE c.deleted_at IS NULL
      ORDER BY c.id, s.closed_at DESC NULLS FIRST
    ) sub
  `);
  console.log("   Caisses:", (caissesResult.rows[0] as any).total);

  // 7. Vérifier toutes les agences disponibles dans ecritures
  console.log("\n7. AGENCES DANS LES ÉCRITURES:");
  const agencesResult = await db.execute(sql`
    SELECT DISTINCT e.agence_id, a.nom, COUNT(*) as nb_ecritures
    FROM ecritures_comptables e
    LEFT JOIN agences a ON e.agence_id = a.id
    WHERE e.statut = 'POSTED'
    GROUP BY e.agence_id, a.nom
    ORDER BY nb_ecritures DESC
  `);
  for (const row of agencesResult.rows as any[]) {
    console.log(`   ${row.agence_id}: ${row.nom || 'NULL'} (${row.nb_ecritures} écritures)`);
  }

  // 8. Vérifier les grosses écritures (probablement SAFE_SUPPLY)
  console.log("\n8. GROSSES ÉCRITURES (>= 10M FCFA):");
  const bigEntriesResult = await db.execute(sql`
    SELECT
      e.id,
      e.numero_piece,
      e.libelle,
      e.agence_id,
      e.statut,
      pc.numero_compte,
      le.debit,
      le.credit
    FROM ecritures_comptables e
    INNER JOIN lignes_ecritures le ON le.ecriture_id = e.id
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    WHERE (pc.numero_compte LIKE '521%' OR pc.numero_compte LIKE '531%')
      AND (le.debit >= 10000000 OR le.credit >= 10000000)
    ORDER BY le.debit DESC, le.credit DESC
    LIMIT 20
  `);
  for (const row of bigEntriesResult.rows as any[]) {
    console.log(`   ${row.numero_piece}: ${row.libelle}`);
    console.log(`     compte=${row.numero_compte}, debit=${row.debit}, credit=${row.credit}`);
    console.log(`     agence_id=${row.agence_id}, statut=${row.statut}`);
  }

  // 9. Test séparé par préfixe (comme encaisse-service)
  console.log("\n9. TEST PAR PRÉFIXE (comme encaisse-service):");

  for (const prefix of ["521", "531", "573", "512", "581"]) {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) as total_debit,
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as total_credit
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE ${prefix + '%'}
        AND e.statut = 'POSTED'
    `);
    const row = result.rows[0] as any;
    const debit = Number(row.total_debit || 0);
    const credit = Number(row.total_credit || 0);
    const solde = debit - credit;
    console.log(`   ${prefix}xxx: debit=${debit}, credit=${credit}, solde=${solde}`);
  }

  // 10. Simulation complète du calcul encaisse
  console.log("\n10. SIMULATION CALCUL ENCAISSE:");
  const caisse521 = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(le.debit AS DECIMAL)) - SUM(CAST(le.credit AS DECIMAL)), 0) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE pc.numero_compte LIKE '521%' AND e.statut = 'POSTED'
  `);
  const coffre531 = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(le.debit AS DECIMAL)) - SUM(CAST(le.credit AS DECIMAL)), 0) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE pc.numero_compte LIKE '531%' AND e.statut = 'POSTED'
  `);
  const mmo573 = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(le.debit AS DECIMAL)) - SUM(CAST(le.credit AS DECIMAL)), 0) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE pc.numero_compte LIKE '573%' AND e.statut = 'POSTED'
  `);
  const banque512 = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(le.debit AS DECIMAL)) - SUM(CAST(le.credit AS DECIMAL)), 0) as solde
    FROM lignes_ecritures le
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
    WHERE pc.numero_compte LIKE '512%' AND e.statut = 'POSTED'
  `);

  const caisseGuichet = Number((caisse521.rows[0] as any).solde || 0);
  const coffreCentral = Number((coffre531.rows[0] as any).solde || 0);
  const mobileMoney = Number((mmo573.rows[0] as any).solde || 0);
  const banque = Number((banque512.rows[0] as any).solde || 0);
  const glTotal = caisseGuichet + coffreCentral + mobileMoney + banque;

  console.log("   caisseGuichet (521):", caisseGuichet);
  console.log("   coffreCentral (531):", coffreCentral);
  console.log("   mobileMoney (573):", mobileMoney);
  console.log("   banque (512):", banque);
  console.log("   GL TOTAL:", glTotal);

  // Opérationnel
  const coffresOp = Number((coffresResult.rows[0] as any).total || 0);
  const caissesOp = Number((caissesResult.rows[0] as any).total || 0);
  const opTotal = coffresOp + caissesOp;

  console.log("\n   coffresOperational:", coffresOp);
  console.log("   caissesOperational:", caissesOp);
  console.log("   OPERATIONAL TOTAL:", opTotal);

  console.log("\n   ÉCART (Op - GL):", opTotal - glTotal);

  const absEcart = Math.abs(opTotal - glTotal);
  let status = "OK";
  if (absEcart >= 500000) status = "CRITICAL";
  else if (absEcart >= 50000) status = "MAJOR";
  else if (absEcart >= 500) status = "MINOR";
  console.log("   STATUS:", status);

  console.log("\n" + "=".repeat(60));
  console.log("  Fin du diagnostic");
  console.log("=".repeat(60));

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("ERREUR:", err);
  await pool.end();
  process.exit(1);
});
