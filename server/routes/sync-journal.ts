/**
 * Sync Journal Routes — Server-side endpoint for offline journal synchronization
 *
 * Implements the 3-phase sync protocol:
 * 1. HANDSHAKE: Exchange state, check keys, download limits
 * 2. UPLOAD: Receive and validate journal entry batches
 * 3. DOWNLOAD: Send confirmed entries and entity updates
 *
 * Endpoints:
 * - POST /api/sync/handshake     - Phase 1: Exchange sync state
 * - POST /api/sync/journal       - Phase 2: Upload journal entries
 * - GET  /api/sync/pull          - Phase 3: Pull server updates
 * - POST /api/devices/register-key - Register device ECDSA public key
 * - POST /api/devices/revoke-key   - Revoke a device key
 * - GET  /api/audit/offline-day    - Reconstruct an offline day (COBAC compliance)
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { db } from "../db";
import { createLogger } from "../lib/logger";
import {
  deviceKeys,
  offlineJournalEntries,
  offlineDaySessions,
} from "@shared/schema/device-keys";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { SyncConflictResolver } from "../services/sync-conflict-resolver";
import { OfflineAnomalyDetector } from "../services/offline-anomaly-detector";
import {
  executeWithLedger,
  updateCompteSolde,
  updateCreditSolde,
  updateTontineSolde,
  type SourceModule,
  type SensMouvement,
} from "../services/ledger";
import crypto from "crypto";

const logger = createLogger('Routes:SyncJournal');

export const syncJournalRouter = Router();
syncJournalRouter.use(requireAuth);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const handshakeSchema = z.object({
  deviceId: z.string().min(1),
  deviceKeyId: z.string().min(1),
  lastConfirmedSequence: z.number().int().min(0),
  chainHeadHash: z.string(),
  pendingCount: z.number().int().min(0),
  clientVersion: z.string().optional(),
});

const journalEntrySchema = z.object({
  uuid: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: z.string().min(1),
  agentId: z.string(), // Will be validated against auth
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

const registerKeySchema = z.object({
  keyId: z.string().min(1),
  publicKeyJwk: z.record(z.unknown()),
  deviceFingerprint: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

const revokeKeySchema = z.object({
  keyId: z.string().min(1),
  reason: z.string().min(1),
});

// ============================================================================
// PHASE 1: HANDSHAKE
// ============================================================================

syncJournalRouter.post('/handshake', async (req, res) => {
  try {
    const data = handshakeSchema.parse(req.body);
    const agentId = (req as any).user.id;

    // Verify device key exists and is active
    const [deviceKey] = await db
      .select()
      .from(deviceKeys)
      .where(and(
        eq(deviceKeys.id, data.deviceKeyId),
        eq(deviceKeys.agentId, agentId)
      ));

    if (!deviceKey) {
      return res.status(401).json({ error: 'Unknown device key. Please re-register.' });
    }

    if (deviceKey.status === 'revoked') {
      return res.status(403).json({ error: 'Device key has been revoked.', revokedAt: deviceKey.revokedAt });
    }

    // Get last confirmed server sequence for this device
    const [lastConfirmed] = await db
      .select()
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        eq(offlineJournalEntries.deviceId, data.deviceId),
        eq(offlineJournalEntries.status, 'confirmed')
      ))
      .orderBy(desc(offlineJournalEntries.serverTimestamp))
      .limit(1);

    // Get all revoked keys for this agent (client needs to know)
    const revokedKeys = await db
      .select({ id: deviceKeys.id, revokedAt: deviceKeys.revokedAt })
      .from(deviceKeys)
      .where(and(
        eq(deviceKeys.agentId, agentId),
        eq(deviceKeys.status, 'revoked')
      ));

    // Generate signed offline limits
    const offlineLimits = {
      maxCaisseBalance: 5_000_000,   // 5M XAF
      maxSingleOperation: 1_000_000, // 1M XAF
      maxDailyOperations: 50,
      maxDailyVolume: 10_000_000,    // 10M XAF
      maxOfflineDays: 7,
      maxPendingSync: 200,
      allowedOperationTypes: [
        'DEPOSIT', 'WITHDRAWAL', 'LOAN_REPAYMENT',
        'TONTINE_CONTRIBUTION', 'CLIENT_CREATE', 'CLIENT_UPDATE',
        'CAISSE_OPEN', 'CAISSE_CLOSE', 'CAISSE_RECONCILE',
        'REMISE_CREATE', 'SETTLEMENT'
      ],
      lastUpdated: Date.now(),
    };

    // Sign the limits with server HMAC key
    const limitsSignature = signLimits(offlineLimits);

    res.json({
      serverTime: Date.now(),
      serverHeadSequence: lastConfirmed?.serverSequence || '0',
      revokedKeys: revokedKeys.map(k => ({ id: k.id, revokedAt: k.revokedAt })),
      offlineLimits: { ...offlineLimits, serverSignature: limitsSignature },
      keyStatus: deviceKey.status,
      keyExpiresAt: deviceKey.expiresAt,
    });
  } catch (error: any) {
    logger.error('Handshake error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid handshake data', details: error.errors });
    }
    res.status(500).json({ error: 'Handshake failed' });
  }
});

// ============================================================================
// PHASE 2: UPLOAD JOURNAL ENTRIES
// ============================================================================

syncJournalRouter.post('/journal', async (req, res) => {
  try {
    const { entries } = uploadBatchSchema.parse(req.body);
    const agentId = (req as any).user.id;

    const accepted: string[] = [];
    const rejected: Array<{ uuid: string; reason: string }> = [];
    const conflicts: Array<{ uuid: string; conflictWith: string; reason: string }> = [];

    for (const entry of entries) {
      try {
        // 1. Verify agent ownership
        if (entry.agentId !== agentId) {
          rejected.push({ uuid: entry.uuid, reason: 'agent_mismatch' });
          continue;
        }

        // 2. Check idempotency (already processed?)
        const [existing] = await db
          .select({ id: offlineJournalEntries.id })
          .from(offlineJournalEntries)
          .where(eq(offlineJournalEntries.idempotencyKey, entry.idempotencyKey))
          .limit(1);

        if (existing) {
          accepted.push(entry.uuid); // Idempotent: silently accept
          continue;
        }

        // 3. Verify device key exists and is valid
        const [deviceKey] = await db
          .select()
          .from(deviceKeys)
          .where(eq(deviceKeys.id, entry.deviceKeyId));

        if (!deviceKey || deviceKey.status === 'revoked') {
          rejected.push({ uuid: entry.uuid, reason: 'invalid_or_revoked_key' });
          continue;
        }

        // Check if key was revoked BEFORE this entry was created
        if (deviceKey.revokedAt && new Date(entry.localTimestamp) > deviceKey.revokedAt) {
          rejected.push({ uuid: entry.uuid, reason: 'key_revoked_before_operation' });
          continue;
        }

        // 4. Verify ECDSA signature
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

        // 5. Verify hash integrity
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

        // 6. Check temporal consistency
        const correctedTimestamp = entry.localTimestamp + (entry.ntpOffset || 0);
        const serverNow = Date.now();
        const drift = Math.abs(serverNow - correctedTimestamp);
        if (drift > 48 * 60 * 60 * 1000) { // 48h tolerance
          rejected.push({ uuid: entry.uuid, reason: 'excessive_clock_drift' });
          continue;
        }

        // 7. Run conflict resolution
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

        // 8. Store the confirmed entry
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

        // 9. Update device key last used timestamp
        await db
          .update(deviceKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(deviceKeys.id, entry.deviceKeyId));

        // 10. Execute business operation via ledger (creates mouvement + GL + events)
        try {
          const mouvementId = await executeJournalBusinessOperation(entry, agentId);
          if (mouvementId) {
            await db
              .update(offlineJournalEntries)
              .set({ mouvementId })
              .where(eq(offlineJournalEntries.id, entry.uuid));
          }
        } catch (bizError: any) {
          // Business operation failed, but journal entry is still confirmed
          // (separation of concerns: journal records intent, ledger records execution)
          logger.warn(`Business operation failed for entry ${entry.uuid}: ${bizError.message}`);
        }

        accepted.push(entry.uuid);

      } catch (entryError: any) {
        logger.error(`Error processing entry ${entry.uuid}:`, entryError);
        rejected.push({ uuid: entry.uuid, reason: 'processing_error' });
      }
    }

    // 10. Run anomaly detection on the batch
    try {
      await OfflineAnomalyDetector.analyzeBatch(entries, agentId);
    } catch (anomalyError) {
      logger.warn('Anomaly detection error (non-blocking):', anomalyError);
    }

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

// ============================================================================
// PHASE 3: PULL UPDATES
// ============================================================================

syncJournalRouter.get('/pull', async (req, res) => {
  try {
    const agentId = (req as any).user.id;
    const since = req.query.since ? new Date(req.query.since as string) : new Date(0);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Get confirmed entries that the client might not have
    const confirmedEntries = await db
      .select({
        id: offlineJournalEntries.id,
        serverSequence: offlineJournalEntries.serverSequence,
        serverTimestamp: offlineJournalEntries.serverTimestamp,
        status: offlineJournalEntries.status,
        rejectReason: offlineJournalEntries.rejectReason,
      })
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        gte(offlineJournalEntries.serverTimestamp, since)
      ))
      .orderBy(offlineJournalEntries.serverTimestamp)
      .limit(limit);

    res.json({
      entries: confirmedEntries,
      serverTime: Date.now(),
      hasMore: confirmedEntries.length === limit,
    });
  } catch (error) {
    logger.error('Pull sync error:', error);
    res.status(500).json({ error: 'Pull sync failed' });
  }
});

// ============================================================================
// DEVICE KEY MANAGEMENT
// ============================================================================

syncJournalRouter.post('/devices/register-key', async (req, res) => {
  try {
    const data = registerKeySchema.parse(req.body);
    const agentId = (req as any).user.id;

    // Check if key already registered
    const [existing] = await db
      .select()
      .from(deviceKeys)
      .where(eq(deviceKeys.id, data.keyId));

    if (existing) {
      return res.json({ status: 'already_registered', keyId: data.keyId });
    }

    await db.insert(deviceKeys).values({
      id: data.keyId,
      agentId,
      deviceFingerprint: data.deviceFingerprint,
      publicKeyJwk: data.publicKeyJwk,
      status: 'active',
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    logger.info(`Device key registered: ${data.keyId} for agent ${agentId}`);

    res.json({ status: 'registered', keyId: data.keyId });
  } catch (error: any) {
    logger.error('Key registration error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid key data', details: error.errors });
    }
    res.status(500).json({ error: 'Key registration failed' });
  }
});

syncJournalRouter.post('/devices/revoke-key', async (req, res) => {
  try {
    const data = revokeKeySchema.parse(req.body);
    const requesterId = (req as any).user.id;

    // Only admins/supervisors can revoke keys
    const requesterRole = (req as any).user.role;
    const allowedRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR'];
    if (!allowedRoles.includes(requesterRole)) {
      return res.status(403).json({ error: 'Insufficient permissions to revoke device keys' });
    }

    const [key] = await db
      .select()
      .from(deviceKeys)
      .where(eq(deviceKeys.id, data.keyId));

    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }

    if (key.status === 'revoked') {
      return res.json({ status: 'already_revoked', keyId: data.keyId });
    }

    await db
      .update(deviceKeys)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokeReason: data.reason,
      })
      .where(eq(deviceKeys.id, data.keyId));

    logger.warn(`Device key revoked: ${data.keyId}, reason: ${data.reason}, by: ${requesterId}`);

    res.json({ status: 'revoked', keyId: data.keyId });
  } catch (error: any) {
    logger.error('Key revocation error:', error);
    res.status(500).json({ error: 'Key revocation failed' });
  }
});

// ============================================================================
// COBAC COMPLIANCE: OFFLINE DAY RECONSTRUCTION
// ============================================================================

syncJournalRouter.get('/audit/offline-day', async (req, res) => {
  try {
    const agentId = req.query.agentId as string;
    const date = req.query.date as string;

    if (!agentId || !date) {
      return res.status(400).json({ error: 'agentId and date are required' });
    }

    // Only admins/supervisors can access audit data
    const requesterRole = (req as any).user.role;
    const allowedRoles = ['ADMIN', 'CHEF_AGENCE', 'SUPERVISEUR', 'COMPTABLE'];
    if (!allowedRoles.includes(requesterRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for audit access' });
    }

    // Get the day session
    const [session] = await db
      .select()
      .from(offlineDaySessions)
      .where(and(
        eq(offlineDaySessions.agentId, agentId),
        eq(offlineDaySessions.date, date)
      ));

    // Get all journal entries for that day
    const entries = await db
      .select()
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.agentId, agentId),
        eq(offlineJournalEntries.offlineSessionDate, date)
      ))
      .orderBy(offlineJournalEntries.clientTimestamp);

    // Verify chain integrity across the day's entries
    let chainValid = true;
    let allSignaturesValid = true;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify hash
      const expectedHash = computeEntryHash(
        parseInt(entry.clientSequence),
        entry.id,
        entry.eventType,
        entry.payloadHash,
        entry.previousHash,
        entry.clientTimestamp.getTime()
      );

      if (expectedHash !== entry.entryHash) {
        chainValid = false;
        break;
      }

      // Verify chain link
      if (i > 0 && entry.previousHash !== entries[i - 1].entryHash) {
        chainValid = false;
        break;
      }

      // Verify signature
      const [key] = await db
        .select()
        .from(deviceKeys)
        .where(eq(deviceKeys.id, entry.deviceKeyId));

      if (key) {
        const sigValid = await verifyEcdsaSignature(
          entry.entryHash,
          entry.signature,
          key.publicKeyJwk as JsonWebKey
        );
        if (!sigValid) {
          allSignaturesValid = false;
        }
      }
    }

    // Run anomaly detection on the day's entries
    const anomalies = await OfflineAnomalyDetector.analyzeDay(entries, agentId);

    res.json({
      session: session || null,
      journal: entries.map(e => ({
        sequence: e.clientSequence,
        type: e.eventType,
        timestamp: e.clientTimestamp,
        serverTimestamp: e.serverTimestamp,
        hash: e.entryHash,
        signature: e.signature,
        status: e.status,
        payload: e.payload,
        operationRef: e.operationRef,
        metadata: e.metadata,
      })),
      chainValid,
      allSignaturesValid,
      reconciledStatus: session?.status || 'not_found',
      entryCount: entries.length,
      anomalies,
    });
  } catch (error) {
    logger.error('Audit offline-day error:', error);
    res.status(500).json({ error: 'Audit reconstruction failed' });
  }
});

// ============================================================================
// BUSINESS OPERATION EXECUTION
// ============================================================================

/**
 * Map journal event types to ledger source modules and directions.
 */
