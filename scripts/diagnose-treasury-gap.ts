/**
 * COFINCO - Diagnostic des écarts de réconciliation Treasury
 *
 * Identifie les opérations qui ont créé des soldes sans écritures GL
 * et propose des corrections
 */

import { pool } from "../server/db";

const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

interface DiagnosticResult {
  operational: {
    coffres: number;
    caisses: number;
    total: number;
  };
  gl: {
    caisse521: number;
    coffre531: number;
    total: number;
  };
  gap: number;
  issues: Array<{
    type: string;
    description: string;
    count: number;
    totalAmount: number;
  }>;
}

async function main() {
  console.log(`\n${CYAN}${BOLD}${"=".repeat(70)}${RESET}`);
  console.log(`${CYAN}${BOLD}   DIAGNOSTIC ÉCARTS TREASURY${RESET}`);
  console.log(`${CYAN}${"=".repeat(70)}${RESET}\n`);

  const client = await pool.connect();

  try {
    // ========== 1. SOLDES OPÉRATIONNELS ==========
    console.log(`${BOLD}1️⃣  SOLDES OPÉRATIONNELS (Tables métier)${RESET}\n`);

    // Coffres
    const coffresResult = await client.query(`
      SELECT
        COUNT(*) as nb_coffres,
        COALESCE(SUM(CAST(solde AS DECIMAL)), 0) as total_coffres
      FROM coffres_forts
    `);

    const coffres = parseFloat(coffresResult.rows[0].total_coffres);
    const nbCoffres = parseInt(coffresResult.rows[0].nb_coffres);

    console.log(`   Coffres-forts: ${nbCoffres} coffres`);
    console.log(`   └─ Total: ${BOLD}${coffres.toLocaleString()} FCFA${RESET}\n`);

    // Caisses (dernière session)
    const caissesResult = await client.query(`
      SELECT COALESCE(SUM(solde_reel), 0) as total FROM (
        SELECT DISTINCT ON (c.id)
          c.id,
          c.nom,
          COALESCE(
            CAST(s.montant_fermeture_theorique AS DECIMAL),
            CAST(s.montant_ouverture AS DECIMAL),
            0
          ) as solde_reel,
          s.statut,
          s.closed_at
        FROM caisses c
        LEFT JOIN sessions_caisse s ON s.caisse_id = c.id
        ORDER BY c.id, s.closed_at DESC NULLS FIRST
      ) sub
    `);

    const caisses = parseFloat(caissesResult.rows[0].total);

    console.log(`   Caisses: Solde consolidé dernières sessions`);
    console.log(`   └─ Total: ${BOLD}${caisses.toLocaleString()} FCFA${RESET}\n`);

    const operationalTotal = coffres + caisses;
    console.log(`   ${BOLD}TOTAL OPÉRATIONNEL: ${operationalTotal.toLocaleString()} FCFA${RESET}\n`);

    // ========== 2. SOLDES GRAND LIVRE (GL) ==========
    console.log(`${BOLD}2️⃣  SOLDES GRAND LIVRE (Écritures comptables POSTED)${RESET}\n`);

    // Comptes 521xxx (Caisse Guichet)
    const caisse521Result = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) as total_debit,
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as total_credit
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '521%'
        AND e.statut = 'POSTED'
    `);

    const caisse521Debit = parseFloat(caisse521Result.rows[0].total_debit);
    const caisse521Credit = parseFloat(caisse521Result.rows[0].total_credit);
    const caisse521 = caisse521Debit - caisse521Credit;

    console.log(`   Compte 521xxx (Caisse Guichet):`);
    console.log(`   ├─ Débits:  ${caisse521Debit.toLocaleString()} FCFA`);
    console.log(`   ├─ Crédits: ${caisse521Credit.toLocaleString()} FCFA`);
    console.log(`   └─ Solde:   ${BOLD}${caisse521.toLocaleString()} FCFA${RESET}\n`);

    // Comptes 531xxx (Coffre-Fort)
    const coffre531Result = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) as total_debit,
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as total_credit
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '531%'
        AND e.statut = 'POSTED'
    `);

    const coffre531Debit = parseFloat(coffre531Result.rows[0].total_debit);
    const coffre531Credit = parseFloat(coffre531Result.rows[0].total_credit);
    const coffre531 = coffre531Debit - coffre531Credit;

    console.log(`   Compte 531xxx (Coffre-Fort):`);
    console.log(`   ├─ Débits:  ${coffre531Debit.toLocaleString()} FCFA`);
    console.log(`   ├─ Crédits: ${coffre531Credit.toLocaleString()} FCFA`);
    console.log(`   └─ Solde:   ${BOLD}${coffre531.toLocaleString()} FCFA${RESET}\n`);

    const glTotal = caisse521 + coffre531;
    console.log(`   ${BOLD}TOTAL GL: ${glTotal.toLocaleString()} FCFA${RESET}\n`);

    // ========== 3. ÉCART ==========
    const gap = operationalTotal - glTotal;
    const gapAbs = Math.abs(gap);

    console.log(`${BOLD}3️⃣  ÉCART${RESET}\n`);
    console.log(`   Opérationnel: ${operationalTotal.toLocaleString()} FCFA`);
    console.log(`   Grand Livre:  ${glTotal.toLocaleString()} FCFA`);
    console.log(`   ${RED}${BOLD}Écart:        ${gap.toLocaleString()} FCFA${RESET}\n`);

    if (gapAbs < 500) {
      console.log(`   ${GREEN}✓ Statut: OK (< 500 FCFA)${RESET}\n`);
      return;
    }

    // ========== 4. ANALYSE DES CAUSES ==========
    console.log(`${BOLD}4️⃣  ANALYSE DES CAUSES${RESET}\n`);

    const issues: Array<{
      type: string;
      description: string;
      count: number;
      totalAmount: number;
    }> = [];

    // Issue 1: Mouvements financiers sans GL
    const mouvementsSansGLResult = await client.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(CAST(montant AS DECIMAL)), 0) as total
      FROM mouvements_financiers
      WHERE gl_posting_status IS NULL
         OR gl_posting_status = 'PENDING'
         OR gl_posting_status = 'FAILED'
    `);

    const mouvementsSansGL = {
      count: parseInt(mouvementsSansGLResult.rows[0].count),
      total: parseFloat(mouvementsSansGLResult.rows[0].total),
    };

    if (mouvementsSansGL.count > 0) {
      issues.push({
        type: "MOUVEMENTS_SANS_GL",
        description: "Mouvements financiers sans écriture GL postée",
        count: mouvementsSansGL.count,
        totalAmount: mouvementsSansGL.total,
      });

      console.log(`   ${YELLOW}⚠️  Mouvements financiers sans GL posting${RESET}`);
      console.log(`      Nombre: ${mouvementsSansGL.count}`);
      console.log(`      Montant: ${mouvementsSansGL.total.toLocaleString()} FCFA\n`);
    }

    // Issue 2: Transferts coffre-caisse sans GL
    const transfertsSansGLResult = await client.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(CAST(montant AS DECIMAL)), 0) as total
      FROM transferts_coffre_caisse
      WHERE statut = 'EXECUTED'
        AND (mouvement_debit_id IS NULL OR mouvement_credit_id IS NULL)
    `);

    const transfertsSansGL = {
      count: parseInt(transfertsSansGLResult.rows[0].count),
      total: parseFloat(transfertsSansGLResult.rows[0].total),
    };

    if (transfertsSansGL.count > 0) {
      issues.push({
        type: "TRANSFERTS_SANS_MOUVEMENT",
        description: "Transferts exécutés sans mouvements financiers",
        count: transfertsSansGL.count,
        totalAmount: transfertsSansGL.total,
      });

      console.log(`   ${YELLOW}⚠️  Transferts coffre-caisse sans mouvements${RESET}`);
      console.log(`      Nombre: ${transfertsSansGL.count}`);
      console.log(`      Montant: ${transfertsSansGL.total.toLocaleString()} FCFA\n`);
    }

    // Issue 3: Sessions caisse sans transfert ouverture
    const sessionsSansTransfertResult = await client.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(CAST(montant_ouverture AS DECIMAL)), 0) as total
      FROM sessions_caisse
      WHERE statut = 'OPEN'
        AND opening_transfert_id IS NULL
        AND CAST(montant_ouverture AS DECIMAL) > 0
    `);

    const sessionsSansTransfert = {
      count: parseInt(sessionsSansTransfertResult.rows[0].count),
      total: parseFloat(sessionsSansTransfertResult.rows[0].total),
    };

    if (sessionsSansTransfert.count > 0) {
      issues.push({
        type: "SESSIONS_SANS_TRANSFERT",
        description: "Sessions ouvertes sans transfert d'ouverture",
        count: sessionsSansTransfert.count,
        totalAmount: sessionsSansTransfert.total,
      });

      console.log(`   ${YELLOW}⚠️  Sessions sans transfert d'ouverture${RESET}`);
      console.log(`      Nombre: ${sessionsSansTransfert.count}`);
      console.log(`      Montant: ${sessionsSansTransfert.total.toLocaleString()} FCFA\n`);
    }

    // Issue 4: Comptes GL de trésorerie manquants
    const comptesGLResult = await client.query(`
      SELECT numero_compte, intitule
      FROM plan_comptable
      WHERE numero_compte LIKE '521%' OR numero_compte LIKE '531%'
      ORDER BY numero_compte
    `);

    console.log(`   ${BOLD}Comptes GL de trésorerie disponibles:${RESET}`);
    comptesGLResult.rows.forEach(compte => {
      console.log(`      • ${compte.numero_compte} - ${compte.intitule}`);
    });
    console.log();

    if (comptesGLResult.rows.length === 0) {
      console.log(`   ${RED}❌ PROBLÈME CRITIQUE: Aucun compte GL 521/531 trouvé!${RESET}\n`);
    }

    // ========== 5. RÉSUMÉ ET RECOMMANDATIONS ==========
    console.log(`${BOLD}5️⃣  RÉSUMÉ ET RECOMMANDATIONS${RESET}\n`);

    if (issues.length === 0) {
      console.log(`   ${YELLOW}⚠️  Aucune cause évidente identifiée.${RESET}`);
      console.log(`   ${YELLOW}    L'écart peut provenir de:${RESET}`);
      console.log(`   ${YELLOW}    - Données de seed/test non comptabilisées${RESET}`);
      console.log(`   ${YELLOW}    - Opérations manuelles en DB${RESET}`);
      console.log(`   ${YELLOW}    - Migrations incomplètes${RESET}\n`);
    } else {
      console.log(`   ${RED}${BOLD}${issues.length} problème(s) identifié(s):${RESET}\n`);

      issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.description}`);
        console.log(`      • ${issue.count} enregistrement(s)`);
        console.log(`      • ${issue.totalAmount.toLocaleString()} FCFA\n`);
      });

      console.log(`   ${GREEN}${BOLD}Solutions recommandées:${RESET}`);
      console.log(`   1. Exécuter: ${CYAN}npm run fix:treasury-gl${RESET}`);
      console.log(`   2. Vérifier règles comptables: accounting-rules.ts`);
      console.log(`   3. Activer guards: Empêcher opérations sans GL posting\n`);
    }

    // Générer rapport JSON
    const report: DiagnosticResult = {
      operational: {
        coffres,
        caisses,
        total: operationalTotal,
      },
      gl: {
        caisse521,
        coffre531,
        total: glTotal,
      },
      gap,
      issues,
    };

    console.log(`   ${BOLD}Rapport JSON sauvegardé:${RESET} /tmp/treasury-diagnostic.json\n`);
    await import('fs').then(fs =>
      fs.promises.writeFile(
        '/tmp/treasury-diagnostic.json',
        JSON.stringify(report, null, 2)
      )
    );

  } catch (error: any) {
    console.error(`\n${RED}${BOLD}ERREUR:${RESET}`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
