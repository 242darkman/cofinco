import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Wallet, RefreshCw, AlertCircle, User, CreditCard, Clock,
  CheckCircle, XCircle, Banknote, FileText, Calendar, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '../../ui';
import { formatMoney, formatClientName } from '../../../lib/format';
import { api } from '../../../lib/api-client';
import { useWebSocket } from '../../../hooks/useWebSocket';
import ConfirmDialog from '../../ui/ConfirmDialog';

interface PendingCredit {
  id: string;
  numeroCredit: string;
  numero_credit?: string;
  montant: string;
  taux: number | string;
  duree: number;
  statut: string;
  disbursementChannel: string;
  disbursement_channel?: string;
  disbursementStatus: string;
  disbursement_status?: string;
  createdAt: string;
  created_at?: string;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoUrl?: string;
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

  // État pour les modales
  const [selectedCredit, setSelectedCredit] = useState<PendingCredit | null>(null);
  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');

  // Fetch pending disbursements
  const {
    data: pendingData,
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['pending-disbursements'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: PendingCredit[]; count: number }>('/api/credits/pending-disbursements');
      return response;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000
  });

  // Listen for WebSocket updates
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CAISSE_UPDATE') {
          const { subtype, clientName, montant } = data.payload || {};
          if (
            subtype === 'NEW_LOAN_DISBURSEMENT' ||
            subtype === 'LOAN_DISBURSEMENT_COMPLETED' ||
            subtype === 'LOAN_DISBURSEMENT_CANCELLED'
          ) {
            // Show toast for new disbursement
            if (subtype === 'NEW_LOAN_DISBURSEMENT' && clientName && montant) {
              toast.info(
                `Nouveau prêt à décaisser: ${formatMoney(montant)} pour ${clientName}`,
                { duration: 6000 }
              );
            }
            // Refetch the list
            refetch();
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, refetch]);

  // Mutation for processing payout
  const payoutMutation = useMutation({
    mutationFn: async (creditId: string) => {
      const response = await api.post<{ success: boolean; message: string }>(`/api/credits/${creditId}/caisse-payout`, {
        sessionCaisseId,
        paymentReference: receiptNumber || undefined
      });
      return response;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Décaissement effectué avec succès');
      queryClient.invalidateQueries({ queryKey: ['pending-disbursements'] });
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      setShowPayoutConfirm(false);
      setSelectedCredit(null);
      setReceiptNumber('');
      onDisbursementComplete?.();
    },
    onError: (error: any) => {
      if (error?.error?.code === 'INSUFFICIENT_FUNDS') {
        toast.error(
          `Solde insuffisant. Il manque ${formatMoney(error.error.deficit)} dans le coffre.`,
          { duration: 6000 }
        );
      } else {
        toast.error(error.message || 'Erreur lors du décaissement');
      }
    }
  });

  // Mutation for cancelling disbursement
  const cancelMutation = useMutation({
    mutationFn: async (creditId: string) => {
      const response = await api.post<{ success: boolean; message: string }>(`/api/credits/${creditId}/cancel-disbursement`, {
        raison: 'Client non présenté'
      });
      return response;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Décaissement annulé');
      queryClient.invalidateQueries({ queryKey: ['pending-disbursements'] });
      setShowCancelConfirm(false);
      setSelectedCredit(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    }
  });

  const pendingCredits: PendingCredit[] = pendingData?.data || [];
  const count = pendingCredits.length;

  // Handler for payout
  const handlePayout = useCallback((credit: PendingCredit) => {
    setSelectedCredit(credit);
    setShowPayoutConfirm(true);
  }, []);

  // Handler for cancel
  const handleCancel = useCallback((credit: PendingCredit) => {
    setSelectedCredit(credit);
    setShowCancelConfirm(true);
  }, []);

  const confirmPayout = () => {
    if (selectedCredit) {
      payoutMutation.mutate(selectedCredit.id);
    }
  };

  const confirmCancel = () => {
    if (selectedCredit) {
      cancelMutation.mutate(selectedCredit.id);
    }
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-3 text-slate-400">
          <RefreshCw className="animate-spin" size={20} />
          <span>Chargement des décaissements en attente...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/30">
            <Wallet className="text-orange-400" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Décaissements Prêts</h3>
            <p className="text-sm text-slate-400">
              {count > 0 ? `${count} prêt${count > 1 ? 's' : ''} en attente` : 'Aucun prêt en attente'}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className={`${isRefetching ? 'animate-spin' : ''}`} size={16} />
        </Button>
      </div>

      {/* Empty State */}
      {count === 0 && (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-slate-700/50">
              <CheckCircle className="text-slate-500" size={32} />
            </div>
            <p className="text-slate-400">Aucun décaissement de prêt en attente</p>
            <p className="text-sm text-slate-500">
              Les nouveaux prêts à décaisser apparaîtront ici automatiquement
            </p>
          </div>
        </Card>
      )}

      {/* List of pending disbursements */}
      <div className="space-y-3">
        {pendingCredits.map((credit) => {
          const numeroCredit = credit.numeroCredit || credit.numero_credit;
          const montant = parseFloat(credit.montant);
          const createdAt = credit.createdAt || credit.created_at;

          return (
            <Card
              key={credit.id}
              className="p-4 hover:border-orange-500/50 transition-colors cursor-pointer"
              onClick={() => handlePayout(credit)}
            >
              <div className="flex items-center justify-between">
                {/* Client info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
                    {credit.client.photoUrl ? (
                      <img
                        src={credit.client.photoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="text-slate-400" size={20} />
                    )}
                  </div>

                  <div>
                    <p className="text-white font-semibold">
                      {formatClientName(credit.client.nom, credit.client.prenom)}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <CreditCard size={14} />
                      <span>{numeroCredit}</span>
                    </div>
                  </div>
                </div>

                {/* Amount and actions */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-orange-400">
                      {formatMoney(montant)}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock size={12} />
                      <span>{createdAt ? formatDate(createdAt) : 'N/A'}</span>
                    </div>
                  </div>

                  <ChevronRight className="text-slate-500" size={20} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Payout Confirmation Modal */}
      {selectedCredit && showPayoutConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/30">
                  <Banknote className="text-orange-400" size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Confirmer le Décaissement</h2>
                  <p className="text-slate-400 text-sm">Vérifiez l'identité du client</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Client Summary */}
              <div className="bg-slate-700/50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Client</span>
                  <span className="text-white font-semibold">
                    {formatClientName(selectedCredit.client.nom, selectedCredit.client.prenom)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Crédit N°</span>
                  <span className="text-white">
                    {selectedCredit.numeroCredit || selectedCredit.numero_credit}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Montant à remettre</span>
                  <span className="text-2xl font-bold text-orange-400">
                    {formatMoney(parseFloat(selectedCredit.montant))}
                  </span>
                </div>
              </div>

              {/* Receipt Number (optional) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <FileText size={14} />
                  N° Reçu (optionnel)
                </label>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder="REC-2026-001"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none"
                />
              </div>

              {/* Warning */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
                <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-amber-200">
                  Vérifiez l'identité du client avant de remettre les fonds.
                  Cette action est irréversible.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-slate-700 flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPayoutConfirm(false);
                  setSelectedCredit(null);
                  setReceiptNumber('');
                }}
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                disabled={payoutMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                onClick={confirmPayout}
                disabled={payoutMutation.isPending}
                className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white"
              >
                {payoutMutation.isPending ? (
                  <>
                    <RefreshCw className="animate-spin mr-2" size={18} />
                    Traitement...
                  </>
                ) : (
                  <>
                    <Banknote className="mr-2" size={18} />
                    Décaisser {formatMoney(parseFloat(selectedCredit.montant))}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Annuler le décaissement"
        message={
          selectedCredit
            ? `Voulez-vous annuler le décaissement de ${formatMoney(parseFloat(selectedCredit.montant))} pour ${formatClientName(selectedCredit.client.nom, selectedCredit.client.prenom)} ? Cette action annulera le crédit.`
            : ''
        }
        confirmText="Annuler le décaissement"
        onConfirm={confirmCancel}
        onClose={() => {
          setShowCancelConfirm(false);
          setSelectedCredit(null);
        }}
        variant="danger"
      />
    </div>
  );
}
