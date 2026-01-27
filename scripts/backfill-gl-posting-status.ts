/**
 * Backfill GL Posting Status
 *
 * Met a jour gl_posting_status et requires_gl_posting sur mouvements_financiers
 * apres que db:push a ajoute ces colonnes avec les defaults (true / 'PENDING').
 *
 * Phases:
 *   A. Backfill gl_posting_links.mouvement_id depuis les entries existantes
 *   B. Marquer POSTED les mouvements qui ont deja un gl_posting_links ou ecriture
 *   C. Retroposter le GL pour les mouvements PENDING avec agence_id (via retryGlPosting)
 *   D. Marquer SKIPPED les mouvements sans agence_id
 *   E. Rapport final
 *
 * Execution : node --env-file=.env --import tsx scripts/backfill-gl-posting-status.ts
 * Dry run   : node --env-file=.env --import tsx scripts/backfill-gl-posting-status.ts --dry-run
 *
 * Idempotent : safe to run multiple times.
 */

import "dotenv/config";

import { db, pool } from "../server/db";
import { mouvementsFinanciers } from "@shared/schema";
import { eq, and, isNotNull, asc, sql } from "drizzle-orm";
import { retryGlPosting } from "../server/services/ledger";
import { AccountingRuleNotFoundError, GlAccountNotFoundError } from "../server/services/accounting-posting-service";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 50; // Process mouvements in batches to avoid memory issues

interface BackfillReport {
  phaseA_linksBackfilled: number;
  phaseB_alreadyPosted: number;
  phaseC_retroposted: number;
  phaseC_skippedNoRule: number;
  phaseC_failed: number;
  phaseD_noAgence: number;
  finalCounts: Record<string, number>;
  errors: Array<{ mouvementId: string; error: string }>;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  GL Posting Status Backfill ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  const report: BackfillReport = {
    phaseA_linksBackfilled: 0,
    phaseB_alreadyPosted: 0,
    phaseC_retroposted: 0,
    phaseC_skippedNoRule: 0,
    phaseC_failed: 0,
    phaseD_noAgence: 0,
    finalCounts: {},
    errors: [],
  };

  // --- Pre-flight: count total mouvements ---
  const [{ count: totalMouvements }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mouvementsFinanciers);
  console.log(`Total mouvements_financiers: ${totalMouvements}`);

