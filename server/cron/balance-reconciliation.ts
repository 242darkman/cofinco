/**
 * Balance Reconciliation Cron Job
 *
 * Exécute la réconciliation complète des soldes financiers
 * et envoie des alertes en cas de divergences critiques.
 *
 * Fonctionnalités:
 * - Réconciliation planifiée (par défaut toutes les heures)
 * - Détection des écarts (MINOR, MAJOR, CRITICAL)
 * - Alertes WebSocket pour les écarts critiques
 * - Logs structurés pour monitoring et audit
 * - Auto-correction optionnelle des écarts mineurs
 */

import cron from "node-cron";
import { balanceService } from "../services/balance-service";
import type { ReconciliationReport, ReconciliationResult } from "@shared/types/balances";
import { getWsInstance } from "../ws-server";

// Configuration
const RECONCILIATION_INTERVAL = process.env.BALANCE_RECONCILIATION_INTERVAL_MINUTES || "60";
const ENABLE_AUTO_CORRECTION = process.env.ENABLE_BALANCE_AUTO_CORRECTION === "true";
const ALERT_ON_MAJOR = process.env.ALERT_ON_MAJOR_DISCREPANCY !== "false";

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let isRunning = false;

// ============================================
// STRUCTURED LOGGING
// ============================================

interface ReconciliationLogEntry {
  timestamp: string;
  runId: string;
  phase: "start" | "processing" | "alert" | "complete" | "error";
  durationMs?: number;
  summary?: ReconciliationReport["summary"];
  error?: string;
}

function logReconciliation(entry: ReconciliationLogEntry): void {
  const level = entry.phase === "error" ? "error" : entry.phase === "alert" ? "warn" : "info";
  console[level](`[Balance Reconciliation]`, entry);
}

// ============================================
// ALERTING
// ============================================

interface BalanceAlert {
  type: "BALANCE_DISCREPANCY";
  severity: "OK" | "MINOR" | "MAJOR" | "CRITICAL";
  entityType: string;
  entityId: string;
  persistedBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  percentage: number;
  timestamp: string;
  runId: string;
}

/**
 * Envoie une alerte WebSocket pour une divergence critique
 */
async function sendDiscrepancyAlert(result: ReconciliationResult, runId: string): Promise<void> {
  const alert: BalanceAlert = {
    type: "BALANCE_DISCREPANCY",
    severity: result.severity,
    entityType: result.entityType,
    entityId: result.entityId,
    persistedBalance: result.persistedBalance,
    calculatedBalance: result.calculatedBalance,
    discrepancy: result.discrepancy,
    percentage: result.persistedBalance !== 0 ? Math.abs(result.discrepancy / result.persistedBalance) * 100 : 0,
    timestamp: new Date().toISOString(),
    runId,
  };

  // Broadcast via WebSocket global (les admins/superviseurs filtreront côté client)
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "BALANCE_ALERT",
      payload: alert,
    });
  }

  logReconciliation({
    timestamp: new Date().toISOString(),
    runId,
    phase: "alert",
    error: `${result.severity} discrepancy: ${result.entityType}/${result.entityId} - ${result.discrepancy} FCFA`,
  });
}

// ============================================
// AUTO-CORRECTION (Optionnel)
// ============================================

/**
 * Corrige automatiquement les écarts mineurs
 * ATTENTION: À utiliser avec précaution
 */
async function autoCorrectMinorDiscrepancy(result: ReconciliationResult): Promise<boolean> {
  if (!ENABLE_AUTO_CORRECTION) {
    return false;
  }

  if (result.severity !== "MINOR") {
    return false; // Seulement les écarts mineurs
  }

  try {
    // Log l'action avant correction
    console.log(`[Balance Reconciliation] Auto-correcting ${result.entityType}/${result.entityId}:`, {
      before: result.persistedBalance,
      after: result.calculatedBalance,
      diff: result.discrepancy,
    });

    // La correction dépend du type d'entité
    // Pour l'instant, on log seulement - la correction réelle serait implémentée
    // selon les règles métier spécifiques

    // TODO: Implémenter la correction réelle si nécessaire
    // await balanceService.forceCorrectBalance(result.entityType, result.entityId, result.calculatedBalance);

    return true;
  } catch (error) {
    console.error(`[Balance Reconciliation] Auto-correction failed:`, error);
    return false;
  }
}

// ============================================
// MAIN RECONCILIATION JOB
// ============================================

