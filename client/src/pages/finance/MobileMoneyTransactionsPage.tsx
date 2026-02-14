import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, RefreshCw, Filter, ChevronDown, Phone, CheckCircle2,
  XCircle, Clock, AlertTriangle, Eye, RotateCcw, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import { PaymentDetailModal, type PaymentDetailData, ProviderBalanceWidget } from '@/components/finance/payments';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

// Safe date format helper
const safeDateFormat = (dateValue: string | Date | null | undefined, formatStr: string): string => {
  if (!dateValue) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '-';
    return format(date, formatStr, { locale: fr });
  } catch {
    return '-';
  }
};

// Provider logos
const ProviderLogo = ({ provider, size = 'sm' }: { provider: string; size?: 'sm' | 'md' }) => {
  const sizeClass = size === 'sm' ? 'h-5 w-5' : 'h-8 w-8';
  if (provider === 'MTN') {
    return <img src={mtnLogo} alt="MTN" className={sizeClass} />;
  }
  return <img src={airtelLogo} alt="Airtel" className={sizeClass} />;
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    CREATED: { bg: 'bg-surface-subtle/40', text: 'text-content-muted', icon: Clock },
    PENDING: { bg: 'bg-accent/10', text: 'text-accent', icon: Clock },
    SUCCESS: { bg: 'bg-status-success-bg', text: 'text-status-success', icon: CheckCircle2 },
    FAILED: { bg: 'bg-status-danger-bg', text: 'text-status-danger', icon: XCircle },
    EXPIRED: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: Clock },
    REVERSED: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: AlertTriangle },
    CANCELLED: { bg: 'bg-surface-subtle/40', text: 'text-content-muted', icon: XCircle },
  };

  const { bg, text, icon: Icon } = config[status] || config.PENDING;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}>
      <Icon size={12} />
      {ALL_STATUS_LABELS[status] || status}
    </span>
  );
};

interface PaymentIntent {
  id: string;
  provider: 'MTN' | 'AIRTEL';
  type: 'COLLECTION' | 'PAYOUT';
  status: string;
  amount: string;
  phone: string;
  externalRef: string;
  providerRef?: string;
  providerTxnId?: string;
  errorCode?: string;
  errorMessage?: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  tontineId?: string;
  agenceId?: string;
  // Cofinco client fees
  feeOption?: string | null;
  clientFeeAmount?: string | null;
  clientFeeRate?: string | null;
  montantBrut?: string | null;
  montantNet?: string | null;
  createdAt: string;
  initiatedAt?: string;
  confirmedAt?: string;
  client?: {
    id: string;
    nom: string;
    prenom?: string;
    phone?: string;
  };
  agence?: {
    id: string;
    nom: string;
  };
}

interface PaymentsResponse {
  payments: PaymentIntent[];
  total: number;
  page: number;
  limit: number;
}

