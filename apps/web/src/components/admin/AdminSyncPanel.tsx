/**
 * AdminSyncPanel
 *
 * Admin tab for monitoring and managing offline sync:
 * - Conflict resolution
 * - Sync queue inspection
 * - Storage stats
 */

import { useState } from 'react';
import { GitMerge, Database, HardDrive, RefreshCw } from 'lucide-react';
import { ConflictResolutionPanel } from '../shared/ConflictResolutionPanel';
import SyncQueueDrawer from '../shared/SyncQueueDrawer';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { tabLeader } from '../../lib/tabLeader';
import Card from '../ui/Card';
import Button from '../ui/Button';

type SyncView = 'conflicts' | 'queue' | 'storage';

export default function AdminSyncPanel() {
  const [activeView, setActiveView] = useState<SyncView>('conflicts');
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const { conflictCount, storageStats, pendingCount, isSyncing, forceSyncNow, refreshStats } =
    useOfflineContext();

  const isLeader = tabLeader.isLeader();

  const views: { id: SyncView; label: string; icon: typeof GitMerge; badge?: number }[] = [
    { id: 'conflicts', label: 'Conflits', icon: GitMerge, badge: conflictCount },
    { id: 'queue', label: 'File d\'attente', icon: Database, badge: pendingCount },
    { id: 'storage', label: 'Stockage', icon: HardDrive },
  ];

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 shrink-0">
        {views.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeView === id
                ? 'bg-accent/10 text-accent'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-subtle'
            }`}
          >
            <Icon size={14} />
            {label}
            {badge != null && badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 bg-status-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-content-muted">
            {isLeader ? 'Onglet leader' : 'Onglet secondaire'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={refreshStats}
            className="text-xs"
          >
            Actualiser
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeView === 'conflicts' && <ConflictResolutionPanel />}

        {activeView === 'queue' && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-content-primary flex items-center gap-2">
                  <Database size={16} className="text-accent" />
                  File de synchronisation
                </h3>
                <div className="flex items-center gap-2">
                  {isSyncing && (
                    <span className="text-xs text-status-info flex items-center gap-1">
                      <RefreshCw size={12} className="animate-spin" />
                      Synchronisation...
                    </span>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={forceSyncNow}
                    disabled={isSyncing || !isLeader}
                  >
                    Synchroniser
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowQueueDrawer(true)}
                  >
                    Voir détails
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-lg bg-surface-subtle border border-edge-subtle">
                  <div className="text-2xl font-bold text-content-primary">{pendingCount}</div>
                  <div className="text-xs text-content-muted">En attente</div>
                </div>
                <div className="p-3 rounded-lg bg-surface-subtle border border-edge-subtle">
                  <div className="text-2xl font-bold text-content-primary">{conflictCount}</div>
                  <div className="text-xs text-content-muted">Conflits</div>
                </div>
                <div className="p-3 rounded-lg bg-surface-subtle border border-edge-subtle">
                  <div className="text-2xl font-bold text-content-primary">
                    {storageStats?.operations ?? 0}
                  </div>
                  <div className="text-xs text-content-muted">Opérations</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeView === 'storage' && (
          <Card className="p-4">
            <h3 className="font-semibold text-content-primary flex items-center gap-2 mb-4">
              <HardDrive size={16} className="text-accent" />
              Stockage local (IndexedDB)
            </h3>
            {storageStats ? (
              <div className="space-y-3">
                <StorageRow label="Opérations en file" value={storageStats.operations} />
                <StorageRow label="Clients cachés" value={storageStats.clients} />
                <StorageRow label="Remises" value={storageStats.remises} />
                <StorageRow label="Enquêtes" value={storageStats.enquetes} />
                <StorageRow label="Requêtes cachées" value={storageStats.cachedQueries} />
                <StorageRow label="Tuiles carte" value={storageStats.mapTiles.count} />
                <StorageRow label="Conflits" value={storageStats.conflicts} />
                <div className="pt-3 border-t border-edge">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-content-primary">Taille estimée</span>
                    <span className="text-sm font-bold text-accent">
                      {formatBytes(storageStats.estimatedTotalSize)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-content-muted">Chargement...</p>
            )}
          </Card>
        )}
      </div>

      <SyncQueueDrawer isOpen={showQueueDrawer} onClose={() => setShowQueueDrawer(false)} />
    </div>
  );
}

function StorageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-content-muted">{label}</span>
      <span className="font-medium text-content-secondary">{value.toLocaleString('fr-FR')}</span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
