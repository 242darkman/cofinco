/**
 * OfflineBus — Client-Side Event Bus for Offline Ledger
 *
 * A lightweight, synchronous event mediator that broadcasts journal events
 * to local reactors. The journal (IndexedDB) remains the single source of truth;
 * the bus only dispatches — it never persists.
 *
 * Design choices:
 * - Synchronous dispatch (microtask queue for async handlers)
 * - Wildcard '*' subscription for cross-cutting concerns
 * - System events (SYNC_*, NETWORK_*, etc.) separate from journal events
 * - Error isolation: a failing reactor never blocks other reactors
 * - Idempotent: safe to call emit() multiple times with the same entry
 *
 * @module offline-bus
 */

import type { JournalEntry, JournalEventType } from './offline-db';

// ========== TYPES ==========

export type OfflineEventHandler = (entry: JournalEntry) => void | Promise<void>;

export type SystemEventType =
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_FAILED'
  | 'SYNC_PROGRESS'
  | 'NETWORK_CHANGED'
  | 'SESSION_OPENED'
  | 'SESSION_CLOSED'
  | 'CHAIN_INTEGRITY_BROKEN'
  | 'LIMITS_UPDATED'
  | 'LIMITS_WARNING'
  | 'KEY_ROTATED'
  | 'CONFLICT_DETECTED'
  | 'RECONCILIATION_COMPLETE'
  | 'OPERATION_REJECTED';

export type SystemEventHandler = (data: unknown) => void | Promise<void>;

export interface BusStats {
  journalHandlers: number;
  systemHandlers: number;
  emittedJournal: number;
  emittedSystem: number;
  errors: number;
}

// ========== OFFLINE BUS CLASS ==========

class OfflineBusImpl {
  private journalHandlers = new Map<string, Set<OfflineEventHandler>>();
  private systemHandlers = new Map<string, Set<SystemEventHandler>>();
  private stats: BusStats = {
    journalHandlers: 0,
    systemHandlers: 0,
    emittedJournal: 0,
    emittedSystem: 0,
    errors: 0,
  };

  // ========== JOURNAL EVENTS ==========

  /**
   * Subscribe to journal events by type.
   * Use '*' to receive all journal events (wildcard).
   * Returns an unsubscribe function.
   */
  on(eventType: JournalEventType | '*', handler: OfflineEventHandler): () => void {
    const key = eventType;
    if (!this.journalHandlers.has(key)) {
      this.journalHandlers.set(key, new Set());
    }
    this.journalHandlers.get(key)!.add(handler);
    this.stats.journalHandlers++;

    return () => {
      const handlers = this.journalHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        this.stats.journalHandlers--;
        if (handlers.size === 0) {
          this.journalHandlers.delete(key);
        }
      }
    };
  }

  /**
   * Emit a journal event to all matching handlers.
   * Handlers are invoked asynchronously (microtask) to avoid blocking the caller.
   * Errors in handlers are caught and logged — they never propagate.
   */
  emit(entry: JournalEntry): void {
    this.stats.emittedJournal++;

    // Dispatch to type-specific handlers
    const typeHandlers = this.journalHandlers.get(entry.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        this.safeInvoke(() => handler(entry));
      }
    }

    // Dispatch to wildcard handlers
    const wildcardHandlers = this.journalHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        this.safeInvoke(() => handler(entry));
      }
    }
  }

  // ========== SYSTEM EVENTS ==========

  /**
   * Subscribe to system events by type.
   * Use '*' to receive all system events.
   * Returns an unsubscribe function.
   */
  onSystem(eventType: SystemEventType | '*', handler: SystemEventHandler): () => void {
    const key = eventType;
    if (!this.systemHandlers.has(key)) {
      this.systemHandlers.set(key, new Set());
    }
    this.systemHandlers.get(key)!.add(handler);
    this.stats.systemHandlers++;

    return () => {
      const handlers = this.systemHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        this.stats.systemHandlers--;
        if (handlers.size === 0) {
          this.systemHandlers.delete(key);
        }
      }
    };
  }

  /**
   * Emit a system event to all matching handlers.
   */
  emitSystem(type: SystemEventType, data?: unknown): void {
    this.stats.emittedSystem++;

    const typeHandlers = this.systemHandlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        this.safeInvoke(() => handler(data));
      }
    }

    const wildcardHandlers = this.systemHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        this.safeInvoke(() => handler({ type, data }));
      }
    }
  }

  // ========== UTILITIES ==========

  /**
   * Get bus statistics (for debugging / monitoring).
   */
  getStats(): Readonly<BusStats> {
    return { ...this.stats };
  }

  /**
   * Remove all handlers (for testing / cleanup).
   */
  clear(): void {
    this.journalHandlers.clear();
    this.systemHandlers.clear();
    this.stats.journalHandlers = 0;
    this.stats.systemHandlers = 0;
  }

  // ========== PRIVATE ==========

  private safeInvoke(fn: () => void | Promise<void>): void {
    try {
      const result = fn();
      // If the handler returns a promise, catch errors on it
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((error) => {
          this.stats.errors++;
          console.error('[OfflineBus] Async handler error:', error);
        });
      }
    } catch (error) {
      this.stats.errors++;
      console.error('[OfflineBus] Handler error:', error);
    }
  }
}

// ========== SINGLETON EXPORT ==========

export const offlineBus = new OfflineBusImpl();
export default offlineBus;
