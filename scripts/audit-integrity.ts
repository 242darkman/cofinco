#!/usr/bin/env tsx
/**
 * SCRIPT D'AUDIT AUTOMATISÉ - INTÉGRITÉ CORE BANKING
 * 
 * Exécute tous les tests SQL de vérification définis dans le plan d'audit
 * Génère un rapport JSON et console avec les anomalies détectées
 * 
 * Usage: npm run audit:integrity
 */

import { Pool } from 'pg';
import { format } from 'date-fns';
import fs from 'fs/promises';
import path from 'path';

// ============================================================
// CONFIGURATION
// ============================================================

interface AuditResult {
  section: string;
  test: string;
  query: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  rowCount: number;
  expectedRowCount: number;
  anomalies?: any[];
  executionTime: number;
}

interface AuditReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  results: AuditResult[];
  criticalIssues: string[];
}

// ============================================================
// TESTS SQL (Extraction du plan d'audit)
// ============================================================

const AUDIT_TESTS = [
  // SECTION 1: INTÉGRITÉ DES COMPTES
  {
    section: 'INTÉGRITÉ COMPTES',
    test: '1.1 Comptes avec solde négatif (INTERDIT)',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, numero_compte, type_compte, solde_courant, client_id
      FROM comptes
      WHERE solde_courant::numeric < 0;
    `
  },
  {
    section: 'INTÉGRITÉ COMPTES',
    test: '1.2 Client avec plusieurs comptes du même type',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT client_id, type_compte, COUNT(*) as nb_comptes, ARRAY_AGG(id) as compte_ids
      FROM comptes
      WHERE deleted_at IS NULL
      GROUP BY client_id, type_compte
      HAVING COUNT(*) > 1;
    `
  },
  {
    section: 'INTÉGRITÉ COMPTES',
    test: '1.3 Comptes sans numéro ou numéro dupliqué',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT numero_compte, COUNT(*) as nb
      FROM comptes
      WHERE deleted_at IS NULL
      GROUP BY numero_compte
      HAVING COUNT(*) > 1 OR numero_compte IS NULL;
    `
  },
  {
    section: 'INTÉGRITÉ COMPTES',
    test: '1.4 Comptes bloqués sans motif',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT id, numero_compte, blocage_actif, blocage_motif
      FROM comptes
      WHERE blocage_actif = true AND blocage_motif IS NULL;
    `
  },
  {
    section: 'INTÉGRITÉ COMPTES',
    test: '1.5 Comptes avec date blocage incohérente',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT id, numero_compte, blocage_debut, blocage_fin
      FROM comptes
      WHERE blocage_fin IS NOT NULL
        AND blocage_debut IS NOT NULL
        AND blocage_fin < blocage_debut;
    `
  },

  // SECTION 2: DIVERGENCE SOLDE vs MOUVEMENTS
  {
    section: 'DIVERGENCE SOLDE',
    test: '2.1 Divergence solde compte vs somme mouvements (CRITIQUE)',
    expectedRowCount: 0,
    critical: true,
    query: `
      WITH soldes_calcules AS (
        SELECT
          compte_id,
          SUM(CASE
            WHEN sens = 'CREDIT' THEN montant::numeric
            WHEN sens = 'DEBIT' THEN -montant::numeric
            ELSE 0
          END) as solde_calcule
        FROM mouvements_financiers
        WHERE compte_id IS NOT NULL
          AND statut = 'POSTED'
        GROUP BY compte_id
      )
      SELECT
        c.id,
        c.numero_compte,
        c.type_compte,
        c.solde_courant::numeric as solde_affiche,
        COALESCE(sc.solde_calcule, 0) as solde_calcule,
        c.solde_courant::numeric - COALESCE(sc.solde_calcule, 0) as ecart
      FROM comptes c
      LEFT JOIN soldes_calcules sc ON c.id = sc.compte_id
      WHERE c.deleted_at IS NULL
        AND ABS(c.solde_courant::numeric - COALESCE(sc.solde_calcule, 0)) > 0.01;
    `
  },
  {
    section: 'DIVERGENCE SOLDE',
    test: '2.2 Transactions sans mouvement associé (orphelins)',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT tc.id, tc.compte_id, tc.montant, tc.type_paiement, tc.created_at
      FROM transactions_compte tc
      LEFT JOIN mouvements_financiers mf ON tc.mouvement_id = mf.id
      WHERE tc.mouvement_id IS NOT NULL
        AND mf.id IS NULL;
    `
  },

  // SECTION 3: COHÉRENCE OPÉRATIONS
  {
    section: 'COHÉRENCE OPÉRATIONS',
    test: '3.1 Mouvements avec montant <= 0',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, reference, montant, sens, source_module
      FROM mouvements_financiers
      WHERE montant::numeric <= 0;
    `
  },
  {
    section: 'COHÉRENCE OPÉRATIONS',
    test: '3.2 Mouvements sans sens défini',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, reference, montant, sens
      FROM mouvements_financiers
      WHERE sens NOT IN ('DEBIT', 'CREDIT') OR sens IS NULL;
    `
  },
  {
    section: 'COHÉRENCE OPÉRATIONS',
    test: '3.3 Mouvements sans source_module',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, reference, montant, created_at
      FROM mouvements_financiers
      WHERE source_module IS NULL;
    `
  },
  {
    section: 'COHÉRENCE OPÉRATIONS',
    test: '3.4 Mouvements sans traçabilité (created_by)',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, reference, montant, source_module, created_at
      FROM mouvements_financiers
      WHERE created_by IS NULL;
    `
  },
  {
    section: 'COHÉRENCE OPÉRATIONS',
    test: '3.5 Doublons idempotency_key (CRITIQUE - double facturation)',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT idempotency_key, COUNT(*) as nb, ARRAY_AGG(id) as mouvement_ids
      FROM mouvements_financiers
      WHERE idempotency_key IS NOT NULL
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1;
    `
  },

  // SECTION 4: OUTBOX (Temps Réel)
  {
    section: 'TEMPS RÉEL (OUTBOX)',
    test: '4.1 Events bloqués dans outbox (> 5 min)',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT
        id,
        type,
        aggregate_type,
        aggregate_id,
        tentative,
        erreur,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_bloque
      FROM evenements_outbox
      WHERE published_at IS NULL
        AND created_at < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at ASC;
    `
  },
  {
    section: 'TEMPS RÉEL (OUTBOX)',
    test: '4.2 Events échoués (5+ tentatives)',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT id, type, aggregate_type, tentative, erreur, created_at
      FROM evenements_outbox
      WHERE tentative >= 5
        AND published_at IS NULL;
    `
  },

  // SECTION 5: SESSIONS CAISSE
  {
    section: 'SESSIONS CAISSE',
    test: '5.1 Sessions avec solde divergent',
    expectedRowCount: 0,
    critical: true,
    query: `
      WITH operations_par_session AS (
        SELECT
          session_caisse_id,
          SUM(CASE
            WHEN sens = 'CREDIT' THEN montant::numeric
            WHEN sens = 'DEBIT' THEN -montant::numeric
            ELSE 0
          END) as delta_operations
        FROM mouvements_financiers
        WHERE session_caisse_id IS NOT NULL
          AND statut = 'POSTED'
        GROUP BY session_caisse_id
      )
      SELECT
        sc.id,
        sc.montant_ouverture::numeric,
        sc.montant_fermeture_theorique::numeric as solde_affiche,
        sc.montant_ouverture::numeric + COALESCE(ops.delta_operations, 0) as solde_calcule,
        sc.montant_fermeture_theorique::numeric - (sc.montant_ouverture::numeric + COALESCE(ops.delta_operations, 0)) as ecart
      FROM sessions_caisse sc
      LEFT JOIN operations_par_session ops ON sc.id = ops.session_caisse_id
      WHERE ABS(sc.montant_fermeture_theorique::numeric - (sc.montant_ouverture::numeric + COALESCE(ops.delta_operations, 0))) > 0.01;
    `
  },
  {
    section: 'SESSIONS CAISSE',
    test: '5.2 Sessions ouvertes multiples pour même caissier',
    critical: true, // Une personne ne peut pas être à 2 endroits à la fois
    expectedRowCount: 0,
    query: `
        SELECT caissier_id, count(*) as session_count
        FROM sessions_caisse
        WHERE closed_at IS NULL -- Définition moderne d'une session active
        AND deleted_at IS NULL  -- Ignorer les soft-deleted
        GROUP BY caissier_id
        HAVING count(*) > 1
    `
  },

  // TESTS ANTI-FANTÔME supprimés car redondant avec test 2.2 (transactions orphelines)
  // Le schéma actuel n'utilise pas de transaction_id pour grouper les mouvements

  // SECTION 6: INTÉGRITÉ CRÉDITS
  {
    section: 'INTÉGRITÉ CRÉDITS',
    test: '6.1 Crédits avec solde_restant négatif',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, numero_credit, client_id, montant, solde_restant, statut
      FROM credits
      WHERE deleted_at IS NULL
        AND solde_restant::numeric < 0;
    `
  },
  {
    section: 'INTÉGRITÉ CRÉDITS',
    test: '6.2 Crédits ACTIVE/LATE avec date_fin passée (non clôturés)',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, numero_credit, client_id, statut, date_fin, solde_restant
      FROM credits
      WHERE deleted_at IS NULL
        AND statut IN ('ACTIVE', 'LATE')
        AND date_fin IS NOT NULL
        AND date_fin < NOW() - INTERVAL '7 days';
    `
  },
  {
    section: 'INTÉGRITÉ CRÉDITS',
    test: '6.3 Divergence solde_restant vs remboursements effectués (CRITIQUE)',
    expectedRowCount: 0,
    critical: true,
    query: `
      WITH remboursements AS (
        SELECT
          mf.source_id as credit_id,
          SUM(mf.montant::numeric) as total_rembourse
        FROM mouvements_financiers mf
        WHERE mf.source_module = 'CREDIT'
          AND mf.statut = 'POSTED'
          AND mf.source_id IS NOT NULL
        GROUP BY mf.source_id
      )
      SELECT
        c.id,
        c.numero_credit,
        c.montant::numeric as montant_initial,
        c.solde_restant::numeric,
        COALESCE(r.total_rembourse, 0) as total_rembourse,
        c.montant::numeric - COALESCE(r.total_rembourse, 0) as solde_calcule,
        c.solde_restant::numeric - (c.montant::numeric - COALESCE(r.total_rembourse, 0)) as ecart
      FROM credits c
      LEFT JOIN remboursements r ON c.id = r.credit_id
      WHERE c.deleted_at IS NULL
        AND c.statut IN ('ACTIVE', 'LATE', 'PAID')
        AND ABS(c.solde_restant::numeric - (c.montant::numeric - COALESCE(r.total_rembourse, 0))) > 0.01;
    `
  },
  {
    section: 'INTÉGRITÉ CRÉDITS',
    test: '6.4 Crédits ACTIVE sans date de début',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, numero_credit, client_id, statut, date_debut
      FROM credits
      WHERE deleted_at IS NULL
        AND statut IN ('ACTIVE', 'LATE')
        AND date_debut IS NULL;
    `
  },
  {
    section: 'INTÉGRITÉ CRÉDITS',
    test: '6.5 Crédits PAID avec solde_restant > 0',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, numero_credit, client_id, statut, solde_restant
      FROM credits
      WHERE deleted_at IS NULL
        AND statut = 'PAID'
        AND solde_restant::numeric > 0.01;
    `
  },
  {
    section: 'INTÉGRITÉ CRÉDITS',
    test: '6.6 Doublons numero_credit',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT numero_credit, COUNT(*) as nb
      FROM credits
      WHERE deleted_at IS NULL
      GROUP BY numero_credit
      HAVING COUNT(*) > 1 OR numero_credit IS NULL;
    `
  },

  // SECTION 7: INTÉGRITÉ COFFRE-FORT
  {
    section: 'INTÉGRITÉ COFFRE-FORT',
    test: '7.1 Coffres avec solde négatif',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, code, nom, owner_type, solde
      FROM coffres_forts
      WHERE solde::numeric < 0;
    `
  },
  {
    section: 'INTÉGRITÉ COFFRE-FORT',
    test: '7.2 Transferts inter-coffres IN_TRANSIT depuis > 24h',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT
        id, reference, montant, type_transfert, statut,
        coffre_source_id, coffre_destination_id,
        dispatched_at,
        EXTRACT(EPOCH FROM (NOW() - dispatched_at))/3600 as heures_en_transit
      FROM transferts_inter_coffres
      WHERE statut = 'IN_TRANSIT'
        AND dispatched_at IS NOT NULL
        AND dispatched_at < NOW() - INTERVAL '24 hours';
    `
  },
  {
    section: 'INTÉGRITÉ COFFRE-FORT',
    test: '7.3 Transferts reçus avec écart non résolu',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT
        t.id, t.reference, t.montant, t.montant_recu, t.ecart_montant,
        t.conforme, t.statut
      FROM transferts_inter_coffres t
      WHERE t.statut = 'RECEIVED_WITH_DISCREPANCY'
        AND NOT EXISTS (
          SELECT 1 FROM taches_regularisation tr
          WHERE tr.transfert_id = t.id
            AND tr.statut = 'RESOLVED'
        );
    `
  },
  {
    section: 'INTÉGRITÉ COFFRE-FORT',
    test: '7.4 Réconciliations liaison en attente > 7 jours',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT
        id, compte_liaison_source_id, compte_liaison_dest_id,
        montant, date_operation, statut, jours_en_attente
      FROM reconciliations_liaison
      WHERE statut = 'PENDING'
        AND date_operation < NOW() - INTERVAL '7 days';
    `
  },
  {
    section: 'INTÉGRITÉ COFFRE-FORT',
    test: '7.5 Transferts RECEIVED sans mouvement destination',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, reference, montant, statut, received_at
      FROM transferts_inter_coffres
      WHERE statut IN ('RECEIVED', 'RECEIVED_WITH_DISCREPANCY')
        AND mouvement_destination_id IS NULL;
    `
  },

  // SECTION 8: INTÉGRITÉ TONTINES
  {
    section: 'INTÉGRITÉ TONTINES',
    test: '8.1 Tontines actives avec solde négatif',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, nom, statut, solde, membres_actuels
      FROM tontines
      WHERE deleted_at IS NULL
        AND statut = 'ACTIVE'
        AND solde::numeric < 0;
    `
  },
  {
    section: 'INTÉGRITÉ TONTINES',
    test: '8.2 Divergence solde tontine vs contributions - distributions',
    expectedRowCount: 0,
    critical: true,
    query: `
      WITH flux AS (
        SELECT
          tontine_id,
          SUM(CASE WHEN type_operation = 'Versement' AND statut_transaction = 'POSTED' THEN montant::numeric ELSE 0 END) as total_in,
          SUM(CASE WHEN type_operation = 'Retrait' AND statut_transaction = 'POSTED' THEN montant::numeric ELSE 0 END) as total_out
        FROM contributions_tontine
        WHERE deleted_at IS NULL
        GROUP BY tontine_id
      ),
      distributions AS (
        SELECT
          tontine_id,
          SUM(COALESCE(amount_paid, 0)::numeric) as total_distribue
        FROM tontine_distribution_requests
        WHERE status = 'SUCCESS'
        GROUP BY tontine_id
      )
      SELECT
        t.id, t.nom, t.solde::numeric as solde_affiche,
        COALESCE(f.total_in, 0) - COALESCE(f.total_out, 0) - COALESCE(d.total_distribue, 0) as solde_calcule,
        t.solde::numeric - (COALESCE(f.total_in, 0) - COALESCE(f.total_out, 0) - COALESCE(d.total_distribue, 0)) as ecart
      FROM tontines t
      LEFT JOIN flux f ON t.id = f.tontine_id
      LEFT JOIN distributions d ON t.id = d.tontine_id
      WHERE t.deleted_at IS NULL
        AND t.statut = 'ACTIVE'
        AND ABS(t.solde::numeric - (COALESCE(f.total_in, 0) - COALESCE(f.total_out, 0) - COALESCE(d.total_distribue, 0))) > 0.01;
    `
  },
  {
    section: 'INTÉGRITÉ TONTINES',
    test: '8.3 Contributions postées sans mouvement financier associé',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT ct.id, ct.tontine_id, ct.montant, ct.statut_transaction, ct.mouvement_id
      FROM contributions_tontine ct
      LEFT JOIN mouvements_financiers mf ON ct.mouvement_id = mf.id
      WHERE ct.deleted_at IS NULL
        AND ct.statut_transaction = 'POSTED'
        AND ct.mouvement_id IS NOT NULL
        AND mf.id IS NULL;
    `
  },
  {
    section: 'INTÉGRITÉ TONTINES',
    test: '8.4 Doublons idempotency_key contributions tontine',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT idempotency_key, COUNT(*) as nb, ARRAY_AGG(id) as contribution_ids
      FROM contributions_tontine
      WHERE idempotency_key IS NOT NULL
        AND deleted_at IS NULL
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1;
    `
  },
  {
    section: 'INTÉGRITÉ TONTINES',
    test: '8.5 Cycles OPEN avec pot distribué > pot collecté',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, tontine_id, cycle_number, status,
        pot_collected::numeric, pot_distributed::numeric,
        pot_distributed::numeric - pot_collected::numeric as ecart
      FROM tontine_cycles
      WHERE status = 'OPEN'
        AND pot_distributed::numeric > pot_collected::numeric + 0.01;
    `
  },

  // SECTION 9: NOTIFICATION JOBS
  {
    section: 'NOTIFICATION JOBS',
    test: '9.1 Jobs bloqués en PROCESSING depuis > 10 min',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT
        id, channel, template_code, recipient, status,
        attempts, locked_at,
        EXTRACT(EPOCH FROM (NOW() - locked_at))/60 as minutes_bloque
      FROM notification_jobs
      WHERE status = 'PROCESSING'
        AND locked_at IS NOT NULL
        AND locked_at < NOW() - INTERVAL '10 minutes';
    `
  },
  {
    section: 'NOTIFICATION JOBS',
    test: '9.2 Jobs en DEAD_LETTER non traités',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT
        id, channel, template_code, recipient,
        attempts, max_attempts, last_error,
        created_at
      FROM notification_jobs
      WHERE status = 'DEAD_LETTER'
      ORDER BY created_at DESC;
    `
  },
  {
    section: 'NOTIFICATION JOBS',
    test: '9.3 Jobs QUEUED depuis > 1 heure (pipeline bloqué)',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT
        id, channel, template_code, recipient, status,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_attente
      FROM notification_jobs
      WHERE status = 'QUEUED'
        AND created_at < NOW() - INTERVAL '1 hour';
    `
  },

  // SECTION 10: TRANSFERTS
  {
    section: 'INTÉGRITÉ TRANSFERTS',
    test: '10.1 Transferts POSTED sans mouvement financier associé',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT t.id, t.reference, t.montant, t.statut, t.mouvement_id
      FROM transferts t
      LEFT JOIN mouvements_financiers mf ON t.mouvement_id = mf.id
      WHERE t.statut = 'POSTED'
        AND t.mouvement_id IS NOT NULL
        AND mf.id IS NULL;
    `
  },
  {
    section: 'INTÉGRITÉ TRANSFERTS',
    test: '10.2 Doublons idempotency_key transferts',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT idempotency_key, COUNT(*) as nb, ARRAY_AGG(id) as transfert_ids
      FROM transferts
      WHERE idempotency_key IS NOT NULL
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1;
    `
  },
  {
    section: 'INTÉGRITÉ TRANSFERTS',
    test: '10.3 Transferts PENDING depuis > 24h',
    expectedRowCount: 0,
    critical: false,
    query: `
      SELECT id, reference, montant, statut, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as heures_attente
      FROM transferts
      WHERE statut = 'PENDING'
        AND created_at < NOW() - INTERVAL '24 hours';
    `
  },
  {
    section: 'INTÉGRITÉ TRANSFERTS',
    test: '10.4 Transferts avec montant <= 0',
    expectedRowCount: 0,
    critical: true,
    query: `
      SELECT id, reference, montant, statut, client_id
      FROM transferts
      WHERE montant::numeric <= 0;
    `
  },
];

