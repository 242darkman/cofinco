import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Wallet, RefreshCw, AlertCircle, User, CreditCard, Clock,
  CheckCircle, XCircle, Banknote, FileText, ChevronDown, X, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Badge } from '../../ui';
import { formatMoney, formatClientName, resolveStorageUrl } from '../../../lib/format';
import { api } from '../../../lib/api-client';
import { useWebSocket } from '../../../hooks/useWebSocket';
import ConfirmDialog from '../../ui/ConfirmDialog';

interface PendingCredit {
  id: string;
  numeroCredit: string;
  montant: string;
  taux: number | string;
  duree: number;
  statut: string;
  disbursementChannel: string;
  disbursementStatus: string;
  createdAt: string;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoProfile?: string;
  };
}

interface PendingDisbursementsProps {
  sessionCaisseId: string;
  onDisbursementComplete?: () => void;
}

export default function PendingDisbursements({
  sessionCaisseId,
  onDisbursementComplete
}: PendingDisbursementsProps) {
  const queryClient = useQueryClient();
  const { socket } = useWebSocket();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [creditToCancel, setCreditToCancel] = useState<PendingCredit | null>(null);
  const [receiptNumbers, setReceiptNumbers] = useState<Record<string, string>>({});

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // Fetch pending disbursements
  const {
    data: pendingData,
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['pending-disbursements'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: PendingCredit[]; count: number }>('/credits/pending-disbursements');
      return response;
    },
    staleTime: 60000
  });

  const toggleSelect = useCallback((creditId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(creditId)) next.delete(creditId);
      else next.add(creditId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const pendingCredits: PendingCredit[] = pendingData?.data || [];
    if (selectedIds.size === pendingCredits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingCredits.map(c => c.id)));
    }
  }, [pendingData, selectedIds]);

  // WebSocket updates
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CAISSE_UPDATE') {
          const { subtype, clientName, montant } = data.payload || {};
          if (['NEW_LOAN_DISBURSEMENT', 'LOAN_DISBURSEMENT_COMPLETED', 'LOAN_DISBURSEMENT_CANCELLED'].includes(subtype)) {
            if (subtype === 'NEW_LOAN_DISBURSEMENT' && clientName && montant) {
              toast.info(`Nouveau prêt: ${formatMoney(montant)} - ${clientName}`, { duration: 5000 });
            }
            refetch();
          }
        }
      } catch (e) { /* ignore */ }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, refetch]);

  // Payout mutation
  const payoutMutation = useMutation({
    mutationFn: async ({ creditId, receipt }: { creditId: string; receipt?: string }) => {
      return api.post<{ success: boolean; message: string }>(`/credits/${creditId}/caisse-payout`, {
        sessionCaisseId,
        paymentReference: receipt || undefined
      });
    },
    onSuccess: (data, variables) => {
      toast.success(data?.message || 'Décaissement effectué');
      queryClient.invalidateQueries({ queryKey: ['pending-disbursements'] });
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      setExpandedId(null);
      setReceiptNumbers(prev => { const n = {...prev}; delete n[variables.creditId]; return n; });
      onDisbursementComplete?.();
    },
    onError: (error: unknown) => {
      const errObj = error as Record<string, any>;
      if (errObj?.error?.code === 'INSUFFICIENT_FUNDS') {
        toast.error(`Solde insuffisant. Déficit: ${formatMoney(errObj.error.deficit)}`, { duration: 6000 });
      } else {
        toast.error((error as Error).message || 'Erreur lors du décaissement');
      }
    }
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (creditId: string) => {
      return api.post<{ success: boolean; message: string }>(`/credits/${creditId}/cancel-disbursement`, {
        raison: 'Client non présenté'
      });
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Décaissement annulé');
      queryClient.invalidateQueries({ queryKey: ['pending-disbursements'] });
      setShowCancelConfirm(false);
      setCreditToCancel(null);
    },
    onError: (error: unknown) => {
      toast.error((error as Error).message || 'Erreur lors de l\'annulation');
    }
  });

  // Batch payout mutation
  const batchPayoutMutation = useMutation({
    mutationFn: async (creditIds: string[]) => {
      return api.post<{ success: boolean; message: string; successCount: number; failCount: number }>('/credits/batch-disburse', {
        creditIds,
        sessionCaisseId,
      });
    },
    onSuccess: (data) => {
      if (data.failCount === 0) {
        toast.success(`${data.successCount} décaissement(s) effectué(s)`);
      } else {
        toast.warning(`${data.successCount} réussi(s), ${data.failCount} erreur(s)`);
      }
      queryClient.invalidateQueries({ queryKey: ['pending-disbursements'] });
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      setSelectedIds(new Set());
      setShowBatchConfirm(false);
      onDisbursementComplete?.();
    },
    onError: (error: unknown) => {
      toast.error((error as Error).message || 'Erreur décaissement groupé');
    }
  });

  const pendingCredits: PendingCredit[] = pendingData?.data || [];
  const count = pendingCredits.length;
  const totalAmount = pendingCredits.reduce((sum, c) => sum + parseFloat(c.montant), 0);

  const handleExpand = (creditId: string) => {
    setExpandedId(expandedId === creditId ? null : creditId);
  };

  const handlePayout = (credit: PendingCredit) => {
    payoutMutation.mutate({ creditId: credit.id, receipt: receiptNumbers[credit.id] });
  };

  const handleCancelClick = (credit: PendingCredit, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreditToCancel(credit);
    setShowCancelConfirm(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 text-content-muted p-8">
        <RefreshCw className="animate-spin" size={18} />
        <span className="text-sm">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-base/50 rounded-xl border border-edge overflow-hidden">
      {/* Compact Header */}
      <div className="px-3 py-2.5 border-b border-edge bg-surface-base/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-status-warning-bg shrink-0">
            <Wallet className="w-4 h-4 text-status-warning" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-content-primary">Décaissements Prêts</h3>
            {count > 0 && (
              <p className="text-[10px] text-content-muted">
                {count} en attente • {formatMoney(totalAmount)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBatchConfirm(true)}
              disabled={batchPayoutMutation.isPending}
              className="px-2 py-1 text-[10px] font-bold bg-status-warning text-white rounded-lg hover:bg-status-warning transition flex items-center gap-1"
            >
              <CheckCircle size={12} />
              {batchPayoutMutation.isPending ? '...' : `(${selectedIds.size})`}
            </button>
          )}
          {count > 1 && (
            <label className="flex items-center gap-1 cursor-pointer text-[10px] text-content-muted px-1.5 py-1 rounded hover:bg-surface">
              <input
                type="checkbox"
                checked={selectedIds.size === count && count > 0}
                onChange={toggleSelectAll}
                className="w-3 h-3 rounded border-edge-strong text-status-warning focus:ring-0"
              />
              <span className="hidden sm:inline">Tout</span>
            </label>
          )}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 rounded-lg hover:bg-surface text-content-muted transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
        {count > 0 ? (
          pendingCredits.map((credit) => {
            const isExpanded = expandedId === credit.id;
            const isSelected = selectedIds.has(credit.id);
            const isPaying = payoutMutation.isPending && payoutMutation.variables?.creditId === credit.id;

            return (
              <div
                key={credit.id}
                className={`rounded-lg border transition-all ${
                  isExpanded
                    ? 'bg-surface/80 border-status-warning/40 shadow-lg'
                    : isSelected
                    ? 'bg-status-warning-bg border-status-warning/20'
                    : 'bg-surface-base/60 border-edge hover:border-edge'
                }`}
              >
                {/* Collapsed Row */}
                <div
                  onClick={() => handleExpand(credit.id)}
                  className="p-2.5 cursor-pointer"
                >
                  {/* Top Row: Client Info */}
                  <div className="flex items-start gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => toggleSelect(credit.id, e)}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded border-edge-strong text-status-warning focus:ring-0 shrink-0 mt-1"
                    />

                    <div className="w-9 h-9 rounded-full bg-surface border border-edge overflow-hidden shrink-0">
                      {credit.client.photoProfile ? (
                        <img src={resolveStorageUrl(credit.client.photoProfile)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User size={16} className="text-content-muted" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <p className="text-xs font-semibold text-content-primary leading-tight">
                        {formatClientName(credit.client.nom, credit.client.prenom)}
                      </p>
                      <p className="text-[10px] text-content-muted font-mono">
                        #{credit.numeroCredit}
                      </p>
                    </div>

                    <ChevronDown
                      size={14}
                      className={`text-content-muted transition-transform shrink-0 ${isExpanded ? 'rotate-180 text-status-warning' : ''}`}
                    />
                  </div>

                  {/* Bottom Row: Amount & Date */}
                  <div className="flex items-center justify-between pl-6">
                    <div className="flex items-center gap-1 text-[10px] text-content-muted">
                      <Clock size={10} />
                      {new Date(credit.createdAt || '').toLocaleDateString('fr', { day: '2-digit', month: '2-digit' })}
                    </div>
                    <p className="text-sm font-bold text-status-warning tabular-nums">
                      {formatMoney(parseFloat(credit.montant))}
                    </p>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-edge-subtle animate-in slide-in-from-top-1 duration-200">
                    {/* Identity Verification Alert */}
                    <div className="flex items-start gap-2 p-2 bg-status-warning-bg border border-status-warning/20 rounded-lg mb-3">
                      <Shield size={14} className="text-status-warning shrink-0 mt-0.5" />
                      <p className="text-[10px] text-status-warning-text/80 leading-relaxed">
                        <span className="font-bold text-status-warning-text">Vérifiez l'identité</span> du client avant de procéder au décaissement.
                      </p>
                    </div>

                    {/* Transaction Info Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-surface-base/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-content-muted uppercase tracking-wider">Montant</p>
                        <p className="text-lg font-black text-content-primary tabular-nums">
                          {formatMoney(parseFloat(credit.montant))}
                        </p>
                      </div>
                      <div className="bg-surface-base/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-content-muted uppercase tracking-wider">Crédit</p>
                        <p className="text-xs font-bold text-content-secondary font-mono mt-1">
                          #{credit.numeroCredit}
                        </p>
                      </div>
                    </div>

                    {/* Receipt Input */}
                    <div className="mb-3">
                      <div className="relative">
                        <FileText size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
                        <input
                          type="text"
                          value={receiptNumbers[credit.id] || ''}
                          onChange={(e) => setReceiptNumbers(prev => ({ ...prev, [credit.id]: e.target.value }))}
                          placeholder="Réf. reçu (optionnel)"
                          className="w-full pl-8 pr-3 py-2 bg-surface-base border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:border-status-warning outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => handleCancelClick(credit, e)}
                        disabled={cancelMutation.isPending}
                        className="flex-1 py-2 px-3 text-[10px] font-bold text-status-danger border border-status-danger/30 rounded-lg hover:bg-status-danger/10 transition flex items-center justify-center gap-1"
                      >
                        <XCircle size={12} />
                        Annuler
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePayout(credit); }}
                        disabled={isPaying}
                        className="flex-[2] py-2.5 px-3 text-xs font-bold text-white bg-gradient-to-r from-status-warning to-status-warning rounded-lg hover:from-status-warning hover:to-status-warning transition flex items-center justify-center gap-1.5 shadow-lg shadow-status-warning/20"
                      >
                        {isPaying ? (
                          <><RefreshCw size={14} className="animate-spin" /> Traitement...</>
                        ) : (
                          <><CheckCircle size={14} /> Confirmer Décaissement</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Empty State */
          <div className="h-full flex flex-col items-center justify-center text-content-muted py-12">
            <div className="p-3 bg-surface-base rounded-full mb-3 border border-edge">
              <CheckCircle size={20} className="text-status-success/50" />
            </div>
            <p className="text-xs font-medium text-content-muted">Aucun décaissement en attente</p>
            <p className="text-[10px] mt-1 opacity-60">Les nouveaux prêts apparaîtront ici</p>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Annuler le décaissement"
        message={
          creditToCancel
            ? `Annuler le prêt de ${formatMoney(parseFloat(creditToCancel.montant))} pour ${formatClientName(creditToCancel.client.nom, creditToCancel.client.prenom)} ?`
            : ''
        }
        confirmText="Confirmer l'annulation"
        onConfirm={() => {
          if (creditToCancel) {
            cancelMutation.mutate(creditToCancel.id);
          }
        }}
        onClose={() => {
          setShowCancelConfirm(false);
          setCreditToCancel(null);
        }}
        variant="danger"
      />

      {/* Batch Payout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showBatchConfirm}
        title="Décaissement groupé"
        message={(() => {
          const selected = pendingCredits.filter(c => selectedIds.has(c.id));
          const totalMontant = selected.reduce((sum, c) => sum + parseFloat(c.montant), 0);
          return `Décaisser ${selectedIds.size} crédit(s) pour un total de ${formatMoney(totalMontant)} ?`;
        })()}
        confirmText={`Décaisser ${selectedIds.size} crédit(s)`}
        onConfirm={() => {
          batchPayoutMutation.mutate(Array.from(selectedIds));
        }}
        onClose={() => setShowBatchConfirm(false)}
        variant="warning"
      />
    </div>
  );
}
