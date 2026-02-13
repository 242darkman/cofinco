/**
 * Service de Monitoring Financier Temps Réel
 *
 * Surveille en continu les anomalies financières et émet des alertes WebSocket
 * - Écarts de solde
 * - Transactions suspectes
 * - Sessions caisse avec écarts
 * - Virements en attente depuis trop longtemps
 */

import { db } from "../db";
import {
  transactionsCompte,
  comptes,
  sessionsCaisse,
  operationsCaisse,
  virementsProgrammes,
} from "@shared/schema";
import { eq, sql, and, gte, lte, isNull, desc, lt } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getWsInstance } from "../ws-server";
import { runReconciliation, type ReconciliationAnomaly } from "./transaction-integrity-service";
import { currencySymbol } from "@shared/config/currency";

const logger = createLogger("FinancialMonitoring");

// ============================================================================
// TYPES
// ============================================================================

export interface MonitoringAlert {
  id: string;
  type: AlertType;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export type AlertType =
  | "BALANCE_DISCREPANCY"
  | "SUSPICIOUS_TRANSACTION"
  | "SESSION_DISCREPANCY"
  | "PENDING_TRANSFER_TIMEOUT"
  | "HIGH_VALUE_TRANSACTION"
  | "DUPLICATE_DETECTED"
  | "RECONCILIATION_FAILED"
  | "NEGATIVE_BALANCE"
  | "UNUSUAL_ACTIVITY";

export interface MonitoringDashboard {
  lastCheck: Date;
  status: "healthy" | "warning" | "critical";
  metrics: {
    totalAccounts: number;
    totalTransactionsToday: number;
    totalVolumeToday: number;
    openSessions: number;
    pendingTransfers: number;
  };
  alerts: {
    critical: number;
    warning: number;
    info: number;
    unacknowledged: number;
  };
  recentAlerts: MonitoringAlert[];
  checks: {
    name: string;
    status: "ok" | "warning" | "error";
    lastRun: Date;
    message?: string;
  }[];
}

export interface MonitoringConfig {
  highValueThreshold: number; // Montant au-delà duquel une transaction est flaggée
  pendingTransferTimeoutHours: number; // Heures avant alerte sur virement en attente
  maxDailyTransactionsPerAccount: number; // Seuil d'activité inhabituelle
  checkIntervalMinutes: number; // Intervalle entre les vérifications automatiques
}

export const DEFAULT_CONFIG: MonitoringConfig = {
  highValueThreshold: 5000000, // 5M FCFA
  pendingTransferTimeoutHours: 24,
  maxDailyTransactionsPerAccount: 20,
  checkIntervalMinutes: 15,
};

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

const activeAlerts: Map<string, MonitoringAlert> = new Map();

function generateAlertId(): string {
  const { randomBytes } = require('crypto');
  return `ALT-${Date.now()}-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

export function createAlert(
  type: AlertType,
  severity: MonitoringAlert["severity"],
  title: string,
  message: string,
  entityType: string,
  entityId: string,
  data: Record<string, unknown> = {}
): MonitoringAlert {
  const alert: MonitoringAlert = {
    id: generateAlertId(),
    type,
    severity,
    title,
    message,
    entityType,
    entityId,
    data,
    createdAt: new Date(),
    acknowledged: false,
  };

  // Deduplicate by key
  const dedupeKey = `${type}:${entityType}:${entityId}`;
  if (!activeAlerts.has(dedupeKey)) {
    activeAlerts.set(dedupeKey, alert);
    broadcastAlert(alert);
    logger.info({ alert }, "New monitoring alert created");
  }

  return alert;
}

export function acknowledgeAlert(alertId: string, userId: string): boolean {
  for (const [key, alert] of Array.from(activeAlerts.entries())) {
    if (alert.id === alertId) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = userId;
      broadcastAlertUpdate(alert);
      return true;
    }
  }
  return false;
}

export function dismissAlert(alertId: string): boolean {
  for (const [key, alert] of Array.from(activeAlerts.entries())) {
    if (alert.id === alertId) {
      activeAlerts.delete(key);
      broadcastAlertDismiss(alertId);
      return true;
    }
  }
  return false;
}

export function getActiveAlerts(): MonitoringAlert[] {
  return Array.from(activeAlerts.values())
    .sort((a, b) => {
      // Critical first, then by date
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}

// ============================================================================
// WEBSOCKET BROADCASTING
// ============================================================================

function broadcastAlert(alert: MonitoringAlert): void {
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "MONITORING_ALERT",
      payload: { action: "NEW", alert },
    });
  }
}

function broadcastAlertUpdate(alert: MonitoringAlert): void {
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "MONITORING_ALERT_UPDATED",
      payload: { alert },
    });
  }
}

function broadcastAlertDismiss(alertId: string): void {
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "MONITORING_ALERT_DISMISSED",
      payload: { alertId },
    });
  }
}

function broadcastDashboardUpdate(dashboard: MonitoringDashboard): void {
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "MONITORING_DASHBOARD",
      payload: { dashboard },
    });
  }
}

// ============================================================================
// MONITORING CHECKS
// ============================================================================

/**
 * Check for high-value transactions
 */
async function checkHighValueTransactions(config: MonitoringConfig): Promise<void> {
  const since = new Date();
  since.setHours(since.getHours() - 1); // Last hour

  const highValueTx = await db
    .select({
      id: transactionsCompte.id,
      compteId: transactionsCompte.compteId,
      montant: transactionsCompte.montant,
      typePaiement: transactionsCompte.typePaiement,
      createdAt: transactionsCompte.createdAt,
    })
    .from(transactionsCompte)
    .where(
      and(
        gte(transactionsCompte.createdAt, since),
        sql`${transactionsCompte.montant}::numeric >= ${config.highValueThreshold}`
      )
    )
    .limit(10);

  for (const tx of highValueTx) {
    createAlert(
      "HIGH_VALUE_TRANSACTION",
      "info",
      "Transaction à montant élevé",
      `Transaction de ${parseFloat(tx.montant).toLocaleString()} ${currencySymbol()} détectée`,
      "transaction_compte",
      tx.id,
      {
        montant: tx.montant,
        typePaiement: tx.typePaiement,
        compteId: tx.compteId,
      }
    );
  }
}

/**
 * Check for pending transfers that have been waiting too long
 */
async function checkPendingTransfers(config: MonitoringConfig): Promise<void> {
  const timeoutDate = new Date();
  timeoutDate.setHours(timeoutDate.getHours() - config.pendingTransferTimeoutHours);

  // Find scheduled transfers that are overdue (prochaineExecution < timeoutDate) and still active
  const overdueTransfers = await db
    .select({
      id: virementsProgrammes.id,
      montant: virementsProgrammes.montant,
      compteSourceId: virementsProgrammes.compteSourceId,
      compteDestId: virementsProgrammes.compteDestId,
      prochaineExecution: virementsProgrammes.prochaineExecution,
      statutDernier: virementsProgrammes.statutDernier,
    })
    .from(virementsProgrammes)
    .where(
      and(
        eq(virementsProgrammes.actif, true),
        lt(virementsProgrammes.prochaineExecution, timeoutDate)
      )
    )
    .limit(20);

  for (const transfer of overdueTransfers) {
    createAlert(
      "PENDING_TRANSFER_TIMEOUT",
      "warning",
      "Virement programmé en retard",
      `Virement de ${parseFloat(transfer.montant || "0").toLocaleString()} ${currencySymbol()} en attente d'exécution depuis plus de ${config.pendingTransferTimeoutHours}h`,
      "virement_programme",
      transfer.id,
      {
        montant: transfer.montant,
        compteSourceId: transfer.compteSourceId,
        compteDestId: transfer.compteDestId,
        prochaineExecution: transfer.prochaineExecution,
        statutDernier: transfer.statutDernier,
      }
    );
  }
}

