/**
 * Unified Offline Database using Dexie (IndexedDB)
 *
 * This module provides comprehensive offline-first functionality:
 * 1. Offline operation queue for sync (transfers, payments, etc.)
 * 2. Persistent caching for slow connections (3G/offline scenarios)
 * 3. Full entity storage for offline access
 * 4. Conflict resolution tracking
 * 5. User preferences and session storage
 *
 * @module offline-db
 */

import Dexie, { type Table } from 'dexie';
import { encryptValue, decryptValue, hasEncryptionKey } from './offline-crypto';

// ========== OPERATION TYPES (for offline sync queue) ==========

export type OperationPriority = 'critical' | 'high' | 'medium' | 'low';
export type OperationStatus = 'pending' | 'syncing' | 'completed' | 'failed' | 'conflict';
export type OperationType =
  | 'transfer'
  | 'caisse'
  | 'client'
  | 'payment'
  | 'epargne'
  | 'credit'
  | 'tontine'
  | 'remise'
  | 'enquete'
  | 'other';

export interface OfflineOperation {
  id?: number;
  uuid: string;
  type: OperationType;
  priority: OperationPriority;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: string;
  payloadHash: string;
  status: OperationStatus;
  retryCount: number;
  maxRetries: number;
  lastAttemptAt?: number;
  createdAt: number;
  syncedAt?: number;
  errorMessage?: string;
  idempotencyKey: string;
  userId?: number;
  agenceId?: string;
  serverResponse?: string;
  // Background sync metadata
  backgroundSyncTag?: string;
  estimatedSyncTime?: number;
}

// ========== ENTITY TYPES (full offline storage) ==========

export interface OfflineClient {
  id?: number;
  serverId?: number;
  uuid: string;
  data: string; // JSON stringified client data
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  isDirty: boolean;
  isDeleted?: boolean;
  agenceId?: string;
}

export interface OfflineTransfer {
  id?: number;
  serverId?: string;
  uuid: string;
  data: string;
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  status: 'draft' | 'pending' | 'synced' | 'failed';
  agenceId?: string;
}

export interface OfflineCaisseTransaction {
  id?: number;
  serverId?: number;
  uuid: string;
  data: string;
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  isDirty: boolean;
  caisseId?: string;
  sessionId?: string;
}

export interface OfflineEpargneAccount {
  id?: number;
  serverId?: number;
  uuid: string;
  clientId: string;
  data: string;
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  isDirty: boolean;
}

export interface OfflineCredit {
  id?: number;
  serverId?: number;
  uuid: string;
  clientId: string;
  data: string;
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  isDirty: boolean;
  status: string;
}

export interface OfflineTontine {
  id?: number;
  serverId?: number;
  uuid: string;
  data: string;
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  isDirty: boolean;
}

export interface OfflineRemise {
  id?: number;
  serverId?: string;
  uuid: string;
  agentId: string;
  data: string;
  status: 'draft' | 'pending' | 'synced' | 'failed';
  photos: string[]; // Base64 encoded photos
  gpsCoordinates?: { lat: number; lng: number };
  createdAt: number;
  syncedAt?: number;
}

export interface OfflineEnquete {
  id?: number;
  serverId?: number;
  uuid: string;
  clientId: string;
  demandeId?: string;
  data: any;
  photos: string[]; // Base64 encoded
  gpsCoordinates?: { lat: number; lng: number };
  timestamp: Date;
  synced: number; // 0 = false, 1 = true
  agentId?: string;
}

// ========== SYNC & CONFLICT TYPES ==========

export interface SyncMetadata {
  id?: number;
  key: string;
  value: string;
  updatedAt: number;
}

export interface ConflictRecord {
  id?: number;
  operationId: string;
  entityType: OperationType;
  entityId: string;
  localData: string;
  serverData: string;
  createdAt: number;
  resolvedAt?: number;
  resolution?: 'local' | 'server' | 'merged';
  resolvedBy?: string;
  mergedData?: string;
}

// ========== CACHE TYPES ==========

export interface CachedQuery {
  id?: number;
  key: string;
  data: unknown;
  timestamp: number;
  ttl: number;
  meta?: {
    endpoint?: string;
    version?: string;
    etag?: string;
  };
}

export interface CachedConfig {
  id?: number;
  key: string;
  data: unknown;
  updatedAt: number;
  version: string;
}

export interface UserPreference {
  id?: number;
  key: string;
  value: unknown;
  userId?: string;
}

// ========== OFFLINE SESSION ==========

export interface OfflineSession {
  id?: number;
  userId: number;
  userName: string;
  userRole: string;
  agenceId?: string;
  agenceName?: string;
  permissions: string[];
  expiresAt: number;
  createdAt: number;
}

