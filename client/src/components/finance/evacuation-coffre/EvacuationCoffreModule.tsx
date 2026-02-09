import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowUpRight,
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
  Shield,
  Truck,
  Package,
  Calendar,
  User,
  Building2,
  RefreshCw,
  Eye,
  Ban,
  Banknote,
  Scale,
  Lock,
} from 'lucide-react';
import { Button, Card, Badge, Pagination, Modal, StatCard, ResponsiveTable } from '@/components/ui';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { StatutEvacuationCoffre, TypeDestinationEvacuation, MotifEvacuation, MOTIF_EVACUATION_LABELS } from '@shared/enum/status-constants';
import CreateEvacuationDialog from './CreateEvacuationDialog';
import EvacuationDetail from './EvacuationDetail';

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

interface EvacuationCoffre {
  id: string;
  reference: string;
  coffreSourceId: string;
  agenceId: string;
  typeDestination: string;
  banqueNom?: string;
  banqueCompte?: string;
  coffreDestinationId?: string;
  transporteurNom?: string;
  montant: string;
  devise: string;
  motifEvacuation: string;
  motifDetail?: string;
  statut: string;
  createdAt: string;
  createdBy: string;
  coffreSource?: CoffreFort;
  coffreDestination?: CoffreFort;
  createdByName?: string;
}

interface EvacuationCoffreModuleProps {
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

  async getEvacuations(params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`/api/evacuations-coffre${query}`, { credentials: 'include' });
    return res.json();
  },

  async getEvacuationDetails(id: string): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}`, { credentials: 'include' });
    return res.json();
  },

  async getStats(): Promise<any> {
    const res = await fetch('/api/evacuations-coffre/stats', { credentials: 'include' });
    return res.json();
  },

  async createEvacuation(data: any): Promise<any> {
    const res = await fetch('/api/evacuations-coffre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async submitEvacuation(id: string): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/submit`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  },

  async approveEvacuation(id: string, commentaire?: string): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ commentaire }),
    });
    return res.json();
  },

  async rejectEvacuation(id: string, reason: string): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ motifRejet: reason }),
    });
    return res.json();
  },

  async prepareEvacuation(id: string, data: any): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async dispatchEvacuation(id: string, data: any): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async depositEvacuation(id: string, data: any): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async reconcileEvacuation(id: string, data: any): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async cancelEvacuation(id: string, reason: string): Promise<any> {
    const res = await fetch(`/api/evacuations-coffre/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ motifAnnulation: reason }),
    });
    return res.json();
  },
};

export { api as evacuationCoffreApi };

// Status badge config
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  [StatutEvacuationCoffre.DRAFT]: { label: 'Brouillon', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: FileText },
  [StatutEvacuationCoffre.SUBMITTED]: { label: 'Soumise', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Send },
  [StatutEvacuationCoffre.APPROVED]: { label: 'Approuvée', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  [StatutEvacuationCoffre.PREPARED]: { label: 'Préparée', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', icon: Package },
  [StatutEvacuationCoffre.IN_TRANSIT]: { label: 'En transit', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Truck },
  [StatutEvacuationCoffre.DEPOSITED]: { label: 'Déposée', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', icon: Banknote },
  [StatutEvacuationCoffre.RECONCILED]: { label: 'Réconciliée', color: 'bg-green-500/15 text-green-400 border-green-500/30', icon: CheckCircle },
  [StatutEvacuationCoffre.DISCREPANCY]: { label: 'Écart', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: AlertTriangle },
  [StatutEvacuationCoffre.REJECTED]: { label: 'Rejetée', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: Ban },
  [StatutEvacuationCoffre.CANCELLED]: { label: 'Annulée', color: 'bg-slate-500/15 text-slate-500 border-slate-500/30', icon: X },
};

const DESTINATION_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  [TypeDestinationEvacuation.BANQUE]: { label: 'Banque', icon: Building2 },
  [TypeDestinationEvacuation.COFFRE_CENTRAL]: { label: 'Coffre Central', icon: Vault },
  [TypeDestinationEvacuation.TRANSPORTEUR]: { label: 'Transporteur', icon: Truck },
};

function StatusBadge({ statut }: { statut: string }) {
  const config = STATUS_CONFIG[statut] || { label: statut, color: 'bg-slate-500/15 text-slate-400', icon: Clock };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.color}`}>
      <Icon size={10} />
      {config.label}
    </span>
  );
}

