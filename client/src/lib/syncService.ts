/**
 * Enhanced Sync Service with Background Sync Support
 *
 * Features:
 * - Background sync via service worker
 * - Periodic sync for data refresh
 * - Priority-based sync queue
 * - Conflict detection and resolution
 * - Real-time progress tracking
 * - Network quality awareness
 */

import {
  offlineDb,
  getPendingOperations,
  updateOperationStatus,
  addConflict,
  getOperationStats,
  OfflineOperation,
  OperationStatus,
  OperationType,
  clearCompletedOperations
} from './offline-db';
import { networkManager, isNetworkUsable } from './networkManager';
import { tabLeader } from './tabLeader';
import {
  getUnsyncedEntries,
  markEntriesSyncing,
  markEntriesConfirmed,
  markEntriesRejected,
  getChainHead,
  getJournalStats,
  updateNtpOffset,
} from './journal-service';
import { getActiveKeyId } from './offline-crypto';
import { getOrCreateFingerprint } from './device-fingerprint';
import { updateOfflineLimits, markSessionSynced } from './offline-treasury';

// ========== Service Worker Sync API extensions (not in standard TS lib) ==========

interface SyncManager {
  register(tag: string): Promise<void>;
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistrationWithSync {
  readonly sync: SyncManager;
  readonly periodicSync: PeriodicSyncManager;
}

// ========== TYPES ==========

type SyncCallback = (stats: SyncStats) => void;
type ConflictCallback = (conflict: ConflictInfo) => void;
type ProgressCallback = (progress: SyncProgress) => void;

export interface SyncStats {
  totalPending: number;
  synced: number;
  failed: number;
  conflicts: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
  byType: Record<OperationType, number>;
  backgroundSyncSupported: boolean;
  periodicSyncSupported: boolean;
}

export interface SyncProgress {
  current: number;
  total: number;
  currentOperation?: {
    uuid: string;
    type: OperationType;
    endpoint: string;
  };
  estimatedTimeRemaining?: number;
}

export interface ConflictInfo {
  operationId: string;
  entityType: OperationType;
  entityId: string;
  localData: any;
  serverData: any;
}

export interface SyncOptions {
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'all';
  type?: OperationType;
  limit?: number;
  useBackgroundSync?: boolean;
}

// ========== CONSTANTS ==========

const BACKGROUND_SYNC_TAG = 'cofin-sync';
const PERIODIC_SYNC_TAG = 'sync-pending-operations';
const BATCH_SIZE = 10;
const RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 60000;

// ========== SYNC SERVICE CLASS ==========

class SyncService {
  private isSyncing: boolean = false;
  private callbacks: Set<SyncCallback> = new Set();
  private conflictCallbacks: Set<ConflictCallback> = new Set();
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private syncStats: SyncStats = {
    totalPending: 0,
    synced: 0,
    failed: 0,
    conflicts: 0,
    isSyncing: false,
    lastSyncAt: null,
    byType: {
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
    },
    backgroundSyncSupported: false,
    periodicSyncSupported: false
  };
  private syncTimeout: number | null = null;
  private currentRetryDelay: number = RETRY_DELAY_MS;
  private serviceWorkerReady: Promise<ServiceWorkerRegistration> | null = null;

  constructor() {
    this.checkBackgroundSyncSupport();
    this.setupConnectivityListener();
    this.setupServiceWorkerListener();
    this.initializeStats();
    if (import.meta.env.DEV) console.log('[Sync Service] Service de synchronisation initialisé');
  }

  // ========== INITIALIZATION ==========

  private async checkBackgroundSyncSupport(): Promise<void> {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      this.syncStats.backgroundSyncSupported = true;
    }

    if ('serviceWorker' in navigator && 'periodicSync' in (await navigator.serviceWorker.ready as unknown as ServiceWorkerRegistrationWithSync)) {
      this.syncStats.periodicSyncSupported = true;
    }
  }

