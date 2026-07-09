#!/usr/bin/env tsx
/**
 * Script de Monitoring Automatisé - Mode GL Strict
 *
 * Ce script vérifie l'intégrité du système en mode STRICT:
 * - Balance discrepancies (écarts de solde)
 * - Accounting rules completeness (règles comptables)
 * - GL posting errors (erreurs GL dans les logs)
 * - Failed movements (mouvements échoués)
 *
 * Usage:
 *   npm run monitor:gl          # Monitoring standard
 *   npm run monitor:gl:alert    # Avec alertes (exit code 1 si problème)
 */

import { db } from '../apps/api/db.ts';
import {
  coffresForts,
  caisses,
  mouvementsFinanciers,
  lignesEcritures,
  planComptable,
  accountingRules
} from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const ALERT_MODE = process.argv.includes('--alert');
const REPORT_DIR = path.join(process.cwd(), 'logs', 'gl-monitoring');
const MAX_BALANCE_DISCREPANCY = 100; // FCFA - seuil d'alerte
const LOG_FILE = path.join(process.cwd(), 'logs', 'app-current.log');

interface MonitoringResult {
  timestamp: string;
  glMode: string;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  issues: string[];
  metrics: {
    balanceDiscrepancy: {
      coffres: number;
      caisses: number;
    };
    accountingRules: {
      required: number;
      present: number;
      missing: string[];
    };
    movements: {
      failedLast24h: number;
      pendingGlPosting: number;
    };
    logErrors: {
      glPostingFailures: number;
      missingRulesErrors: number;
    };
  };
}

// Créer le répertoire de rapports si nécessaire
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function checkBalanceDiscrepancies() {
  console.log('📊 Vérification des écarts de balance...');

  // Coffres
  const coffres = await db.select().from(coffresForts);
  let totalSoldeOpCoffres = 0;
  for (const coffre of coffres) {
    totalSoldeOpCoffres += Number(coffre.solde || 0);
  }

  const [glBalanceCoffres] = await db.select({
    balance: sql<number>`COALESCE(SUM(
      CAST(${lignesEcritures.debit} AS DECIMAL) - CAST(${lignesEcritures.credit} AS DECIMAL)
    ), 0)`
  })
  .from(lignesEcritures)
  .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
  .where(eq(planComptable.numeroCompte, '531'));

  const soldeGLCoffres = Number(glBalanceCoffres?.balance || 0);
  const ecartCoffres = totalSoldeOpCoffres - soldeGLCoffres;

  // Caisses
  const allCaisses = await db.select().from(caisses);
  let totalSoldeOpCaisses = 0;
  for (const caisse of allCaisses) {
    totalSoldeOpCaisses += Number(caisse.solde || 0);
  }

  const [glBalanceCaisses] = await db.select({
    balance: sql<number>`COALESCE(SUM(
      CAST(${lignesEcritures.debit} AS DECIMAL) - CAST(${lignesEcritures.credit} AS DECIMAL)
    ), 0)`
  })
  .from(lignesEcritures)
  .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
  .where(eq(planComptable.numeroCompte, '521'));

  const soldeGLCaisses = Number(glBalanceCaisses?.balance || 0);
  const ecartCaisses = totalSoldeOpCaisses - soldeGLCaisses;

  console.log(`   Coffres: ${ecartCoffres.toLocaleString()} FCFA ${Math.abs(ecartCoffres) > MAX_BALANCE_DISCREPANCY ? '⚠️' : '✓'}`);
  console.log(`   Caisses: ${ecartCaisses.toLocaleString()} FCFA ${Math.abs(ecartCaisses) > MAX_BALANCE_DISCREPANCY ? '⚠️' : '✓'}`);

  return { coffres: ecartCoffres, caisses: ecartCaisses };
}