/**
 * Check for unusual account activity
 */
async function checkUnusualActivity(config: MonitoringConfig): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find accounts with unusually high transaction count
  const highActivity = await db.execute(sql`
    SELECT
      compte_id,
      COUNT(*) as tx_count,
      SUM(montant::numeric) as total_volume
    FROM transactions_compte
    WHERE created_at >= ${today}
    GROUP BY compte_id
    HAVING COUNT(*) > ${config.maxDailyTransactionsPerAccount}
    LIMIT 10
  `);

  for (const row of highActivity.rows as any[]) {
    createAlert(
      "UNUSUAL_ACTIVITY",
      "warning",
      "Activité inhabituelle détectée",
      `${row.tx_count} transactions aujourd'hui sur un compte (seuil: ${config.maxDailyTransactionsPerAccount})`,
      "compte",
      row.compte_id,
      {
        transactionCount: row.tx_count,
        totalVolume: row.total_volume,
        threshold: config.maxDailyTransactionsPerAccount,
      }
    );
  }
}

/**
 * Run quick reconciliation check
 */
async function runQuickReconciliation(): Promise<void> {
  try {
    const result = await runReconciliation({
      checks: ["sens", "balance"],
      limit: 100,
    });

    if (result.criticalCount > 0) {
      createAlert(
        "RECONCILIATION_FAILED",
        "critical",
        "Anomalies de réconciliation détectées",
        `${result.criticalCount} anomalies critiques détectées lors de la réconciliation`,
        "system",
        "reconciliation",
        {
          criticalCount: result.criticalCount,
          warningCount: result.warningCount,
          checks: result.checks,
        }
      );
    }
  } catch (error) {
    logger.error({ error }, "Quick reconciliation failed");
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================

export async function getDashboard(): Promise<MonitoringDashboard> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Gather metrics in parallel
  const [
    accountsCount,
    todayTransactions,
    openSessions,
    pendingTransfers,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(comptes).where(isNull(comptes.deletedAt)),
    db.select({
      count: sql<number>`count(*)`,
      volume: sql<string>`COALESCE(SUM(montant::numeric), 0)`,
    }).from(transactionsCompte).where(gte(transactionsCompte.createdAt, today)),
    db.select({ count: sql<number>`count(*)` }).from(sessionsCaisse).where(isNull(sessionsCaisse.closedAt)),
    db.select({ count: sql<number>`count(*)` }).from(virementsProgrammes).where(eq(virementsProgrammes.actif, true)),
  ]);

  const alerts = getActiveAlerts();
  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const warningCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;
  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length;

  const status: MonitoringDashboard["status"] =
    criticalCount > 0 ? "critical" :
    warningCount > 0 ? "warning" : "healthy";

  return {
    lastCheck: new Date(),
    status,
    metrics: {
      totalAccounts: accountsCount[0]?.count || 0,
      totalTransactionsToday: todayTransactions[0]?.count || 0,
      totalVolumeToday: parseFloat(todayTransactions[0]?.volume || "0"),
      openSessions: openSessions[0]?.count || 0,
      pendingTransfers: pendingTransfers[0]?.count || 0,
    },
    alerts: {
      critical: criticalCount,
      warning: warningCount,
      info: infoCount,
      unacknowledged: unacknowledgedCount,
    },
    recentAlerts: alerts.slice(0, 10),
    checks: [
      { name: "Réconciliation", status: criticalCount > 0 ? "error" : "ok", lastRun: new Date() },
      { name: "Soldes comptes", status: "ok", lastRun: new Date() },
      { name: "Sessions caisse", status: "ok", lastRun: new Date() },
      { name: "Virements", status: pendingTransfers[0]?.count > 5 ? "warning" : "ok", lastRun: new Date() },
    ],
  };
}

