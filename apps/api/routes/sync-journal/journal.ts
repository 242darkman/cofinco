import { Router } from "express";
import { z } from "zod";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { deviceKeys, offlineJournalEntries } from "@shared/schema/device-keys";
import { eq, and, sql, inArray } from "drizzle-orm";
import { SyncConflictResolver } from "../../services/sync-conflict-resolver";
import { OfflineAnomalyDetector } from "../../services/offline-anomaly-detector";
import { OfflineReconciliationService } from "../../services/offline-reconciliation-service";
import { processConfirmedBatch, type ConfirmedEntry } from "../../services/offline-event-reactor";
import { computeEntryHash, verifyEcdsaSignature } from "../../services/sync-journal/crypto-utils";
import { executeJournalBusinessOperation } from "../../services/sync-journal/business-execution";
import {
  extractEntryAmount,
  validateEntryAgainstLimits,
  FINANCIAL_OPERATION_TYPES,
  type AgentDailyStats,
} from "../../services/sync-journal/offline-limits";
import { D } from "../../lib/money";
import { requireAuth } from "../../auth";

const logger = createLogger('Routes:SyncJournal:Upload');

export const journalUploadRouter = Router();

export const journalEntrySchema = z.object({
  uuid: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: z.string().min(1),
  agentId: z.string(),
  deviceId: z.string().min(1),
  agenceId: z.string().uuid(),

  payload: z.record(z.unknown()),
  payloadHash: z.string().min(1),

  previousHash: z.string().min(1),
  entryHash: z.string().min(1),

  signature: z.string().min(1),
  deviceKeyId: z.string().min(1),

  localTimestamp: z.number().int().positive(),
  monotonicClock: z.number().min(0),
  ntpOffset: z.number().optional(),

  sessionId: z.string().min(1),
  operationRef: z.string().min(1),
  idempotencyKey: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const uploadBatchSchema = z.object({
  entries: z.array(journalEntrySchema).min(1).max(10),
});

/**
 * Statistiques financières confirmées d'un agent pour une session (jour)
 * offline donnée — base du contrôle serveur des plafonds quotidiens.
 */
async function getConfirmedDailyStats(
  agentId: string,
  offlineSessionDate: string,
): Promise<AgentDailyStats> {
  const financialTypes = [...FINANCIAL_OPERATION_TYPES];
  const result = await db
    .select({
      count: sql<string>`COUNT(*)`,
      volume: sql<string>`COALESCE(SUM(CAST(payload->>'amount' AS DECIMAL)), 0)`,
    })
    .from(offlineJournalEntries)
    .where(and(
      eq(offlineJournalEntries.agentId, agentId),
      eq(offlineJournalEntries.offlineSessionDate, offlineSessionDate),
      eq(offlineJournalEntries.status, 'confirmed'),
      inArray(offlineJournalEntries.eventType, financialTypes),
      sql`payload->>'amount' IS NOT NULL`,
    ));

  const row = result[0];
  return {
    operationCount: Number(row?.count ?? 0),
    totalVolume: Number(row?.volume ?? 0),
  };
}

journalUploadRouter.post('/journal', requireAuth, async (req, res) => {
  try {
    const { entries } = uploadBatchSchema.parse(req.body);
    const agentId = req.user!.id;

    const accepted: string[] = [];
    const rejected: Array<{ uuid: string; reason: string }> = [];
    const conflicts: Array<{ uuid: string; conflictWith: string; reason: string }> = [];
    const confirmedEntries: ConfirmedEntry[] = [];

    // Stats quotidiennes par session offline, cumulées au fil du batch
    // (une entrée acceptée compte pour les suivantes du même jour)
    const dailyStatsCache = new Map<string, AgentDailyStats>();

    for (const entry of entries) {
      try {
        if (entry.agentId !== agentId) {
          rejected.push({ uuid: entry.uuid, reason: 'agent_mismatch' });
          continue;
        }

        const [existing] = await db
          .select({ id: offlineJournalEntries.id })
          .from(offlineJournalEntries)
          .where(eq(offlineJournalEntries.idempotencyKey, entry.idempotencyKey))
          .limit(1);

        if (existing) {
          accepted.push(entry.uuid);
          continue;
        }

        const [deviceKey] = await db
          .select()
          .from(deviceKeys)
          .where(eq(deviceKeys.id, entry.deviceKeyId));

        if (!deviceKey || deviceKey.status === 'revoked') {
          rejected.push({ uuid: entry.uuid, reason: 'invalid_or_revoked_key' });
          continue;
        }

        if (deviceKey.revokedAt && new Date(entry.localTimestamp) > deviceKey.revokedAt) {
          rejected.push({ uuid: entry.uuid, reason: 'key_revoked_before_operation' });
          continue;
        }

        const signatureValid = await verifyEcdsaSignature(
          entry.entryHash,
          entry.signature,
          deviceKey.publicKeyJwk as JsonWebKey
        );

        if (!signatureValid) {
          rejected.push({ uuid: entry.uuid, reason: 'invalid_signature' });
          logger.warn(`Invalid signature for entry ${entry.uuid} from agent ${agentId}`);
          continue;
        }

        const expectedHash = computeEntryHash(
          entry.sequence,
          entry.uuid,
          entry.type,
          entry.payloadHash,
          entry.previousHash,
          entry.localTimestamp
        );

        if (expectedHash !== entry.entryHash) {
          rejected.push({ uuid: entry.uuid, reason: 'hash_mismatch' });
          logger.warn(`Hash mismatch for entry ${entry.uuid} from agent ${agentId}`);
          continue;
        }

        const correctedTimestamp = entry.localTimestamp + (entry.ntpOffset || 0);
        const serverNow = Date.now();
        const drift = Math.abs(serverNow - correctedTimestamp);
        if (drift > 48 * 60 * 60 * 1000) {
          rejected.push({ uuid: entry.uuid, reason: 'excessive_clock_drift' });
          continue;
        }

        const conflictResult = await SyncConflictResolver.resolve(entry, agentId);
        if (conflictResult.action === 'reject') {
          if (conflictResult.conflictWith) {
            conflicts.push({
              uuid: entry.uuid,
              conflictWith: conflictResult.conflictWith,
              reason: conflictResult.reason,
            });
          } else {
            rejected.push({ uuid: entry.uuid, reason: conflictResult.reason });
          }
          continue;
        }

        // Application SERVEUR des plafonds offline. Les limites côté client
        // ne sont qu'un garde-fou UX : c'est ici que la contrainte est réelle
        // (§8 AGENTS.md — ne jamais faire confiance au client).
        let dailyStats = dailyStatsCache.get(entry.sessionId);
        if (!dailyStats) {
          dailyStats = await getConfirmedDailyStats(agentId, entry.sessionId);
          dailyStatsCache.set(entry.sessionId, dailyStats);
        }
        const entryAmount = extractEntryAmount(entry.payload);
        const limitCheck = validateEntryAgainstLimits({
          type: entry.type,
          amount: entryAmount,
          dailyStats,
        });
        if (!limitCheck.allowed) {
          rejected.push({ uuid: entry.uuid, reason: limitCheck.reason });
          logger.warn(
            { uuid: entry.uuid, agentId, reason: limitCheck.reason, details: limitCheck.details },
            'Rejet au rejeu : plafond offline dépassé',
          );
          continue;
        }
        if (FINANCIAL_OPERATION_TYPES.has(entry.type) && entryAmount !== null) {
          dailyStats.operationCount += 1;
          dailyStats.totalVolume = D(dailyStats.totalVolume).plus(D(entryAmount)).toNumber();
        }

        await db.insert(offlineJournalEntries).values({
          id: entry.uuid,
          clientSequence: String(entry.sequence),
          deviceId: entry.deviceId,
          agentId: entry.agentId,
          agenceId: entry.agenceId,
          eventType: entry.type,
          payload: entry.payload,
          payloadHash: entry.payloadHash,
          previousHash: entry.previousHash,
          entryHash: entry.entryHash,
          signature: entry.signature,
          deviceKeyId: entry.deviceKeyId,
          clientTimestamp: new Date(entry.localTimestamp),
          ntpOffset: entry.ntpOffset != null ? String(entry.ntpOffset) : null,
          status: 'confirmed',
          operationRef: entry.operationRef,
          offlineSessionDate: entry.sessionId,
          idempotencyKey: entry.idempotencyKey,
          metadata: entry.metadata || null,
        });

        await db
          .update(deviceKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(deviceKeys.id, entry.deviceKeyId));

        let mouvementId: string | null = null;
        try {
          mouvementId = await executeJournalBusinessOperation(entry, agentId);
          if (mouvementId) {
            await db
              .update(offlineJournalEntries)
              .set({ mouvementId })
              .where(eq(offlineJournalEntries.id, entry.uuid));
          }
        } catch (bizError: any) {
          logger.warn(`Business operation failed for entry ${entry.uuid}: ${bizError.message}`);
        }

        accepted.push(entry.uuid);

        confirmedEntries.push({
          uuid: entry.uuid,
          type: entry.type,
          agentId: entry.agentId,
          agenceId: entry.agenceId,
          payload: entry.payload as Record<string, unknown>,
          operationRef: entry.operationRef,
          mouvementId,
          sessionDate: entry.sessionId,
          serverTimestamp: Date.now(),
        });

      } catch (entryError: any) {
        logger.error(`Error processing entry ${entry.uuid}:`, entryError);
        rejected.push({ uuid: entry.uuid, reason: 'processing_error' });
      }
    }

    let anomalies: Awaited<ReturnType<typeof OfflineAnomalyDetector.analyzeBatch>> = [];
    try {
      anomalies = await OfflineAnomalyDetector.analyzeBatch(entries, agentId);
    } catch (anomalyError) {
      logger.warn({ err: anomalyError }, 'Anomaly detection error (non-blocking)');
    }

    let reconciliationResults: Awaited<ReturnType<typeof OfflineReconciliationService.reconcileAllPending>> = [];
    try {
      reconciliationResults = await OfflineReconciliationService.reconcileAllPending(agentId);
      if (reconciliationResults.length > 0) {
        logger.info(`Reconciled ${reconciliationResults.length} session(s) for agent ${agentId}`);
      }
    } catch (reconcileError) {
      logger.warn({ err: reconcileError }, 'Reconciliation error (non-blocking)');
    }

    processConfirmedBatch(confirmedEntries, agentId, {
      accepted,
      rejected,
      conflicts,
      anomalies,
      reconciliations: reconciliationResults,
    }).catch(reactorError => {
      logger.warn('Event reactor error (non-blocking):', reactorError);
    });

    res.json({
      accepted,
      rejected,
      conflicts,
      serverTime: Date.now(),
    });
  } catch (error: any) {
    logger.error('Journal upload error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid journal data', details: error.errors });
    }
    res.status(500).json({ error: 'Journal upload failed' });
  }
});
