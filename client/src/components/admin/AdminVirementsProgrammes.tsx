import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarClock,
    Edit2,
    Lock,
    RefreshCw,
    Play,
    Pause,
    ArrowRight,
    Activity,
    Banknote,
    Clock,
    LayoutList,
    Calendar as CalendarIcon,
    Plus,
    Filter,
    Wifi,
    WifiOff
} from 'lucide-react';
import {
    Badge,
    Button,
    Card,
    ConfirmDialog,
    IconButton,
    ResponsiveTable,
    SearchInput,
    TabGroup,
    EmptyState,
    StatCard
} from '../ui';
import { compteEpargneApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney, formatDate } from '../../lib/format';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import ScheduledTransferDetails, { ScheduledTransfer } from './ScheduledTransferDetails';
import ScheduledTransferFormModal from './ScheduledTransferFormModal';

// --- Types ---
// Reusing/Expanding type to match API better if needed, but keeping local for now or importing if I moved it.
// The api-client likely returns the type, but for this file it was defined locally. 
// I will keep the local definition or ensure it matches ScheduledTransferDetails.
// Ideally, this should be in a types file.

// For now, I will use the ScheduledTransfer type from the new component if exported, or redefine compatible one.
// I exported it from ScheduledTransferDetails.tsx.

type ScheduledTransferType = ScheduledTransfer;

const frequencyLabels: Record<string, string> = {
  once: 'Une fois',
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
};

const getOwnerName = (item: ScheduledTransferType, prefix: 'source' | 'dest') => {
  // @ts-ignore
  const userNom = item[`${prefix}UserNom`];
  // @ts-ignore
  const userPrenom = item[`${prefix}UserPrenom`];
  // @ts-ignore
  const clientNom = item[`${prefix}ClientNom`];
  // @ts-ignore
  const clientPrenom = item[`${prefix}ClientPrenom`];
  return `${userNom || clientNom || ''} ${userPrenom || clientPrenom || ''}`.trim();
};

const getStatusBadge = (item: ScheduledTransferType) => {
  if (!item.actif) {
    return { label: 'Suspendu', variant: 'neutral' as const };
  }
  switch (item.statutDernier) {
    case 'failed':
      return { label: 'Échec', variant: 'danger' as const };
    case 'success':
      return { label: 'Succès', variant: 'success' as const };
    case 'pending':
      return { label: 'En attente', variant: 'warning' as const };
    default:
      return { label: 'Actif', variant: 'info' as const };
  }
};