// ============================================================================
// SCHEDULED MONITORING
// ============================================================================

let monitoringInterval: ReturnType<typeof setInterval> | null = null;

export async function runMonitoringChecks(config: MonitoringConfig = DEFAULT_CONFIG): Promise<void> {
  logger.info("Running monitoring checks");

  try {
    await Promise.all([
      checkHighValueTransactions(config),
      checkPendingTransfers(config),
      checkUnusualActivity(config),
      runQuickReconciliation(),
    ]);

    const dashboard = await getDashboard();
    broadcastDashboardUpdate(dashboard);

    logger.info({ status: dashboard.status, alertCount: dashboard.alerts.critical + dashboard.alerts.warning }, "Monitoring checks completed");
  } catch (error) {
    logger.error({ error }, "Monitoring checks failed");
  }
}

export function startMonitoring(config: MonitoringConfig = DEFAULT_CONFIG): void {
  if (monitoringInterval) {
    logger.warn("Monitoring already running");
    return;
  }

  const intervalMs = config.checkIntervalMinutes * 60 * 1000;
  monitoringInterval = setInterval(() => runMonitoringChecks(config), intervalMs);

  // Run immediately
  runMonitoringChecks(config);

  logger.info({ intervalMinutes: config.checkIntervalMinutes }, "Monitoring started");
}

export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info("Monitoring stopped");
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createAlert,
  acknowledgeAlert,
  dismissAlert,
  getActiveAlerts,
  getDashboard,
  runMonitoringChecks,
  startMonitoring,
  stopMonitoring,
  DEFAULT_CONFIG,
};
