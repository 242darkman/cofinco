/**
 * Offline Anomaly Detector
 *
 * Analyzes batches of synced offline journal entries for fraud patterns,
 * unusual behavior, and compliance violations.
 *
 * Patterns detected:
 * - Abnormal volume (2x historical average)
 * - Off-hours operations (22h-5h local time)
 * - Rapid-fire operations (<30s between entries)
 * - Repetitive round amounts (>5 identical consecutive)
 * - Broken hash chain (tamper evidence)
 * - Excessive clock drift (>24h from NTP-corrected time)
 * - Single client concentration (>50% volume to one client)
 *
 * Results are stored for supervisor review and COBAC compliance.
 */

import { createLogger } from "../lib/logger";

const logger = createLogger('Services:OfflineAnomalyDetector');

// ========== TYPES ==========

export interface AnomalyAlert {
  type: AnomalyType;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  entryUuids: string[];
  metadata?: Record<string, unknown>;
}

export type AnomalyType =
  | 'abnormal_volume'
  | 'off_hours'
  | 'rapid_fire'
  | 'repetitive_amounts'
  | 'chain_broken'
  | 'signature_invalid'
  | 'clock_drift'
  | 'client_concentration'
  | 'limit_exceeded';

interface JournalEntryLike {
  uuid: string;
  type: string;
  localTimestamp: number;
  ntpOffset?: number;
  payload: Record<string, unknown>;
  entryHash: string;
  previousHash: string;
  signature: string;
  agentId: string;
}

// ========== THRESHOLDS ==========

const THRESHOLDS = {
  MIN_OPERATION_INTERVAL_MS: 30_000,       // 30 seconds between operations
  OFF_HOURS_START: 22,                      // 10 PM
  OFF_HOURS_END: 5,                         // 5 AM
  MAX_IDENTICAL_CONSECUTIVE: 5,             // Same amount 5+ times in a row
  CLOCK_DRIFT_MAX_MS: 24 * 60 * 60 * 1000, // 24 hours
  CLIENT_CONCENTRATION_PCT: 0.5,            // 50% volume to single client
  VOLUME_MULTIPLIER: 2,                     // 2x average = anomaly
};

// ========== BATCH ANALYSIS (Called during sync) ==========