const EVENT_TYPE_MAPPING: Record<string, {
  sourceModule: SourceModule;
  sens: SensMouvement;
  typePaiement: string;
  requiresGl: boolean;
} | null> = {
  DEPOSIT: { sourceModule: 'EPARGNE', sens: 'CREDIT', typePaiement: 'DEPOT_ESPECES', requiresGl: true },
  WITHDRAWAL: { sourceModule: 'EPARGNE', sens: 'DEBIT', typePaiement: 'RETRAIT_ESPECES', requiresGl: true },
  LOAN_REPAYMENT: { sourceModule: 'CREDIT', sens: 'CREDIT', typePaiement: 'REMBOURSEMENT_CREDIT', requiresGl: true },
  LOAN_DISBURSEMENT: { sourceModule: 'CREDIT', sens: 'DEBIT', typePaiement: 'DECAISSEMENT_CREDIT', requiresGl: true },
  TONTINE_CONTRIBUTION: { sourceModule: 'TONTINE', sens: 'CREDIT', typePaiement: 'COTISATION_TONTINE', requiresGl: true },
  TONTINE_DISTRIBUTION: { sourceModule: 'TONTINE', sens: 'DEBIT', typePaiement: 'DISTRIBUTION_TONTINE', requiresGl: true },
  SETTLEMENT: { sourceModule: 'CAISSE_AGENT', sens: 'CREDIT', typePaiement: 'VERSEMENT_CAISSE', requiresGl: true },
  // Non-financial event types — no ledger operation
  CLIENT_CREATE: null,
  CLIENT_UPDATE: null,
  CAISSE_OPEN: null,
  CAISSE_CLOSE: null,
  CAISSE_RECONCILE: null,
  REMISE_CREATE: null,
};

