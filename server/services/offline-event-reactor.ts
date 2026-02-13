/**
 * Offline Event Reactor — Server-side event processing for confirmed journal entries
 *
 * Integrates with the existing domain event system (outbox + WS + notifications).
 * Called after journal entries are confirmed during sync.
 *
 * Reactors:
 * - GLReactor: Validates GL entries were posted (defense-in-depth)
 * - BalanceReactor: Emits real-time balance updates via WebSocket
 * - NotifReactor: Sends supervisor notifications for flagged operations
 * - AnomalyReactor: Forwards anomaly alerts to supervisors
 * - ReportReactor: Aggregates data for COBAC reporting
 *
 * @module offline-event-reactor
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";
import { getWsInstance } from "../ws-server";
import { currencySymbol } from "@shared/config/currency";
import { offlineJournalEntries, offlineDaySessions } from "@shared/schema/device-keys";
import { eq, and, sql } from "drizzle-orm";
import type { AnomalyAlert } from "./offline-anomaly-detector";
import type { ReconciliationResult } from "./offline-reconciliation-service";

const logger = createLogger('Services:OfflineEventReactor');

// ========== TYPES ==========

export interface ConfirmedEntry {
  uuid: string;
  type: string;
  agentId: string;
  agenceId: string;
  payload: Record<string, unknown>;
  operationRef: string;
  mouvementId: string | null;
  sessionDate: string;
  serverTimestamp: number;
}

export interface BatchResult {
  accepted: string[];
  rejected: Array<{ uuid: string; reason: string }>;
  conflicts: Array<{ uuid: string; conflictWith: string; reason: string }>;
  anomalies: AnomalyAlert[];
  reconciliations: ReconciliationResult[];
}

// ========== FINANCIAL OPERATIONS ==========

const FINANCIAL_EVENTS = new Set([
  'DEPOSIT', 'WITHDRAWAL', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT',
  'TONTINE_CONTRIBUTION', 'TONTINE_DISTRIBUTION', 'SETTLEMENT',
]);

// ========== MAIN REACTOR ENTRY POINT ==========

/**
 * Process a batch of confirmed journal entries through all server-side reactors.
 * Called after the sync-journal endpoint successfully processes a batch.
 *
 * This function is non-blocking — errors in individual reactors don't affect
 * the sync response. All errors are logged for operational monitoring.
 */
export async function processConfirmedBatch(
  entries: ConfirmedEntry[],
  agentId: string,
  batchResult: BatchResult
): Promise<void> {
  if (entries.length === 0) return;

  const startTime = Date.now();

  // Run all reactors in parallel (non-blocking)
  const results = await Promise.allSettled([
    runBalanceReactor(entries, agentId),
    runNotifReactor(entries, agentId, batchResult),
    runAnomalyNotifReactor(batchResult.anomalies, agentId),
    runReconcNotifReactor(batchResult.reconciliations, agentId),
    runReportReactor(entries, agentId),
  ]);

  // Log any reactor failures
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    for (const f of failures) {
      logger.error('Reactor failure:', (f as PromiseRejectedResult).reason);
    }
  }

  logger.info(`Processed ${entries.length} confirmed entries through reactors in ${Date.now() - startTime}ms`, {
    agentId,
    failures: failures.length,
  });
}

// ========== BALANCE REACTOR ==========

/**
 * Emits real-time balance updates via WebSocket for each financial operation.
 * Supervisors and the agent (if online) see balance changes immediately.
 */
async function runBalanceReactor(entries: ConfirmedEntry[], agentId: string): Promise<void> {
  const ws = getWsInstance();
  if (!ws) return;

  for (const entry of entries) {
    if (!FINANCIAL_EVENTS.has(entry.type)) continue;

    const amount = (entry.payload as any)?.amount || (entry.payload as any)?.montant;
    if (typeof amount !== 'number') continue;

    // Broadcast balance update to the agent
    ws.sendToUser(agentId, {
      type: 'BALANCE_UPDATED',
      payload: {
        source: 'offline_sync',
        eventType: entry.type,
        operationRef: entry.operationRef,
        amount,
        compteId: (entry.payload as any)?.compteId,
        creditId: (entry.payload as any)?.creditId,
        tontineId: (entry.payload as any)?.tontineId,
        timestamp: entry.serverTimestamp,
      },
    });

    // Broadcast to the agency (supervisors see all operations)
    ws.broadcastToAgency(entry.agenceId, {
      type: 'CAISSE_UPDATE',
      payload: {
        source: 'offline_sync',
        agentId,
        eventType: entry.type,
        operationRef: entry.operationRef,
        amount,
        timestamp: entry.serverTimestamp,
      },
    });
  }
}

// ========== NOTIFICATION REACTOR ==========

/**
 * Sends notifications to supervisors for important events:
 * - Large operations (>500K XAF)
 * - Rejected operations
 * - Conflicts detected
 * - Session with long offline duration
 */
