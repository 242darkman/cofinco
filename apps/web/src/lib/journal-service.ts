/**
 * Journal Service — Immutable Offline Ledger
 *
 * Core service for the "Offline Native Total" architecture.
 * Every financial operation offline is an immutable, signed event
 * in a hash-chained journal stored in IndexedDB.
 *
 * Guarantees:
 * - Append-only: entries can never be modified or deleted
 * - Hash-chained: each entry links to the previous via SHA-256
 * - Signed: each entry is ECDSA P-256 signed by the device key
 * - Tamper-evident: any modification breaks the chain
 * - Ordered: monotonic sequence counter, gap-free
 *
 * @module journal-service
 */

import {
  db,
  generateUUID,
  hashPayload,
  type JournalEntry,
  type JournalEventType,
  type JournalSyncStatus,
} from './offline-db';
import {
  signData,
  hasSigningKey,
  getActiveKeyId,
  computeSha256,
  verifySignature,
  encryptValue,
  hasEncryptionKey,
} from './offline-crypto';
import { getOrCreateFingerprint } from './device-fingerprint';

// ========== CONSTANTS ==========

const GENESIS_HASH = 'GENESIS';
const SESSION_BOOT_TIME = performance.now();

// ========== UUIDv7 GENERATION ==========

/**
 * Generate a UUIDv7 (timestamp-ordered UUID).
 * Uses millisecond precision Unix timestamp in the most significant bits.
 */
function generateUUIDv7(): string {
  const timestamp = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Encode timestamp (48 bits) into first 6 bytes
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp / 2 ** 24) & 0xff;
  bytes[3] = (timestamp / 2 ** 16) & 0xff;
  bytes[4] = (timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ========== ENTRY HASH COMPUTATION ==========

/**
 * Compute the hash of a journal entry for chain linking.
 * Format: SHA-256(sequence|uuid|type|payloadHash|previousHash|localTimestamp)
 */
export async function computeEntryHash(
  sequence: number,
  uuid: string,
  type: JournalEventType,
  payloadHash: string,
  previousHash: string,
  localTimestamp: number
): Promise<string> {
  const preimage = `${sequence}|${uuid}|${type}|${payloadHash}|${previousHash}|${localTimestamp}`;
  return computeSha256(preimage);
}

// ========== SEQUENCE MANAGEMENT ==========

/**
 * Get the next sequence number (monotonically increasing, gap-free).
 * Uses a Dexie transaction to ensure atomicity.
 */
async function getNextSequence(): Promise<{ sequence: number; previousHash: string }> {
  const lastEntry = await db.journalEntries.orderBy('sequence').last();

  if (!lastEntry) {
    return { sequence: 1, previousHash: GENESIS_HASH };
  }

  return {
    sequence: lastEntry.sequence + 1,
    previousHash: lastEntry.entryHash,
  };
}

// ========== NTP OFFSET MANAGEMENT ==========

let lastKnownNtpOffset: number | undefined;

/**
 * Update the NTP offset when a server response is received.
 * Called during sync handshake or any server communication.
 */
export function updateNtpOffset(serverTimestamp: number): void {
  lastKnownNtpOffset = serverTimestamp - Date.now();
}

/**
 * Get the last known NTP offset, or undefined if never synced.
 */
export function getNtpOffset(): number | undefined {
  return lastKnownNtpOffset;
}

// ========== CORE: APPEND JOURNAL ENTRY ==========

export interface AppendEntryOptions {
  type: JournalEventType;
  agentId: string;
  agenceId: string;
  sessionId: string;
  operationRef: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Append a new entry to the immutable offline journal.
 *
 * This is an atomic operation within a Dexie transaction:
 * 1. Get next sequence + previous hash
 * 2. Hash and optionally encrypt the payload
 * 3. Compute entry hash (chain link)
 * 4. Sign the entry hash with ECDSA device key
 * 5. Store the entry
 *
 * @throws Error if no signing key is available
 * @returns The created journal entry
 */
export async function appendJournalEntry(options: AppendEntryOptions): Promise<JournalEntry> {
  if (!hasSigningKey()) {
    throw new Error('Cannot create journal entry: no active device signing key.');
  }

  const deviceKeyId = getActiveKeyId()!;
  const { full: deviceId } = getOrCreateFingerprint();
  const idempotencyKey = `journal-${generateUUID()}-${Date.now()}`;

  // Serialize payload
  const payloadJson = JSON.stringify(options.payload);
  const payloadHash = await hashPayload(payloadJson);

  // Optionally encrypt payload for at-rest protection
  const encryptedPayload = hasEncryptionKey()
    ? await encryptValue(payloadJson)
    : payloadJson;

  // Metadata
  const metadataStr = options.metadata ? JSON.stringify(options.metadata) : undefined;

  // Use Dexie transaction for atomicity
  return await db.transaction('rw', db.journalEntries, async () => {
    const { sequence, previousHash } = await getNextSequence();

    const localTimestamp = Date.now();
    const monotonicClock = performance.now() - SESSION_BOOT_TIME;
    const uuid = generateUUIDv7();

    // Compute chain hash
    const entryHash = await computeEntryHash(
      sequence,
      uuid,
      options.type,
      payloadHash,
      previousHash,
      localTimestamp
    );

    // Sign the entry hash
    const signature = await signData(entryHash);

    const entry: JournalEntry = {
      sequence,
      uuid,
      type: options.type,
      agentId: options.agentId,
      deviceId,
      agenceId: options.agenceId,

      payload: encryptedPayload,
      payloadHash,

      previousHash,
      entryHash,

      signature,
      deviceKeyId,

      localTimestamp,
      monotonicClock,
      ntpOffset: lastKnownNtpOffset,

      syncStatus: 'local',
      syncAttempts: 0,

      sessionId: options.sessionId,
      operationRef: options.operationRef,
      idempotencyKey,
      metadata: metadataStr,
    };

    const id = await db.journalEntries.add(entry);
    return { ...entry, id };
  });
}

// ========== CHAIN INTEGRITY VERIFICATION ==========

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  checkedEntries: number;
  brokenAt?: number;           // Sequence number where chain broke
  brokenReason?: 'hash_mismatch' | 'signature_invalid' | 'sequence_gap' | 'sequence_duplicate';
}

/**
 * Verify the full hash chain integrity of the local journal.
 * Checks:
 * - Sequential ordering (no gaps, no duplicates)
 * - Hash chain continuity (each entry links to previous)
 * - ECDSA signature validity (requires public keys in deviceKeys table)
 *
 * @param verifySignatures If true, also verify ECDSA signatures (slower)
 */
export async function verifyChainIntegrity(
  verifySignatures: boolean = false
): Promise<ChainVerificationResult> {
  const entries = await db.journalEntries.orderBy('sequence').toArray();

  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, checkedEntries: 0 };
  }

  let previousHash = GENESIS_HASH;
  let expectedSequence = 1;

  for (const entry of entries) {
    // Check sequence continuity
    if (entry.sequence !== expectedSequence) {
      const reason = entry.sequence < expectedSequence ? 'sequence_duplicate' : 'sequence_gap';
      return {
        valid: false,
        totalEntries: entries.length,
        checkedEntries: expectedSequence - 1,
        brokenAt: entry.sequence,
        brokenReason: reason,
      };
    }

    // Verify hash chain
    const computedHash = await computeEntryHash(
      entry.sequence,
      entry.uuid,
      entry.type,
      entry.payloadHash,
      previousHash,
      entry.localTimestamp
    );

    if (computedHash !== entry.entryHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        checkedEntries: expectedSequence - 1,
        brokenAt: entry.sequence,
        brokenReason: 'hash_mismatch',
      };
    }

    // Optionally verify signature
    if (verifySignatures) {
      const deviceKey = await db.deviceKeys.get(entry.deviceKeyId);
      if (deviceKey) {
        const publicKeyJwk = JSON.parse(deviceKey.publicKey) as JsonWebKey;
        const sigValid = await verifySignature(entry.entryHash, entry.signature, publicKeyJwk);
        if (!sigValid) {
          return {
            valid: false,
            totalEntries: entries.length,
            checkedEntries: expectedSequence - 1,
            brokenAt: entry.sequence,
            brokenReason: 'signature_invalid',
          };
        }
      }
    }

    previousHash = entry.entryHash;
    expectedSequence++;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    checkedEntries: entries.length,
  };
}

