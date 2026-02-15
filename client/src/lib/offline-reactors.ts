/**
 * Offline Reactors — Client-side event handlers for the OfflineBus
 *
 * Each reactor subscribes to journal and/or system events and performs
 * a specific side-effect. Reactors are registered once at app startup
 * via `initOfflineReactors()`.
 *
 * Reactors NEVER modify the journal. They only react to it.
 *
 * @module offline-reactors
 */

import { offlineBus } from './offline-bus';
import type { JournalEntry, JournalEventType } from './offline-db';
import { currencySymbol } from '@shared/config/currency';

// ========== TYPES ==========

type UnsubscribeFn = () => void;

interface ReactorContext {
  /** React Query client — injected at init time */
  queryClient: {
    invalidateQueries: (opts: { queryKey: string[] }) => void;
  } | null;
  /** Toast function — injected at init time */
  showToast: ((opts: {
    title: string;
    description?: string;
    variant?: 'default' | 'success' | 'warning' | 'destructive';
  }) => void) | null;
  /** Sync service reference */
  syncService: {
    syncJournal: () => Promise<unknown>;
    requestBackgroundSync: (tag: string) => Promise<boolean>;
  } | null;
}

// ========== STATE ==========

const unsubscribers: UnsubscribeFn[] = [];
let initialized = false;
const context: ReactorContext = {
  queryClient: null,
  showToast: null,
  syncService: null,
};

// ========== HELPER: FINANCIAL EVENT CHECK ==========

const FINANCIAL_EVENTS: Set<string> = new Set([
  'DEPOSIT', 'WITHDRAWAL', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT',
  'TONTINE_CONTRIBUTION', 'TONTINE_DISTRIBUTION', 'SETTLEMENT', 'REMISE_CREATE',
]);

function isFinancialEvent(type: JournalEventType): boolean {
  return FINANCIAL_EVENTS.has(type);
}

// ========== HELPER: OPERATION LABELS ==========

const OPERATION_LABELS: Record<string, string> = {
  DEPOSIT: 'Depot',
  WITHDRAWAL: 'Retrait',
  LOAN_DISBURSEMENT: 'Decaissement credit',
  LOAN_REPAYMENT: 'Remboursement credit',
  TONTINE_CONTRIBUTION: 'Cotisation tontine',
  TONTINE_DISTRIBUTION: 'Distribution tontine',
  CLIENT_CREATE: 'Nouveau client',
  CLIENT_UPDATE: 'Mise a jour client',
  CAISSE_OPEN: 'Ouverture session',
  CAISSE_CLOSE: 'Cloture session',
  CAISSE_RECONCILE: 'Reconciliation',
  REMISE_CREATE: 'Remise',
  SETTLEMENT: 'Versement caisse',
};

function getOperationLabel(type: JournalEventType): string {
  return OPERATION_LABELS[type] || type;
}

// ========== REACTOR: CACHE INVALIDATION ==========

/**
 * CacheReactor — Invalidates React Query caches when journal events occur.
 * This ensures the UI reflects the latest state after offline operations.
 */
function registerCacheReactor(): UnsubscribeFn {
  const INVALIDATION_MAP: Record<string, string[][]> = {
    DEPOSIT: [['compte'], ['caisse-session'], ['dashboard'], ['transactions']],
    WITHDRAWAL: [['compte'], ['caisse-session'], ['dashboard'], ['transactions']],
    LOAN_DISBURSEMENT: [['credit'], ['caisse-session'], ['dashboard'], ['transactions']],
    LOAN_REPAYMENT: [['credit'], ['caisse-session'], ['dashboard'], ['transactions']],
    TONTINE_CONTRIBUTION: [['tontine'], ['caisse-session'], ['dashboard']],
    TONTINE_DISTRIBUTION: [['tontine'], ['caisse-session'], ['dashboard']],
    CLIENT_CREATE: [['clients']],
    CLIENT_UPDATE: [['clients']],
    CAISSE_OPEN: [['caisse-session'], ['dashboard']],
    CAISSE_CLOSE: [['caisse-session'], ['dashboard']],
    CAISSE_RECONCILE: [['caisse-session'], ['reconciliation']],
    REMISE_CREATE: [['remises'], ['caisse-session']],
    SETTLEMENT: [['caisse-session'], ['treasury'], ['dashboard']],
  };

  return offlineBus.on('*', (entry) => {
    if (!context.queryClient) return;
    const keys = INVALIDATION_MAP[entry.type];
    if (keys) {
      for (const queryKey of keys) {
        context.queryClient.invalidateQueries({ queryKey });
      }
    }
  });
}

