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
  Trash2,
  CheckSquare,
  Square,
  XCircle,
  Printer,
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
import { usePermissions } from '../../auth/ProtectedFeature';

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

  async getTransfertStats(): Promise<any> {
    const res = await fetch('/api/transferts-inter-coffres/stats/transferts', { credentials: 'include' });
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

  async deleteTransfert(id: string): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.json();
  },

  async bulkApprove(ids: string[], level: 1 | 2): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids, level }),
    });
    return res.json();
  },

  async bulkReject(ids: string[], reason: string): Promise<any> {
    const res = await fetch(`/api/transferts-inter-coffres/transferts/bulk-reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids, reason }),
    });
    return res.json();
  },

  async exportCsv(params?: Record<string, string>): Promise<void> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`/api/transferts-inter-coffres/transferts/export/csv${query}`, {
      credentials: 'include',
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transferts-coffres-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export { api as transfertInterCoffresApi };

export default function TransfertInterCoffresModule({
  onBack,
  userRole = '',
  userAgenceId,
}: TransfertInterCoffresModuleProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('coffres', 'manage') || hasPermission('transferts', 'manage') || hasPermission('admin', 'manage');

  // State
  const [transferts, setTransferts] = useState<TransfertInterCoffre[]>([]);
  const [coffres, setCoffres] = useState<CoffreFort[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [transfertStats, setTransfertStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statutFilter, setStatutFilter] = useState('all');
  const [dateDebutFilter, setDateDebutFilter] = useState('');
  const [dateFinFilter, setDateFinFilter] = useState('');
  const [montantMin, setMontantMin] = useState('');
  const [montantMax, setMontantMax] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);

  // Delete draft
  const [deleteTarget, setDeleteTarget] = useState<TransfertInterCoffre | null>(null);

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
      const [coffresData, statsData, tStatsData] = await Promise.all([
        api.getCoffres(),
        api.getCoffresStats(),
        api.getTransfertStats(),
      ]);
      setCoffres(coffresData);
      if (statsData.success) setStats(statsData.data);
      if (tStatsData.success) setTransfertStats(tStatsData.data);

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
      if (montantMin) params.montantMin = montantMin;
      if (montantMax) params.montantMax = montantMax;

      const [result, tStatsData] = await Promise.all([
        api.getTransferts(params),
        api.getTransfertStats(),
      ]);
      if (result.success) {
        setTransferts(result.transferts);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.total);
      }
      if (tStatsData.success) setTransfertStats(tStatsData.data);
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

  // Real-time WebSocket updates
  useEffect(() => {
    const handler = () => {
      loadTransferts();
    };
    window.addEventListener('transfert-coffre-update', handler);
    return () => window.removeEventListener('transfert-coffre-update', handler);
  }, [loadTransferts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTransferts();
    setRefreshing(false);
  };

  // Actions
  const handleCreateSuccess = async (transfert: any) => {
    setShowCreateForm(false);
    toast.success('Transfert créé');
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

  // Delete draft
  const handleDeleteDraft = async () => {
    if (!deleteTarget) return;
    const loadingId = toast.loading('Suppression en cours...');
    try {
      const result = await api.deleteTransfert(deleteTarget.id);
      toast.dismiss(loadingId);
      if (result.success) {
        toast.success('Brouillon supprimé');
        await loadTransferts();
      } else {
        toast.error(result.error || 'Erreur lors de la suppression');
      }
    } catch {
      toast.dismiss(loadingId);
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Bulk selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transferts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transferts.map(t => t.id)));
    }
  };

  const selectedTransferts = transferts.filter(t => selectedIds.has(t.id));

  // Check what bulk actions are possible
  const bulkCanApproveL1 = selectedTransferts.length > 0 && selectedTransferts.every(t => t.statut === 'SUBMITTED');
  const bulkCanApproveL2 = selectedTransferts.length > 0 && selectedTransferts.every(t => t.statut === 'APPROVED_L1');
  const bulkCanReject = selectedTransferts.length > 0 && selectedTransferts.every(t => ['SUBMITTED', 'APPROVED_L1'].includes(t.statut));

  const handleBulkApprove = async (level: 1 | 2) => {
    const loadingId = toast.loading(`Approbation groupée N${level}...`);
    try {
      const result = await api.bulkApprove(Array.from(selectedIds), level);
      toast.dismiss(loadingId);
      if (result.success) {
        toast.success(`${result.data.approved} transfert(s) approuvé(s)`);
        if (result.data.failed > 0) {
          toast.warning(`${result.data.failed} transfert(s) en erreur`);
        }
        setSelectedIds(new Set());
        await loadTransferts();
      } else {
        toast.error(result.error || 'Erreur lors de l\'approbation groupée');
      }
    } catch {
      toast.dismiss(loadingId);
      toast.error('Erreur lors de l\'approbation groupée');
    }
  };

  const handleBulkReject = async () => {
    if (bulkRejectReason.length < 10) {
      toast.error('Le motif doit contenir au moins 10 caractères');
      return;
    }
    const loadingId = toast.loading('Rejet groupé en cours...');
    try {
      const result = await api.bulkReject(Array.from(selectedIds), bulkRejectReason);
      toast.dismiss(loadingId);
      if (result.success) {
        toast.success(`${result.data.rejected} transfert(s) rejeté(s)`);
        setSelectedIds(new Set());
        setShowBulkRejectModal(false);
        setBulkRejectReason('');
        await loadTransferts();
      } else {
        toast.error(result.error || 'Erreur lors du rejet groupé');
      }
    } catch {
      toast.dismiss(loadingId);
      toast.error('Erreur lors du rejet groupé');
    }
  };

  const handleExportCsv = async () => {
    const loadingId = toast.loading('Export en cours...');
    try {
      const params: Record<string, string> = {};
      if (statutFilter !== 'all') params.statut = statutFilter;
      if (searchQuery) params.search = searchQuery;
      if (dateDebutFilter) params.dateDebut = dateDebutFilter;
      if (dateFinFilter) params.dateFin = dateFinFilter;
      if (montantMin) params.montantMin = montantMin;
      if (montantMax) params.montantMax = montantMax;
      await api.exportCsv(params);
      toast.dismiss(loadingId);
      toast.success('Export CSV téléchargé');
    } catch {
      toast.dismiss(loadingId);
      toast.error('Erreur lors de l\'export');
    }
  };

  // Computed stats
  const computedStats = useMemo(() => {
    const bs = transfertStats?.byStatus || {};
    const sumMontant = (...keys: string[]) => keys.reduce((s, k) => s + parseFloat(bs[k]?.montant || '0'), 0);
    const sumCount = (...keys: string[]) => keys.reduce((s, k) => s + (bs[k]?.count || 0), 0);

    return {
      total: transfertStats?.total || totalItems,
      enAttente: sumCount('SUBMITTED', 'APPROVED_L1'),
      enAttenteMontant: sumMontant('SUBMITTED', 'APPROVED_L1'),
      enTransit: sumCount('IN_TRANSIT'),
      enTransitMontant: sumMontant('IN_TRANSIT'),
      recus: sumCount('RECEIVED', 'RECEIVED_WITH_DISCREPANCY'),
      recusMontant: sumMontant('RECEIVED', 'RECEIVED_WITH_DISCREPANCY'),
      soldeTotalCoffres: stats?.soldeTotal || 0,
    };
  }, [transfertStats, totalItems, stats]);

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
        actions.push('submit', 'delete', 'cancel');
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
      key: 'select',
      label: (
        <button onClick={(e) => { e.stopPropagation(); toggleSelectAll(); }} className="p-0.5">
          {selectedIds.size === transferts.length && transferts.length > 0 ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} className="text-content-muted" />}
        </button>
      ) as any,
      format: (_: any, row: TransfertInterCoffre) => (
        <button onClick={(e) => { e.stopPropagation(); toggleSelect(row.id); }} className="p-0.5">
          {selectedIds.has(row.id) ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} className="text-content-muted" />}
        </button>
      ),
    },
    {
      key: 'reference',
      label: 'Référence',
      format: (val: string) => <span className="font-mono text-xs text-content-muted">{val}</span>
    },
    { 
      key: 'parcours', 
      label: 'Parcours',
      format: (_: any, row: TransfertInterCoffre) => (
        <div className="flex items-center gap-2">
          <span className="text-content-muted">
            {row.coffreSource?.agenceNom || 'Source'}
          </span>
          <ArrowRight size={12} className="text-content-muted" />
          <span className="text-content-primary font-medium">
            {row.coffreDestination?.agenceNom || 'Dest'}
          </span>
        </div>
      )
    },
    { 
      key: 'montant', 
      label: 'Montant', 
      align: 'right' as const,
      format: (val: string) => <span className="font-bold text-content-primary">{formatMoney(parseFloat(val))}</span>
    },
    { 
      key: 'typeTransfert', 
      label: 'Type', 
      align: 'center' as const,
      format: (val: string) => <span className="text-xs text-content-muted">{val.replace(/_/g, ' → ')}</span>
    },
    { 
      key: 'dateTransfert', 
      label: 'Date', 
      align: 'center' as const,
      format: (val: string) => <span className="text-content-muted">{new Date(val).toLocaleDateString('fr-FR')}</span>
    },
    { 
      key: 'statut', 
      label: 'Statut', 
      align: 'center' as const,
      format: (val: string) => <Badge value={val} variant={getStatutBadge(val)} />
    }
  ], [selectedIds, transferts]);

  // Use ResponsiveTable inside render instead of custom table


  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-base via-surface-base to-surface-base">
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
                  className="rounded-full hover:bg-surface text-content-muted h-10 w-10 p-0"
                  aria-label="Retour"
                >
                  <ArrowLeft size={20} />
                </Button>
              )}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-content-primary">
                  Transferts Inter-Coffres
                </h1>
                <p className="text-sm text-content-muted hidden sm:block">
                  Gestion sécurisée des mouvements de fonds entre coffres-forts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip content="Exporter CSV" position="bottom">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-10 w-10 p-0 rounded-full text-content-muted hover:bg-surface"
                  aria-label="Exporter CSV"
                >
                  <Download size={18} />
                </Button>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="h-10 w-10 p-0 rounded-full text-content-muted hover:bg-surface"
                aria-label="Actualiser"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              </Button>
              {canManage && (
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-gradient-to-r from-status-success to-accent hover:from-status-success/90 hover:to-accent/90 text-white shadow-lg shadow-status-success/20"
              >
                <Plus size={18} className="mr-2 hidden sm:inline" />
                <span className="hidden sm:inline">Nouveau Transfert</span>
                <Plus size={18} className="sm:hidden" />
              </Button>
              )}
            </div>
          </div>
        </header>

        {/* Stats Cards - Compact */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Statistiques">
          <div className="bg-gradient-to-br from-surface/50 to-surface-base/50 border border-edge-subtle rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-surface-elevated/50">
                <Vault size={16} className="text-content-secondary" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-content-muted uppercase tracking-wide leading-tight">Solde Coffres</span>
                <span className="text-sm font-bold text-content-primary leading-tight">
                  {loading ? "..." : formatMoney(computedStats.soldeTotalCoffres)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-status-warning/10 to-status-warning/10 border border-status-warning/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-status-warning-bg">
                <Clock size={16} className="text-status-warning" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-status-warning/80 uppercase tracking-wide leading-tight">En Attente</span>
                <span className="text-sm font-bold text-status-warning leading-tight">
                   {loading ? "..." : formatMoney(computedStats.enAttenteMontant)}
                </span>
                <span className="text-[9px] text-status-warning/50 leading-tight">{computedStats.enAttente} transfert{computedStats.enAttente !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-status-info/10 to-status-info/10 border border-status-info/30/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-status-info-bg">
                <Truck size={16} className="text-status-info" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-status-info/80 uppercase tracking-wide leading-tight">En Transit</span>
                <span className="text-sm font-bold text-status-info leading-tight">
                   {loading ? "..." : formatMoney(computedStats.enTransitMontant)}
                </span>
                <span className="text-[9px] text-status-info/50 leading-tight">{computedStats.enTransit} transfert{computedStats.enTransit !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-status-success/10 to-status-success/10 border border-status-success/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-status-success-bg">
                <CheckCircle size={16} className="text-status-success" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-status-success/80 uppercase tracking-wide leading-tight">Reçus</span>
                <span className="text-sm font-bold text-status-success leading-tight">
                   {loading ? "..." : formatMoney(computedStats.recusMontant)}
                </span>
                <span className="text-[9px] text-status-success/50 leading-tight">{computedStats.recus} transfert{computedStats.recus !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="bg-surface-base/50 border border-edge rounded-lg p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Rechercher par référence..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
              />
            </div>

            {/* Statut Filter */}
            <select
              value={statutFilter}
              onChange={(e) => {
                setStatutFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
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
                className="px-2 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:ring-2 focus:ring-accent/30 outline-none"
              />
              <span className="text-content-muted text-xs">→</span>
              <input
                type="date"
                value={dateFinFilter}
                onChange={(e) => {
                  setDateFinFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:ring-2 focus:ring-accent/30 outline-none"
              />
            </div>

            {/* Amount range filter */}
            <div className="hidden lg:flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={montantMin}
                onChange={(e) => {
                  setMontantMin(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-24 px-2 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:ring-2 focus:ring-accent/30 outline-none"
              />
              <span className="text-content-muted text-xs">→</span>
              <input
                type="number"
                placeholder="Max"
                value={montantMax}
                onChange={(e) => {
                  setMontantMax(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-24 px-2 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:ring-2 focus:ring-accent/30 outline-none"
              />
            </div>
          </div>
        </section>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && canManage && (
          <section className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-accent font-medium">
              {selectedIds.size} transfert{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {bulkCanApproveL1 && (
                <Button size="sm" onClick={() => handleBulkApprove(1)} className="h-7 px-3 text-xs bg-status-success text-white">
                  <CheckCircle size={12} className="mr-1" /> Approuver N1
                </Button>
              )}
              {bulkCanApproveL2 && (
                <Button size="sm" onClick={() => handleBulkApprove(2)} className="h-7 px-3 text-xs bg-status-info text-white">
                  <Shield size={12} className="mr-1" /> Approuver N2
                </Button>
              )}
              {bulkCanReject && (
                <Button size="sm" onClick={() => setShowBulkRejectModal(true)} className="h-7 px-3 text-xs bg-status-danger text-white">
                  <XCircle size={12} className="mr-1" /> Rejeter
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-7 px-3 text-xs text-content-muted">
                Désélectionner
              </Button>
            </div>
          </section>
        )}

        {/* Transfers List - ResponsiveTable */}
        <section className="bg-surface-base/50 border border-edge rounded-lg overflow-hidden">
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
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-content-muted hover:text-content-secondary hover:bg-surface-elevated/50 transition-colors"
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
                                className="h-7 px-3 text-xs bg-status-success hover:bg-status-success text-white font-semibold shadow-sm"
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
                                className="h-7 px-3 text-xs bg-status-info hover:bg-status-info text-white font-semibold shadow-sm"
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
                                className="h-7 px-3 text-xs bg-status-warning hover:bg-status-warning text-white font-semibold shadow-sm"
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
                                className="h-7 px-3 text-xs bg-accent-secondary hover:bg-accent-secondary text-content-primary font-semibold shadow-sm"
                              >
                                <Package size={12} fill="currentColor" className="mr-1" />
                                Recevoir
                              </Button>
                            </Tooltip>
                          )}

                          {/* Submit draft */}
                          {getAvailableActions(transfert).includes('submit') && (
                            <Tooltip content="Soumettre le brouillon" position="top">
                              <Button
                                size="sm"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const loadingId = toast.loading('Soumission...');
                                  try {
                                    const result = await api.submitTransfert(transfert.id);
                                    toast.dismiss(loadingId);
                                    if (result.success) { toast.success('Transfert soumis'); await loadTransferts(); }
                                    else toast.error(result.error || 'Erreur');
                                  } catch { toast.dismiss(loadingId); toast.error('Erreur'); }
                                }}
                                className="h-7 px-3 text-xs bg-accent hover:bg-accent text-white font-semibold shadow-sm"
                              >
                                <Send size={12} className="mr-1" />
                                Soumettre
                              </Button>
                            </Tooltip>
                          )}

                          {/* Delete draft */}
                          {getAvailableActions(transfert).includes('delete') && (
                            <Tooltip content="Supprimer le brouillon" position="top">
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(transfert); }}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-status-danger hover:bg-status-danger-bg transition-colors"
                                aria-label="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </Tooltip>
                          )}

                          {/* Cancel */}
                          {getAvailableActions(transfert).includes('cancel') && transfert.statut !== 'DRAFT' && (
                            <Tooltip content="Annuler le transfert" position="top">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCancel(transfert); }}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-content-muted hover:text-status-danger hover:bg-status-danger-bg transition-colors"
                                aria-label="Annuler"
                              >
                                <X size={14} />
                              </button>
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

        {/* Delete Draft Confirm */}
        <ConfirmDialog
          isOpen={!!deleteTarget}
          title="Supprimer le brouillon"
          message={`Supprimer définitivement le brouillon ${deleteTarget?.reference} ? Cette action est irréversible.`}
          onConfirm={handleDeleteDraft}
          onClose={() => setDeleteTarget(null)}
          variant="danger"
          confirmText="Supprimer"
          cancelText="Annuler"
        />

        {/* Bulk Reject Modal */}
        {showBulkRejectModal && (
          <Modal onClose={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }} title="Rejet groupé">
            <div className="space-y-4 p-4">
              <p className="text-sm text-content-secondary">
                Rejeter {selectedIds.size} transfert{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}.
              </p>
              <div>
                <label className="text-xs text-content-muted uppercase block mb-2">Motif de rejet *</label>
                <textarea
                  value={bulkRejectReason}
                  onChange={(e) => setBulkRejectReason(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary"
                  rows={3}
                  placeholder="Minimum 10 caractères..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }}>
                  Annuler
                </Button>
                <Button onClick={handleBulkReject} className="bg-status-danger text-white">
                  <XCircle size={14} className="mr-1" /> Rejeter
                </Button>
              </div>
            </div>
          </Modal>
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
                    <label className="text-xs text-content-muted uppercase block mb-2">Motif d'annulation *</label>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary"
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
