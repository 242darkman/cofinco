import { 
  offlineDb, 
  getPendingOperations, 
  updateOperationStatus, 
  addConflict,
  OfflineOperation,
  OperationStatus
} from './offlineDb';
import { connectivityService } from './connectivityService';

type SyncCallback = (stats: SyncStats) => void;

export interface SyncStats {
  totalPending: number;
  synced: number;
  failed: number;
  conflicts: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
}

class SyncService {
  private isSyncing: boolean = false;
  private callbacks: Set<SyncCallback> = new Set();
  private syncStats: SyncStats = {
    totalPending: 0,
    synced: 0,
    failed: 0,
    conflicts: 0,
    isSyncing: false,
    lastSyncAt: null
  };
  private syncTimeout: number | null = null;
  private batchSize: number = 10;
  private retryDelayMs: number = 5000;

  constructor() {
    this.setupConnectivityListener();
    this.initializeStats();
    console.log('[Sync Service] Service de synchronisation initialisé');
  }

  private setupConnectivityListener(): void {
    connectivityService.subscribe((isOnline) => {
      if (isOnline) {
        console.log('[Sync Service] Connexion rétablie, démarrage de la synchronisation');
        this.scheduleSync(1000);
      } else {
        console.log('[Sync Service] Connexion perdue, synchronisation en pause');
        this.cancelScheduledSync();
      }
    });
  }

  private async initializeStats(): Promise<void> {
    const pending = await getPendingOperations();
    this.syncStats.totalPending = pending.length;
    this.notifyCallbacks();
  }

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

  public async sync(): Promise<SyncStats> {
    if (this.isSyncing) {
      console.log('[Sync Service] Synchronisation déjà en cours');
      return this.syncStats;
    }

    if (!connectivityService.getStatus()) {
      console.log('[Sync Service] Hors ligne, synchronisation reportée');
      return this.syncStats;
    }

    this.isSyncing = true;
    this.syncStats.isSyncing = true;
    this.syncStats.synced = 0;
    this.syncStats.failed = 0;
    this.syncStats.conflicts = 0;
    this.notifyCallbacks();

    console.log('[Sync Service] Démarrage de la synchronisation...');

    try {
      const operations = await getPendingOperations();
      this.syncStats.totalPending = operations.length;

      if (operations.length === 0) {
        console.log('[Sync Service] Aucune opération en attente');
        return this.finishSync();
      }

      console.log(`[Sync Service] ${operations.length} opération(s) à synchroniser`);

      for (let i = 0; i < operations.length; i += this.batchSize) {
        if (!connectivityService.getStatus()) {
          console.log('[Sync Service] Connexion perdue pendant la synchronisation');
          break;
        }

        const batch = operations.slice(i, i + this.batchSize);
        await this.processBatch(batch);
        this.notifyCallbacks();
      }

      return this.finishSync();
    } catch (error) {
      console.error('[Sync Service] Erreur de synchronisation:', error);
      return this.finishSync();
    }
  }

  private async processBatch(operations: OfflineOperation[]): Promise<void> {
    const promises = operations.map(op => this.processOperation(op));
    await Promise.allSettled(promises);
  }

  private async processOperation(operation: OfflineOperation): Promise<void> {
    if (operation.retryCount >= operation.maxRetries) {
      console.log(`[Sync Service] Opération ${operation.uuid} a atteint le max de tentatives`);
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
        console.log(`[Sync Service] Opération ${operation.uuid} synchronisée avec succès`);
        await updateOperationStatus(
          operation.uuid, 
          'completed', 
          undefined, 
          JSON.stringify(responseData)
        );
        this.syncStats.synced++;
      } else if (response.status === 409) {
        console.log(`[Sync Service] Conflit détecté pour ${operation.uuid}`);
        await updateOperationStatus(operation.uuid, 'conflict', 'Conflit de données');
        await addConflict(
          operation.uuid,
          operation.type,
          operation.uuid,
          JSON.parse(operation.payload),
          responseData
        );
        this.syncStats.conflicts++;
      } else if (response.status === 401 || response.status === 403) {
        console.log(`[Sync Service] Session expirée pour ${operation.uuid}`);
        await updateOperationStatus(operation.uuid, 'failed', 'Session expirée - reconnexion requise');
        this.syncStats.failed++;
      } else {
        const errorMsg = responseData?.message || `Erreur HTTP ${response.status}`;
        console.log(`[Sync Service] Échec opération ${operation.uuid}: ${errorMsg}`);
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

    console.log('[Sync Service] Synchronisation terminée:', {
      synced: this.syncStats.synced,
      failed: this.syncStats.failed,
      conflicts: this.syncStats.conflicts
    });

    if (this.syncStats.failed > 0 && connectivityService.getStatus()) {
      console.log('[Sync Service] Programmation nouvelle tentative dans', this.retryDelayMs, 'ms');
      this.scheduleSync(this.retryDelayMs);
    }

    return this.syncStats;
  }

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

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback({ ...this.syncStats });
      } catch (error) {
        console.error('[Sync Service] Erreur dans callback:', error);
      }
    });
  }

  public getStats(): SyncStats {
    return { ...this.syncStats };
  }

  public async forceSyncNow(): Promise<SyncStats> {
    this.cancelScheduledSync();
    return this.sync();
  }

  public async refreshPendingCount(): Promise<number> {
    const operations = await getPendingOperations();
    this.syncStats.totalPending = operations.length;
    this.notifyCallbacks();
    return operations.length;
  }
}

export const syncService = new SyncService();

export default syncService;
