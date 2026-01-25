import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Plus,
  CheckCircle,
  Clock,
  X,
  AlertTriangle,
  Send,
  Vault,
  FileText,
  Filter,
  Search,
  ChevronRight,
  Shield,
  Truck,
  Package,
  Calendar,
  User,
  Building2,
  RefreshCw,
  Download,
  Eye,
} from 'lucide-react';
import { Button, Card, Badge, Pagination, Modal, StatCard, Tooltip, ResponsiveTable } from '@/components/ui';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import TransfertInterCoffresForm from './TransfertInterCoffresForm';
import TransfertInterCoffresDetail from './TransfertInterCoffresDetail';
import TransfertInterCoffresApproval from './TransfertInterCoffresApproval';
import TransfertInterCoffresReception from './TransfertInterCoffresReception';

// Types
interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  ownerId?: string;
  solde: string;
  devise: string;
  statut: string;
  agenceNom?: string;
}

interface TransfertInterCoffre {
  id: string;
  reference: string;
  dateTransfert: string;
  coffreSourceId: string;
  coffreDestinationId: string;
  montant: string;
  devise: string;
  typeTransfert: string;
  typeConditionnement: string;
  numeroScelle?: string;
  motif: string;
  statut: string;
  agentsTransport?: Array<{ nom: string; contact: string }>;
  createdAt: string;
  coffreSource?: CoffreFort;
  coffreDestination?: CoffreFort;
}

interface TransfertInterCoffresModuleProps {
  onBack?: () => void;
  userRole?: string;
  userAgenceId?: string;
}

// API functions
const api = {
  async getCoffres(): Promise<CoffreFort[]> {
    const res = await fetch('/api/transferts-inter-coffres/coffres', { credentials: 'include' });
    const data = await res.json();
    return data.success ? data.data : [];
  },

  async getTransferts(params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`/api/transferts-inter-coffres/transferts${query}`, { credentials: 'include' });
    return res.json();
  },

  async getTransfertDetails(id: string): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}`, { credentials: 'include' });
    return res.json();
  },

  async getCoffresStats(): Promise<any> {
    const res = await fetch('/api/transferts-inter-coffres/stats/coffres', { credentials: 'include' });
    return res.json();
  },

  async createTransfert(data: any): Promise<any> {
    const res = await fetch('/api/transferts-inter-coffres/transferts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async submitTransfert(id: string): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}/submit`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  },

  async approveTransfert(id: string, level: 1 | 2, data: any): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}/approve?level=${level}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async dispatchTransfert(id: string, data?: any): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data || {}),
    });
    return res.json();
  },

  async receiveTransfert(id: string, data: any): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async cancelTransfert(id: string, reason: string): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },
};

export { api as transfertInterCoffresApi };

