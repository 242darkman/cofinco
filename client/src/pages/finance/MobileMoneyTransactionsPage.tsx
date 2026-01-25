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
import { PaymentDetailModal, type PaymentDetailData } from '@/components/finance/payments';
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
    CREATED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Clock },
    PENDING: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: Clock },
    SUCCESS: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle2 },
    FAILED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle },
    EXPIRED: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: Clock },
    REVERSED: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: AlertTriangle },
    CANCELLED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: XCircle },
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
          <h1 className="text-2xl font-bold text-white">Transactions Mobile Money</h1>
          <p className="text-sm text-slate-400 mt-1">
            Suivi des paiements MTN et Airtel Money
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher (téléphone, référence, client...)"
                className="w-full h-10 pl-9 pr-4 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="h-10 pl-3 pr-8 rounded-lg bg-slate-800 border border-slate-700 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Tous statuts</option>
              <option value="PENDING">En attente</option>
              <option value="SUCCESS">Succès</option>
              <option value="FAILED">Échoué</option>
              <option value="EXPIRED">Expiré</option>
              <option value="REVERSED">Annulé</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>

          {/* Provider filter */}
          <div className="relative">
            <select
              value={filterProvider}
              onChange={(e) => { setFilterProvider(e.target.value); setPage(1); }}
              className="h-10 pl-3 pr-8 rounded-lg bg-slate-800 border border-slate-700 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Tous providers</option>
              <option value="MTN">MTN MoMo</option>
              <option value="AIRTEL">Airtel Money</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="h-10 pl-3 pr-8 rounded-lg bg-slate-800 border border-slate-700 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Tous types</option>
              <option value="COLLECTION">Collection</option>
              <option value="PAYOUT">Décaissement</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: total, color: 'slate' },
          { label: 'En attente', value: payments.filter(p => p.status === 'PENDING').length, color: 'cyan' },
          { label: 'Succès', value: payments.filter(p => p.status === 'SUCCESS').length, color: 'emerald' },
          { label: 'Échoués', value: payments.filter(p => ['FAILED', 'EXPIRED'].includes(p.status)).length, color: 'red' },
        ].map((stat) => (
          <div key={stat.label} className={`bg-${stat.color}-500/10 border border-${stat.color}-500/20 rounded-xl p-4`}>
            <p className={`text-xs text-${stat.color}-400 uppercase tracking-wider`}>{stat.label}</p>
            <p className={`text-2xl font-bold text-${stat.color}-300 mt-1`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={32} className="text-cyan-500 animate-spin" />
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Phone size={48} className="mb-4 opacity-50" />
            <p>Aucune transaction trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Provider</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Téléphone</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Client</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Montant</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Statut</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProviderLogo provider={payment.provider} />
                        <span className="text-sm text-white">{payment.provider}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        payment.type === 'COLLECTION'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {payment.type === 'COLLECTION' ? 'Collection' : 'Payout'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-white font-mono">{payment.phone}</span>
                    </td>
                    <td className="px-4 py-3">
                      {payment.client ? (
                        <span className="text-sm text-white">
                          {payment.client.nom} {payment.client.prenom || ''}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-white">
                        {Number(payment.amount).toLocaleString()} <span className="text-xs text-slate-500">FCFA</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-400">
                        {safeDateFormat(payment.createdAt, 'dd/MM/yyyy HH:mm')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewDetails(payment)}
                          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="Voir détails"
                        >
                          <Eye size={16} />
                        </button>
                        {payment.status === 'PENDING' && (
                          <button
                            onClick={() => handleViewDetails(payment)}
                            className="p-2 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <p className="text-sm text-slate-500">
              Page {page} sur {totalPages} ({total} transactions)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