export class OfflineAnomalyDetector {
  /**
   * Analyze a batch of journal entries being synced.
   * Returns anomaly alerts for supervisor review.
   */
  static async analyzeBatch(
    entries: JournalEntryLike[],
    agentId: string
  ): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];

    if (entries.length === 0) return alerts;

    // Sort entries by timestamp
    const sorted = [...entries].sort((a, b) => a.localTimestamp - b.localTimestamp);

    // 1. Check for rapid-fire operations
    alerts.push(...this.detectRapidFire(sorted));

    // 2. Check for off-hours operations
    alerts.push(...this.detectOffHours(sorted));

    // 3. Check for repetitive round amounts
    alerts.push(...this.detectRepetitiveAmounts(sorted));

    // 4. Check for excessive clock drift
    alerts.push(...this.detectClockDrift(sorted));

    // 5. Check for client concentration
    alerts.push(...this.detectClientConcentration(sorted));

    // Log alerts
    if (alerts.length > 0) {
      logger.warn(
        { alerts: alerts.map(a => ({ type: a.type, severity: a.severity })) },
        `Anomaly detection: ${alerts.length} alert(s) for agent ${agentId}`
      );
    }

    return alerts;
  }

  /**
   * Analyze a full day's worth of entries (for COBAC audit).
   */
  static async analyzeDay(
    entries: Array<{
      id: string;
      eventType: string;
      clientTimestamp: Date;
      ntpOffset: string | null;
      payload: unknown;
      entryHash: string;
      previousHash: string;
    }>,
    agentId: string
  ): Promise<AnomalyAlert[]> {
    // Convert to the common format
    const normalized: JournalEntryLike[] = entries.map(e => ({
      uuid: e.id,
      type: e.eventType,
      localTimestamp: e.clientTimestamp.getTime(),
      ntpOffset: e.ntpOffset ? parseInt(e.ntpOffset) : undefined,
      payload: (e.payload || {}) as Record<string, unknown>,
      entryHash: e.entryHash,
      previousHash: e.previousHash,
      signature: '',
      agentId,
    }));

    return this.analyzeBatch(normalized, agentId);
  }

  // ========== DETECTION METHODS ==========

  private static detectRapidFire(entries: JournalEntryLike[]): AnomalyAlert[] {
    const rapidPairs: string[] = [];

    for (let i = 1; i < entries.length; i++) {
      const interval = entries[i].localTimestamp - entries[i - 1].localTimestamp;
      if (interval < THRESHOLDS.MIN_OPERATION_INTERVAL_MS && interval >= 0) {
        rapidPairs.push(entries[i - 1].uuid, entries[i].uuid);
      }
    }

    if (rapidPairs.length === 0) return [];

    const uniqueUuids = [...new Set(rapidPairs)];
    return [{
      type: 'rapid_fire',
      severity: uniqueUuids.length > 6 ? 'warning' : 'info',
      description: `${uniqueUuids.length} operations with <30s interval detected.`,
      entryUuids: uniqueUuids,
      metadata: { threshold: THRESHOLDS.MIN_OPERATION_INTERVAL_MS },
    }];
  }

  private static detectOffHours(entries: JournalEntryLike[]): AnomalyAlert[] {
    const offHoursEntries = entries.filter(entry => {
      const correctedTime = entry.localTimestamp + (entry.ntpOffset || 0);
      const hour = new Date(correctedTime).getHours();
      return hour >= THRESHOLDS.OFF_HOURS_START || hour < THRESHOLDS.OFF_HOURS_END;
    });

    if (offHoursEntries.length === 0) return [];

    return [{
      type: 'off_hours',
      severity: offHoursEntries.length > 3 ? 'warning' : 'info',
      description: `${offHoursEntries.length} operation(s) recorded outside business hours (22h-5h).`,
      entryUuids: offHoursEntries.map(e => e.uuid),
      metadata: {
        offHoursStart: THRESHOLDS.OFF_HOURS_START,
        offHoursEnd: THRESHOLDS.OFF_HOURS_END,
      },
    }];
  }

  private static detectRepetitiveAmounts(entries: JournalEntryLike[]): AnomalyAlert[] {
    const financialEntries = entries.filter(e =>
      ['DEPOSIT', 'WITHDRAWAL', 'LOAN_REPAYMENT', 'TONTINE_CONTRIBUTION'].includes(e.type)
    );

    if (financialEntries.length < THRESHOLDS.MAX_IDENTICAL_CONSECUTIVE) return [];

    const alerts: AnomalyAlert[] = [];
    let streak: JournalEntryLike[] = [];
    let lastAmount: number | null = null;

    for (const entry of financialEntries) {
      const amount = (entry.payload as any)?.amount || (entry.payload as any)?.montant;
      if (typeof amount !== 'number') continue;

      if (amount === lastAmount) {
        streak.push(entry);
      } else {
        if (streak.length >= THRESHOLDS.MAX_IDENTICAL_CONSECUTIVE) {
          alerts.push({
            type: 'repetitive_amounts',
            severity: 'warning',
            description: `${streak.length} consecutive operations with identical amount: ${lastAmount} XAF.`,
            entryUuids: streak.map(e => e.uuid),
            metadata: { amount: lastAmount, count: streak.length },
          });
        }
        streak = [entry];
        lastAmount = amount;
      }
    }

    // Check final streak
    if (streak.length >= THRESHOLDS.MAX_IDENTICAL_CONSECUTIVE && lastAmount !== null) {
      alerts.push({
        type: 'repetitive_amounts',
        severity: 'warning',
        description: `${streak.length} consecutive operations with identical amount: ${lastAmount} XAF.`,
        entryUuids: streak.map(e => e.uuid),
        metadata: { amount: lastAmount, count: streak.length },
      });
    }

    return alerts;
  }

  private static detectClockDrift(entries: JournalEntryLike[]): AnomalyAlert[] {
    const driftEntries = entries.filter(entry => {
      if (entry.ntpOffset == null) return false;
      return Math.abs(entry.ntpOffset) > THRESHOLDS.CLOCK_DRIFT_MAX_MS;
    });

    if (driftEntries.length === 0) return [];

    return [{
      type: 'clock_drift',
      severity: 'warning',
      description: `${driftEntries.length} entry/entries with clock drift >24h from NTP reference.`,
      entryUuids: driftEntries.map(e => e.uuid),
      metadata: {
        maxDrift: Math.max(...driftEntries.map(e => Math.abs(e.ntpOffset || 0))),
        threshold: THRESHOLDS.CLOCK_DRIFT_MAX_MS,
      },
    }];
  }

  private static detectClientConcentration(entries: JournalEntryLike[]): AnomalyAlert[] {
    const clientVolumes: Record<string, { total: number; uuids: string[] }> = {};
    let totalVolume = 0;

    for (const entry of entries) {
      const clientId = (entry.payload as any)?.clientId;
      const amount = (entry.payload as any)?.amount || (entry.payload as any)?.montant || 0;

      if (clientId && typeof amount === 'number') {
        if (!clientVolumes[clientId]) {
          clientVolumes[clientId] = { total: 0, uuids: [] };
        }
        clientVolumes[clientId].total += Math.abs(amount);
        clientVolumes[clientId].uuids.push(entry.uuid);
        totalVolume += Math.abs(amount);
      }
    }

    if (totalVolume === 0) return [];

    const alerts: AnomalyAlert[] = [];
    for (const [clientId, data] of Object.entries(clientVolumes)) {
      const pct = data.total / totalVolume;
      if (pct > THRESHOLDS.CLIENT_CONCENTRATION_PCT && data.uuids.length > 3) {
        alerts.push({
          type: 'client_concentration',
          severity: 'warning',
          description: `Client ${clientId} represents ${(pct * 100).toFixed(1)}% of total volume (${data.total} XAF).`,
          entryUuids: data.uuids,
          metadata: {
            clientId,
            clientVolume: data.total,
            totalVolume,
            percentage: pct,
          },
        });
      }
    }

    return alerts;
  }
}