// ========== REACTOR: UI NOTIFICATIONS ==========

/**
 * UIReactor — Shows toast notifications for journal events.
 */
function registerUIReactor(): UnsubscribeFn {
  const unsub1 = offlineBus.on('*', (entry) => {
    if (!context.showToast) return;
    if (!isFinancialEvent(entry.type)) return;

    let description = `Ref: ${entry.operationRef}`;
    try {
      const payload = typeof entry.payload === 'string' && !entry.payload.startsWith('enc:')
        ? JSON.parse(entry.payload)
        : null;
      if (payload?.amount) {
        description = `${Number(payload.amount).toLocaleString('fr-FR')} ${currencySymbol()} — ${description}`;
      }
    } catch {
      // payload may be encrypted
    }

    context.showToast({
      title: getOperationLabel(entry.type),
      description,
      variant: 'success',
    });
  });

  const unsub2 = offlineBus.onSystem('CONFLICT_DETECTED', () => {
    if (!context.showToast) return;
    context.showToast({
      title: 'Conflit detecte',
      description: 'Une operation necessite une resolution manuelle.',
      variant: 'warning',
    });
  });

  const unsub3 = offlineBus.onSystem('OPERATION_REJECTED', (data: unknown) => {
    if (!context.showToast) return;
    const d = data as { reason?: string } | undefined;
    context.showToast({
      title: 'Operation rejetee',
      description: d?.reason || 'Une operation a ete rejetee par le serveur.',
      variant: 'destructive',
    });
  });

  const unsub4 = offlineBus.onSystem('LIMITS_WARNING', (data: unknown) => {
    if (!context.showToast) return;
    const d = data as { type?: string; current?: number; max?: number } | undefined;
    const pct = d?.current && d?.max ? Math.round((d.current / d.max) * 100) : 0;
    context.showToast({
      title: 'Limite proche',
      description: `${d?.type === 'DAILY_OPS' ? 'Operations journalieres' : 'Volume journalier'}: ${pct}% utilise`,
      variant: 'warning',
    });
  });

  return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
}

// ========== REACTOR: SYNC TRIGGER ==========

/**
 * SyncReactor — Triggers journal sync when network is available.
 * Debounced to avoid hammering the server when multiple events fire quickly.
 */
function registerSyncReactor(): UnsubscribeFn {
  let syncTimeout: ReturnType<typeof setTimeout> | null = null;
  const SYNC_DEBOUNCE_MS = 3000;

  const unsub = offlineBus.on('*', () => {
    if (!context.syncService) return;

    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      syncTimeout = null;
      try {
        // Import dynamically to avoid circular dependency
        const { isNetworkUsable } = await import('./networkManager');
        if (isNetworkUsable()) {
          await context.syncService!.syncJournal();
        } else {
          await context.syncService!.requestBackgroundSync('cofin-journal-sync');
        }
      } catch {
        // Non-blocking: sync will retry later
      }
    }, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    unsub();
  };
}

// ========== REACTOR: LIMITS MONITORING ==========

/**
 * LimitsReactor — Monitors offline limits and emits warnings at 80% threshold.
 */