function DestinationBadge({ type }: { type: string }) {
  const config = DESTINATION_LABELS[type] || { label: type, icon: Building2 };
  const Icon = config.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <Icon size={11} />
      {config.label}
    </span>
  );
}

export default function EvacuationCoffreModule({
  onBack,
  userRole = '',
  userAgenceId,
}: EvacuationCoffreModuleProps) {
  // State
  const [evacuations, setEvacuations] = useState<EvacuationCoffre[]>([]);
  const [coffres, setCoffres] = useState<CoffreFort[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statutFilter, setStatutFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  // Modals
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedEvacuation, setSelectedEvacuation] = useState<EvacuationCoffre | null>(null);
  const [selectedEvacuationDetails, setSelectedEvacuationDetails] = useState<any>(null);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'submit' | 'approve' | 'reject';
    evacuation: EvacuationCoffre;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // Load data
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      else setRefreshing(true);

      const params: Record<string, string> = {
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      };
      if (statutFilter !== 'all') params.statut = statutFilter;
      if (destinationFilter !== 'all') params.typeDestination = destinationFilter;
      if (searchQuery) params.search = searchQuery;

      const [evacuationsRes, coffresData, statsRes] = await Promise.all([
        api.getEvacuations(params),
        api.getCoffres(),
        api.getStats(),
      ]);

      if (evacuationsRes.success) {
        setEvacuations(evacuationsRes.data || []);
        setTotalPages(evacuationsRes.pagination?.totalPages || 1);
        setTotalItems(evacuationsRes.pagination?.total || 0);
      }

      setCoffres(coffresData);

      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, statutFilter, destinationFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats computation
  const totalCount = stats?.total || totalItems;
  const totalMontant = stats?.totalMontant || '0';
  const pendingCount = stats?.byStatus?.SUBMITTED?.count || 0;
  const pendingMontant = stats?.byStatus?.SUBMITTED?.montant || '0';
  const inTransitCount = stats?.byStatus?.IN_TRANSIT?.count || 0;
  const inTransitMontant = stats?.byStatus?.IN_TRANSIT?.montant || '0';
  const reconciledCount = stats?.byStatus?.RECONCILED?.count || 0;
  const reconciledMontant = stats?.byStatus?.RECONCILED?.montant || '0';

  // Open detail
  const handleViewDetails = async (evacuation: EvacuationCoffre) => {
    try {
      const res = await api.getEvacuationDetails(evacuation.id);
      if (res.success) {
        setSelectedEvacuationDetails(res.data);
        setShowDetails(true);
      } else {
        toast.error(res.error || 'Erreur lors du chargement des détails');
      }
    } catch (error) {
      handleApiError(error);
    }
  };

  // Workflow actions
  const handleSubmit = async (evacuation: EvacuationCoffre) => {
    try {
      const res = await api.submitEvacuation(evacuation.id);
      if (res.success) {
        toast.success('Évacuation soumise pour approbation');
        loadData(true);
      } else {
        toast.error(res.error || 'Erreur lors de la soumission');
      }
    } catch (error) {
      handleApiError(error);
    }
  };

  const handleApprove = async (evacuation: EvacuationCoffre) => {
    try {
      const res = await api.approveEvacuation(evacuation.id);
      if (res.success) {
        toast.success('Évacuation approuvée');
        loadData(true);
      } else {
        toast.error(res.error || 'Erreur lors de l\'approbation');
      }
    } catch (error) {
      handleApiError(error);
    }
  };

  const handleReject = async (evacuation: EvacuationCoffre, reason: string) => {
    try {
      const res = await api.rejectEvacuation(evacuation.id, reason);
      if (res.success) {
        toast.success('Évacuation rejetée');
        loadData(true);
      } else {
        toast.error(res.error || 'Erreur lors du rejet');
      }
    } catch (error) {
      handleApiError(error);
    }
  };

  const handleCancel = async (evacuation: EvacuationCoffre, reason: string) => {
    try {
      const res = await api.cancelEvacuation(evacuation.id, reason);
      if (res.success) {
        toast.success('Évacuation annulée');
        loadData(true);
      } else {
        toast.error(res.error || 'Erreur lors de l\'annulation');
      }
    } catch (error) {
      handleApiError(error);
    }
  };

  // Create success
  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    loadData(true);
    toast.success('Évacuation créée avec succès');
  };

  // Detail action callback — reload list after any workflow action from detail view
  const handleDetailAction = () => {
    loadData(true);
    // Refresh detail if still open
    if (selectedEvacuationDetails) {
      api.getEvacuationDetails(selectedEvacuationDetails.id).then(res => {
        if (res.success) setSelectedEvacuationDetails(res.data);
      });
    }
  };

  // Confirm dialog execution
  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, evacuation } = confirmAction;

    switch (type) {
      case 'submit':
        await handleSubmit(evacuation);
        break;
      case 'approve':
        await handleApprove(evacuation);
        break;
      case 'reject':
        await handleReject(evacuation, rejectReason);
        break;
      case 'cancel':
        await handleCancel(evacuation, cancelReason);
        break;
    }
    setConfirmAction(null);
    setCancelReason('');
    setRejectReason('');
  };

  // Destination label helper
  const getDestinationInfo = (e: EvacuationCoffre) => {
    switch (e.typeDestination) {
      case TypeDestinationEvacuation.BANQUE:
        return e.banqueNom || 'Banque';
      case TypeDestinationEvacuation.COFFRE_CENTRAL:
        return e.coffreDestination?.nom || 'Coffre Central';
      case TypeDestinationEvacuation.TRANSPORTEUR:
        return e.transporteurNom || 'Transporteur';
      default:
        return e.typeDestination;
    }
  };

  // Row actions per status
  const getRowActions = (e: EvacuationCoffre) => {
    const actions: React.ReactNode[] = [];

    actions.push(
      <button
        key="view"
        onClick={() => handleViewDetails(e)}
        className="p-1 text-slate-400 hover:text-blue-400 transition"
        title="Voir détails"
      >
        <Eye size={14} />
      </button>
    );

    if (e.statut === StatutEvacuationCoffre.DRAFT) {
      actions.push(
        <button
          key="submit"
          onClick={() => setConfirmAction({ type: 'submit', evacuation: e })}
          className="p-1 text-slate-400 hover:text-blue-400 transition"
          title="Soumettre"
        >
          <Send size={14} />
        </button>
      );
      actions.push(
        <button
          key="cancel"
          onClick={() => setConfirmAction({ type: 'cancel', evacuation: e })}
          className="p-1 text-slate-400 hover:text-red-400 transition"
          title="Annuler"
        >
          <Ban size={14} />
        </button>
      );
    }

    if (e.statut === StatutEvacuationCoffre.SUBMITTED) {
      actions.push(
        <button
          key="approve"
          onClick={() => setConfirmAction({ type: 'approve', evacuation: e })}
          className="p-1 text-slate-400 hover:text-emerald-400 transition"
          title="Approuver"
        >
          <CheckCircle size={14} />
        </button>
      );
      actions.push(
        <button
          key="reject"
          onClick={() => setConfirmAction({ type: 'reject', evacuation: e })}
          className="p-1 text-slate-400 hover:text-red-400 transition"
          title="Rejeter"
        >
          <Ban size={14} />
        </button>
      );
    }

    return <div className="flex items-center gap-0.5">{actions}</div>;
  };

  if (loading) {
    return (
      <div className="space-y-3 p-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total</div>
          <div className="text-sm font-bold text-white">{formatMoney(totalMontant)}</div>
          <div className="text-[10px] text-slate-500">{totalCount} évacuation{totalCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-slate-800/40 border border-amber-500/20 rounded-lg p-2.5">
          <div className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-1">En attente</div>
          <div className="text-sm font-bold text-amber-400">{formatMoney(pendingMontant)}</div>
          <div className="text-[10px] text-slate-500">{pendingCount} évacuation{pendingCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-slate-800/40 border border-blue-500/20 rounded-lg p-2.5">
          <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-1">En transit</div>
          <div className="text-sm font-bold text-blue-400">{formatMoney(inTransitMontant)}</div>
          <div className="text-[10px] text-slate-500">{inTransitCount} évacuation{inTransitCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-slate-800/40 border border-green-500/20 rounded-lg p-2.5">
          <div className="text-[9px] font-bold text-green-500 uppercase tracking-widest mb-1">Réconciliées</div>
          <div className="text-sm font-bold text-green-400">{formatMoney(reconciledMontant)}</div>
          <div className="text-[10px] text-slate-500">{reconciledCount} évacuation{reconciledCount !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Rechercher par référence..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <select
          value={statutFilter}
          onChange={(e) => { setStatutFilter(e.target.value); setCurrentPage(1); }}
          className="px-2.5 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500/50"
        >
          <option value="all">Tous statuts</option>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>

        <select
          value={destinationFilter}
          onChange={(e) => { setDestinationFilter(e.target.value); setCurrentPage(1); }}
          className="px-2.5 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500/50"
        >
          <option value="all">Toutes destinations</option>
          {Object.entries(DESTINATION_LABELS).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="p-1.5 text-slate-400 hover:text-white transition disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>

        <Button
          size="sm"
          onClick={() => setShowCreateForm(true)}
          className="ml-auto"
        >
          <Plus size={13} className="mr-1" />
          Nouvelle évacuation
        </Button>
      </div>

      {/* List */}
      {evacuations.length === 0 ? (
        <div className="text-center py-12">
          <Vault size={32} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-500">Aucune évacuation trouvée</p>
          <p className="text-xs text-slate-600 mt-1">Créez une nouvelle évacuation pour commencer</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {evacuations.map((evacuation) => (
            <div
              key={evacuation.id}
              className="bg-slate-800/30 border border-slate-700/40 rounded-lg p-2.5 hover:border-slate-600/50 transition cursor-pointer"
              onClick={() => handleViewDetails(evacuation)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0">
                    <StatusBadge statut={evacuation.statut} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">{evacuation.reference}</span>
                      <DestinationBadge type={evacuation.typeDestination} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      <span>{evacuation.coffreSource?.nom || 'Coffre'}</span>
                      <ArrowUpRight size={10} />
                      <span>{getDestinationInfo(evacuation)}</span>
                      <span>•</span>
                      <span>{new Date(evacuation.createdAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-white tabular-nums">
                    {formatMoney(evacuation.montant)}
                  </span>
                  <div onClick={(e) => e.stopPropagation()}>
                    {getRowActions(evacuation)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center pt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Create Dialog */}
      {showCreateForm && (
        <CreateEvacuationDialog
          coffres={coffres}
          onClose={() => setShowCreateForm(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Detail Dialog */}
      {showDetails && selectedEvacuationDetails && (
        <EvacuationDetail
          evacuation={selectedEvacuationDetails}
          onClose={() => { setShowDetails(false); setSelectedEvacuationDetails(null); }}
          onAction={handleDetailAction}
          api={api}
        />
      )}

      {/* Confirm Dialogs */}
      {confirmAction?.type === 'submit' && (
        <ConfirmDialog
          open
          title="Soumettre l'évacuation"
          message={`Soumettre l'évacuation ${confirmAction.evacuation.reference} (${formatMoney(confirmAction.evacuation.montant)}) pour approbation ?`}
          confirmLabel="Soumettre"
          onConfirm={executeConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction?.type === 'approve' && (
        <ConfirmDialog
          open
          title="Approuver l'évacuation"
          message={`Approuver l'évacuation ${confirmAction.evacuation.reference} de ${formatMoney(confirmAction.evacuation.montant)} ?`}
          confirmLabel="Approuver"
          onConfirm={executeConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction?.type === 'reject' && (
        <ConfirmDialog
          open
          title="Rejeter l'évacuation"
          message={
            <div className="space-y-2">
              <p>Rejeter l'évacuation {confirmAction.evacuation.reference} ?</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motif du rejet (obligatoire)..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50"
                rows={3}
              />
            </div>
          }
          confirmLabel="Rejeter"
          confirmVariant="danger"
          onConfirm={() => { if (rejectReason.trim().length < 5) { toast.error('Motif trop court (min 5 caractères)'); return; } executeConfirmAction(); }}
          onCancel={() => { setConfirmAction(null); setRejectReason(''); }}
        />
      )}

      {confirmAction?.type === 'cancel' && (
        <ConfirmDialog
          open
          title="Annuler l'évacuation"
          message={
            <div className="space-y-2">
              <p>Annuler l'évacuation {confirmAction.evacuation.reference} ?</p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Motif d'annulation (obligatoire)..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50"
                rows={3}
              />
            </div>
          }
          confirmLabel="Annuler l'évacuation"
          confirmVariant="danger"
          onConfirm={() => { if (cancelReason.trim().length < 5) { toast.error('Motif trop court (min 5 caractères)'); return; } executeConfirmAction(); }}
          onCancel={() => { setConfirmAction(null); setCancelReason(''); }}
        />
      )}
    </div>
  );
}