/**
 * Exécute la réconciliation complète des soldes
 */
async function runBalanceReconciliation(): Promise<void> {
  if (isRunning) {
    logReconciliation({
      timestamp: new Date().toISOString(),
      runId: "skipped",
      phase: "start",
      error: "Previous run still in progress",
    });
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  let runId = "";

  try {
    logReconciliation({
      timestamp: new Date().toISOString(),
      runId: "pending",
      phase: "start",
    });

    // Lancer la réconciliation complète
    const report = await balanceService.runFullReconciliation();
    runId = report.runId;

    logReconciliation({
      timestamp: new Date().toISOString(),
      runId,
      phase: "processing",
      summary: report.summary,
    });

    // Traiter les divergences
    for (const discrepancy of report.discrepancies) {
      // Alerter pour les écarts MAJOR et CRITICAL
      if (discrepancy.severity === "CRITICAL") {
        await sendDiscrepancyAlert(discrepancy, runId);
      } else if (discrepancy.severity === "MAJOR" && ALERT_ON_MAJOR) {
        await sendDiscrepancyAlert(discrepancy, runId);
      } else if (discrepancy.severity === "MINOR") {
        // Tenter une auto-correction pour les écarts mineurs
        await autoCorrectMinorDiscrepancy(discrepancy);
      }
    }

    // Broadcast le résumé de réconciliation (global - les admins filtreront côté client)
    const ws = getWsInstance();
    if (ws) {
      ws.broadcast({
        type: "RECONCILIATION_COMPLETE",
        payload: {
          runId: report.runId,
          timestamp: report.completedAt?.toISOString() ?? new Date().toISOString(),
          totalEntities: report.totalEntities,
          summary: report.summary,
          durationMs: Date.now() - startTime,
        },
      });
    }

    logReconciliation({
      timestamp: new Date().toISOString(),
      runId,
      phase: "complete",
      durationMs: Date.now() - startTime,
      summary: report.summary,
    });

  } catch (error) {
    logReconciliation({
      timestamp: new Date().toISOString(),
      runId: runId || "error",
      phase: "error",
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Alerter en cas d'erreur du job lui-même
    const ws = getWsInstance();
    if (ws) {
      ws.broadcast({
        type: "RECONCILIATION_ERROR",
        payload: {
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  } finally {
    isRunning = false;
  }
}

// ============================================
// CRON MANAGEMENT
// ============================================

/**
 * Démarre le cron job de réconciliation des soldes
 */
export function startBalanceReconciliationCron(): void {
  if (cronJob) {
    console.log("[Balance Reconciliation] Cron already running");
    return;
  }

  // Exécuter toutes les X minutes (par défaut: toutes les heures)
  const cronExpression = `0 */${RECONCILIATION_INTERVAL} * * *`;

  // Pour les intervalles < 60 minutes, ajuster l'expression
  const intervalMinutes = parseInt(RECONCILIATION_INTERVAL, 10);
  const expression = intervalMinutes >= 60
    ? `0 0 */${Math.floor(intervalMinutes / 60)} * * *` // Toutes les X heures
    : `*/${intervalMinutes} * * * *`; // Toutes les X minutes

  cronJob = cron.schedule(expression, async () => {
    await runBalanceReconciliation();
  });

  console.log(`[Balance Reconciliation] Cron job started (every ${RECONCILIATION_INTERVAL} minutes)`);

  // Exécuter immédiatement au démarrage en mode développement
  if (process.env.NODE_ENV === "development") {
    setTimeout(() => runBalanceReconciliation(), 5000);
  }
}

/**
 * Arrête le cron job
 */
export function stopBalanceReconciliationCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("[Balance Reconciliation] Cron job stopped");
  }
}

/**
 * Force une exécution immédiate de la réconciliation
 * Utile pour les tests ou les interventions manuelles
 */
export async function runReconciliationNow(): Promise<ReconciliationReport> {
  console.log("[Balance Reconciliation] Manual run triggered");
  await runBalanceReconciliation();

  // Retourner le dernier rapport
  return balanceService.runFullReconciliation();
}

/**
 * Vérifie si le cron est en cours d'exécution
 */
export function isReconciliationRunning(): boolean {
  return isRunning;
}

export default {
  startBalanceReconciliationCron,
  stopBalanceReconciliationCron,
  runReconciliationNow,
  isReconciliationRunning,
};
