/**
 * SyncQueueDrawer
 *
 * Debug/admin panel for viewing and managing the offline operation queue.
 * Shows pending operations, their status, retry counts, and errors.
 * Allows manual retry and deletion of blocked operations.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Trash2,
  RotateCcw,
  CloudUpload,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Database,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  getPendingOperations,
  getOperationStats,
  updateOperationStatus,
  clearCompletedOperations,
  type OfflineOperation,
} from '../../lib/offline-db';
import { getJournalStats } from '../../lib/journal-service';
import { syncService } from '../../lib/syncService';
import { tabLeader } from '../../lib/tabLeader';

interface SyncQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  transfer: 'Transfert',
  caisse: 'Caisse',
  client: 'Client',
  payment: 'Paiement',
  epargne: 'Epargne',
  credit: 'Credit',
  tontine: 'Tontine',
  remise: 'Remise',
  enquete: 'Enquete',
  other: 'Autre',
};

const STATUS_CONFIG = {
  pending: { label: 'En attente', icon: Clock, color: 'text-status-warning' },
  syncing: { label: 'Envoi...', icon: RefreshCw, color: 'text-status-info' },
  completed: { label: 'Envoye', icon: CheckCircle, color: 'text-status-success' },
  failed: { label: 'Echoue', icon: XCircle, color: 'text-status-danger' },
  conflict: { label: 'Conflit', icon: AlertTriangle, color: 'text-status-warning' },
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export default function SyncQueueDrawer({ isOpen, onClose }: SyncQueueDrawerProps) {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getOperationStats>> | null>(null);
  const [journalStats, setJournalStats] = useState<Record<string, number> | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isLeader = tabLeader.isLeader();

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [ops, opStats, jStats] = await Promise.all([
        getPendingOperations(),
        getOperationStats(),
        getJournalStats(),
      ]);
      setOperations(ops);
      setStats(opStats);
      setJournalStats(jStats);
    } catch (err) {
      console.error('[SyncQueueDrawer] Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refresh();
      // Auto-refresh every 3s while open
      const interval = setInterval(refresh, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, refresh]);

  const handleRetryOne = useCallback(async (uuid: string) => {
    await updateOperationStatus(uuid, 'pending');
    await refresh();
  }, [refresh]);

  const handleDeleteOne = useCallback(async (uuid: string) => {
    await updateOperationStatus(uuid, 'completed', 'Supprime manuellement');
    await refresh();
  }, [refresh]);

  const handleRetryAll = useCallback(async () => {
    for (const op of operations.filter(o => o.status === 'failed')) {
      await updateOperationStatus(op.uuid, 'pending');
    }
    await refresh();
  }, [operations, refresh]);

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncService.forceSyncNow();
    } finally {
      setIsSyncing(false);
      await refresh();
    }
  }, [refresh]);

  const handleClearCompleted = useCallback(async () => {
    await clearCompletedOperations(0);
    await refresh();
  }, [refresh]);

  if (!isOpen) return null;

  const failedCount = operations.filter(o => o.status === 'failed').length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[70] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface z-[71] shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-content-primary">File de synchronisation</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg hover:bg-surface-subtle text-content-muted"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-subtle text-content-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 py-3 border-b border-edge-subtle bg-surface-subtle">
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <div className="text-lg font-bold text-content-primary">{stats?.pending ?? 0}</div>
              <div className="text-content-muted">En attente</div>
            </div>
            <div>
              <div className="text-lg font-bold text-status-danger">{stats?.failed ?? 0}</div>
              <div className="text-content-muted">Echoues</div>
            </div>
            <div>
              <div className="text-lg font-bold text-status-success">{stats?.completed ?? 0}</div>
              <div className="text-content-muted">Envoyes</div>
            </div>
          </div>

          {/* Journal stats */}
          {journalStats && (journalStats.local > 0 || journalStats.syncing > 0) && (
            <div className="mt-2 pt-2 border-t border-edge-subtle text-xs text-content-secondary">
              Journal: {journalStats.local} local, {journalStats.syncing} en envoi, {journalStats.confirmed} confirme
            </div>
          )}

          {/* Leader indicator */}
          <div className="mt-1 text-xs text-content-muted">
            {isLeader ? 'Cet onglet synchronise (leader)' : 'Un autre onglet synchronise'}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-edge-subtle">
          <button
            onClick={handleSyncNow}
            disabled={isSyncing || !isLeader}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
            {isSyncing ? 'Synchronisation...' : 'Synchroniser'}
          </button>

          {failedCount > 0 && (
            <button
              onClick={handleRetryAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-status-warning-bg text-status-warning hover:bg-status-warning-bg/80"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry tous ({failedCount})
            </button>
          )}

          {(stats?.completed ?? 0) > 0 && (
            <button
              onClick={handleClearCompleted}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-content-muted hover:bg-surface-subtle"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Purger
            </button>
          )}
        </div>

        {/* Operations list */}
        <div className="flex-1 overflow-y-auto">
          {operations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-content-muted gap-2">
              <CheckCircle className="w-8 h-8" />
              <p className="text-sm">Aucune operation en attente</p>
            </div>
          ) : (
            <div className="divide-y divide-edge-subtle">
              {operations.map((op) => {
                const statusConf = STATUS_CONFIG[op.status];
                const StatusIcon = statusConf.icon;
                const isExpanded = expandedId === op.uuid;

                return (
                  <div key={op.uuid} className="px-4 py-3">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : op.uuid)}
                    >
                      <StatusIcon className={`w-4 h-4 flex-shrink-0 ${statusConf.color} ${op.status === 'syncing' ? 'animate-spin' : ''}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-content-primary">
                            {TYPE_LABELS[op.type] || op.type}
                          </span>
                          <span className="text-xs text-content-muted uppercase">
                            {op.method}
                          </span>
                        </div>
                        <div className="text-xs text-content-muted truncate">
                          {op.endpoint}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {op.retryCount > 0 && (
                          <span className="text-xs text-content-muted">
                            {op.retryCount}/{op.maxRetries}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-content-muted" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-content-muted" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-2 ml-7 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-content-muted">Cree le: </span>
                            <span className="text-content-secondary">{formatDate(op.createdAt)}</span>
                          </div>
                          <div>
                            <span className="text-content-muted">Status: </span>
                            <span className={statusConf.color}>{statusConf.label}</span>
                          </div>
                          {op.lastAttemptAt && (
                            <div>
                              <span className="text-content-muted">Dernier essai: </span>
                              <span className="text-content-secondary">{formatDate(op.lastAttemptAt)}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-content-muted">Priorite: </span>
                            <span className="text-content-secondary">{op.priority}</span>
                          </div>
                        </div>

                        {op.errorMessage && (
                          <div className="p-2 rounded bg-status-danger-bg text-xs text-status-danger">
                            {op.errorMessage}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {(op.status === 'failed' || op.status === 'conflict') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryOne(op.uuid);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-surface-subtle hover:bg-surface-subtle-elevated text-content-secondary"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reessayer
                            </button>
                          )}
                          {(op.status === 'failed' || op.status === 'conflict') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOne(op.uuid);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-status-danger-bg hover:bg-status-danger-bg/80 text-status-danger"
                            >
                              <Trash2 className="w-3 h-3" />
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