async function checkAccountingRules() {
  console.log('📋 Vérification des règles comptables...');

  // Liste des types d'événements requis (synchronisée avec verify-accounting-rules-completeness.ts)
  const REQUIRED_EVENT_TYPES = [
    'COFFRE_TO_CAISSE', 'CAISSE_TO_COFFRE',
    'DEPOSIT_SAVINGS', 'WITHDRAWAL_SAVINGS',
    'DEPOSIT_CURRENT', 'WITHDRAWAL_CURRENT',
    'DEPOSIT_BLOCKED', 'WITHDRAWAL_BLOCKED',
    'CREDIT_DISBURSEMENT', 'CREDIT_REPAYMENT',
    'CREDIT_REPAYMENT_INTEREST', 'CREDIT_REPAYMENT_PENALTY',
    'CREDIT_FEE', 'TONTINE_CONTRIBUTION', 'TONTINE_DISTRIBUTION',
    'TONTINE_PENALTY', 'INTERNAL_TRANSFER',
    'COFFRE_TRANSIT_OUT', 'COFFRE_TRANSIT_IN',
    'SESSION_DEFICIT', 'SESSION_SURPLUS',
    'PAYROLL_ENGAGEMENT', 'PAYROLL_PAYMENT',
    'COLLECT_CASH', 'SETTLEMENT_CASH', 'SAFE_SUPPLY',
    'INITIAL_DEPOSIT', 'TRANSFER_OUT', 'TRANSFER_IN',
    'RESTITUTION', 'OPERATOR_FEE', 'ENGAGEMENT_FEE',
    'MISC_COLLECTION', 'CASH_TRANSFER',
    'ENTREE_COFFRE', 'SORTIE_COFFRE',
  ];

  const rules = await db
    .select()
    .from(accountingRules)
    .where(eq(accountingRules.active, true));

  const rulesByEvent = rules.reduce((acc, rule) => {
    if (!acc[rule.eventType]) {
      acc[rule.eventType] = [];
    }
    acc[rule.eventType].push(rule);
    return acc;
  }, {} as Record<string, typeof rules>);

  const missingRules: string[] = [];
  for (const eventType of REQUIRED_EVENT_TYPES) {
    if (!rulesByEvent[eventType] || rulesByEvent[eventType].length === 0) {
      missingRules.push(eventType);
    }
  }

  console.log(`   Règles présentes: ${REQUIRED_EVENT_TYPES.length - missingRules.length}/${REQUIRED_EVENT_TYPES.length} ${missingRules.length === 0 ? '✓' : '⚠️'}`);
  if (missingRules.length > 0) {
    console.log(`   Règles manquantes: ${missingRules.join(', ')}`);
  }

  return {
    required: REQUIRED_EVENT_TYPES.length,
    present: REQUIRED_EVENT_TYPES.length - missingRules.length,
    missing: missingRules
  };
}

async function checkMovementsStatus() {
  console.log('💸 Vérification des mouvements...');

  // Mouvements échoués dans les dernières 24h
  const [failedCount] = await db.select({
    count: sql<number>`COUNT(*)`
  })
  .from(mouvementsFinanciers)
  .where(and(
    sql`${mouvementsFinanciers.glPostingStatus} = 'FAILED'`,
    sql`${mouvementsFinanciers.dateOperation} > NOW() - INTERVAL '24 hours'`
  ));

  // Mouvements en attente de GL posting
  const [pendingCount] = await db.select({
    count: sql<number>`COUNT(*)`
  })
  .from(mouvementsFinanciers)
  .where(eq(mouvementsFinanciers.glPostingStatus, 'PENDING'));

  const failed = Number(failedCount?.count || 0);
  const pending = Number(pendingCount?.count || 0);

  console.log(`   Mouvements échoués (24h): ${failed} ${failed > 0 ? '⚠️' : '✓'}`);
  console.log(`   Mouvements en attente GL: ${pending} ${pending > 0 ? '⚠️' : '✓'}`);

  return { failedLast24h: failed, pendingGlPosting: pending };
}

async function checkLogErrors() {
  console.log('📝 Analyse des logs...');

  if (!fs.existsSync(LOG_FILE)) {
    console.log('   ⚠️ Fichier de log introuvable');
    return { glPostingFailures: 0, missingRulesErrors: 0 };
  }

  const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
  const last24hLines = logContent.split('\n').slice(-10000); // Dernières 10k lignes

  let glPostingFailures = 0;
  let missingRulesErrors = 0;

  for (const line of last24hLines) {
    if (line.includes('GL posting failed') || line.includes('GL failed')) {
      glPostingFailures++;
    }
    if (line.includes('Règle comptable manquante') || line.includes('AccountingRuleNotFoundError')) {
      missingRulesErrors++;
    }
  }

  console.log(`   Erreurs GL posting: ${glPostingFailures} ${glPostingFailures > 0 ? '⚠️' : '✓'}`);
  console.log(`   Erreurs règles manquantes: ${missingRulesErrors} ${missingRulesErrors > 0 ? '⚠️' : '✓'}`);

  return { glPostingFailures, missingRulesErrors };
}

function determineStatus(result: MonitoringResult): 'OK' | 'WARNING' | 'CRITICAL' {
  const issues = result.issues;

  // CRITICAL: Règles manquantes OU écarts importants
  if (result.metrics.accountingRules.missing.length > 0) {
    return 'CRITICAL';
  }

  if (Math.abs(result.metrics.balanceDiscrepancy.coffres) > MAX_BALANCE_DISCREPANCY ||
      Math.abs(result.metrics.balanceDiscrepancy.caisses) > MAX_BALANCE_DISCREPANCY) {
    return 'CRITICAL';
  }

  // WARNING: Erreurs récentes
  if (result.metrics.movements.failedLast24h > 0 ||
      result.metrics.logErrors.glPostingFailures > 0 ||
      result.metrics.logErrors.missingRulesErrors > 0) {
    return 'WARNING';
  }

  return 'OK';
}