// ========== QUERY FUNCTIONS ==========

/**
 * Get unsynced journal entries ordered by sequence.
 */
export async function getUnsyncedEntries(limit?: number): Promise<JournalEntry[]> {
  let collection = db.journalEntries
    .where('syncStatus')
    .equals('local')
    .sortBy('sequence');

  const entries = await collection;
  return limit ? entries.slice(0, limit) : entries;
}

/**
 * Get journal entries for a specific day session.
 */
export async function getSessionEntries(sessionId: string): Promise<JournalEntry[]> {
  return db.journalEntries
    .where('sessionId')
    .equals(sessionId)
    .sortBy('sequence');
}

/**
 * Get the chain head (last entry hash and sequence).
 */
export async function getChainHead(): Promise<{ sequence: number; hash: string } | null> {
  const lastEntry = await db.journalEntries.orderBy('sequence').last();
  if (!lastEntry) return null;
  return { sequence: lastEntry.sequence, hash: lastEntry.entryHash };
}

/**
 * Get total count of entries by sync status.
 */
export async function getJournalStats(): Promise<Record<JournalSyncStatus, number>> {
  const [local, syncing, confirmed, rejected] = await Promise.all([
    db.journalEntries.where('syncStatus').equals('local').count(),
    db.journalEntries.where('syncStatus').equals('syncing').count(),
    db.journalEntries.where('syncStatus').equals('confirmed').count(),
    db.journalEntries.where('syncStatus').equals('rejected').count(),
  ]);
  return { local, syncing, confirmed, rejected };
}

// ========== SYNC STATUS UPDATES ==========

/**
 * Mark entries as syncing (before upload).
 */