// ========== MAP TILES CACHE ==========

export interface CachedMapTile {
  id?: number;
  tileUrl: string;
  blob: Blob;
  zoom: number;
  x: number;
  y: number;
  timestamp: number;
}

// ========== JOURNAL ENTRIES (Immutable Offline Ledger) ==========

export type JournalEventType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'LOAN_DISBURSEMENT'
  | 'LOAN_REPAYMENT'
  | 'TONTINE_CONTRIBUTION'
  | 'TONTINE_DISTRIBUTION'
  | 'CLIENT_CREATE'
  | 'CLIENT_UPDATE'
  | 'CAISSE_OPEN'
  | 'CAISSE_CLOSE'
  | 'CAISSE_RECONCILE'
  | 'REMISE_CREATE'
  | 'SETTLEMENT';

export type JournalSyncStatus = 'local' | 'syncing' | 'confirmed' | 'rejected';

export interface JournalEntry {
  id?: number;
  sequence: number;               // Monotonically increasing, gap-free
  uuid: string;                   // UUIDv7 (timestamp-ordered)
  type: JournalEventType;
  agentId: string;
  deviceId: string;               // Device fingerprint
  agenceId: string;

  // Payload
  payload: string;                // AES-GCM encrypted JSON of business data
  payloadHash: string;            // SHA-256 of plaintext payload

  // Chain linking (tamper detection)
  previousHash: string;           // Hash of previous entry ("GENESIS" for first)
  entryHash: string;              // SHA-256(sequence|uuid|type|payloadHash|previousHash|timestamp)

  // Signature
  signature: string;              // ECDSA P-256 signature of entryHash
  deviceKeyId: string;            // ID of signing key (for rotation tracking)

  // Timestamps
  localTimestamp: number;         // Date.now() at creation
  monotonicClock: number;         // performance.now() relative to session boot
  ntpOffset?: number;             // Last known NTP offset (serverTime - localTime)

  // Sync state
  syncStatus: JournalSyncStatus;
  serverTimestamp?: number;       // Server-assigned timestamp after sync
  serverSequence?: number;        // Global server sequence after sync
  syncAttempts: number;
  syncError?: string;

  // Context
  sessionId: string;              // Offline day session ID
  operationRef: string;           // Business reference (e.g., EPG-20260213-XXXXXX)
  idempotencyKey: string;
  metadata?: string;              // JSON (GPS coords, billetage, etc.)
}

// ========== DEVICE KEYS (ECDSA P-256 Key Store) ==========

export type DeviceKeyStatus = 'active' | 'rotated' | 'revoked';

export interface DeviceKey {
  id: string;                     // SHA-256 fingerprint of public key JWK
  publicKey: string;              // Exported JWK (JSON string)
  privateKey: CryptoKey;          // Non-extractable CryptoKey (stored by Dexie as structured clone)
  createdAt: number;
  expiresAt: number;              // 90-day rotation
  status: DeviceKeyStatus;
  agentId: string;
  deviceFingerprint: string;
  serverRegistered: boolean;      // Public key sent to server
}

// ========== AGENT DAY SESSION (Offline Treasury Tracking) ==========

export type DaySessionSyncStatus = 'open' | 'closed' | 'synced' | 'reconciled';

export interface AgentDaySession {
  id?: number;
  date: string;                   // YYYY-MM-DD
  agentId: string;
  deviceId: string;

  // Opening
  openedAt: number;
  openingBalance: number;         // Cash at start of day
  openingBilletage: string;       // JSON denomination breakdown

  // Real-time tracking
  currentCashBalance: number;     // Computed = opening + sum(cash impacts)
  operationCount: number;
  dailyVolume: number;            // Sum of absolute amounts

  // Collections
  totalCollected: number;         // Deposits + repayments received
  totalDisbursed: number;         // Withdrawals + disbursements made

  // Closing
  closedAt?: number;
  closingBalance?: number;        // Physically counted cash
  closingBilletage?: string;
  discrepancy?: number;           // closingBalance - currentCashBalance
  discrepancyJustification?: string;

  // Sync
  syncStatus: DaySessionSyncStatus;
  lastSyncTimestamp: number;

  // Chain reference
  firstJournalSequence?: number;
  lastJournalSequence?: number;
}

// ========== OFFLINE LIMITS (Server-Signed Parameters) ==========