  private setupConnectivityListener(): void {
    networkManager.subscribe((state) => {
      const usable = state.status === 'online' || state.status === 'unstable';
      if (usable) {
        if (import.meta.env.DEV) console.log('[Sync Service] Connexion rétablie, démarrage de la synchronisation');
        this.currentRetryDelay = RETRY_DELAY_MS; // Reset retry delay
        this.scheduleSync(1000);
        // Also trigger journal sync when connectivity returns
        setTimeout(() => this.syncJournal().catch(() => {}), 2000);
      } else {
        if (import.meta.env.DEV) console.log('[Sync Service] Connexion perdue, synchronisation en pause');
        this.cancelScheduledSync();
      }
    });
  }

  private setupServiceWorkerListener(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, payload } = event.data || {};

        switch (type) {
          case 'SYNC_COMPLETED':
            if (import.meta.env.DEV) console.log('[Sync Service] Opération synchronisée via SW:', payload);
            this.refreshPendingCount();
            break;

          case 'PERIODIC_SYNC_TRIGGER':
            if (import.meta.env.DEV) console.log('[Sync Service] Sync périodique déclenché');
            this.sync({ useBackgroundSync: false });
            break;

          case 'CONFLICT_DETECTED':
            this.notifyConflict(payload);
            break;
        }
      });
    }
  }

  private async initializeStats(): Promise<void> {
    const stats = await getOperationStats();
    this.syncStats.totalPending = stats.pending;
    this.syncStats.byType = stats.byType;
    this.notifyCallbacks();
  }

  // ========== SCHEDULING ==========

  private scheduleSync(delayMs: number): void {
    this.cancelScheduledSync();
    this.syncTimeout = window.setTimeout(() => {
      this.sync();
    }, delayMs);
  }

  private cancelScheduledSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
  }

  // ========== BACKGROUND SYNC ==========

  /**
   * Request background sync via service worker
   */
  public async requestBackgroundSync(tag: string = BACKGROUND_SYNC_TAG): Promise<boolean> {
    if (!this.syncStats.backgroundSyncSupported) {
      if (import.meta.env.DEV) console.log('[Sync Service] Background sync non supporté');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as unknown as ServiceWorkerRegistrationWithSync).sync.register(tag);
      if (import.meta.env.DEV) console.log('[Sync Service] Background sync demandé:', tag);
      return true;
    } catch (error) {
      console.error('[Sync Service] Erreur background sync:', error);
      return false;
    }
  }

  /**
   * Register periodic background sync
   */
  public async registerPeriodicSync(minInterval: number = 60 * 60 * 1000): Promise<boolean> {
    if (!this.syncStats.periodicSyncSupported) {
      if (import.meta.env.DEV) console.log('[Sync Service] Periodic sync non supporté');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const periodicSync = (registration as unknown as ServiceWorkerRegistrationWithSync).periodicSync;

      // Check permission
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync' as PermissionName
      });

      if (status.state === 'granted') {
        await periodicSync.register(PERIODIC_SYNC_TAG, { minInterval });
        if (import.meta.env.DEV) console.log('[Sync Service] Periodic sync enregistré');
        return true;
      }
    } catch (error) {
      console.error('[Sync Service] Erreur periodic sync:', error);
    }
    return false;
  }

  // ========== MAIN SYNC ==========

  public async sync(options: SyncOptions = {}): Promise<SyncStats> {
    // Only the leader tab runs sync to prevent duplicate requests across tabs
    if (!tabLeader.isLeader()) {
      if (import.meta.env.DEV) console.log('[Sync Service] Skipping sync: not leader tab');
      return this.syncStats;
    }

    if (this.isSyncing) {
      if (import.meta.env.DEV) console.log('[Sync Service] Synchronisation déjà en cours');
      return this.syncStats;
    }

    if (!isNetworkUsable()) {
      if (import.meta.env.DEV) console.log('[Sync Service] Hors ligne, synchronisation reportée');

      // Try background sync if supported
      if (options.useBackgroundSync !== false && this.syncStats.backgroundSyncSupported) {
        await this.requestBackgroundSync();
      }

      return this.syncStats;
    }

    this.isSyncing = true;
    this.syncStats.isSyncing = true;
    this.syncStats.synced = 0;
    this.syncStats.failed = 0;
    this.syncStats.conflicts = 0;
    this.notifyCallbacks();

    if (import.meta.env.DEV) console.log('[Sync Service] Démarrage de la synchronisation...', options);

    try {
      const operations = await getPendingOperations({
        type: options.type,
        limit: options.limit
      });

      // Filter by priority if specified
      let filteredOps = operations;
      if (options.priority && options.priority !== 'all') {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const maxPriority = priorityOrder[options.priority];
        filteredOps = operations.filter((op) => {
          const opPriority = priorityOrder[op.priority];
          return opPriority <= maxPriority;
        });
      }

      this.syncStats.totalPending = filteredOps.length;

      if (filteredOps.length === 0) {
        if (import.meta.env.DEV) console.log('[Sync Service] Aucune opération en attente');
        return this.finishSync();
      }

      if (import.meta.env.DEV) console.log(`[Sync Service] ${filteredOps.length} opération(s) à synchroniser`);

      // Process in batches
      for (let i = 0; i < filteredOps.length; i += BATCH_SIZE) {
        if (!isNetworkUsable()) {
          if (import.meta.env.DEV) console.log('[Sync Service] Connexion perdue pendant la synchronisation');
          break;
        }

        const batch = filteredOps.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch, i, filteredOps.length);
        this.notifyCallbacks();
      }

      return this.finishSync();
    } catch (error) {
      console.error('[Sync Service] Erreur de synchronisation:', error);
      return this.finishSync();
    }
  }

  private async processBatch(
    operations: OfflineOperation[],
    startIndex: number,
    total: number
  ): Promise<void> {
    const promises = operations.map((op, idx) =>
      this.processOperation(op, startIndex + idx, total)
    );
    await Promise.allSettled(promises);
  }

  private async processOperation(
    operation: OfflineOperation,
    currentIndex: number,
    total: number
  ): Promise<void> {
    // Notify progress
    this.notifyProgress({
      current: currentIndex + 1,
      total,
      currentOperation: {
        uuid: operation.uuid,
        type: operation.type,
        endpoint: operation.endpoint
      }
    });

    if (operation.retryCount >= operation.maxRetries) {
      if (import.meta.env.DEV) console.log(`[Sync Service] Opération ${operation.uuid} a atteint le max de tentatives`);
      await updateOperationStatus(operation.uuid, 'failed', 'Nombre maximum de tentatives atteint');
      this.syncStats.failed++;
      return;
    }

    await updateOperationStatus(operation.uuid, 'syncing');

    try {
      const payload = JSON.parse(operation.payload);

      const response = await fetch(operation.endpoint, {
        method: operation.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': operation.idempotencyKey,
          'X-Offline-Sync': 'true'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const responseData = await response.json().catch(() => null);

      if (response.ok) {
        if (import.meta.env.DEV) console.log(`[Sync Service] Opération ${operation.uuid} synchronisée avec succès`);
        await updateOperationStatus(operation.uuid, 'completed', undefined, JSON.stringify(responseData));
        this.syncStats.synced++;
      } else if (response.status === 409) {
        // Conflict
        if (import.meta.env.DEV) console.log(`[Sync Service] Conflit détecté pour ${operation.uuid}`);
        await updateOperationStatus(operation.uuid, 'conflict', 'Conflit de données');
        await addConflict(
          operation.uuid,
          operation.type,
          operation.uuid,
          JSON.parse(operation.payload),
          responseData
        );
        this.syncStats.conflicts++;

        // Notify conflict listeners
        this.notifyConflict({
          operationId: operation.uuid,
          entityType: operation.type,
          entityId: operation.uuid,
          localData: JSON.parse(operation.payload),
          serverData: responseData
        });
      } else if (response.status === 401 || response.status === 403) {
        if (import.meta.env.DEV) console.log(`[Sync Service] Session expirée pour ${operation.uuid}`);
        await updateOperationStatus(operation.uuid, 'failed', 'Session expirée - reconnexion requise');
        this.syncStats.failed++;
      } else if (response.status === 422 || response.status === 400) {
        // Validation error - don't retry
        const errorMsg = responseData?.message || `Erreur de validation`;
        if (import.meta.env.DEV) console.log(`[Sync Service] Erreur de validation ${operation.uuid}: ${errorMsg}`);
        await updateOperationStatus(operation.uuid, 'failed', errorMsg, JSON.stringify(responseData));
        this.syncStats.failed++;
      } else {
        const errorMsg = responseData?.message || `Erreur HTTP ${response.status}`;
        if (import.meta.env.DEV) console.log(`[Sync Service] Échec opération ${operation.uuid}: ${errorMsg}`);
        await updateOperationStatus(operation.uuid, 'pending', errorMsg);
        this.syncStats.failed++;
      }
    } catch (error: any) {
      console.error(`[Sync Service] Erreur réseau pour ${operation.uuid}:`, error);
      await updateOperationStatus(operation.uuid, 'pending', error.message);
      this.syncStats.failed++;
    }
  }

  private finishSync(): SyncStats {
    this.isSyncing = false;
    this.syncStats.isSyncing = false;
    this.syncStats.lastSyncAt = Date.now();
    this.notifyCallbacks();

    // Clear progress
    this.notifyProgress({ current: 0, total: 0 });

    if (import.meta.env.DEV) {
      console.log('[Sync Service] Synchronisation terminée:', {
        synced: this.syncStats.synced,
        failed: this.syncStats.failed,
        conflicts: this.syncStats.conflicts
      });
    }

    // Schedule retry with exponential backoff
    if (this.syncStats.failed > 0 && isNetworkUsable()) {
      if (import.meta.env.DEV) console.log('[Sync Service] Programmation nouvelle tentative dans', this.currentRetryDelay, 'ms');
      this.scheduleSync(this.currentRetryDelay);
      this.currentRetryDelay = Math.min(this.currentRetryDelay * 2, MAX_RETRY_DELAY_MS);
    } else {
      this.currentRetryDelay = RETRY_DELAY_MS; // Reset on success
    }

    // Cleanup old completed operations
    clearCompletedOperations(24 * 60 * 60 * 1000).catch(console.error);

    return this.syncStats;
  }

  // ========== SUBSCRIPTIONS ==========

  public subscribe(callback: SyncCallback): () => void {
    this.callbacks.add(callback);

    setTimeout(() => {
      if (this.callbacks.has(callback)) {
        callback({ ...this.syncStats });
      }
    }, 0);

    return () => {
      this.callbacks.delete(callback);
    };
  }

  public subscribeToConflicts(callback: ConflictCallback): () => void {
    this.conflictCallbacks.add(callback);
    return () => {
      this.conflictCallbacks.delete(callback);
    };
  }

  public subscribeToProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => {
      this.progressCallbacks.delete(callback);
    };
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach((callback) => {
      try {
        callback({ ...this.syncStats });
      } catch (error) {
        console.error('[Sync Service] Erreur dans callback:', error);
      }
    });
  }

  private notifyConflict(conflict: ConflictInfo): void {
    this.conflictCallbacks.forEach((callback) => {
      try {
        callback(conflict);
      } catch (error) {
        console.error('[Sync Service] Erreur dans conflict callback:', error);
      }
    });
  }

  private notifyProgress(progress: SyncProgress): void {
    this.progressCallbacks.forEach((callback) => {
      try {
        callback(progress);
      } catch (error) {
        console.error('[Sync Service] Erreur dans progress callback:', error);
      }
    });
  }

  // ========== PUBLIC API ==========

  public getStats(): SyncStats {
    return { ...this.syncStats };
  }

  public async forceSyncNow(options?: SyncOptions): Promise<SyncStats> {
    this.cancelScheduledSync();
    return this.sync(options);
  }

  public async syncCriticalOnly(): Promise<SyncStats> {
    return this.sync({ priority: 'critical' });
  }

  public async syncByType(type: OperationType): Promise<SyncStats> {
    return this.sync({ type });
  }

  public async refreshPendingCount(): Promise<number> {
    const stats = await getOperationStats();
    this.syncStats.totalPending = stats.pending;
    this.syncStats.byType = stats.byType;
    this.notifyCallbacks();
    return stats.pending;
  }

  /**
   * Get queue status from service worker
   */
  public async getServiceWorkerQueueStatus(): Promise<{ financial: number; general: number; total: number } | null> {
    if (!('serviceWorker' in navigator)) return null;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) return null;

      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          resolve(event.data);
        };

        registration.active!.postMessage({ type: 'GET_QUEUE_STATUS' }, [channel.port2]);

        // Timeout after 5s
        setTimeout(() => resolve(null), 5000);
      });
    } catch {
      return null;
    }
  }

  /**
   * Force service worker to replay queued requests
   */
  public async forceServiceWorkerSync(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) return false;

      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          resolve(event.data?.success || false);
        };

        registration.active!.postMessage({ type: 'FORCE_SYNC' }, [channel.port2]);

        setTimeout(() => resolve(false), 30000);
      });
    } catch {
      return false;
    }
  }

  /**
   * Clear all service worker caches
   */
  public async clearServiceWorkerCaches(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'CLEAR_CACHE' });
    } catch (error) {
      console.error('[Sync Service] Erreur clear cache:', error);
    }
  }

  /**
   * Cache specific URLs for offline access
   */
  public async cacheUrls(urls: string[]): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'CACHE_URLS', payload: { urls } });
    } catch (error) {
      console.error('[Sync Service] Erreur cache URLs:', error);
    }
  }
  // ========== PULL SYNC (Server → Client) ==========

  private pullCursors: Record<string, string> = {};
  private isPulling = false;

  /**
   * Pull changes from server for specified entity types.
   * Uses cursor-based delta sync to only fetch what changed.
   */
  public async pullChanges(
    entities: string[] = ['clients', 'credits', 'remboursements', 'comptes', 'transferts', 'tontines', 'prospections'],
    options?: { limit?: number }
  ): Promise<{ totalChanges: number; byEntity: Record<string, number> }> {
    if (this.isPulling) {
      if (import.meta.env.DEV) console.log('[Sync Service] Pull already in progress');
      return { totalChanges: 0, byEntity: {} };
    }

    if (!isNetworkUsable()) {
      if (import.meta.env.DEV) console.log('[Sync Service] Offline, pull skipped');
      return { totalChanges: 0, byEntity: {} };
    }

    this.isPulling = true;
    const byEntity: Record<string, number> = {};
    let totalChanges = 0;

    try {
      // Load cursors from IndexedDB
      await this.loadPullCursors();

      const cursors: Record<string, string> = {};
      for (const entity of entities) {
        cursors[entity] = this.pullCursors[entity] || '1970-01-01T00:00:00.000Z';
      }

      const response = await fetch('/api/sync/pull', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entities,
          cursors,
          limit: options?.limit || 200,
        }),
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }

      const data = await response.json();

      // Store pulled changes in IndexedDB
      for (const entity of entities) {
        const changes = data.changes?.[entity] || [];
        byEntity[entity] = changes.length;
        totalChanges += changes.length;

        if (changes.length > 0) {
          await this.storePulledChanges(entity, changes);
          // Update cursor
          this.pullCursors[entity] = data.cursors[entity];
        }
      }

      // Persist cursors
      await this.savePullCursors();

      if (import.meta.env.DEV) console.log(`[Sync Service] Pull complete: ${totalChanges} changes across ${entities.length} entities`);

      // If any entity has more data, schedule another pull
      const hasMore = Object.values(data.hasMore || {}).some(Boolean);
      if (hasMore) {
        setTimeout(() => this.pullChanges(entities, options), 1000);
      }

      return { totalChanges, byEntity };
    } catch (err: any) {
      console.error('[Sync Service] Pull error:', err.message);
      return { totalChanges: 0, byEntity: {} };
    } finally {
      this.isPulling = false;
    }
  }

  private async storePulledChanges(entity: string, changes: any[]): Promise<void> {
    // Store in the offline DB's cached queries table for now
    // This provides a generic storage mechanism that other components can read from
    try {
      const { setCachedQuery } = await import('./offline-db');
      await setCachedQuery(
        `sync:${entity}:latest`,
        changes,
        24 * 60 * 60 * 1000 // 24h TTL
      );
    } catch (err) {
      console.error(`[Sync Service] Error storing ${entity} changes:`, err);
    }
  }

  private async loadPullCursors(): Promise<void> {
    try {
      const { getCachedQuery } = await import('./offline-db');
      const stored = await getCachedQuery('sync:cursors');
      if (stored) {
        this.pullCursors = stored as Record<string, string>;
      }
    } catch {
      // First sync, no cursors
    }
  }

  private async savePullCursors(): Promise<void> {
    try {
      const { setCachedQuery } = await import('./offline-db');
      await setCachedQuery('sync:cursors', this.pullCursors, 365 * 24 * 60 * 60 * 1000);
    } catch {
      // Non-critical
    }
  }

  // ========== JOURNAL-BASED 3-PHASE SYNC (Offline Native) ==========

  private isJournalSyncing = false;
  private journalSyncCallbacks: Set<(stats: JournalSyncStats) => void> = new Set();

  /**
   * Execute the full 3-phase journal sync protocol.
   * Phase 1: Handshake (exchange state, get limits/revoked keys/server time)
   * Phase 2: Upload journal entries in batches of 10
   * Phase 3: Pull confirmed entry statuses
   */
  public async syncJournal(): Promise<JournalSyncStats> {
    // Only the leader tab runs journal sync
    if (!tabLeader.isLeader()) {
      if (import.meta.env.DEV) console.log('[Sync Service] Skipping journal sync: not leader tab');
      return { phase: 'idle', uploaded: 0, confirmed: 0, rejected: 0, conflicts: 0, error: null };
    }

    if (this.isJournalSyncing) {
      if (import.meta.env.DEV) console.log('[Sync Service] Journal sync already in progress');
      return { phase: 'idle', uploaded: 0, confirmed: 0, rejected: 0, conflicts: 0, error: null };
    }

    if (!isNetworkUsable()) {
      if (import.meta.env.DEV) console.log('[Sync Service] Offline, journal sync skipped');
      return { phase: 'idle', uploaded: 0, confirmed: 0, rejected: 0, conflicts: 0, error: null };
    }

    this.isJournalSyncing = true;
    const stats: JournalSyncStats = {
      phase: 'handshake',
      uploaded: 0,
      confirmed: 0,
      rejected: 0,
      conflicts: 0,
      error: null,
    };

    this.notifyJournalCallbacks(stats);

    try {
      // ===== PHASE 1: HANDSHAKE =====
      const handshakeResult = await this.journalHandshake();
      if (!handshakeResult.ok) {
        stats.error = handshakeResult.error || 'Handshake failed';
        return stats;
      }

      // Update NTP offset from server time
      if (handshakeResult.serverTime) {
        updateNtpOffset(handshakeResult.serverTime);
      }

      // Update offline limits
      if (handshakeResult.offlineLimits) {
        await updateOfflineLimits(handshakeResult.offlineLimits).catch(() => {});
      }

      // ===== PHASE 2: UPLOAD =====
      stats.phase = 'upload';
      this.notifyJournalCallbacks(stats);

      const unsyncedEntries = await getUnsyncedEntries();
      if (unsyncedEntries.length > 0) {
        if (import.meta.env.DEV) console.log(`[Sync Service] Journal: ${unsyncedEntries.length} entries to upload`);

        // Process in batches of 10
        for (let i = 0; i < unsyncedEntries.length; i += JOURNAL_BATCH_SIZE) {
          if (!isNetworkUsable()) break;

          const batch = unsyncedEntries.slice(i, i + JOURNAL_BATCH_SIZE);
          const batchUuids = batch.map(e => e.uuid);

          // Mark as syncing
          await markEntriesSyncing(batchUuids);

          // Upload batch
          const result = await this.uploadJournalBatch(batch);

          if (result.error) {
            // Revert syncing status on network failure
            await markEntriesRejected(batchUuids.map(uuid => ({ uuid, reason: 'upload_failed' })));
            stats.error = result.error;
            break;
          }

          // Process results
          if (result.accepted.length > 0) {
            const serverTime = result.serverTime || Date.now();
            await markEntriesConfirmed(
              result.accepted.map((uuid: string, idx: number) => ({
                uuid,
                serverTimestamp: serverTime,
                serverSequence: i + idx + 1, // Approximate server sequence
              }))
            );
            stats.confirmed += result.accepted.length;
          }

          if (result.rejected.length > 0) {
            await markEntriesRejected(result.rejected);
            stats.rejected += result.rejected.length;
          }

          stats.conflicts += result.conflicts?.length || 0;
          stats.uploaded += batch.length;

          this.notifyJournalCallbacks(stats);
        }
      }

      // Mark sessions as synced (for any closed sessions with all entries confirmed)
      await this.markSyncedSessions();

      // ===== PHASE 3: PULL =====
      stats.phase = 'pull';
      this.notifyJournalCallbacks(stats);

      // Pull is lightweight — just check for status updates on entries
      // The main pull mechanism for entities remains in pullChanges()
      await this.pullJournalUpdates();

      stats.phase = 'done';
      this.notifyJournalCallbacks(stats);

      if (import.meta.env.DEV) {
        console.log('[Sync Service] Journal sync complete:', {
          uploaded: stats.uploaded,
          confirmed: stats.confirmed,
          rejected: stats.rejected,
          conflicts: stats.conflicts,
        });
      }

      return stats;
    } catch (error: any) {
      console.error('[Sync Service] Journal sync error:', error);
      stats.error = error.message;
      return stats;
    } finally {
      this.isJournalSyncing = false;
      this.notifyJournalCallbacks(stats);
    }
  }

  /**
   * Phase 1: Handshake with server.
   */
  private async journalHandshake(): Promise<{
    ok: boolean;
    error?: string;
    serverTime?: number;
    offlineLimits?: any;
  }> {
    try {
      const chainHead = await getChainHead();
      const journalStats = await getJournalStats();
      const deviceKeyId = getActiveKeyId();
      const { full: deviceId } = getOrCreateFingerprint();

      if (!deviceKeyId) {
        return { ok: false, error: 'No active device key' };
      }

      const response = await fetch('/api/sync/handshake', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          deviceKeyId,
          lastConfirmedSequence: chainHead?.sequence || 0,
          chainHeadHash: chainHead?.hash || 'GENESIS',
          pendingCount: journalStats.local + journalStats.syncing,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: false, error: data.error || `Handshake HTTP ${response.status}` };
      }

      const data = await response.json();
      return {
        ok: true,
        serverTime: data.serverTime,
        offlineLimits: data.offlineLimits,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Phase 2: Upload a batch of journal entries.
   */
  private async uploadJournalBatch(entries: Array<{
    uuid: string;
    sequence: number;
    type: string;
    agentId: string;
    deviceId: string;
    agenceId: string;
    payloadHash: string;
    previousHash: string;
    entryHash: string;
    signature: string;
    deviceKeyId: string;
    localTimestamp: number;
    monotonicClock: number;
    ntpOffset?: number;
    sessionId: string;
    operationRef: string;
    idempotencyKey: string;
    metadata?: string;
    payload: string;
  }>): Promise<{
    accepted: string[];
    rejected: Array<{ uuid: string; reason: string }>;
    conflicts: Array<{ uuid: string; conflictWith: string; reason: string }>;
    serverTime?: number;
    error?: string;
  }> {
    try {
      // Parse payload for server (server expects objects, not encrypted strings)
      const serverEntries = entries.map(e => {
        let parsedPayload: Record<string, unknown> = {};
        try {
          // If payload is encrypted, we still send the hash (server validates hash)
          // For non-encrypted payloads, parse them
          if (!e.payload.startsWith('enc:')) {
            parsedPayload = JSON.parse(e.payload);
          }
        } catch {
          parsedPayload = {};
        }

        return {
          uuid: e.uuid,
          sequence: e.sequence,
          type: e.type,
          agentId: String(e.agentId),
          deviceId: e.deviceId,
          agenceId: e.agenceId,
          payload: parsedPayload,
          payloadHash: e.payloadHash,
          previousHash: e.previousHash,
          entryHash: e.entryHash,
          signature: e.signature,
          deviceKeyId: e.deviceKeyId,
          localTimestamp: e.localTimestamp,
          monotonicClock: e.monotonicClock,
          ntpOffset: e.ntpOffset,
          sessionId: e.sessionId,
          operationRef: e.operationRef,
          idempotencyKey: e.idempotencyKey,
          metadata: e.metadata ? JSON.parse(e.metadata) : undefined,
        };
      });

      const response = await fetch('/api/sync/journal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: serverEntries }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          accepted: [],
          rejected: [],
          conflicts: [],
          error: data.error || `Upload HTTP ${response.status}`,
        };
      }

      return await response.json();
    } catch (err: any) {
      return {
        accepted: [],
        rejected: [],
        conflicts: [],
        error: err.message,
      };
    }
  }

  /**
   * Phase 3: Pull journal entry status updates from server.
   */
  private async pullJournalUpdates(): Promise<void> {
    try {
      const response = await fetch('/api/sync/pull?limit=100', {
        credentials: 'include',
      });

      if (!response.ok) return;

      const data = await response.json();

      // Update NTP offset
      if (data.serverTime) {
        updateNtpOffset(data.serverTime);
      }
    } catch {
      // Non-critical
    }
  }

  /**
   * Mark day sessions as synced when all their entries are confirmed.
   */
  private async markSyncedSessions(): Promise<void> {
    try {
      const { db } = await import('./offline-db');
      const sessions = await db.agentDaySessions
        .where('syncStatus')
        .anyOf(['open', 'closed'])
        .toArray();

      for (const session of sessions) {
        if (!session.agentId || !session.date) continue;

        // Check if all entries for this session are confirmed
        const unconfirmed = await db.journalEntries
          .where('sessionId')
          .equals(session.date)
          .filter(e => e.syncStatus !== 'confirmed' && e.syncStatus !== 'rejected')
          .count();

        if (unconfirmed === 0) {
          await markSessionSynced(session.agentId, session.date);
        }
      }
    } catch {
      // Non-critical
    }
  }

  // ========== JOURNAL SYNC SUBSCRIPTIONS ==========

  public subscribeToJournalSync(callback: (stats: JournalSyncStats) => void): () => void {
    this.journalSyncCallbacks.add(callback);
    return () => {
      this.journalSyncCallbacks.delete(callback);
    };
  }

  private notifyJournalCallbacks(stats: JournalSyncStats): void {
    this.journalSyncCallbacks.forEach(cb => {
      try { cb({ ...stats }); } catch {}
    });
  }

  /**
   * Get current journal sync statistics.
   */
  public async getJournalSyncStats(): Promise<{
    pending: number;
    syncing: number;
    confirmed: number;
    rejected: number;
  }> {
    const stats = await getJournalStats();
    return {
      pending: stats.local,
      syncing: stats.syncing,
      confirmed: stats.confirmed,
      rejected: stats.rejected,
    };
  }

  /**
   * Full sync: run legacy queue sync + journal sync.
   */
  public async fullSync(): Promise<void> {
    // Run both in parallel
    await Promise.allSettled([
      this.sync(),
      this.syncJournal(),
    ]);
  }
}

// ========== JOURNAL SYNC TYPES ==========

export interface JournalSyncStats {
  phase: 'idle' | 'handshake' | 'upload' | 'pull' | 'done';
  uploaded: number;
  confirmed: number;
  rejected: number;
  conflicts: number;
  error: string | null;
}

const JOURNAL_BATCH_SIZE = 10;

export const syncService = new SyncService();

export default syncService;