function registerLimitsReactor(): UnsubscribeFn {
  return offlineBus.on('*', async (entry) => {
    if (!isFinancialEvent(entry.type)) return;

    try {
      const { db } = await import('./offline-db');

      // Get current session
      const today = new Date().toISOString().slice(0, 10);
      const session = await db.agentDaySessions
        .where('[agentId+date]')
        .equals([entry.agentId, today])
        .first();

      if (!session) return;

      // Get limits
      const limits = await db.offlineLimits.get('current');
      if (!limits) return;

      const WARNING_THRESHOLD = 0.8;

      // Check daily operations
      if (session.operationCount >= limits.maxDailyOperations * WARNING_THRESHOLD) {
        offlineBus.emitSystem('LIMITS_WARNING', {
          type: 'DAILY_OPS',
          current: session.operationCount,
          max: limits.maxDailyOperations,
        });
      }

      // Check daily volume
      if (session.dailyVolume >= limits.maxDailyVolume * WARNING_THRESHOLD) {
        offlineBus.emitSystem('LIMITS_WARNING', {
          type: 'DAILY_VOLUME',
          current: session.dailyVolume,
          max: limits.maxDailyVolume,
        });
      }

      // Check caisse balance
      if (session.currentCashBalance >= limits.maxCaisseBalance * WARNING_THRESHOLD) {
        offlineBus.emitSystem('LIMITS_WARNING', {
          type: 'CAISSE_BALANCE',
          current: session.currentCashBalance,
          max: limits.maxCaisseBalance,
        });
      }

      // Check pending sync count
      const pendingCount = await db.journalEntries
        .where('syncStatus')
        .equals('local')
        .count();

      if (pendingCount >= limits.maxPendingSync * WARNING_THRESHOLD) {
        offlineBus.emitSystem('LIMITS_WARNING', {
          type: 'SYNC_BACKLOG',
          current: pendingCount,
          max: limits.maxPendingSync,
        });
      }
    } catch {
      // Non-blocking
    }
  });
}

// ========== REACTOR: AUDIT LOG ==========

/**
 * AuditReactor — Maintains a lightweight local audit log
 * separate from the journal, for non-repudiation of UI actions.
 */
function registerAuditReactor(): UnsubscribeFn {
  return offlineBus.on('*', async (entry) => {
    try {
      const { setMetadata, getMetadata } = await import('./offline-db');

      const auditLog = (await getMetadata<Array<{
        timestamp: number;
        action: string;
        agentId: string;
        ref: string;
        deviceId: string;
      }>>('audit_log')) || [];

      auditLog.push({
        timestamp: entry.localTimestamp,
        action: entry.type,
        agentId: entry.agentId,
        ref: entry.operationRef,
        deviceId: entry.deviceId,
      });

      // Keep only last 500 entries to avoid bloat
      const trimmed = auditLog.length > 500 ? auditLog.slice(-500) : auditLog;
      await setMetadata('audit_log', trimmed);
    } catch {
      // Non-blocking
    }
  });
}

// ========== INITIALIZATION ==========

/**
 * Initialize all offline reactors.
 * Call this once at app startup, after the QueryClient and other
 * dependencies are available.
 *
 * @param deps - Optional dependency injection for React Query client, toast, etc.
 */
export function initOfflineReactors(deps?: {
  queryClient?: ReactorContext['queryClient'];
  showToast?: ReactorContext['showToast'];
  syncService?: ReactorContext['syncService'];
}): void {
  if (initialized) {
    console.warn('[OfflineReactors] Already initialized. Call teardownOfflineReactors() first.');
    return;
  }

  // Inject dependencies
  if (deps?.queryClient) context.queryClient = deps.queryClient;
  if (deps?.showToast) context.showToast = deps.showToast;
  if (deps?.syncService) context.syncService = deps.syncService;

  // Register all reactors
  unsubscribers.push(registerCacheReactor());
  unsubscribers.push(registerUIReactor());
  unsubscribers.push(registerSyncReactor());
  unsubscribers.push(registerLimitsReactor());
  unsubscribers.push(registerAuditReactor());

  initialized = true;
  console.log('[OfflineReactors] Initialized with', unsubscribers.length, 'reactors');
}

/**
 * Update injected dependencies (e.g., when QueryClient changes).
 */
export function updateReactorDeps(deps: Partial<ReactorContext>): void {
  if (deps.queryClient !== undefined) context.queryClient = deps.queryClient;
  if (deps.showToast !== undefined) context.showToast = deps.showToast;
  if (deps.syncService !== undefined) context.syncService = deps.syncService;
}

/**
 * Tear down all reactors. Call on unmount or before re-init.
 */
export function teardownOfflineReactors(): void {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers.length = 0;
  initialized = false;
  context.queryClient = null;
  context.showToast = null;
  context.syncService = null;
  console.log('[OfflineReactors] Torn down');
}

/**
 * Check if reactors are initialized.
 */
export function areReactorsInitialized(): boolean {
  return initialized;
}
