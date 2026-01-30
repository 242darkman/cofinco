import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, CheckCircle, AlertTriangle, Clock, Building2,
  ArrowRight, RefreshCw, Loader2, Search, Filter, Calendar,
  CheckSquare, XCircle
} from 'lucide-react';
import { Button, Badge, FormField, SelectField } from '../../ui';
import { toast } from '../../../lib/toast';
import { api } from '../../../lib/api-client';
import { formatMoney } from '../../../lib/format';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface CaisseTransfert {
  id: string;
  agenceSourceId: string;
  agenceSourceNom?: string;
  agenceDestId: string;
  agenceDestNom?: string;
  montant: string;
  reference: string;
  statut: string;
  dateCreation: string;
  dateReception?: string;
  reconciled?: boolean;
  reconciledAt?: string;
  reconciledBy?: string;
  daysInTransit?: number;
  observations?: string;
}

interface ReconciliationStats {
  total: number;
  pending: number;
  received: number;
  reconciled: number;
  avgDaysInTransit: number;
}

interface TransferReconciliationPanelProps {
  agenceId?: string;
  onReconcile?: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING: { color: 'warning', icon: Clock, label: 'En transit' },
  SENT: { color: 'info', icon: ArrowRight, label: 'Envoyé' },
  RECEIVED: { color: 'success', icon: CheckCircle, label: 'Reçu' },
  CANCELLED: { color: 'danger', icon: XCircle, label: 'Annulé' },
};