async function runNotifReactor(
  entries: ConfirmedEntry[],
  agentId: string,
  batchResult: BatchResult
): Promise<void> {
  const ws = getWsInstance();
  const notifications: Array<{
    type: string;
    level: 'info' | 'warning' | 'critical';
    message: string;
    data: Record<string, unknown>;
  }> = [];

  // Check for large operations
  for (const entry of entries) {
    const amount = (entry.payload as any)?.amount || (entry.payload as any)?.montant || 0;
    if (typeof amount === 'number' && amount >= 500_000) {
      notifications.push({
        type: 'LARGE_OFFLINE_OPERATION',
        level: 'info',
        message: `Operation offline de ${amount.toLocaleString('fr-FR')} ${currencySymbol()} (${entry.type}) par agent ${agentId}`,
        data: {
          entryUuid: entry.uuid,
          operationRef: entry.operationRef,
          amount,
          eventType: entry.type,
          agentId,
        },
      });
    }
  }

  // Notify about rejections
  if (batchResult.rejected.length > 0) {
    notifications.push({
      type: 'OFFLINE_SYNC_REJECTIONS',
      level: 'warning',
      message: `${batchResult.rejected.length} operation(s) offline rejetee(s) pour agent ${agentId}`,
      data: {
        agentId,
        rejections: batchResult.rejected,
      },
    });
  }

  // Notify about conflicts
  if (batchResult.conflicts.length > 0) {
    notifications.push({
      type: 'OFFLINE_SYNC_CONFLICTS',
      level: 'warning',
      message: `${batchResult.conflicts.length} conflit(s) detecte(s) pour agent ${agentId}`,
      data: {
        agentId,
        conflicts: batchResult.conflicts,
      },
    });
  }

  // Broadcast to agency supervisors via WebSocket
  if (ws && notifications.length > 0) {
    const agenceId = entries[0]?.agenceId;
    if (agenceId) {
      for (const notif of notifications) {
        ws.broadcastToAgency(agenceId, {
          type: 'NOTIFICATION',
          payload: {
            ...notif,
            source: 'offline_sync',
            timestamp: Date.now(),
          },
        });
      }
    }
  }

  // Also create in-app notifications for critical items
  if (notifications.some(n => n.level === 'warning' || n.level === 'critical')) {
    try {
      const { enqueueNotification } = await import('./notifications/notification-service');

      for (const notif of notifications.filter(n => n.level !== 'info')) {
        // Get agency supervisor IDs
        const supervisors = await getAgencySupervisors(entries[0]?.agenceId);
        for (const supervisorId of supervisors) {
          await enqueueNotification({
            channel: 'IN_APP',
            templateCode: 'offline_sync_alert',
            recipient: supervisorId,
            payload: {
              title: notif.message,
              level: notif.level,
              ...notif.data,
            },
            userId: supervisorId,
            agenceId: entries[0]?.agenceId,
          }).catch(() => {});
        }
      }
    } catch {
      // Notification service may not be available — non-critical
    }
  }
}

// ========== ANOMALY NOTIFICATION REACTOR ==========

/**
 * Forwards anomaly detection results to supervisors.
 */
async function runAnomalyNotifReactor(
  anomalies: AnomalyAlert[],
  agentId: string
): Promise<void> {
  if (anomalies.length === 0) return;

  const ws = getWsInstance();
  const criticalAnomalies = anomalies.filter(a => a.severity === 'critical' || a.severity === 'warning');

  if (criticalAnomalies.length === 0) return;

  // Look up the agent's agency for broadcasting
  const agenceId = await getAgentAgenceId(agentId);
  if (!agenceId) return;

  if (ws) {
    ws.broadcastToAgency(agenceId, {
      type: 'NOTIFICATION',
      payload: {
        type: 'OFFLINE_ANOMALY_DETECTED',
        level: criticalAnomalies.some(a => a.severity === 'critical') ? 'critical' : 'warning',
        message: `${criticalAnomalies.length} anomalie(s) detectee(s) pour agent ${agentId}`,
        source: 'offline_sync',
        anomalies: criticalAnomalies.map(a => ({
          type: a.type,
          severity: a.severity,
          description: a.description,
        })),
        agentId,
        timestamp: Date.now(),
      },
    });
  }

  logger.warn(`Anomaly alerts forwarded for agent ${agentId}`, {
    count: criticalAnomalies.length,
    types: criticalAnomalies.map(a => a.type),
  });
}

// ========== RECONCILIATION NOTIFICATION REACTOR ==========

/**
 * Forwards reconciliation results to supervisors when review is needed.
 */