export interface OfflineLimits {
  id: string;                     // 'current'
  maxCaisseBalance: number;       // Max agent cash balance (e.g., 5,000,000 XAF)
  maxSingleOperation: number;     // Max single operation (e.g., 1,000,000 XAF)
  maxDailyOperations: number;     // Max ops per day (e.g., 50)
  maxDailyVolume: number;         // Max daily volume (e.g., 10,000,000 XAF)
  maxOfflineDays: number;         // Max days offline (e.g., 7)
  maxPendingSync: number;         // Max unsynced operations (e.g., 200)
  allowedOperationTypes: string[];// Types allowed offline
  lastUpdated: number;
  serverSignature: string;        // HMAC-SHA256 by server (anti-tampering)
}

// ========== GPS TRACKING ==========

export interface GpsTrackPoint {
  id?: number;
  agentId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  synced: boolean;
  activityType?: 'collection' | 'visit' | 'delivery' | 'other';
  metadata?: string;
}

// ========== DATABASE CLASS ==========

/**
 * Unified Dexie database for offline-first functionality
 */
class OfflineDatabase extends Dexie {
  // Sync queue tables
  operations!: Table<OfflineOperation>;
  conflicts!: Table<ConflictRecord>;
  metadata!: Table<SyncMetadata>;

  // Entity tables
  clients!: Table<OfflineClient>;
  transfers!: Table<OfflineTransfer>;
  caisseTransactions!: Table<OfflineCaisseTransaction>;
  epargneAccounts!: Table<OfflineEpargneAccount>;
  credits!: Table<OfflineCredit>;
  tontines!: Table<OfflineTontine>;
  remises!: Table<OfflineRemise>;
  enquetes!: Table<OfflineEnquete>;

  // Cache tables
  cachedQueries!: Table<CachedQuery>;
  cachedConfigs!: Table<CachedConfig>;
  preferences!: Table<UserPreference>;

  // Session & Maps
  offlineSessions!: Table<OfflineSession>;
  mapTiles!: Table<CachedMapTile>;
  gpsTrackPoints!: Table<GpsTrackPoint>;

  // Offline-native ledger tables
  journalEntries!: Table<JournalEntry>;
  deviceKeys!: Table<DeviceKey>;
  agentDaySessions!: Table<AgentDaySession>;
  offlineLimits!: Table<OfflineLimits>;

  constructor() {
    super('COFINOfflineDB');

    // Version 3: Offline-native ledger with cryptographic integrity
    this.version(3).stores({
      // Sync queue tables
      operations: '++id, uuid, type, priority, status, createdAt, idempotencyKey, userId, agenceId, backgroundSyncTag',
      conflicts: '++id, operationId, entityType, entityId, createdAt, resolvedAt',
      metadata: '++id, key',

      // Entity tables
      clients: '++id, uuid, serverId, isDirty, lastSyncedAt, agenceId, isDeleted',
      transfers: '++id, uuid, serverId, status, lastSyncedAt, agenceId',
      caisseTransactions: '++id, uuid, serverId, isDirty, lastSyncedAt, caisseId, sessionId',
      epargneAccounts: '++id, uuid, serverId, clientId, isDirty, lastSyncedAt',
      credits: '++id, uuid, serverId, clientId, isDirty, lastSyncedAt, status',
      tontines: '++id, uuid, serverId, isDirty, lastSyncedAt',
      remises: '++id, uuid, serverId, agentId, status, createdAt',
      enquetes: '++id, uuid, serverId, clientId, demandeId, synced, timestamp, agentId',

      // Cache tables
      cachedQueries: '++id, key, timestamp',
      cachedConfigs: '++id, key, version',
      preferences: '++id, key, userId',

      // Session & Maps
      offlineSessions: '++id, userId, expiresAt',
      mapTiles: '++id, tileUrl, zoom, [zoom+x+y], timestamp',
      gpsTrackPoints: '++id, agentId, timestamp, synced',

      // Offline-native ledger tables
      journalEntries: '++id, sequence, uuid, type, syncStatus, sessionId, [agentId+syncStatus], idempotencyKey, localTimestamp',
      deviceKeys: 'id, status, agentId, deviceFingerprint',
      agentDaySessions: '++id, date, agentId, syncStatus, [agentId+date]',
      offlineLimits: 'id'
    });

    // Version 2: Enhanced schema with full offline support
    this.version(2).stores({
      // Sync queue tables
      operations: '++id, uuid, type, priority, status, createdAt, idempotencyKey, userId, agenceId, backgroundSyncTag',
      conflicts: '++id, operationId, entityType, entityId, createdAt, resolvedAt',
      metadata: '++id, key',

      // Entity tables
      clients: '++id, uuid, serverId, isDirty, lastSyncedAt, agenceId, isDeleted',
      transfers: '++id, uuid, serverId, status, lastSyncedAt, agenceId',
      caisseTransactions: '++id, uuid, serverId, isDirty, lastSyncedAt, caisseId, sessionId',
      epargneAccounts: '++id, uuid, serverId, clientId, isDirty, lastSyncedAt',
      credits: '++id, uuid, serverId, clientId, isDirty, lastSyncedAt, status',
      tontines: '++id, uuid, serverId, isDirty, lastSyncedAt',
      remises: '++id, uuid, serverId, agentId, status, createdAt',
      enquetes: '++id, uuid, serverId, clientId, demandeId, synced, timestamp, agentId',

      // Cache tables
      cachedQueries: '++id, key, timestamp',
      cachedConfigs: '++id, key, version',
      preferences: '++id, key, userId',

      // Session & Maps
      offlineSessions: '++id, userId, expiresAt',
      mapTiles: '++id, tileUrl, zoom, [zoom+x+y], timestamp',
      gpsTrackPoints: '++id, agentId, timestamp, synced'
    }).upgrade(tx => {
      // Migration from v1 to v2: rename enquetes_offline to enquetes
      return tx.table('enquetes_offline').toArray().then(enquetes => {
        return tx.table('enquetes').bulkAdd(enquetes.map(e => ({
          ...e,
          uuid: e.uuid || generateUUID(),
          photos: e.photos || [],
          synced: e.synced || 0
        })));
      }).catch(() => {
        // Table might not exist, that's fine
      });
    });

    // Keep v1 schema for backward compatibility during migration
    this.version(1).stores({
      operations: '++id, uuid, type, priority, status, createdAt, idempotencyKey',
      clients: '++id, uuid, serverId, isDirty, lastSyncedAt',
      transfers: '++id, uuid, serverId, status, lastSyncedAt',
      caisseTransactions: '++id, uuid, serverId, isDirty, lastSyncedAt',
      metadata: '++id, key',
      conflicts: '++id, operationId, entityType, entityId, createdAt',
      enquetes_offline: '++id, clientId, timestamp, synced',
      cachedQueries: '++id, key, timestamp',
      cachedConfigs: '++id, key, version',
      preferences: '++id, key, userId'
    });
  }
}