  const [{ count: pendingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mouvementsFinanciers)
    .where(eq(mouvementsFinanciers.glPostingStatus, "PENDING"));
  console.log(`Mouvements en PENDING: ${pendingCount}`);

  if (pendingCount === 0) {
    console.log("\nAucun mouvement PENDING. Rien a faire.");
    await cleanup();
    return;
  }

  // ================================================================
  // PHASE A: Backfill gl_posting_links.mouvement_id
  // ================================================================
  console.log("\n--- Phase A: Backfill gl_posting_links.mouvement_id ---");

  if (DRY_RUN) {
    const aResult = await db.execute(sql`
      SELECT count(*)::int as count FROM gl_posting_links
      WHERE source_type = 'MOUVEMENT' AND mouvement_id IS NULL AND source_id IS NOT NULL
    `);
    report.phaseA_linksBackfilled = Number((aResult.rows[0] as any)?.count || 0);
    console.log(`  [DRY] ${report.phaseA_linksBackfilled} links a backfill`);
  } else {
    // Step A1: source_id direct
    const a1 = await db.execute(sql`
      UPDATE gl_posting_links
      SET mouvement_id = source_id::uuid
      WHERE source_type = 'MOUVEMENT' AND mouvement_id IS NULL AND source_id IS NOT NULL
    `);
    const a1Count = Number((a1 as any).rowCount || 0);

    // Step A2: from ecritures.mouvement_id
    const a2 = await db.execute(sql`
      UPDATE gl_posting_links gpl
      SET mouvement_id = ec.mouvement_id
      FROM ecritures_comptables ec
      WHERE gpl.ecriture_id = ec.id AND gpl.mouvement_id IS NULL AND ec.mouvement_id IS NOT NULL
    `);
    const a2Count = Number((a2 as any).rowCount || 0);

    report.phaseA_linksBackfilled = a1Count + a2Count;
    console.log(`  ${a1Count} links via source_id, ${a2Count} via ecritures.mouvement_id`);
  }

  // ================================================================
  // PHASE B: Mark mouvements that already have GL entries as POSTED
  // ================================================================
  console.log("\n--- Phase B: Marquer POSTED les mouvements avec GL existant ---");

  if (DRY_RUN) {
    const bDryResult = await db.execute(sql`
      SELECT count(*)::int as count FROM mouvements_financiers mf
      WHERE mf.gl_posting_status = 'PENDING'
        AND (
          EXISTS (SELECT 1 FROM gl_posting_links gpl WHERE gpl.mouvement_id = mf.id)
          OR EXISTS (SELECT 1 FROM ecritures_comptables ec WHERE ec.mouvement_id = mf.id AND ec.statut = 'POSTED')
        )
    `);
    report.phaseB_alreadyPosted = Number((bDryResult.rows[0] as any)?.count || 0);
    console.log(`  [DRY] ${report.phaseB_alreadyPosted} mouvements deja POSTED`);
  } else {
    const bResult = await db.execute(sql`
      UPDATE mouvements_financiers mf
      SET gl_posting_status = 'POSTED', requires_gl_posting = true
      WHERE mf.gl_posting_status = 'PENDING'
        AND (
          EXISTS (SELECT 1 FROM gl_posting_links gpl WHERE gpl.mouvement_id = mf.id)
          OR EXISTS (SELECT 1 FROM ecritures_comptables ec WHERE ec.mouvement_id = mf.id AND ec.statut = 'POSTED')
        )
    `);
    report.phaseB_alreadyPosted = Number((bResult as any).rowCount || 0);
    console.log(`  ${report.phaseB_alreadyPosted} mouvements marques POSTED`);
  }

  // ================================================================
  // PHASE C: Retropostage GL pour mouvements PENDING avec agence_id
  // ================================================================
  console.log("\n--- Phase C: Retropostage GL (mouvements PENDING + agence_id) ---");

  if (DRY_RUN) {
    const cDryResult = await db.execute(sql`
      SELECT count(*)::int as count FROM mouvements_financiers
      WHERE gl_posting_status = 'PENDING' AND agence_id IS NOT NULL
    `);
    const candidateCount = Number((cDryResult.rows[0] as any)?.count || 0);
    console.log(`  [DRY] ${candidateCount} mouvements candidats au retropostage`);
    report.phaseC_retroposted = candidateCount; // Approximate
  } else {
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch a batch of PENDING mouvements with agence_id
      const batch = await db
        .select()
        .from(mouvementsFinanciers)
        .where(
          and(
            eq(mouvementsFinanciers.glPostingStatus, "PENDING"),
            isNotNull(mouvementsFinanciers.agenceId)
          )
        )
        .orderBy(asc(mouvementsFinanciers.createdAt))
        .limit(BATCH_SIZE);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const mouvement of batch) {
        processed++;
        try {
          await retryGlPosting(mouvement, mouvement.agenceId!, "system-backfill");
          report.phaseC_retroposted++;

          if (processed % 100 === 0) {
            console.log(`  ... ${processed} traites (${report.phaseC_retroposted} posted, ${report.phaseC_skippedNoRule} skipped, ${report.phaseC_failed} failed)`);
          }
        } catch (error: unknown) {
          if (error instanceof AccountingRuleNotFoundError || error instanceof GlAccountNotFoundError) {
            // No accounting rule for this type → SKIPPED
            await db.update(mouvementsFinanciers)
              .set({
                glPostingStatus: "SKIPPED",
                requiresGlPosting: false,
                glPostingError: `Aucune regle comptable: ${mouvement.typePaiement || "N/A"}`,
              })
              .where(eq(mouvementsFinanciers.id, mouvement.id));
            report.phaseC_skippedNoRule++;
          } else {
            // Other GL error → FAILED
            const message = error instanceof Error ? error.message : "Unknown error";
            await db.update(mouvementsFinanciers)
              .set({
                glPostingStatus: "FAILED",
                glPostingError: message,
              })
              .where(eq(mouvementsFinanciers.id, mouvement.id));
            report.phaseC_failed++;
            report.errors.push({ mouvementId: mouvement.id, error: message });
          }
        }
      }
    }