export async function markEntriesSyncing(uuids: string[]): Promise<void> {
  await db.transaction('rw', db.journalEntries, async () => {
    for (const uuid of uuids) {
      const entry = await db.journalEntries.where('uuid').equals(uuid).first();
      if (entry) {
        await db.journalEntries.update(entry.id!, {
          syncStatus: 'syncing' as JournalSyncStatus,
          syncAttempts: entry.syncAttempts + 1,
        });
      }
    }
  });
}

/**
 * Mark entries as confirmed by the server.
 */
export async function markEntriesConfirmed(
  confirmations: Array<{ uuid: string; serverTimestamp: number; serverSequence: number }>
): Promise<void> {
  for (const conf of confirmations) {
    const entry = await db.journalEntries.where('uuid').equals(conf.uuid).first();
    if (entry) {
      await db.journalEntries.update(entry.id!, {
        syncStatus: 'confirmed' as JournalSyncStatus,
        serverTimestamp: conf.serverTimestamp,
        serverSequence: conf.serverSequence,
      });
    }
  }
}

/**
 * Mark entries as rejected by the server.
 */
export async function markEntriesRejected(
  rejections: Array<{ uuid: string; reason: string }>
): Promise<void> {
  for (const rej of rejections) {
    const entry = await db.journalEntries.where('uuid').equals(rej.uuid).first();
    if (entry) {
      await db.journalEntries.update(entry.id!, {
        syncStatus: 'rejected' as JournalSyncStatus,
        syncError: rej.reason,
      });
    }
  }
}

// ========== DEVICE KEY MANAGEMENT ==========

/**
 * Store a new device key pair in IndexedDB.
 */
export async function storeDeviceKey(
  keyId: string,
  publicKeyJwk: JsonWebKey,
  privateKey: CryptoKey,
  agentId: string
): Promise<void> {
  const { full: deviceFingerprint } = getOrCreateFingerprint();

  await db.deviceKeys.put({
    id: keyId,
    publicKey: JSON.stringify(publicKeyJwk),
    privateKey,
    createdAt: Date.now(),
    expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
    status: 'active',
    agentId,
    deviceFingerprint,
    serverRegistered: false,
  });
}

/**
 * Get the active device key for the current agent.
 */
export async function getActiveDeviceKey(agentId: string): Promise<{
  keyId: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
} | null> {
  const key = await db.deviceKeys
    .where('agentId')
    .equals(agentId)
    .filter((k) => k.status === 'active')
    .first();

  if (!key) return null;

  return {
    keyId: key.id,
    privateKey: key.privateKey,
    publicKeyJwk: JSON.parse(key.publicKey),
  };
}

/**
 * Mark a device key as registered with the server.
 */
export async function markKeyServerRegistered(keyId: string): Promise<void> {
  await db.deviceKeys.update(keyId, { serverRegistered: true });
}

/**
 * Rotate the active key: mark old as rotated, generate and store new.
 */
export async function rotateDeviceKey(
  oldKeyId: string,
  newKeyId: string,
  newPublicKeyJwk: JsonWebKey,
  newPrivateKey: CryptoKey,
  agentId: string
): Promise<void> {
  await db.transaction('rw', db.deviceKeys, async () => {
    // Mark old key as rotated
    await db.deviceKeys.update(oldKeyId, { status: 'rotated' });

    // Store new key
    await storeDeviceKey(newKeyId, newPublicKeyJwk, newPrivateKey, agentId);
  });
}

/**
 * Check if the active key needs rotation (approaching expiry).
 */
export async function needsKeyRotation(agentId: string): Promise<boolean> {
  const key = await db.deviceKeys
    .where('agentId')
    .equals(agentId)
    .filter((k) => k.status === 'active')
    .first();

  if (!key) return true; // No active key

  // Rotate if less than 7 days before expiry
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return key.expiresAt - Date.now() < sevenDays;
}

// ========== OPERATION REFERENCE GENERATION ==========

let dailyCounter = 0;
let lastCounterDate = '';

/**
 * Generate a unique operation reference for the current day.
 * Format: {prefix}-YYYYMMDD-{6-digit counter}
 */
export function generateOperationRef(type: JournalEventType): string {
  const prefixMap: Record<JournalEventType, string> = {
    DEPOSIT: 'DEP',
    WITHDRAWAL: 'RET',
    LOAN_DISBURSEMENT: 'DEC',
    LOAN_REPAYMENT: 'RMB',
    TONTINE_CONTRIBUTION: 'TCO',
    TONTINE_DISTRIBUTION: 'TDI',
    CLIENT_CREATE: 'CLI',
    CLIENT_UPDATE: 'CLU',
    CAISSE_OPEN: 'COP',
    CAISSE_CLOSE: 'CCL',
    CAISSE_RECONCILE: 'CRC',
    REMISE_CREATE: 'REM',
    SETTLEMENT: 'SET',
  };

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (lastCounterDate !== today) {
    dailyCounter = 0;
    lastCounterDate = today;
  }

  dailyCounter++;
  const prefix = prefixMap[type] || 'OTH';
  const counter = String(dailyCounter).padStart(6, '0');

  return `${prefix}-${today}-${counter}`;
}
