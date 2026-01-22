/**
 * Unified Offline Database using Dexie (IndexedDB)
 *
 * This module provides:
 * 1. Offline operation queue for sync (transfers, payments, etc.)
 * 2. Persistent caching for slow connections (3G/offline scenarios)
 * 3. User preferences storage
 *
 * @module offline-db
 */

import Dexie, { type Table } from 'dexie';

// ========== OPERATION TYPES (for offline sync queue) ==========

export type OperationPriority = 'critical' | 'high' | 'medium' | 'low';
export type OperationStatus = 'pending' | 'syncing' | 'completed' | 'failed' | 'conflict';
export type OperationType = 'transfer' | 'caisse' | 'client' | 'payment' | 'epargne' | 'credit' | 'tontine' | 'other';

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
  serverResponse?: string;
}

export interface OfflineClient {
  id?: number;
  serverId?: number;
  uuid: string;
  data: string;
  localVersion: number;
  serverVersion?: number;
  lastSyncedAt?: number;
  isDirty: boolean;
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
}

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
}

// ========== CACHE TYPES (for slow connection optimization) ==========

/** Offline enquete form data */
export interface OfflineEnquete {
  id?: number;
  clientId: string;
  data: any;
  timestamp: Date;
  synced: number; // 0 = false, 1 = true
}

/** Cached API response with TTL */
export interface CachedQuery {
  id?: number;
  key: string;
  data: unknown;
  timestamp: number;
  ttl: number;
  meta?: {
    endpoint?: string;
    version?: string;
  };
}

/** Static configuration data */
export interface CachedConfig {
  id?: number;
  key: string;
  data: unknown;
  updatedAt: number;
  version: string;
}

/** User preferences */
export interface UserPreference {
  id?: number;
  key: string;
  value: unknown;
  userId?: string;
}

// ========== DATABASE CLASS ==========

/**
 * Unified Dexie database for offline-first functionality
 */
class OfflineDatabase extends Dexie {
  // Sync queue tables
  operations!: Table<OfflineOperation>;
  clients!: Table<OfflineClient>;
  transfers!: Table<OfflineTransfer>;
  caisseTransactions!: Table<OfflineCaisseTransaction>;
  metadata!: Table<SyncMetadata>;
  conflicts!: Table<ConflictRecord>;

  // Cache tables
  enquetes_offline!: Table<OfflineEnquete>;
  cachedQueries!: Table<CachedQuery>;
  cachedConfigs!: Table<CachedConfig>;
  preferences!: Table<UserPreference>;

  constructor() {
    super('COFINOfflineDB');

    // Version 1: All tables unified
    this.version(1).stores({
      // Sync queue tables
      operations: '++id, uuid, type, priority, status, createdAt, idempotencyKey',
      clients: '++id, uuid, serverId, isDirty, lastSyncedAt',
      transfers: '++id, uuid, serverId, status, lastSyncedAt',
      caisseTransactions: '++id, uuid, serverId, isDirty, lastSyncedAt',
      metadata: '++id, key',
      conflicts: '++id, operationId, entityType, entityId, createdAt',
      // Cache tables
      enquetes_offline: '++id, clientId, timestamp, synced',
      cachedQueries: '++id, key, timestamp',
      cachedConfigs: '++id, key, version',
      preferences: '++id, key, userId',
    });
  }
}

// Singleton instance
export const db = new OfflineDatabase();
// Alias for backward compatibility
export const offlineDb = db;

// ========== CACHE TTL CONFIGURATION ==========

export const CACHE_TTL = {
  CONFIG: 24 * 60 * 60 * 1000,  // 24 hours
  LOOKUP: 12 * 60 * 60 * 1000,  // 12 hours
  STATS: 5 * 60 * 1000,         // 5 minutes
  LIST: 10 * 60 * 1000,         // 10 minutes
  RECORD: 15 * 60 * 1000,       // 15 minutes
} as const;

// ========== UUID & HASH UTILITIES ==========

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
    low: 3,
  };
  return order[priority];
}

export function getOperationPriority(type: OperationType): OperationPriority {
  const priorities: Record<OperationType, OperationPriority> = {
    transfer: 'critical',
    caisse: 'critical',
    payment: 'high',
    credit: 'high',
    client: 'medium',
    epargne: 'medium',
    tontine: 'medium',
    other: 'low',
  };
  return priorities[type];
}

// ========== OFFLINE OPERATION FUNCTIONS ==========

export async function addOfflineOperation(
  type: OperationType,
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  payload: any,
  userId?: number
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
    userId,
  });

  return uuid;
}

export async function getPendingOperations(): Promise<OfflineOperation[]> {
  const operations = await db.operations
    .where('status')
    .anyOf(['pending', 'failed'])
    .toArray();

  return operations.sort((a, b) => {
    const priorityDiff = getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.createdAt - b.createdAt;
  });
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
      serverResponse,
    });
  }
}

export async function getOperationStats(): Promise<{
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflict: number;
}> {
  const [pending, syncing, completed, failed, conflict] = await Promise.all([
    db.operations.where('status').equals('pending').count(),
    db.operations.where('status').equals('syncing').count(),
    db.operations.where('status').equals('completed').count(),
    db.operations.where('status').equals('failed').count(),
    db.operations.where('status').equals('conflict').count(),
  ]);

  return { pending, syncing, completed, failed, conflict };
}

export async function clearCompletedOperations(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  await db.operations
    .where('status')
    .equals('completed')
    .and((op) => (op.syncedAt || 0) < cutoff)
    .delete();
}

// ========== CONFLICT FUNCTIONS ==========

export async function addConflict(
  operationId: string,
  entityType: OperationType,
  entityId: string,
  localData: any,
  serverData: any
): Promise<void> {
  await db.conflicts.add({
    operationId,
    entityType,
    entityId,
    localData: JSON.stringify(localData),
    serverData: JSON.stringify(serverData),
    createdAt: Date.now(),
  });
}

export async function getUnresolvedConflicts(): Promise<ConflictRecord[]> {
  return db.conflicts
    .where('resolvedAt')
    .equals(undefined as any)
    .toArray();
}

export async function resolveConflict(
  conflictId: number,
  resolution: 'local' | 'server' | 'merged'
): Promise<void> {
  await db.conflicts.update(conflictId, {
    resolvedAt: Date.now(),
    resolution,
  });
}

// ========== METADATA FUNCTIONS ==========

export async function setMetadata(key: string, value: any): Promise<void> {
  const existing = await db.metadata.where('key').equals(key).first();
  if (existing) {
    await db.metadata.update(existing.id!, {
      value: JSON.stringify(value),
      updatedAt: Date.now(),
    });
  } else {
    await db.metadata.add({
      key,
      value: JSON.stringify(value),
      updatedAt: Date.now(),
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
      meta,
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

export async function purgeExpiredCache(): Promise<number> {
  try {
    const now = Date.now();
    const expired = await db.cachedQueries
      .filter((entry) => now - entry.timestamp > entry.ttl)
      .toArray();

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
      version,
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

// ========== INITIALIZATION ==========

export async function initOfflineDb(): Promise<void> {
  try {
    await db.open();

    const purged = await purgeExpiredCache();
    if (purged > 0) {
      console.log(`[OfflineDB] Purged ${purged} expired cache entries`);
    }

    console.log('[OfflineDB] Initialized successfully');
  } catch (error) {
    console.error('[OfflineDB] Initialization failed:', error);
  }
}

// Auto-initialize when module loads (browser only)
if (typeof window !== 'undefined') {
  initOfflineDb();
}

export default db;