    console.log(`  ${report.phaseC_retroposted} retropostes, ${report.phaseC_skippedNoRule} skipped (pas de regle), ${report.phaseC_failed} failed`);
  }

  // ================================================================
  // PHASE D: Mark mouvements without agence_id as SKIPPED
  // ================================================================
  console.log("\n--- Phase D: SKIPPED mouvements sans agence_id ---");

  if (DRY_RUN) {
    const dDryResult = await db.execute(sql`
      SELECT count(*)::int as count FROM mouvements_financiers
      WHERE gl_posting_status = 'PENDING' AND agence_id IS NULL
    `);
    report.phaseD_noAgence = Number((dDryResult.rows[0] as any)?.count || 0);
    console.log(`  [DRY] ${report.phaseD_noAgence} mouvements sans agence_id`);
  } else {
    const dResult = await db.execute(sql`
      UPDATE mouvements_financiers
      SET gl_posting_status = 'SKIPPED',
          requires_gl_posting = false,
          gl_posting_error = 'Pas d''agence_id — ne peut pas poster GL'
      WHERE gl_posting_status = 'PENDING' AND agence_id IS NULL
    `);
    report.phaseD_noAgence = Number((dResult as any).rowCount || 0);
    console.log(`  ${report.phaseD_noAgence} mouvements marques SKIPPED`);
  }

  // ================================================================
  // PHASE E: Rapport final
  // ================================================================
  console.log("\n--- Phase E: Rapport final ---");

  const statusCounts = await db.execute(sql`
    SELECT gl_posting_status, requires_gl_posting, count(*)::int as count
    FROM mouvements_financiers
    GROUP BY gl_posting_status, requires_gl_posting
    ORDER BY gl_posting_status
  `);

  for (const row of statusCounts.rows as any[]) {
    const key = `${row.gl_posting_status} (requires_gl=${row.requires_gl_posting})`;
    report.finalCounts[key] = Number(row.count);
    console.log(`  ${key}: ${row.count}`);
  }

  // Remaining PENDING (should be 0 if everything went well)
  const [{ count: remainingPending }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mouvementsFinanciers)
    .where(eq(mouvementsFinanciers.glPostingStatus, "PENDING"));

  console.log(`\n  Mouvements restants en PENDING: ${remainingPending}`);

  if (remainingPending > 0) {
    console.log("  *** ATTENTION: Des mouvements sont encore PENDING. Verifiez les erreurs ci-dessous.");
    const remaining = await db
      .select({
        id: mouvementsFinanciers.id,
        reference: mouvementsFinanciers.reference,
        sourceModule: mouvementsFinanciers.sourceModule,
        typePaiement: mouvementsFinanciers.typePaiement,
        agenceId: mouvementsFinanciers.agenceId,
        createdAt: mouvementsFinanciers.createdAt,
      })
      .from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.glPostingStatus, "PENDING"))
      .limit(20);

    for (const m of remaining) {
      console.log(`    - ${m.id} | ${m.sourceModule}/${m.typePaiement} | agence=${m.agenceId} | ${m.createdAt}`);
    }
  }

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log("  RESUME");
  console.log(`${"=".repeat(60)}`);
  console.log(`  Phase A (links backfill):    ${report.phaseA_linksBackfilled}`);
  console.log(`  Phase B (deja posted):       ${report.phaseB_alreadyPosted}`);
  console.log(`  Phase C (retropostes):       ${report.phaseC_retroposted}`);
  console.log(`  Phase C (skipped/no rule):   ${report.phaseC_skippedNoRule}`);
  console.log(`  Phase C (failed):            ${report.phaseC_failed}`);
  console.log(`  Phase D (no agence):         ${report.phaseD_noAgence}`);
  console.log(`  Remaining PENDING:           ${remainingPending}`);

  if (report.errors.length > 0) {
    console.log(`\n  Erreurs (${report.errors.length}):`);
    for (const err of report.errors.slice(0, 20)) {
      console.log(`    - ${err.mouvementId}: ${err.error}`);
    }
    if (report.errors.length > 20) {
      console.log(`    ... et ${report.errors.length - 20} autres`);
    }
  }

  console.log(`\n  ${DRY_RUN ? "[DRY RUN] Aucune modification appliquee." : "Backfill termine."}`);
  console.log(`  ${new Date().toISOString()}\n`);

  await cleanup();
}

async function cleanup() {
  try {
    await pool.end();
  } catch {
    // Ignore pool close errors
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\nFATAL ERROR:", err);
  try {
    await pool.end();
  } catch {
    // Ignore
  }
  process.exit(1);
});