// Singleton instance
export const db = new OfflineDatabase();
// Alias for backward compatibility
export const offlineDb = db;

// ========== CACHE TTL CONFIGURATION ==========

export const CACHE_TTL = {
  CONFIG: 24 * 60 * 60 * 1000, // 24 hours
  LOOKUP: 12 * 60 * 60 * 1000, // 12 hours
  STATS: 5 * 60 * 1000, // 5 minutes
  LIST: 10 * 60 * 1000, // 10 minutes
  RECORD: 15 * 60 * 1000, // 15 minutes
  CLIENT: 60 * 60 * 1000, // 1 hour
  MAP_TILE: 30 * 24 * 60 * 60 * 1000 // 30 days
} as const;

// ========== UUID & HASH UTILITIES ==========

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 1
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export async function hashPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ========== PRIORITY UTILITIES ==========

export function getPriorityOrder(priority: OperationPriority): number {
  const order: Record<OperationPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };
  return order[priority];
}

export function getOperationPriority(type: OperationType): OperationPriority {
  const priorities: Record<OperationType, OperationPriority> = {
    transfer: 'critical',
    caisse: 'critical',
    remise: 'critical',
    payment: 'high',
    credit: 'high',
    epargne: 'medium',
    client: 'medium',
    tontine: 'medium',
    enquete: 'medium',
    other: 'low'
  };
  return priorities[type];
}

// ========== OFFLINE OPERATION FUNCTIONS ==========

export async function addOfflineOperation(
  type: OperationType,
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  payload: any,
  options?: {
    userId?: number;
    agenceId?: string;
    backgroundSyncTag?: string;
  }
): Promise<string> {
  const uuid = generateUUID();
  const payloadStr = JSON.stringify(payload);
  const payloadHash = await hashPayload(payloadStr);
  const idempotencyKey = `offline-${uuid}-${Date.now()}`;

  await db.operations.add({
    uuid,
    type,
    priority: getOperationPriority(type),
    endpoint,
    method,
    payload: payloadStr,
    payloadHash,
    status: 'pending',
    retryCount: 0,
    maxRetries: 5,
    createdAt: Date.now(),
    idempotencyKey,
    userId: options?.userId,
    agenceId: options?.agenceId,
    backgroundSyncTag: options?.backgroundSyncTag
  });

  return uuid;
}