export default function MobileMoneyTransactionsPage() {
  const queryClient = useQueryClient();

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterProvider, setFilterProvider] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Detail modal
  const [selectedPayment, setSelectedPayment] = useState<PaymentDetailData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Manual reconciliation
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Build query params
  const queryParams = new URLSearchParams();
  if (filterStatus) queryParams.set('status', filterStatus);
  if (filterProvider) queryParams.set('provider', filterProvider);
  if (filterType) queryParams.set('type', filterType);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  // Fetch payments
  const { data, isLoading, refetch, isFetching } = useQuery<PaymentsResponse>({
    queryKey: ['mobile-money-transactions', filterStatus, filterProvider, filterType, page],
    queryFn: async () => {
      const res = await fetch(`/api/payments?${queryParams.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch payments');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const payments = data?.payments || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Filter by search term (client-side)
  const filteredPayments = payments.filter((p) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      p.phone?.toLowerCase().includes(search) ||
      p.externalRef?.toLowerCase().includes(search) ||
      p.providerTxnId?.toLowerCase().includes(search) ||
      p.client?.nom?.toLowerCase().includes(search) ||
      p.client?.prenom?.toLowerCase().includes(search)
    );
  });

  // View payment details
  const handleViewDetails = (payment: PaymentIntent) => {
    const detailData: PaymentDetailData = {
      id: payment.id,
      externalRef: payment.externalRef,
      provider: payment.provider,
      type: payment.type,
      status: payment.status,
      amount: payment.amount,
      phone: payment.phone,
      providerRef: payment.providerRef,
      providerTxnId: payment.providerTxnId,
      errorCode: payment.errorCode,
      errorMessage: payment.errorMessage,
      createdAt: payment.createdAt,
      initiatedAt: payment.initiatedAt,
      confirmedAt: payment.confirmedAt,
      client: payment.client,
      agence: payment.agence,
      feeOption: payment.feeOption,
      clientFeeAmount: payment.clientFeeAmount,
      clientFeeRate: payment.clientFeeRate,
      montantBrut: payment.montantBrut,
      montantNet: payment.montantNet,
    };
    setSelectedPayment(detailData);
    setShowDetailModal(true);
  };

  // Manual reconciliation
  const handleManualReconcile = async (decision: 'SUCCESS' | 'FAILED') => {
    if (!selectedPayment) return;

    setReconcilingId(selectedPayment.id);
    try {
      const res = await fetch(`/api/payments/${selectedPayment.id}/manual-reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          decision,
          notes: `Reconciliation manuelle: ${decision}`,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || error.error || 'Erreur');
      }

      toast.success(`Paiement marqué comme ${decision}`);
      setShowDetailModal(false);
      setSelectedPayment(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la réconciliation');
    } finally {
      setReconcilingId(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Transactions Mobile Money</h1>
          <p className="text-sm text-content-muted mt-1">
            Suivi des paiements MTN et Airtel Money
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface hover:bg-surface-elevated text-content-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface-base/50 border border-edge rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher (téléphone, référence, client...)"
                className="w-full h-10 pl-9 pr-4 rounded-lg bg-input-bg border border-input-border text-content-primary placeholder-content-muted focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="h-10 pl-3 pr-8 rounded-lg bg-input-bg border border-input-border text-content-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/50"
            >
              <option value="">Tous statuts</option>
              <option value="PENDING">En attente</option>
              <option value="SUCCESS">Succès</option>
              <option value="FAILED">Échoué</option>
              <option value="EXPIRED">Expiré</option>
              <option value="REVERSED">Annulé</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          </div>

          {/* Provider filter */}
          <div className="relative">
            <select
              value={filterProvider}
              onChange={(e) => { setFilterProvider(e.target.value); setPage(1); }}
              className="h-10 pl-3 pr-8 rounded-lg bg-input-bg border border-input-border text-content-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/50"
            >
              <option value="">Tous providers</option>
              <option value="MTN">MTN MoMo</option>
              <option value="AIRTEL">Airtel Money</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="h-10 pl-3 pr-8 rounded-lg bg-input-bg border border-input-border text-content-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/50"
            >
              <option value="">Tous types</option>
              <option value="COLLECTION">Collection</option>
              <option value="PAYOUT">Décaissement</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Provider Balances */}
      <div className="bg-surface-base/50 border border-edge rounded-xl p-3 mb-4">
        <ProviderBalanceWidget />
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: total, bg: 'bg-surface-subtle/40', border: 'border-edge', text: 'text-content-muted', num: 'text-content-secondary' },
          { label: 'En attente', value: payments.filter(p => p.status === 'PENDING').length, bg: 'bg-accent/10', border: 'border-accent/20', text: 'text-accent', num: 'text-accent' },
          { label: 'Succès', value: payments.filter(p => p.status === 'SUCCESS').length, bg: 'bg-status-success-bg', border: 'border-status-success/20', text: 'text-status-success', num: 'text-status-success' },
          { label: 'Échoués', value: payments.filter(p => ['FAILED', 'EXPIRED'].includes(p.status)).length, bg: 'bg-status-danger-bg', border: 'border-status-danger/20', text: 'text-status-danger', num: 'text-status-danger' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} border ${stat.border} rounded-xl p-4`}>
            <p className={`text-xs ${stat.text} uppercase tracking-wider`}>{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.num} mt-1`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface-base/50 border border-edge rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={32} className="text-accent animate-spin" />
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-content-muted">
            <Phone size={48} className="mb-4 opacity-50" />
            <p>Aucune transaction trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-edge">
                  <th className="text-left text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Provider</th>
                  <th className="text-left text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Téléphone</th>
                  <th className="text-left text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Client</th>
                  <th className="text-right text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Montant</th>
                  <th className="text-center text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Statut</th>
                  <th className="text-left text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-center text-xs font-semibold text-content-muted uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProviderLogo provider={payment.provider} />
                        <span className="text-sm text-content-primary">{payment.provider}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        payment.type === 'COLLECTION'
                          ? 'bg-status-success-bg text-status-success'
                          : 'bg-status-warning-bg text-status-warning'
                      }`}>
                        {payment.type === 'COLLECTION' ? 'Collection' : 'Payout'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-content-primary font-mono">{payment.phone}</span>
                    </td>
                    <td className="px-4 py-3">
                      {payment.client ? (
                        <span className="text-sm text-content-primary">
                          {payment.client.nom} {payment.client.prenom || ''}
                        </span>
                      ) : (
                        <span className="text-sm text-content-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-content-primary">
                        {Number(payment.amount).toLocaleString()} <span className="text-xs text-content-muted">FCFA</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-content-muted">
                        {safeDateFormat(payment.createdAt, 'dd/MM/yyyy HH:mm')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewDetails(payment)}
                          className="p-2 rounded-lg hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-colors"
                          title="Voir détails"
                        >
                          <Eye size={16} />
                        </button>
                        {payment.status === 'PENDING' && (
                          <button
                            onClick={() => handleViewDetails(payment)}
                            className="p-2 rounded-lg hover:bg-status-warning-bg text-status-warning transition-colors"
                            title="Réconcilier"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-edge">
            <p className="text-sm text-content-muted">
              Page {page} sur {totalPages} ({total} transactions)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-surface text-content-primary hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-surface text-content-primary hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <PaymentDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedPayment(null);
        }}
        payment={selectedPayment}
        isAdmin={true}
        onManualReconcile={handleManualReconcile}
      />
    </div>
  );
}