// ============================================================
// EXÉCUTION
// ============================================================

async function executeAudit(): Promise<AuditReport> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL non définie');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const report: AuditReport = {
    timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    totalTests: AUDIT_TESTS.length,
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
    criticalIssues: [],
  };

  console.log('\n🔍 AUDIT D\'INTÉGRITÉ CORE BANKING - DÉMARRAGE\n');
  console.log(`📅 ${report.timestamp}`);
  console.log(`📊 ${AUDIT_TESTS.length} tests à exécuter\n`);
  console.log('═'.repeat(80));

  try {
    for (const test of AUDIT_TESTS) {
      const startTime = Date.now();
      
      try {
        const result = await pool.query(test.query);
        const executionTime = Date.now() - startTime;
        const rowCount = result.rows.length;
        
        const status: 'PASS' | 'FAIL' | 'WARNING' = 
          rowCount === test.expectedRowCount 
            ? 'PASS' 
            : test.critical 
              ? 'FAIL' 
              : 'WARNING';

        const auditResult: AuditResult = {
          section: test.section,
          test: test.test,
          query: test.query.trim(),
          status,
          rowCount,
          expectedRowCount: test.expectedRowCount,
          anomalies: rowCount > 0 ? result.rows : undefined,
          executionTime,
        };

        report.results.push(auditResult);

        if (status === 'PASS') {
          report.passed++;
          console.log(`✅ ${test.test} (${executionTime}ms)`);
        } else if (status === 'FAIL') {
          report.failed++;
          console.log(`❌ ${test.test}`);
          console.log(`   ANOMALIES DÉTECTÉES: ${rowCount} lignes`);
          console.log(`   Échantillon:`, JSON.stringify(result.rows.slice(0, 3), null, 2));
          report.criticalIssues.push(`${test.test}: ${rowCount} anomalies détectées`);
        } else {
          report.warnings++;
          console.log(`⚠️  ${test.test} - ${rowCount} lignes à vérifier`);
        }

      } catch (error: any) {
        console.log(`🔥 ERREUR: ${test.test}`);
        console.error(`   ${error.message}`);
        report.failed++;
        report.criticalIssues.push(`${test.test}: Erreur d'exécution - ${error.message}`);
      }
    }

  } finally {
    await pool.end();
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📋 RÉSUMÉ AUDIT\n');
  console.log(`✅ Tests réussis:   ${report.passed}/${report.totalTests}`);
  console.log(`❌ Tests échoués:   ${report.failed}/${report.totalTests}`);
  console.log(`⚠️  Avertissements: ${report.warnings}/${report.totalTests}`);

  if (report.criticalIssues.length > 0) {
    console.log('\n🚨 PROBLÈMES CRITIQUES:\n');
    report.criticalIssues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }

  return report;
}

// ============================================================
// SAUVEGARDE RAPPORT
// ============================================================

async function saveReport(report: AuditReport) {
  const reportsDir = path.join(process.cwd(), 'logs', 'audit-reports');
  await fs.mkdir(reportsDir, { recursive: true });

  const filename = `audit-integrity-${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.json`;
  const filepath = path.join(reportsDir, filename);

  await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n💾 Rapport sauvegardé: ${filepath}\n`);

  return filepath;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    const report = await executeAudit();
    await saveReport(report);

    // Code de sortie selon les résultats
    if (report.failed > 0) {
      console.log('🔴 AUDIT ÉCHOUÉ - Des anomalies critiques ont été détectées\n');
      process.exit(1);
    } else if (report.warnings > 0) {
      console.log('🟡 AUDIT AVEC AVERTISSEMENTS - Vérifications manuelles recommandées\n');
      process.exit(0);
    } else {
      console.log('🟢 AUDIT RÉUSSI - Aucune anomalie détectée\n');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('💥 ERREUR FATALE:', error.message);
    process.exit(1);
  }
}

main();