export async function getPendingOperations(
  options?: { type?: OperationType; agenceId?: string; limit?: number }
): Promise<OfflineOperation[]> {
  let query = db.operations.where('status').anyOf(['pending', 'failed']);

  const operations = await query.toArray();

  let filtered = operations;

  if (options?.type) {
    filtered = filtered.filter((op) => op.type === options.type);
  }

  if (options?.agenceId) {
    filtered = filtered.filter((op) => op.agenceId === options.agenceId);
  }

  // Sort by priority then by creation time
  filtered.sort((a, b) => {
    const priorityDiff = getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.createdAt - b.createdAt;
  });

  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

export async function updateOperationStatus(
  uuid: string,
  status: OperationStatus,
  errorMessage?: string,
  serverResponse?: string
): Promise<void> {
  const operation = await db.operations.where('uuid').equals(uuid).first();
  if (operation) {
    await db.operations.update(operation.id!, {
      status,
      lastAttemptAt: Date.now(),
      retryCount: status === 'failed' ? operation.retryCount + 1 : operation.retryCount,
      syncedAt: status === 'completed' ? Date.now() : undefined,
      errorMessage,
      serverResponse
    });
  }
}

export async function getOperationStats(): Promise<{
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflict: number;
  byType: Record<OperationType, number>;
}> {
  const [pending, syncing, completed, failed, conflict] = await Promise.all([
    db.operations.where('status').equals('pending').count(),
    db.operations.where('status').equals('syncing').count(),
    db.operations.where('status').equals('completed').count(),
    db.operations.where('status').equals('failed').count(),
    db.operations.where('status').equals('conflict').count()
  ]);

  const pendingOps = await db.operations.where('status').equals('pending').toArray();
  const byType: Record<OperationType, number> = {
    transfer: 0,
    caisse: 0,
    client: 0,
    payment: 0,
    epargne: 0,
    credit: 0,
    tontine: 0,
    remise: 0,
    enquete: 0,
    other: 0
  };

  pendingOps.forEach((op) => {
    byType[op.type]++;
  });

  return { pending, syncing, completed, failed, conflict, byType };
}

export async function clearCompletedOperations(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const toDelete = await db.operations
    .where('status')
    .equals('completed')
    .filter((op) => (op.syncedAt || 0) < cutoff)
    .toArray();

  await db.operations.bulkDelete(toDelete.map((op) => op.id!));
  return toDelete.length;
}

// ========== CONFLICT FUNCTIONS ==========

export async function addConflict(
  operationId: string,
  entityType: OperationType,
  entityId: string,
  localData: any,
  serverData: any
): Promise<number> {
  return await db.conflicts.add({
    operationId,
    entityType,
    entityId,
    localData: JSON.stringify(localData),
    serverData: JSON.stringify(serverData),
    createdAt: Date.now()
  });
}

export async function getUnresolvedConflicts(): Promise<ConflictRecord[]> {
  return db.conflicts.filter((c) => !c.resolvedAt).toArray();
}

export async function resolveConflict(
  conflictId: number,
  resolution: 'local' | 'server' | 'merged',
  resolvedBy?: string,
  mergedData?: any
): Promise<void> {
  await db.conflicts.update(conflictId, {
    resolvedAt: Date.now(),
    resolution,
    resolvedBy,
    mergedData: mergedData ? JSON.stringify(mergedData) : undefined
  });
}

export async function getConflictsByType(type: OperationType): Promise<ConflictRecord[]> {
  return db.conflicts.where('entityType').equals(type).filter((c) => !c.resolvedAt).toArray();
}

// ========== METADATA FUNCTIONS ==========

export async function setMetadata(key: string, value: any): Promise<void> {
  const existing = await db.metadata.where('key').equals(key).first();
  if (existing) {
    await db.metadata.update(existing.id!, {
      value: JSON.stringify(value),
      updatedAt: Date.now()
    });
  } else {
    await db.metadata.add({
      key,
      value: JSON.stringify(value),
      updatedAt: Date.now()
    });
  }
}

export async function getMetadata<T>(key: string): Promise<T | null> {
  const record = await db.metadata.where('key').equals(key).first();
  if (record) {
    return JSON.parse(record.value) as T;
  }
  return null;
}

// ========== CLIENT OFFLINE STORAGE ==========

export async function saveClientOffline(client: any, agenceId?: string): Promise<string> {
  const uuid = client.uuid || generateUUID();
  const existing = await db.clients.where('uuid').equals(uuid).first();

  // Encrypt sensitive client data if encryption key is available
  const rawData = JSON.stringify(client);
  const data = hasEncryptionKey() ? await encryptValue(rawData) : rawData;

  if (existing) {
    await db.clients.update(existing.id!, {
      data,
      localVersion: existing.localVersion + 1,
      isDirty: true,
      agenceId
    });
  } else {
    await db.clients.add({
      uuid,
      serverId: client.id,
      data,
      localVersion: 1,
      serverVersion: client.version,
      isDirty: !client.id, // Dirty if new (no server ID)
      agenceId
    });
  }

  return uuid;
}

export async function getClientOffline(uuid: string): Promise<any | null> {
  const record = await db.clients.where('uuid').equals(uuid).first();
  if (record) {
    // Decrypt if the data was encrypted
    const data = record.data.startsWith('enc:')
      ? await decryptValue(record.data)
      : record.data;
    return JSON.parse(data);
  }
  return null;
}

export async function getClientsOffline(options?: {
  agenceId?: string;
  isDirty?: boolean;
  limit?: number;
}): Promise<any[]> {
  let collection = db.clients.filter((c) => !c.isDeleted);

  if (options?.agenceId) {
    collection = collection.and((c) => c.agenceId === options.agenceId);
  }

  if (options?.isDirty !== undefined) {
    collection = collection.and((c) => c.isDirty === options.isDirty);
  }

  let results = await collection.toArray();

  if (options?.limit) {
    results = results.slice(0, options.limit);
  }

  return Promise.all(results.map(async (r) => {
    const data = r.data.startsWith('enc:')
      ? await decryptValue(r.data)
      : r.data;
    return { ...JSON.parse(data), _offline: { uuid: r.uuid, isDirty: r.isDirty } };
  }));
}

export async function markClientSynced(uuid: string, serverId: number, serverVersion?: number): Promise<void> {
  const existing = await db.clients.where('uuid').equals(uuid).first();
  if (existing) {
    await db.clients.update(existing.id!, {
      serverId,
      serverVersion,
      lastSyncedAt: Date.now(),
      isDirty: false
    });
  }
}

// ========== REMISE (TERRAIN) OFFLINE STORAGE ==========

export async function saveRemiseOffline(
  agentId: string,
  data: any,
  photos: string[] = [],
  gpsCoordinates?: { lat: number; lng: number }
): Promise<string> {
  const uuid = generateUUID();

  await db.remises.add({
    uuid,
    agentId,
    data: JSON.stringify(data),
    status: 'draft',
    photos,
    gpsCoordinates,
    createdAt: Date.now()
  });

  return uuid;
}

export async function getRemisesOffline(agentId: string): Promise<OfflineRemise[]> {
  return db.remises.where('agentId').equals(agentId).toArray();
}

export async function updateRemiseStatus(
  uuid: string,
  status: 'draft' | 'pending' | 'synced' | 'failed',
  serverId?: string
): Promise<void> {
  const existing = await db.remises.where('uuid').equals(uuid).first();
  if (existing) {
    await db.remises.update(existing.id!, {
      status,
      serverId,
      syncedAt: status === 'synced' ? Date.now() : undefined
    });
  }
}

// ========== ENQUETE OFFLINE STORAGE ==========

export async function saveEnqueteOffline(
  clientId: string,
  data: any,
  options?: {
    demandeId?: string;
    photos?: string[];
    gpsCoordinates?: { lat: number; lng: number };
    agentId?: string;
  }
): Promise<string> {
  const uuid = generateUUID();

  await db.enquetes.add({
    uuid,
    clientId,
    demandeId: options?.demandeId,
    data,
    photos: options?.photos || [],
    gpsCoordinates: options?.gpsCoordinates,
    timestamp: new Date(),
    synced: 0,
    agentId: options?.agentId
  });

  return uuid;
}

export async function getEnquetesOffline(options?: {
  clientId?: string;
  agentId?: string;
  synced?: boolean;
}): Promise<OfflineEnquete[]> {
  let collection = db.enquetes.toCollection();

  if (options?.clientId) {
    collection = db.enquetes.where('clientId').equals(options.clientId);
  }

  let results = await collection.toArray();

  if (options?.agentId) {
    results = results.filter((e) => e.agentId === options.agentId);
  }

  if (options?.synced !== undefined) {
    results = results.filter((e) => (e.synced === 1) === options.synced);
  }

  return results;
}

export async function markEnqueteSynced(uuid: string, serverId: number): Promise<void> {
  const existing = await db.enquetes.where('uuid').equals(uuid).first();
  if (existing) {
    await db.enquetes.update(existing.id!, {
      serverId,
      synced: 1
    });
  }
}

// ========== CACHE QUERY FUNCTIONS ==========

export async function getCachedQuery<T>(key: string): Promise<T | null> {
  try {
    const cached = await db.cachedQueries.where('key').equals(key).first();

    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > cached.ttl;
    if (isExpired) {
      await db.cachedQueries.delete(cached.id!);
      return null;
    }

    return cached.data as T;
  } catch (error) {
    console.warn('[OfflineDB] Error reading cache:', error);
    return null;
  }
}

export async function setCachedQuery<T>(
  key: string,
  data: T,
  ttl: number = CACHE_TTL.RECORD,
  meta?: CachedQuery['meta']
): Promise<void> {
  try {
    await db.cachedQueries.where('key').equals(key).delete();
    await db.cachedQueries.add({
      key,
      data,
      timestamp: Date.now(),
      ttl,
      meta
    });
  } catch (error) {
    console.warn('[OfflineDB] Error writing cache:', error);
  }
}

export async function clearCachedQuery(key: string): Promise<void> {
  try {
    await db.cachedQueries.where('key').equals(key).delete();
  } catch (error) {
    console.warn('[OfflineDB] Error clearing cache:', error);
  }
}

export async function clearCacheByPattern(pattern: string): Promise<number> {
  try {
    const regex = new RegExp(pattern);
    const toDelete = await db.cachedQueries.filter((c) => regex.test(c.key)).toArray();
    await db.cachedQueries.bulkDelete(toDelete.map((c) => c.id!));
    return toDelete.length;
  } catch (error) {
    console.warn('[OfflineDB] Error clearing cache by pattern:', error);
    return 0;
  }
}

export async function purgeExpiredCache(): Promise<number> {
  try {
    const now = Date.now();
    const expired = await db.cachedQueries.filter((entry) => now - entry.timestamp > entry.ttl).toArray();

    const ids = expired.map((e) => e.id!).filter(Boolean);
    await db.cachedQueries.bulkDelete(ids);

    return ids.length;
  } catch (error) {
    console.warn('[OfflineDB] Error purging cache:', error);
    return 0;
  }
}

export async function clearAllQueryCache(): Promise<void> {
  try {
    await db.cachedQueries.clear();
  } catch (error) {
    console.warn('[OfflineDB] Error clearing all cache:', error);
  }
}

// ========== CONFIG CACHE FUNCTIONS ==========

export async function getCachedConfig<T>(key: string): Promise<T | null> {
  try {
    const config = await db.cachedConfigs.where('key').equals(key).first();
    return config ? (config.data as T) : null;
  } catch (error) {
    console.warn('[OfflineDB] Error reading config:', error);
    return null;
  }
}

export async function setCachedConfig<T>(key: string, data: T, version: string): Promise<void> {
  try {
    await db.cachedConfigs.where('key').equals(key).delete();
    await db.cachedConfigs.add({
      key,
      data,
      updatedAt: Date.now(),
      version
    });
  } catch (error) {
    console.warn('[OfflineDB] Error writing config:', error);
  }
}

export async function isConfigVersionValid(key: string, version: string): Promise<boolean> {
  try {
    const config = await db.cachedConfigs.where('key').equals(key).first();
    return config?.version === version;
  } catch (error) {
    return false;
  }
}

// ========== PREFERENCE FUNCTIONS ==========

export async function getPreference<T>(key: string, userId?: string): Promise<T | null> {
  try {
    let query = db.preferences.where('key').equals(key);
    if (userId) {
      const results = await query.toArray();
      const match = results.find((p) => p.userId === userId);
      return match ? (match.value as T) : null;
    }
    const pref = await query.first();
    return pref ? (pref.value as T) : null;
  } catch (error) {
    console.warn('[OfflineDB] Error reading preference:', error);
    return null;
  }
}

export async function setPreference<T>(key: string, value: T, userId?: string): Promise<void> {
  try {
    if (userId) {
      const existing = await db.preferences
        .where('key')
        .equals(key)
        .filter((p) => p.userId === userId)
        .first();
      if (existing?.id) {
        await db.preferences.delete(existing.id);
      }
    } else {
      await db.preferences.where('key').equals(key).delete();
    }

    await db.preferences.add({ key, value, userId });
  } catch (error) {
    console.warn('[OfflineDB] Error writing preference:', error);
  }
}

// ========== OFFLINE SESSION FUNCTIONS ==========

export async function saveOfflineSession(session: Omit<OfflineSession, 'id' | 'createdAt'>): Promise<void> {
  // Clear existing sessions for this user
  await db.offlineSessions.where('userId').equals(session.userId).delete();

  await db.offlineSessions.add({
    ...session,
    createdAt: Date.now()
  });
}

export async function getOfflineSession(): Promise<OfflineSession | null> {
  const sessions = await db.offlineSessions.toArray();
  const validSession = sessions.find((s) => s.expiresAt > Date.now());
  return validSession || null;
}

export async function clearOfflineSession(): Promise<void> {
  await db.offlineSessions.clear();
}

// ========== MAP TILES CACHE ==========

export async function cacheMapTile(
  tileUrl: string,
  blob: Blob,
  zoom: number,
  x: number,
  y: number
): Promise<void> {
  try {
    // Remove existing tile if present
    await db.mapTiles.where('tileUrl').equals(tileUrl).delete();

    await db.mapTiles.add({
      tileUrl,
      blob,
      zoom,
      x,
      y,
      timestamp: Date.now()
    });
  } catch (error) {
    console.warn('[OfflineDB] Error caching map tile:', error);
  }
}

export async function getCachedMapTile(tileUrl: string): Promise<Blob | null> {
  try {
    const tile = await db.mapTiles.where('tileUrl').equals(tileUrl).first();
    return tile?.blob || null;
  } catch (error) {
    return null;
  }
}

export async function clearOldMapTiles(maxAgeMs: number = CACHE_TTL.MAP_TILE): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const toDelete = await db.mapTiles.filter((t) => t.timestamp < cutoff).toArray();
  await db.mapTiles.bulkDelete(toDelete.map((t) => t.id!));
  return toDelete.length;
}

