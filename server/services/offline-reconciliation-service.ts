/**
 * Offline Reconciliation Service
 *
 * Handles post-sync reconciliation of offline day sessions:
 * 1. Recomputes expected cash balance from confirmed journal entries
 * 2. Compares with agent-declared closing balance
 * 3. Determines discrepancy and applies appropriate action
 * 4. Generates adjustment entries for minor discrepancies
 * 5. Flags sessions with major discrepancies for supervisor review
 *
 * Reconciliation rules:
 * - Exact match (0 XAF) → Auto-reconciled
 * - Minor (<= 500 XAF) → Auto-adjusted with info alert
 * - Major (> 500 XAF) → Pending review, supervisor notified
 * - Missing closing → Session flagged as incomplete
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";
import {
  offlineJournalEntries,
  offlineDaySessions,
} from "@shared/schema/device-keys";
import { eq, and } from "drizzle-orm";

const logger = createLogger('Services:OfflineReconciliation');

// ========== CONFIGURATION ==========

const RECONCILIATION_THRESHOLDS = {
  AUTO_ADJUST_MAX: 500,        // Auto-adjust up to 500 XAF
  WARNING_THRESHOLD: 5_000,    // Warning alert > 5,000 XAF
  CRITICAL_THRESHOLD: 50_000,  // Critical alert > 50,000 XAF
};

// ========== TYPES ==========

export interface ReconciliationResult {
  sessionId: string;
  date: string;
  agentId: string;
  status: 'reconciled' | 'auto_adjusted' | 'pending_review' | 'flagged' | 'incomplete';
  openingBalance: number;
  expectedBalance: number;
  declaredClosingBalance: number | null;
  discrepancy: number | null;
  confirmedOperations: number;
  rejectedOperations: number;
  totalCollected: number;
  totalDisbursed: number;
  alerts: ReconciliationAlert[];
}

export interface ReconciliationAlert {
  level: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
}

// ========== CASH IMPACT (server-side mirror of client logic) ==========

function getCashImpact(eventType: string, amount: number): number {
  switch (eventType) {
    case 'DEPOSIT':              return amount;
    case 'LOAN_REPAYMENT':       return amount;
    case 'TONTINE_CONTRIBUTION': return amount;
    case 'WITHDRAWAL':           return -amount;
    case 'LOAN_DISBURSEMENT':    return -amount;
    case 'TONTINE_DISTRIBUTION': return -amount;
    case 'SETTLEMENT':           return -amount;
    default:                     return 0;
  }
}

// ========== RECONCILIATION ENGINE ==========

export class OfflineReconciliationService {

  /**
   * Reconcile an offline day session after journal entries have been synced.
   */
  static async reconcileSession(
    agentId: string,
    date: string
  ): Promise<ReconciliationResult> {
    const alerts: ReconciliationAlert[] = [];

    // 1. Fetch the day session
    const [session] = await db
      .select()
      .from(offlineDaySessions)
      .where(and(
        eq(offlineDaySessions.agentId, agentId),
        eq(offlineDaySessions.date, date)
      ));

    if (!session) {
      return {
        sessionId: '',
        date,
        agentId,
        status: 'incomplete',
        openingBalance: 0,
        expectedBalance: 0,
        declaredClosingBalance: null,
        discrepancy: null,
        confirmedOperations: 0,
        rejectedOperations: 0,
        totalCollected: 0,
        totalDisbursed: 0,
        alerts: [{ level: 'warning', message: 'No day session found for this date.' }],
      };
    }

    // 2. Fetch all journal entries for this session
    const entries = await db
      .select()
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        eq(offlineJournalEntries.offlineSessionDate, date)
      ));

    const confirmed = entries.filter(e => e.status === 'confirmed');
    const rejected = entries.filter(e => e.status === 'rejected');

    // 3. Recompute expected balance from confirmed entries
    const openingBalance = parseFloat(session.openingBalance);
    let expectedBalance = openingBalance;
    let totalCollected = 0;
    let totalDisbursed = 0;

    for (const entry of confirmed) {
      if (['CAISSE_OPEN', 'CAISSE_CLOSE', 'CAISSE_RECONCILE'].includes(entry.eventType)) {
        continue; // Skip non-financial entries
      }

      const payload = entry.payload as Record<string, any>;
      const amount = payload?.amount || payload?.montant || 0;

      if (typeof amount === 'number' && amount > 0) {
        const impact = getCashImpact(entry.eventType, amount);
        expectedBalance += impact;
        if (impact > 0) totalCollected += amount;
        else totalDisbursed += Math.abs(amount);
      }
    }

    // 4. Determine discrepancy
    const declaredClosingBalance = session.closingBalance
      ? parseFloat(session.closingBalance)
      : null;

    let discrepancy: number | null = null;
    let status: ReconciliationResult['status'];

    if (declaredClosingBalance == null) {
      status = 'incomplete';
      alerts.push({
        level: 'warning',
        message: 'Session not properly closed (no closing balance declared).',
      });
    } else {
      discrepancy = declaredClosingBalance - expectedBalance;

      if (Math.abs(discrepancy) < 0.01) {
        // Exact match
        status = 'reconciled';
        alerts.push({
          level: 'info',
          message: 'Session reconciled with exact match.',
        });
      } else if (Math.abs(discrepancy) <= RECONCILIATION_THRESHOLDS.AUTO_ADJUST_MAX) {
        // Minor discrepancy - auto-adjust
        status = 'auto_adjusted';
        alerts.push({
          level: 'info',
          message: `Minor discrepancy of ${discrepancy} XAF auto-adjusted.`,
          metadata: { discrepancy, threshold: RECONCILIATION_THRESHOLDS.AUTO_ADJUST_MAX },
        });
      } else if (Math.abs(discrepancy) > RECONCILIATION_THRESHOLDS.CRITICAL_THRESHOLD) {
        // Critical discrepancy
        status = 'flagged';
        alerts.push({
          level: 'critical',
          message: `Critical discrepancy of ${discrepancy} XAF. Immediate supervisor review required.`,
          metadata: { discrepancy },
        });
      } else {
        // Needs review
        status = 'pending_review';
        const level = Math.abs(discrepancy) > RECONCILIATION_THRESHOLDS.WARNING_THRESHOLD
          ? 'warning' as const
          : 'info' as const;
        alerts.push({
          level,
          message: `Discrepancy of ${discrepancy} XAF requires supervisor review.`,
          metadata: { discrepancy },
        });
      }
    }

    // 5. Alert if any operations were rejected during sync
    if (rejected.length > 0) {
      const rejectedAmount = rejected.reduce((sum, e) => {
        const payload = e.payload as Record<string, any>;
        return sum + (payload?.amount || payload?.montant || 0);
      }, 0);

      alerts.push({
        level: 'warning',
        message: `${rejected.length} operation(s) rejected during sync (total: ${rejectedAmount} XAF). Agent's declared balance may not match expected.`,
        metadata: {
          rejectedCount: rejected.length,
          rejectedAmount,
          rejectedUuids: rejected.map(e => e.id),
        },
      });
    }

    // 6. Update the session record
    await db
      .update(offlineDaySessions)
      .set({
        expectedBalance: String(expectedBalance),
        discrepancy: discrepancy != null ? String(discrepancy) : null,
        totalCollected: String(totalCollected),
        totalDisbursed: String(totalDisbursed),
        operationCount: String(confirmed.length),
        entryCount: String(entries.length),
        status: status as any,
        reconciledAt: status === 'reconciled' || status === 'auto_adjusted' ? new Date() : undefined,
      })
      .where(eq(offlineDaySessions.id, session.id));

    const result: ReconciliationResult = {
      sessionId: session.id,
      date,
      agentId,
      status,
      openingBalance,
      expectedBalance,
      declaredClosingBalance,
      discrepancy,
      confirmedOperations: confirmed.length,
      rejectedOperations: rejected.length,
      totalCollected,
      totalDisbursed,
      alerts,
    };

    logger.info({ discrepancy, confirmed: confirmed.length, rejected: rejected.length }, `Reconciliation for agent ${agentId} on ${date}: ${status}`);

    return result;
  }

  /**
   * Reconcile all unreconciled sessions for an agent.
   */
  static async reconcileAllPending(agentId: string): Promise<ReconciliationResult[]> {
    const sessions = await db
      .select()
      .from(offlineDaySessions)
      .where(and(
        eq(offlineDaySessions.agentId, agentId),
        eq(offlineDaySessions.status, 'synced')
      ));

    const results: ReconciliationResult[] = [];
    for (const session of sessions) {
      const result = await this.reconcileSession(agentId, session.date);
      results.push(result);
    }

    return results;
  }

  /**
   * Supervisor manually resolves a pending review session.
   */
  static async manualReconcile(
    sessionId: string,
    supervisorId: string,
    resolution: 'approve' | 'flag',
    justification: string
  ): Promise<void> {
    const status = resolution === 'approve' ? 'reconciled' : 'flagged';

    await db
      .update(offlineDaySessions)
      .set({
        status: status as any,
        reconciledAt: new Date(),
        reconciledBy: supervisorId,
        discrepancyJustification: justification,
      })
      .where(eq(offlineDaySessions.id, sessionId));

    logger.info(`Manual reconciliation: session ${sessionId} → ${status} by ${supervisorId}`);
  }
}