export default function TransfertInterCoffresModule({
  onBack,
  userRole = '',
  userAgenceId,
}: TransfertInterCoffresModuleProps) {
  // State
  const [transferts, setTransferts] = useState<TransfertInterCoffre[]>([]);
  const [coffres, setCoffres] = useState<CoffreFort[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statutFilter, setStatutFilter] = useState('all');
  const [dateDebutFilter, setDateDebutFilter] = useState('');
  const [dateFinFilter, setDateFinFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  // Modals
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showApproval, setShowApproval] = useState(false);
  const [showReception, setShowReception] = useState(false);
  const [selectedTransfert, setSelectedTransfert] = useState<TransfertInterCoffre | null>(null);
  const [selectedTransfertDetails, setSelectedTransfertDetails] = useState<any>(null);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'dispatch';
    transfert: TransfertInterCoffre;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coffresData, statsData] = await Promise.all([
        api.getCoffres(),
        api.getCoffresStats(),
      ]);
      setCoffres(coffresData);
      if (statsData.success) setStats(statsData.data);

      await loadTransferts();
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransferts = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      };

      if (statutFilter !== 'all') params.statut = statutFilter;
      if (searchQuery) params.search = searchQuery;
      if (dateDebutFilter) params.dateDebut = dateDebutFilter;
      if (dateFinFilter) params.dateFin = dateFinFilter;

      const result = await api.getTransferts(params);
      if (result.success) {
        setTransferts(result.transferts);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.total);
      }
    } catch (error) {
      console.error('Error loading transferts:', error);
    }
  }, [currentPage, statutFilter, searchQuery, dateDebutFilter, dateFinFilter]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadTransferts();
  }, [currentPage, statutFilter, searchQuery, dateDebutFilter, dateFinFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTransferts();
    setRefreshing(false);
  };

  // Actions
  const handleCreateSuccess = async (transfert: any) => {
    setShowCreateForm(false);
    toast.success('Transfert créé avec succès');
    await loadTransferts();
  };

  const handleViewDetails = async (transfert: TransfertInterCoffre) => {
    setSelectedTransfert(transfert);
    const result = await api.getTransfertDetails(transfert.id);
    if (result.success) {
      setSelectedTransfertDetails(result);
      setShowDetails(true);
    } else {
      toast.error('Erreur lors du chargement des détails');
    }
  };

  const handleApprove = (transfert: TransfertInterCoffre) => {
    setSelectedTransfert(transfert);
    setShowApproval(true);
  };

  const handleReceive = (transfert: TransfertInterCoffre) => {
    setSelectedTransfert(transfert);
    setShowReception(true);
  };

  const handleDispatch = (transfert: TransfertInterCoffre) => {
    setConfirmAction({ type: 'dispatch', transfert });
  };

  const handleCancel = (transfert: TransfertInterCoffre) => {
    setConfirmAction({ type: 'cancel', transfert });
    setCancelReason('');
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;

    const loadingId = toast.loading(
      confirmAction.type === 'dispatch' ? 'Dispatch en cours...' : 'Annulation en cours...'
    );

    try {
      let result;
      if (confirmAction.type === 'dispatch') {
        result = await api.dispatchTransfert(confirmAction.transfert.id);
      } else {
        if (cancelReason.length < 10) {
          toast.dismiss(loadingId);
          toast.error('Le motif d\'annulation doit contenir au moins 10 caractères');
          return;
        }
        result = await api.cancelTransfert(confirmAction.transfert.id, cancelReason);
      }

      toast.dismiss(loadingId);

      if (result.success) {
        toast.success(confirmAction.type === 'dispatch' ? 'Transfert dispatché' : 'Transfert annulé');
        await loadTransferts();
      } else {
        // Gérer les erreurs de conflit (déjà traité par un autre processus)
        if (result.errorCode === 'TIC_CONFLICT' || result.errorCode === 'TIC_024') {
          toast.info('Ce transfert a déjà été traité par un autre processus.');
          await loadTransferts(); // Rafraîchir pour voir le nouvel état
        } else {
          toast.error(result.error || 'Erreur lors de l\'opération');
        }
      }
    } catch (error: any) {
      toast.dismiss(loadingId);
      // Gérer HTTP 409 côté fetch
      if (error?.response?.status === 409 || error?.status === 409) {
        toast.info('Ce transfert a déjà été traité par un autre processus.');
        await loadTransferts();
      } else {
        toast.error('Erreur lors de l\'opération');
      }
    } finally {
      setConfirmAction(null);
      setCancelReason('');
    }
  };

  const handleApprovalComplete = async () => {
    setShowApproval(false);
    setSelectedTransfert(null);
    await loadTransferts();
  };

  const handleReceptionComplete = async () => {
    setShowReception(false);
    setSelectedTransfert(null);
    await loadTransferts();
  };

  // Computed stats
  const computedStats = useMemo(() => {
    const byStatut = transferts.reduce((acc, t) => {
      acc[t.statut] = (acc[t.statut] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: totalItems,
      enAttente: (byStatut['SUBMITTED'] || 0) + (byStatut['APPROVED_L1'] || 0),
      enTransit: byStatut['IN_TRANSIT'] || 0,
      recus: (byStatut['RECEIVED'] || 0) + (byStatut['RECEIVED_WITH_DISCREPANCY'] || 0),
      soldeTotalCoffres: stats?.soldeTotal || 0,
    };
  }, [transferts, totalItems, stats]);

  // Get status badge variant
  const getStatutBadge = (statut: string) => {
    const variants: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'> = {
      'DRAFT': 'neutral',
      'SUBMITTED': 'warning',
      'APPROVED_L1': 'info',
      'APPROVED_L2': 'primary',
      'IN_TRANSIT': 'warning',
      'RECEIVED': 'success',
      'RECEIVED_WITH_DISCREPANCY': 'danger',
      'REJECTED': 'danger',
      'CANCELLED': 'neutral',
    };
    return variants[statut] || 'neutral';
  };

  // Get available actions for a transfert
  const getAvailableActions = (transfert: TransfertInterCoffre) => {
    const actions: string[] = [];

    switch (transfert.statut) {
      case 'DRAFT':
        actions.push('submit', 'cancel');
        break;
      case 'SUBMITTED':
        actions.push('approve_l1', 'reject', 'cancel');
        break;
      case 'APPROVED_L1':
        actions.push('approve_l2', 'reject', 'cancel');
        break;
      case 'APPROVED_L2':
        actions.push('dispatch');
        break;
      case 'IN_TRANSIT':
        actions.push('receive');
        break;
    }

    return actions;
  };

  // Loading state
  const tableColumns = useMemo(() => [
    { 
      key: 'reference', 
      label: 'Référence',
      format: (val: string) => <span className="font-mono text-xs text-slate-400">{val}</span>
    },
    { 
      key: 'parcours', 
      label: 'Parcours',
      format: (_: any, row: TransfertInterCoffre) => (
        <div className="flex items-center gap-2">
          <span className="text-slate-400">
            {row.coffreSource?.agenceNom || 'Source'}
          </span>
          <ArrowRight size={12} className="text-slate-600" />
          <span className="text-white font-medium">
            {row.coffreDestination?.agenceNom || 'Dest'}
          </span>
        </div>
      )
    },
    { 
      key: 'montant', 
      label: 'Montant', 
      align: 'right' as const,
      format: (val: string) => <span className="font-bold text-white">{formatMoney(parseFloat(val))}</span>
    },
    { 
      key: 'typeTransfert', 
      label: 'Type', 
      align: 'center' as const,
      format: (val: string) => <span className="text-xs text-slate-400">{val.replace(/_/g, ' → ')}</span>
    },
    { 
      key: 'dateTransfert', 
      label: 'Date', 
      align: 'center' as const,
      format: (val: string) => <span className="text-slate-400">{new Date(val).toLocaleDateString('fr-FR')}</span>
    },
    { 
      key: 'statut', 
      label: 'Statut', 
      align: 'center' as const,
      format: (val: string) => <Badge value={val} variant={getStatutBadge(val)} />
    }
  ], []);

  // Use ResponsiveTable inside render instead of custom table


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="rounded-full hover:bg-slate-800 text-slate-400 h-10 w-10 p-0"
                  aria-label="Retour"
                >
                  <ArrowLeft size={20} />
                </Button>
              )}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  Transferts Inter-Coffres
                </h1>
                <p className="text-sm text-slate-400 hidden sm:block">
                  Gestion sécurisée des mouvements de fonds entre coffres-forts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="h-10 w-10 p-0 rounded-full text-slate-400 hover:bg-slate-800"
                aria-label="Actualiser"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              </Button>
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-500/20"
              >
                <Plus size={18} className="mr-2 hidden sm:inline" />
                <span className="hidden sm:inline">Nouveau Transfert</span>
                <Plus size={18} className="sm:hidden" />
              </Button>
            </div>
          </div>
        </header>

        {/* Stats Cards - Compact */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Statistiques">
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-slate-700/50">
                <Vault size={16} className="text-slate-300" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide leading-tight">Solde Coffres</span>
                <span className="text-sm font-bold text-white leading-tight">
                  {loading ? "..." : formatMoney(computedStats.soldeTotalCoffres)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-900/20 to-amber-950/20 border border-amber-700/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20">
                <Clock size={16} className="text-amber-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-amber-400/80 uppercase tracking-wide leading-tight">En Attente</span>
                <span className="text-sm font-bold text-amber-400 leading-tight">
                   {loading ? "..." : computedStats.enAttente}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-900/20 to-blue-950/20 border border-blue-700/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/20">
                <Truck size={16} className="text-blue-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-blue-400/80 uppercase tracking-wide leading-tight">En Transit</span>
                <span className="text-sm font-bold text-blue-400 leading-tight">
                   {loading ? "..." : computedStats.enTransit}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/20 to-emerald-950/20 border border-emerald-700/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20">
                <CheckCircle size={16} className="text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-400/80 uppercase tracking-wide leading-tight">Reçus</span>
                <span className="text-sm font-bold text-emerald-400 leading-tight">
                   {loading ? "..." : computedStats.recus}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher par référence..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none transition-all"
              />
            </div>

            {/* Statut Filter */}
            <select
              value={statutFilter}
              onChange={(e) => {
                setStatutFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none transition-all"
            >
              <option value="all">Tous les statuts</option>
              <option value="DRAFT">Brouillon</option>
              <option value="SUBMITTED">Soumis</option>
              <option value="APPROVED_L1">Approuvé N1</option>
              <option value="APPROVED_L2">Approuvé N2</option>
              <option value="IN_TRANSIT">En transit</option>
              <option value="RECEIVED">Reçu</option>
              <option value="RECEIVED_WITH_DISCREPANCY">Reçu avec écart</option>
              <option value="REJECTED">Rejeté</option>
              <option value="CANCELLED">Annulé</option>
            </select>

            {/* Date filters on desktop */}
            <div className="hidden lg:flex items-center gap-2">
              <input
                type="date"
                value={dateDebutFilter}
                onChange={(e) => {
                  setDateDebutFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500/30 outline-none"
              />
              <span className="text-slate-500 text-xs">→</span>
              <input
                type="date"
                value={dateFinFilter}
                onChange={(e) => {
                  setDateFinFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500/30 outline-none"
              />
            </div>
          </div>
        </section>

        {/* Transfers List - ResponsiveTable */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
             <ResponsiveTable
                data={transferts}
                columns={tableColumns}
                loading={loading && transferts.length === 0}
                emptyMessage="Aucun transfert trouvé"
                onRowClick={handleViewDetails}
                density="compact"
                pagination={{
                    page: currentPage,
                    totalPages: totalPages,
                    onPageChange: setCurrentPage
                }}
                actions={(transfert) => (
                    <div className="flex flex-row items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Bouton secondaire (Voir) - Ghost style */}
                          <Tooltip content="Voir les détails" position="top">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewDetails(transfert); }}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
                              aria-label="Voir les détails"
                            >
                              <Eye size={16} />
                            </button>
                          </Tooltip>

                          {/* Boutons principaux d'action - Production Ready */}
                          {getAvailableActions(transfert).includes('approve_l1') && (
                            <Tooltip content="Approuver au niveau 1" position="top">
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleApprove(transfert); }}
                                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm"
                              >
                                <CheckCircle size={12} fill="currentColor" className="mr-1" />
                                Valider N1
                              </Button>
                            </Tooltip>
                          )}
                          {getAvailableActions(transfert).includes('approve_l2') && (
                            <Tooltip content="Approuver au niveau 2" position="top">
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleApprove(transfert); }}
                                className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm"
                              >
                                <Shield size={12} fill="currentColor" className="mr-1" />
                                Valider N2
                              </Button>
                            </Tooltip>
                          )}
                          {getAvailableActions(transfert).includes('dispatch') && (
                            <Tooltip content="Expédier le transfert" position="top">
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleDispatch(transfert); }}
                                className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-sm"
                              >
                                <Truck size={12} fill="currentColor" className="mr-1" />
                                Expédier
                              </Button>
                            </Tooltip>
                          )}
                          {getAvailableActions(transfert).includes('receive') && (
                            <Tooltip content="Réceptionner le transfert" position="top">
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleReceive(transfert); }}
                                className="h-7 px-3 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-sm"
                              >
                                <Package size={12} fill="currentColor" className="mr-1" />
                                Recevoir
                              </Button>
                            </Tooltip>
                          )}
                    </div>
                )}
             />
        </section>

        {/* Create Form Modal */}
        {showCreateForm && (
          <TransfertInterCoffresForm
            coffres={coffres}
            onClose={() => setShowCreateForm(false)}
            onSuccess={handleCreateSuccess}
          />
        )}

        {/* Details Modal */}
        {showDetails && selectedTransfertDetails && (
          <TransfertInterCoffresDetail
            transfert={selectedTransfertDetails.transfert}
            documents={selectedTransfertDetails.documents}
            auditLogs={selectedTransfertDetails.auditLogs}
            reconciliation={selectedTransfertDetails.reconciliation}
            onClose={() => {
              setShowDetails(false);
              setSelectedTransfertDetails(null);
            }}
            onAction={async (action) => {
              setShowDetails(false);
              if (action === 'approve') handleApprove(selectedTransfertDetails.transfert);
              if (action === 'dispatch') handleDispatch(selectedTransfertDetails.transfert);
              if (action === 'receive') handleReceive(selectedTransfertDetails.transfert);
              if (action === 'cancel') handleCancel(selectedTransfertDetails.transfert);
            }}
          />
        )}

        {/* Approval Modal */}
        {showApproval && selectedTransfert && (
          <TransfertInterCoffresApproval
            transfert={selectedTransfert}
            onClose={() => {
              setShowApproval(false);
              setSelectedTransfert(null);
            }}
            onComplete={handleApprovalComplete}
          />
        )}

        {/* Reception Modal */}
        {showReception && selectedTransfert && (
          <TransfertInterCoffresReception
            transfert={selectedTransfert}
            onClose={() => {
              setShowReception(false);
              setSelectedTransfert(null);
            }}
            onComplete={handleReceptionComplete}
          />
        )}

        {/* Confirm Dialog */}
        <ConfirmDialog
          isOpen={!!confirmAction}
          title={confirmAction?.type === 'dispatch' ? 'Confirmer le dispatch' : 'Annuler le transfert'}
          message={
            confirmAction?.type === 'dispatch'
              ? `Confirmer le départ du transfert ${confirmAction?.transfert.reference} pour un montant de ${formatMoney(parseFloat(confirmAction?.transfert.montant || '0'))} ? Cette action est irréversible.`
              : confirmAction?.type === 'cancel'
              ? (
                <div className="space-y-4">
                  <p>Êtes-vous sûr de vouloir annuler le transfert {confirmAction?.transfert.reference} ?</p>
                  <div>
                    <label className="text-xs text-slate-400 uppercase block mb-2">Motif d'annulation *</label>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white"
                      rows={3}
                      placeholder="Minimum 10 caractères..."
                    />
                  </div>
                </div>
              )
              : ''
          }
          onConfirm={executeConfirmAction}
          onClose={() => {
            setConfirmAction(null);
            setCancelReason('');
          }}
          variant={confirmAction?.type === 'cancel' ? 'danger' : 'warning'}
          confirmText={confirmAction?.type === 'dispatch' ? 'Dispatcher' : 'Annuler le transfert'}
          cancelText="Retour"
        />
      </div>
    </div>
  );
}