export async function getMapTilesCount(): Promise<{ count: number; sizeEstimate: number }> {
  const tiles = await db.mapTiles.toArray();
  const totalSize = tiles.reduce((sum, t) => sum + (t.blob?.size || 0), 0);
  return { count: tiles.length, sizeEstimate: totalSize };
}

// ========== GPS TRACKING ==========

export async function addGpsTrackPoint(point: Omit<GpsTrackPoint, 'id' | 'synced'>): Promise<void> {
  await db.gpsTrackPoints.add({
    ...point,
    synced: false
  });
}

export async function getUnsyncedTrackPoints(agentId: string): Promise<GpsTrackPoint[]> {
  return db.gpsTrackPoints
    .where('agentId')
    .equals(agentId)
    .filter((p) => !p.synced)
    .toArray();
}

export async function markTrackPointsSynced(ids: number[]): Promise<void> {
  await db.gpsTrackPoints.bulkUpdate(ids.map((id) => ({ key: id, changes: { synced: true } })));
}

export async function clearOldTrackPoints(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const toDelete = await db.gpsTrackPoints.filter((p) => p.timestamp < cutoff && p.synced).toArray();
  await db.gpsTrackPoints.bulkDelete(toDelete.map((p) => p.id!));
  return toDelete.length;
}

