import Dexie, { Table } from 'dexie';

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

class OfflineDatabase extends Dexie {
  operations!: Table<OfflineOperation>;
  clients!: Table<OfflineClient>;
  transfers!: Table<OfflineTransfer>;
  caisseTransactions!: Table<OfflineCaisseTransaction>;
  metadata!: Table<SyncMetadata>;
  conflicts!: Table<ConflictRecord>;

  constructor() {
    super('COFINOfflineDB');
    
    this.version(1).stores({
      operations: '++id, uuid, type, priority, status, createdAt, idempotencyKey',
      clients: '++id, uuid, serverId, isDirty, lastSyncedAt',
      transfers: '++id, uuid, serverId, status, lastSyncedAt',
      caisseTransactions: '++id, uuid, serverId, isDirty, lastSyncedAt',
      metadata: '++id, key',
      conflicts: '++id, operationId, entityType, entityId, createdAt'
    });
  }
}

export const offlineDb = new OfflineDatabase();

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function hashPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
    payment: 'high',
    credit: 'high',
    client: 'medium',
    epargne: 'medium',
    tontine: 'medium',
    other: 'low'
  };
  return priorities[type];
}

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

  await offlineDb.operations.add({
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
    userId
  });

  return uuid;
}

export async function getPendingOperations(): Promise<OfflineOperation[]> {
  const operations = await offlineDb.operations
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
  const operation = await offlineDb.operations.where('uuid').equals(uuid).first();
  if (operation) {
    await offlineDb.operations.update(operation.id!, {
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
}> {
  const [pending, syncing, completed, failed, conflict] = await Promise.all([
    offlineDb.operations.where('status').equals('pending').count(),
    offlineDb.operations.where('status').equals('syncing').count(),
    offlineDb.operations.where('status').equals('completed').count(),
    offlineDb.operations.where('status').equals('failed').count(),
    offlineDb.operations.where('status').equals('conflict').count()
  ]);

  return { pending, syncing, completed, failed, conflict };
}

export async function clearCompletedOperations(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  await offlineDb.operations
    .where('status')
    .equals('completed')
    .and(op => (op.syncedAt || 0) < cutoff)
    .delete();
}

export async function addConflict(
  operationId: string,
  entityType: OperationType,
  entityId: string,
  localData: any,
  serverData: any
): Promise<void> {
  await offlineDb.conflicts.add({
    operationId,
    entityType,
    entityId,
    localData: JSON.stringify(localData),
    serverData: JSON.stringify(serverData),
    createdAt: Date.now()
  });
}

export async function getUnresolvedConflicts(): Promise<ConflictRecord[]> {
  return offlineDb.conflicts
    .where('resolvedAt')
    .equals(undefined as any)
    .toArray();
}

export async function resolveConflict(
  conflictId: number,
  resolution: 'local' | 'server' | 'merged'
): Promise<void> {
  await offlineDb.conflicts.update(conflictId, {
    resolvedAt: Date.now(),
    resolution
  });
}

export async function setMetadata(key: string, value: any): Promise<void> {
  const existing = await offlineDb.metadata.where('key').equals(key).first();
  if (existing) {
    await offlineDb.metadata.update(existing.id!, {
      value: JSON.stringify(value),
      updatedAt: Date.now()
    });
  } else {
    await offlineDb.metadata.add({
      key,
      value: JSON.stringify(value),
      updatedAt: Date.now()
    });
  }
}

export async function getMetadata<T>(key: string): Promise<T | null> {
  const record = await offlineDb.metadata.where('key').equals(key).first();
  if (record) {
    return JSON.parse(record.value) as T;
  }
  return null;
}

console.log('[Offline DB] Base de données IndexedDB initialisée');