function generateReport(result: MonitoringResult) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(REPORT_DIR, `monitor-${timestamp}.json`);

  fs.writeFileSync(reportFile, JSON.stringify(result, null, 2));
  console.log(`\n📄 Rapport sauvegardé: ${reportFile}`);

  // Garder uniquement les 30 derniers rapports
  const reports = fs.readdirSync(REPORT_DIR)
    .filter(f => f.startsWith('monitor-'))
    .sort()
    .reverse();

  if (reports.length > 30) {
    for (const oldReport of reports.slice(30)) {
      fs.unlinkSync(path.join(REPORT_DIR, oldReport));
    }
  }
}

async function runMonitoring() {
  console.log('=== MONITORING GL STRICT MODE ===');
  console.log(`Mode: ${process.env.GL_POSTING_MODE || 'LENIENT'}`);
  console.log(`Date: ${new Date().toLocaleString('fr-FR')}\n`);

  const result: MonitoringResult = {
    timestamp: new Date().toISOString(),
    glMode: process.env.GL_POSTING_MODE || 'LENIENT',
    status: 'OK',
    issues: [],
    metrics: {
      balanceDiscrepancy: { coffres: 0, caisses: 0 },
      accountingRules: { required: 0, present: 0, missing: [] },
      movements: { failedLast24h: 0, pendingGlPosting: 0 },
      logErrors: { glPostingFailures: 0, missingRulesErrors: 0 }
    }
  };

  try {
    // 1. Balance discrepancies
    result.metrics.balanceDiscrepancy = await checkBalanceDiscrepancies();
    if (Math.abs(result.metrics.balanceDiscrepancy.coffres) > MAX_BALANCE_DISCREPANCY) {
      result.issues.push(`Écart coffres: ${result.metrics.balanceDiscrepancy.coffres.toLocaleString()} FCFA`);
    }
    if (Math.abs(result.metrics.balanceDiscrepancy.caisses) > MAX_BALANCE_DISCREPANCY) {
      result.issues.push(`Écart caisses: ${result.metrics.balanceDiscrepancy.caisses.toLocaleString()} FCFA`);
    }

    // 2. Accounting rules
    result.metrics.accountingRules = await checkAccountingRules();
    if (result.metrics.accountingRules.missing.length > 0) {
      result.issues.push(`Règles manquantes: ${result.metrics.accountingRules.missing.join(', ')}`);
    }

    // 3. Movements status
    result.metrics.movements = await checkMovementsStatus();
    if (result.metrics.movements.failedLast24h > 0) {
      result.issues.push(`${result.metrics.movements.failedLast24h} mouvements échoués (24h)`);
    }
    if (result.metrics.movements.pendingGlPosting > 0) {
      result.issues.push(`${result.metrics.movements.pendingGlPosting} mouvements en attente GL`);
    }

    // 4. Log errors
    result.metrics.logErrors = await checkLogErrors();
    if (result.metrics.logErrors.glPostingFailures > 0) {
      result.issues.push(`${result.metrics.logErrors.glPostingFailures} erreurs GL dans logs`);
    }
    if (result.metrics.logErrors.missingRulesErrors > 0) {
      result.issues.push(`${result.metrics.logErrors.missingRulesErrors} erreurs règles manquantes dans logs`);
    }

    // Déterminer le statut global
    result.status = determineStatus(result);

    // Afficher le résumé
    console.log('\n=== RÉSUMÉ ===');
    console.log(`Statut: ${result.status === 'OK' ? '✅ OK' : result.status === 'WARNING' ? '⚠️ WARNING' : '❌ CRITICAL'}`);

    if (result.issues.length > 0) {
      console.log('\nProblèmes détectés:');
      result.issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('✅ Aucun problème détecté');
    }

    // Sauvegarder le rapport
    generateReport(result);

    // En mode alerte, exit avec code d'erreur si problèmes
    if (ALERT_MODE && result.status !== 'OK') {
      console.log('\n🚨 ALERTE: Problèmes détectés en mode alerte!');
      process.exit(1);
    }

    console.log('\n=== FIN DU MONITORING ===');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur durant le monitoring:', error);
    result.status = 'CRITICAL';
    result.issues.push(`Erreur système: ${error instanceof Error ? error.message : 'Unknown'}`);
    generateReport(result);
    process.exit(1);
  }
}

runMonitoring();