// ========== STORAGE STATISTICS ==========

export async function getStorageStats(): Promise<{
  operations: number;
  clients: number;
  remises: number;
  enquetes: number;
  cachedQueries: number;
  mapTiles: { count: number; sizeEstimate: number };
  conflicts: number;
  estimatedTotalSize: number;
}> {
  const [operations, clients, remises, enquetes, cachedQueries, conflicts] = await Promise.all([
    db.operations.count(),
    db.clients.count(),
    db.remises.count(),
    db.enquetes.count(),
    db.cachedQueries.count(),
    db.conflicts.filter((c) => !c.resolvedAt).count()
  ]);

  const mapTiles = await getMapTilesCount();

  // Rough estimate of storage size
  const estimatedTotalSize =
    operations * 2000 + // ~2KB per operation
    clients * 5000 + // ~5KB per client
    remises * 10000 + // ~10KB per remise (with photos)
    enquetes * 15000 + // ~15KB per enquete
    cachedQueries * 3000 + // ~3KB per cached query
    mapTiles.sizeEstimate;

  return {
    operations,
    clients,
    remises,
    enquetes,
    cachedQueries,
    mapTiles,
    conflicts,
    estimatedTotalSize
  };
}

// ========== INITIALIZATION ==========

export async function initOfflineDb(): Promise<void> {
  try {
    await db.open();

    // Purge expired data
    const [purgedCache, purgedOps, purgedTiles, purgedTracks] = await Promise.all([
      purgeExpiredCache(),
      clearCompletedOperations(7 * 24 * 60 * 60 * 1000), // 7 days
      clearOldMapTiles(),
      clearOldTrackPoints()
    ]);

    if (import.meta.env.DEV && (purgedCache > 0 || purgedOps > 0 || purgedTiles > 0 || purgedTracks > 0)) {
      console.log('[OfflineDB] Purged:', {
        cache: purgedCache,
        operations: purgedOps,
        tiles: purgedTiles,
        tracks: purgedTracks
      });
    }

    if (import.meta.env.DEV) console.log('[OfflineDB] Initialized successfully');
  } catch (error) {
    console.error('[OfflineDB] Initialization failed:', error);
  }
}

// Auto-initialize when module loads (browser only)
if (typeof window !== 'undefined') {
  initOfflineDb();
}

export default db;