export default function TransferReconciliationPanel({
  agenceId,
  onReconcile,
}: TransferReconciliationPanelProps) {
  const [transfers, setTransfers] = useState<CaisseTransfert[]>([]);
  const [stats, setStats] = useState<ReconciliationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterDirection, setFilterDirection] = useState<'sent' | 'received' | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTransfers();
  }, [agenceId, filterStatus, filterDirection]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      // Fetch pending reconciliation transfers
      const params = new URLSearchParams();
      if (agenceId) {
        if (filterDirection === 'sent') {
          params.append('agenceSourceId', agenceId);
        } else if (filterDirection === 'received') {
          params.append('agenceDestId', agenceId);
        } else {
          params.append('agenceId', agenceId);
        }
      }
      if (filterStatus === 'pending') {
        params.append('reconciled', 'false');
      } else if (filterStatus === 'reconciled') {
        params.append('reconciled', 'true');
      }

      const response = await api.get<{ transfers: CaisseTransfert[]; stats: ReconciliationStats }>(
        `/caisses/transferts/reconciliation${params.toString() ? `?${params.toString()}` : ''}`
      );

      setTransfers(response?.transfers || []);
      setStats(response?.stats || null);
    } catch (error) {
      console.error('Error fetching transfers for reconciliation:', error);
      // Try alternative endpoint
      try {
        const response = await api.get<CaisseTransfert[]>(
          `/caisses/transferts${agenceId ? `?agenceId=${agenceId}` : ''}`
        );
        setTransfers(response || []);
      } catch {
        setTransfers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = useCallback(async (transferId: string) => {
    setReconciling(transferId);
    try {
      await api.post(`/caisses/transferts/${transferId}/reconcile`, {});
      toast.success('Transfert rapproché');
      fetchTransfers();
      onReconcile?.();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du rapprochement');
    } finally {
      setReconciling(null);
    }
  }, [onReconcile]);

  const handleConfirmReceipt = useCallback(async (transferId: string) => {
    setReconciling(transferId);
    try {
      await api.post(`/caisses/transferts/${transferId}/confirm-receipt`, {});
      toast.success('Réception confirmée');
      fetchTransfers();
      onReconcile?.();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la confirmation');
    } finally {
      setReconciling(null);
    }
  }, [onReconcile]);

  const filteredTransfers = transfers.filter(t => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.reference?.toLowerCase().includes(term) ||
      t.agenceSourceNom?.toLowerCase().includes(term) ||
      t.agenceDestNom?.toLowerCase().includes(term)
    );
  });

  const getStatusConfig = (statut: string) => {
    return STATUS_CONFIG[statut] || STATUS_CONFIG.PENDING;
  };

  const isOverdue = (transfer: CaisseTransfert) => {
    if (transfer.reconciled) return false;
    const daysSinceCreation = Math.floor(
      (Date.now() - new Date(transfer.dateCreation).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceCreation > 3; // More than 3 days is considered overdue
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ArrowLeftRight size={16} className="text-cyan-400" />
          Rapprochement Transferts
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchTransfers}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{stats.total}</p>
            <p className="text-[10px] text-slate-400">Total</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-amber-400">{stats.pending}</p>
            <p className="text-[10px] text-slate-400">En transit</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-green-400">{stats.reconciled}</p>
            <p className="text-[10px] text-slate-400">Rapprochés</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{stats.avgDaysInTransit?.toFixed(1) || '-'}</p>
            <p className="text-[10px] text-slate-400">Jours moy.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par référence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">Tous</option>
          <option value="pending">Non rapprochés</option>
          <option value="reconciled">Rapprochés</option>
        </select>

        <select
          value={filterDirection}
          onChange={(e) => setFilterDirection(e.target.value as any)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">Tous transferts</option>
          <option value="sent">Envoyés</option>
          <option value="received">Reçus</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {loading && transfers.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun transfert à rapprocher</p>
          </div>
        ) : (
          filteredTransfers.map((transfer) => {
            const status = getStatusConfig(transfer.statut);
            const StatusIcon = status.icon;
            const overdue = isOverdue(transfer);
            const isSource = agenceId === transfer.agenceSourceId;

            return (
              <div
                key={transfer.id}
                className={`bg-slate-800/50 border rounded-lg p-3 ${
                  overdue
                    ? 'border-red-500/50 bg-red-500/5'
                    : transfer.reconciled
                      ? 'border-green-500/30'
                      : 'border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Route */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        isSource ? 'bg-orange-500/20 text-orange-400' : 'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {isSource ? 'Envoyé' : 'Reçu'}
                      </span>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 size={12} className="text-slate-400" />
                        <span className="text-slate-300 truncate">
                          {transfer.agenceSourceNom || 'Source'}
                        </span>
                        <ArrowRight size={12} className="text-slate-500" />
                        <span className="text-slate-300 truncate">
                          {transfer.agenceDestNom || 'Dest'}
                        </span>
                      </div>
                    </div>

                    {/* Amount and reference */}
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-base font-bold text-white">
                        {formatMoney(parseFloat(transfer.montant))}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{transfer.reference}</span>
                    </div>

                    {/* Date and transit info */}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {formatDistanceToNow(new Date(transfer.dateCreation), { addSuffix: true, locale: fr })}
                      </span>
                      {transfer.daysInTransit !== undefined && transfer.daysInTransit > 0 && (
                        <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
                          <Clock size={10} />
                          {transfer.daysInTransit} jour{transfer.daysInTransit > 1 ? 's' : ''} en transit
                        </span>
                      )}
                    </div>

                    {overdue && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
                        <AlertTriangle size={10} />
                        Transfert en retard
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      variant={status.color as any}
                      value={transfer.reconciled ? 'Rapproché' : status.label}
                      size="xs"
                    />

                    {!transfer.reconciled && (
                      <div className="flex items-center gap-1">
                        {/* If we're the receiving agency and transfer is SENT, show confirm receipt */}
                        {!isSource && transfer.statut === 'SENT' && (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleConfirmReceipt(transfer.id)}
                            disabled={reconciling === transfer.id}
                            className="text-xs"
                          >
                            {reconciling === transfer.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <>
                                <CheckCircle size={12} className="mr-1" />
                                Confirmer
                              </>
                            )}
                          </Button>
                        )}

                        {/* If transfer is RECEIVED, allow reconciliation */}
                        {transfer.statut === 'RECEIVED' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleReconcile(transfer.id)}
                            disabled={reconciling === transfer.id}
                            className="text-xs"
                          >
                            {reconciling === transfer.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <>
                                <CheckSquare size={12} className="mr-1" />
                                Rapprocher
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