export default function AdminVirementsProgrammes() {
  const [transfers, setTransfers] = useState<ScheduledTransferType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // New States
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<ScheduledTransferType | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<ScheduledTransferType | null>(null);

  const [stats, setStats] = useState({
      totalCount: 0,
      activeCount: 0,
      pausedCount: 0,
      failedCount: 0,
      totalVolume: 0,
      nextExecution: null as string | null,
      trend: 0,
      trendUp: true
  });

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();
  const { hasPermission } = usePermissions();
  const { isConnected: wsConnected } = useWebSocketContext();

  const canView = hasPermission('virements_programmes', 'view') || hasPermission('admin', 'manage');
  const canEdit = hasPermission('virements_programmes', 'edit') || hasPermission('admin', 'manage');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadData = useCallback(async (isPolling = false) => {
    if (!canView) {
      if (!isPolling) {
        setLoading(false);
        setTransfers([]);
      }
      return;
    }
    if (!isPolling) setLoading(true);
    setError('');
    
    try {
      // Parallel fetch for stats and list
      // Filter logic: all -> no filter, active -> actif=true, paused -> actif=false, failed -> statut=FAILED
      const filterParams: any = {
        search: debouncedSearch || undefined,
        page,
        limit,
      };

      if (statusFilter === 'active') {
        filterParams.actif = true;
      } else if (statusFilter === 'paused') {
        filterParams.actif = false;
      } else if (statusFilter === 'failed') {
        filterParams.statut = 'FAILED';
      }

      const [listRes, statsRes] = await Promise.all([
         compteEpargneApi.getScheduledTransfers(filterParams),
         compteEpargneApi.getScheduledTransferStats()
      ]);

      setTransfers(listRes?.data || []);
      setTotalPages(listRes?.pagination?.totalPages || 1);
      setTotal(listRes?.pagination?.total || 0);
      
      if (statsRes) {
          // @ts-ignore - mismatch temporary between initial state and api response partials if stringent
          setStats(statsRes);
      }

    } catch (err) {
      if (!isPolling) setError(handleApiError(err, 'Erreur lors du chargement'));
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [canView, debouncedSearch, page, limit, statusFilter]);

  useEffect(() => {
    if (canView) loadData();
  }, [canView, loadData]);

  // WebSocket event listeners pour mise à jour temps réel
  useEffect(() => {
    if (!canView) return;

    const handleTransferUpdated = () => {
      loadData(true); // Silent refresh
    };

    const handleTransferExecuted = (e: CustomEvent) => {
      loadData(true);
      // Update selected transfer if it's the one that was executed
      if (selectedTransfer && e.detail?.transferId === selectedTransfer.id) {
        setSelectedTransfer(prev => prev ? ({
          ...prev,
          statutDernier: e.detail.success ? 'success' : 'failed',
          derniereExecution: new Date().toISOString(),
        }) : null);
      }
    };

    const handleBatchCompleted = () => {
      loadData(true);
    };

    // Subscribe to WebSocket events
    window.addEventListener('scheduled-transfer-updated', handleTransferUpdated as EventListener);
    window.addEventListener('scheduled-transfer-executed', handleTransferExecuted as EventListener);
    window.addEventListener('scheduled-transfers-batch-completed', handleBatchCompleted as EventListener);

    return () => {
      window.removeEventListener('scheduled-transfer-updated', handleTransferUpdated as EventListener);
      window.removeEventListener('scheduled-transfer-executed', handleTransferExecuted as EventListener);
      window.removeEventListener('scheduled-transfers-batch-completed', handleBatchCompleted as EventListener);
    };
  }, [canView, loadData, selectedTransfer]);

  // Actions
  const handleToggleActive = async (transfer: ScheduledTransferType, nextActive: boolean) => {
      openConfirm({
          title: nextActive ? 'Réactiver ?' : 'Mettre en pause ?',
          message: nextActive ? 'Le virement reprendra selon le planning.' : "Aucune exécution ne se fera tant qu'il est en pause.",
          variant: nextActive ? 'info' : 'warning',
          onConfirm: async () => {
              try {
                  await compteEpargneApi.updateScheduledTransfer(transfer.id, { actif: nextActive });
                  toast.success(nextActive ? 'Réactivé' : 'Mis en pause');
                  await loadData(true); // fast refresh
                  
                  if (selectedTransfer?.id === transfer.id) {
                      setSelectedTransfer(prev => prev ? ({...prev, actif: nextActive}) : null);
                  }
              } catch (err) {
                  toast.error("Erreur mise à jour");
              }
          }
      });
  };

  const handleRunNow = (transfer: ScheduledTransferType) => {
      openConfirm({
          title: "Exécution forcée",
          message: "Voulez-vous déclencher ce virement immédiatement ? Cela va créer une transaction effective.",
          confirmText: "Exécuter maintenant",
          variant: "danger",
          onConfirm: async () => {
               try {
                   await compteEpargneApi.runScheduledTransferNow(transfer.id);
                   toast.success("Exécution lancée");
                   // WebSocket va automatiquement déclencher le refresh
               } catch (e) {
                   toast.error(handleApiError(e, "Erreur lors de l'exécution"));
               }
          }
      });
  };

  const handleRowClick = (item: ScheduledTransferType) => {
      setSelectedTransfer(item);
      setDetailsOpen(true);
  };

  // derived stats (mocked for now as per plan, or calculated from list if possible)
  // In a real app these would come from an API summary endpoint
  // const stats = {
  //     monthlyVolume: transfers.reduce((acc, curr) => acc + Number(curr.montant || 0), 0), 
  //     activeCount: transfers.filter(t => t.actif).length,
  //     nextRunTime: transfers.find(t => t.actif && t.prochaineExecution && new Date(t.prochaineExecution) > new Date())?.prochaineExecution
  // };

  const tableColumns = useMemo(() => [
    {
      key: 'flux',
      label: 'Flux financier',
      primary: true,
      format: (_: unknown, item: ScheduledTransferType) => (
        <div className="flex items-center gap-4 group cursor-pointer">
           {/* Source Avatar Mock */}
           <div className="w-8 h-8 rounded-full bg-status-info-bg flex items-center justify-center text-status-info font-bold text-xs">
               {item.sourceClientPrenom?.[0] || 'S'}
           </div>
           
           <div className="flex flex-col">
               <span className="text-sm font-medium text-content-primary">
                   {item.sourceClientPrenom || 'Source'} <span className="text-content-muted">➔</span> {item.destClientPrenom || 'Dest'}
               </span>
               <span className="text-xs text-content-muted flex items-center gap-1">
                   {item.sourceNumero} <ArrowRight size={10} /> {item.destNumero}
               </span>
           </div>
        </div>
      )
    },
    {
        key: 'timing',
        label: 'Fréquence',
        format: (_: any, item: ScheduledTransferType) => (
            <div>
                <div className="text-sm font-medium text-content-secondary">
                    {frequencyLabels[item.frequence || 'once']}
                </div>
                {item.prochaineExecution && (
                    <div className="text-xs text-content-muted">
                        Prochaine: {formatDate(item.prochaineExecution)}
                    </div>
                )}
            </div>
        )
    },
    {
        key: 'montant',
        label: 'Montant',
        align: 'right' as const,
        format: (val: string) => <span className="font-bold text-content-primary">{formatMoney(val)}</span>
    },
    {
        key: 'status',
        label: 'État',
        align: 'center' as const,
        format: (_: any, item: ScheduledTransferType) => {
            const { label, variant } = getStatusBadge(item);
            return <Badge value={label} variant={variant} size="sm" />;
        }
    },
    {
        key: 'actions',
        label: '',
        align: 'right' as const,
        format: (_: any, item: ScheduledTransferType) => (
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <IconButton 
                    icon={Play} 
                    size="sm" 
                    variant="ghost" 
                    className="text-status-success hover:bg-status-success-bg"
                    onClick={() => handleRunNow(item)}
                    aria-label="Exécuter maintenant"
                />
                 <IconButton 
                    icon={item.actif ? Pause : Play} 
                    size="sm" 
                    variant="ghost" 
                    className={item.actif ? "text-status-warning" : "text-status-info"}
                    onClick={() => handleToggleActive(item, !item.actif)}
                    aria-label={item.actif ? "Mettre en pause" : "Réactiver"}
                />
                <IconButton 
                    icon={Edit2} 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                        setSelectedTransfer(item);
                        setDetailsOpen(true);
                    }}
                    aria-label="Voir détails"
                />
            </div>
        )
    }
  ], []);

  if (!canView) {
      return (
          <div className="p-8 flex justify-center">
              <div className="text-center">
                  <Lock className="mx-auto h-12 w-12 text-content-secondary" />
                  <h3 className="mt-2 text-lg font-medium text-content-primary">Accès refusé</h3>
                  <p className="text-content-muted">Vous n'avez pas les permissions nécessaires.</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full space-y-3 overflow-y-auto overflow-x-hidden animate-in fade-in duration-500">
      
      {/* 1. Hero Zone: KPIs - Compact */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard 
            title="Volume Mensuel" 
            value={formatMoney(stats.totalVolume || 0)} 
            icon={Banknote} 
            color="primary"
            variant="glass"
            trend={stats.trend ? `${stats.trend > 0 ? '+' : ''}${Math.round(stats.trend)}%` : undefined}
            trendUp={stats.trendUp ?? true}
            className="py-3 px-4"
        />
        <StatCard 
            title="Actifs" 
            value={stats.activeCount || 0} 
            subtitle={`${stats.pausedCount || 0} en pause`}
            icon={Activity} 
            color="success"
            variant="glass"
            className="py-3 px-4"
        />
        <StatCard 
            title="Prochaine exécution" 
            value={stats.nextExecution ? new Date(stats.nextExecution).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'} 
            subtitle={stats.nextExecution ? formatDate(stats.nextExecution) : 'Aucun prévu'}
            icon={Clock} 
            color="warning"
            variant="glass"
            className="py-3 px-4"
        />
      </div>

      {/* 2. Toolbar & Filters - Compact */}
      <div className="shrink-0 bg-surface/50 p-1.5 rounded-xl border border-edge flex flex-col sm:flex-row justify-between items-center gap-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
              <TabGroup 
                 activeTab={statusFilter}
                 onTabChange={setStatusFilter}
                 tabs={[
                     { key: 'all', label: 'Tous', icon: LayoutList, badge: stats.totalCount },
                     { key: 'active', label: 'Actifs', badge: stats.activeCount },
                     { key: 'paused', label: 'En pause', badge: stats.pausedCount },
                     { key: 'failed', label: 'Échecs', badge: stats.failedCount, icon: Filter }
                 ]}
                 variant="pills"
                 size="sm"
              />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
              <SearchInput 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full sm:w-48 h-8 text-xs"
              />
              
              <div className="flex bg-surface-elevated/50 p-0.5 rounded-lg border border-edge-strong shrink-0">
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-surface-subtle text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary'}`}
                  >
                      <LayoutList size={14} />
                  </button>
                  <button 
                    onClick={() => setViewMode('calendar')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-surface-subtle text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary'}`}
                  >
                      <CalendarIcon size={14} />
                  </button>
              </div>

              {/* Indicateur WebSocket temps réel */}
              <div className="flex items-center gap-1 px-2" title={wsConnected ? "Temps réel actif" : "Temps réel déconnecté"}>
                  {wsConnected ? (
                    <Wifi size={14} className="text-status-success" />
                  ) : (
                    <WifiOff size={14} className="text-status-danger" />
                  )}
                  <span className={`text-xs ${wsConnected ? 'text-status-success' : 'text-status-danger'}`}>
                    {wsConnected ? 'Live' : 'Hors ligne'}
                  </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadData(false)}
                className="text-content-muted hover:text-content-primary h-8 w-8 p-0"
                aria-label="Rafraîchir"
              >
                  <RefreshCw size={16} />
              </Button>

              <Button
                variant="primary"
                icon={Plus}
                size="sm"
                onClick={() => {
                     setEditingTransfer(null);
                     setFormModalOpen(true);
                }}
                className="h-8 text-xs"
              >
                  Nouveau
              </Button>
          </div>
      </div>

      {/* 3. Data Table - Fixed Height Scrollable */}
      <div className="flex-1 min-h-0 bg-surface-base rounded-xl border border-edge overflow-hidden flex flex-col">
         {transfers.length > 0 ? (
             <div className="flex-1 overflow-y-auto custom-scrollbar">
                 <ResponsiveTable
                    data={transfers}
                    columns={tableColumns}
                    loading={loading}
                    emptyMessage="Aucun résultat"
                    onRowClick={handleRowClick}
                 />
             </div>
         ) : (
             <div className="flex-1 flex flex-col justify-center">
                 <EmptyState
                    icon={CalendarIcon}
                    title="Aucun virement programmé"
                    description="Automatisez vos flux financiers en créant votre premier virement programmé."
                    action={{
                        label: "Planifier un virement",
                        onClick: () => {
                            setEditingTransfer(null);
                            setFormModalOpen(true);
                        }
                    }}
                 />
             </div>
         )}
      </div>

      {/* Details Drawer */}
      <ScheduledTransferDetails
          isOpen={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          transfer={selectedTransfer}
          onToggleActive={handleToggleActive}
          onRunNow={handleRunNow}
          onEdit={(t) => {
              setEditingTransfer(t);
              setDetailsOpen(false);
              setFormModalOpen(true);
          }}
      />

      {/* Form Modal for Create/Edit */}
      <ScheduledTransferFormModal
          isOpen={formModalOpen}
          onClose={() => {
              setFormModalOpen(false);
              setEditingTransfer(null);
          }}
          onSuccess={() => {
              loadData(true);
          }}
          editTransfer={editingTransfer as any}
      />

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || 'Confirmer'}
        message={confirmState.message || 'Êtes-vous sûr ?'}
        variant={confirmState.variant || 'warning'}
        confirmText={confirmState.confirmText || 'Confirmer'}
      />
    </div>
  );
}