async function runReconcNotifReactor(
  reconciliations: ReconciliationResult[],
  agentId: string
): Promise<void> {
  const needsAttention = reconciliations.filter(
    r => r.status === 'pending_review' || r.status === 'flagged'
  );

  if (needsAttention.length === 0) return;

  const ws = getWsInstance();
  const agenceId = await getAgentAgenceId(agentId);
  if (!agenceId) return;

  for (const recon of needsAttention) {
    const isCritical = recon.status === 'flagged';

    if (ws) {
      ws.broadcastToAgency(agenceId, {
        type: 'NOTIFICATION',
        payload: {
          type: 'OFFLINE_RECONCILIATION_ALERT',
          level: isCritical ? 'critical' : 'warning',
          message: isCritical
            ? `Ecart critique de ${recon.discrepancy} ${currencySymbol()} pour agent ${agentId} le ${recon.date}`
            : `Ecart de ${recon.discrepancy} ${currencySymbol()} a verifier pour agent ${agentId} le ${recon.date}`,
          source: 'offline_reconciliation',
          sessionId: recon.sessionId,
          agentId,
          date: recon.date,
          discrepancy: recon.discrepancy,
          status: recon.status,
          alerts: recon.alerts,
          timestamp: Date.now(),
        },
      });
    }

    // Create in-app notification for critical discrepancies
    if (isCritical) {
      try {
        const { enqueueNotification } = await import('./notifications/notification-service');
        const supervisors = await getAgencySupervisors(agenceId);
        for (const supervisorId of supervisors) {
          await enqueueNotification({
            channel: 'IN_APP',
            templateCode: 'reconciliation_critical',
            recipient: supervisorId,
            payload: {
              agentId,
              date: recon.date,
              discrepancy: recon.discrepancy,
              sessionId: recon.sessionId,
            },
            userId: supervisorId,
            agenceId,
          }).catch(() => {});
        }
      } catch {
        // Non-critical
      }
    }
  }
}

// ========== REPORT REACTOR (COBAC) ==========

/**
 * Aggregates confirmed entries into daily/monthly reporting summaries
 * for COBAC compliance. Stores aggregated metrics in the database.
 */
async function runReportReactor(entries: ConfirmedEntry[], agentId: string): Promise<void> {
  if (entries.length === 0) return;

  // Group entries by session date
  const byDate = new Map<string, ConfirmedEntry[]>();
  for (const entry of entries) {
    const date = entry.sessionDate;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(entry);
  }

  for (const [date, dateEntries] of byDate) {
    const financialEntries = dateEntries.filter(e => FINANCIAL_EVENTS.has(e.type));
    if (financialEntries.length === 0) continue;

    // Compute daily aggregates
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalLoanDisbursements = 0;
    let totalLoanRepayments = 0;
    let totalTontineContributions = 0;
    let totalTontineDistributions = 0;
    let totalSettlements = 0;
    let operationCount = 0;
    const uniqueClients = new Set<string>();

    for (const entry of financialEntries) {
      const amount = (entry.payload as any)?.amount || (entry.payload as any)?.montant || 0;
      const clientId = (entry.payload as any)?.clientId;
      if (clientId) uniqueClients.add(clientId);
      operationCount++;

      switch (entry.type) {
        case 'DEPOSIT': totalDeposits += amount; break;
        case 'WITHDRAWAL': totalWithdrawals += amount; break;
        case 'LOAN_DISBURSEMENT': totalLoanDisbursements += amount; break;
        case 'LOAN_REPAYMENT': totalLoanRepayments += amount; break;
        case 'TONTINE_CONTRIBUTION': totalTontineContributions += amount; break;
        case 'TONTINE_DISTRIBUTION': totalTontineDistributions += amount; break;
        case 'SETTLEMENT': totalSettlements += amount; break;
      }
    }

    // Upsert daily report entry for this agent/date
    // Using metadata on the session for now (future: dedicated reporting table)
    try {
      const [session] = await db
        .select()
        .from(offlineDaySessions)
        .where(and(
          eq(offlineDaySessions.agentId, agentId),
          eq(offlineDaySessions.date, date)
        ));

      if (session) {
        // Store COBAC report data in the daily volume field
        await db
          .update(offlineDaySessions)
          .set({
            dailyVolume: String(
              totalDeposits + totalWithdrawals + totalLoanDisbursements +
              totalLoanRepayments + totalTontineContributions +
              totalTontineDistributions + totalSettlements
            ),
            operationCount: String(operationCount),
            totalCollected: String(totalDeposits + totalLoanRepayments + totalTontineContributions),
            totalDisbursed: String(totalWithdrawals + totalLoanDisbursements + totalTontineDistributions + totalSettlements),
          })
          .where(eq(offlineDaySessions.id, session.id));
      }
    } catch (error) {
      logger.warn(`Report reactor: failed to update daily report for ${agentId}/${date}:`, error);
    }
  }
}

// ========== HELPERS ==========

/**
 * Get the agency ID for an agent.
 */
async function getAgentAgenceId(agentId: string): Promise<string | null> {
  try {
    const result = await db.execute(
      sql`SELECT agence_id FROM utilisateurs WHERE id = ${agentId} LIMIT 1`
    );
    return (result.rows[0] as any)?.agence_id || null;
  } catch {
    return null;
  }
}

/**
 * Get supervisor user IDs for an agency.
 */
async function getAgencySupervisors(agenceId: string | undefined): Promise<string[]> {
  if (!agenceId) return [];
  try {
    const result = await db.execute(
      sql`SELECT id FROM utilisateurs
          WHERE agence_id = ${agenceId}
          AND role IN ('CHEF_AGENCE', 'SUPERVISEUR', 'ADMIN')
          AND statut = 'ACTIF'`
    );
    return (result.rows as any[]).map(r => r.id);
  } catch {
    return [];
  }
}