/**
 * Execute the business operation corresponding to a confirmed journal entry.
 * Creates a mouvement financier, posts to GL, and emits domain events.
 *
 * @returns The mouvement ID if a financial operation was created, null otherwise.
 */
async function executeJournalBusinessOperation(
  entry: z.infer<typeof journalEntrySchema>,
  agentId: string
): Promise<string | null> {
  const mapping = EVENT_TYPE_MAPPING[entry.type];

  // Skip non-financial events
  if (mapping === null || mapping === undefined) {
    return null;
  }

  const payload = entry.payload as Record<string, any>;
  const amount = payload?.amount || payload?.montant;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    logger.warn(`Skipping business op for entry ${entry.uuid}: no valid amount`);
    return null;
  }

  const { result, mouvement } = await executeWithLedger(
    mapping.sourceModule,
    {
      montant: String(amount),
      sens: mapping.sens,
      typePaiement: mapping.typePaiement,
      methodePaiement: 'ESPECES',
      clientId: payload.clientId || undefined,
      compteId: payload.compteId || undefined,
      creditId: payload.creditId || undefined,
      tontineId: payload.tontineId || undefined,
      agenceId: entry.agenceId,
      agentId: agentId,
      referenceExterne: entry.operationRef,
      idempotencyKey: entry.idempotencyKey,
      requiresGlPosting: mapping.requiresGl,
      metadata: {
        offlineSync: true,
        journalUuid: entry.uuid,
        deviceId: entry.deviceId,
        clientTimestamp: entry.localTimestamp,
        sessionId: entry.sessionId,
      },
    },
    async (tx, mouvement) => {
      // Update account/credit/tontine balances based on entry type
      const delta = mapping.sens === 'CREDIT' ? amount : -amount;

      if (payload.compteId) {
        await updateCompteSolde(tx, payload.compteId, delta);
      }
      if (payload.creditId) {
        await updateCreditSolde(tx, payload.creditId, delta);
      }
      if (payload.tontineId) {
        await updateTontineSolde(tx, payload.tontineId, delta);
      }

      return { result: mouvement.id };
    },
    agentId
  );

  logger.info(`Business operation created for journal entry ${entry.uuid}: mouvement ${mouvement.id}`);
  return mouvement.id;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sign offline limits using server HMAC key.
 */
function signLimits(limits: Record<string, unknown>): string {
  const hmacKey = process.env.OFFLINE_LIMITS_HMAC_KEY || 'cofinco-offline-limits-v1';
  const data = JSON.stringify(limits);
  return crypto
    .createHmac('sha256', hmacKey)
    .update(data)
    .digest('base64');
}

/**
 * Compute SHA-256 hash of a journal entry (server-side).
 */
function computeEntryHash(
  sequence: number,
  uuid: string,
  type: string,
  payloadHash: string,
  previousHash: string,
  localTimestamp: number
): string {
  const preimage = `${sequence}|${uuid}|${type}|${payloadHash}|${previousHash}|${localTimestamp}`;
  return crypto.createHash('sha256').update(preimage).digest('hex');
}

/**
 * Verify an ECDSA P-256 signature using Node.js crypto.
 */
async function verifyEcdsaSignature(
  data: string,
  signatureBase64: string,
  publicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    const publicKey = await globalThis.crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const encoded = new TextEncoder().encode(data);
    const signature = Buffer.from(signatureBase64, 'base64');

    return await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      encoded
    );
  } catch (error) {
    logger.error('ECDSA verification error:', error);
    return false;
  }
}
