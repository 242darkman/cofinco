import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Wallet, RefreshCw, AlertCircle, User, CreditCard, Clock,
  CheckCircle, XCircle, Banknote, FileText, Calendar, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Badge } from '../../ui';
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

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // Fetch pending disbursements (must be declared before callbacks that use it)
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
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000
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
      const response = await api.post<{ success: boolean; message: string }>(`/credits/${creditId}/caisse-payout`, {
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
      const response = await api.post<{ success: boolean; message: string }>(`/credits/${creditId}/cancel-disbursement`, {
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

  // Mutation for batch payout
  const batchPayoutMutation = useMutation({
    mutationFn: async (creditIds: string[]) => {
      const response = await api.post<{ success: boolean; message: string; successCount: number; failCount: number }>('/credits/batch-disburse', {
        creditIds,
        sessionCaisseId,
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.failCount === 0) {
        toast.success(`${data.successCount} décaissement(s) effectué(s) avec succès`);
      } else {
        toast.warning(`${data.successCount} réussi(s), ${data.failCount} erreur(s)`);
      }
      queryClient.invalidateQueries({ queryKey: ['pending-disbursements'] });
      queryClient.invalidateQueries({ queryKey: ['session-caisse'] });
      setSelectedIds(new Set());
      setShowBatchConfirm(false);
      onDisbursementComplete?.();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors du décaissement groupé');
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
    <div className="h-full flex flex-col font-sans selection:bg-orange-500/30 p-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
        
        {/* LEFT COL: List of Pending Loans (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3 h-full overflow-y-auto overflow-x-hidden">
            {/* Header / Stats */}
            <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3 shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                         <div className="p-1.5 rounded-lg bg-orange-500/10">
                            <Wallet className="w-4 h-4 text-orange-400" aria-hidden="true" />
                        </div>
                        <h3 className="font-semibold text-sm text-slate-200">Prêts en Attente</h3>
                    </div>
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className="h-6 w-6 p-0 rounded-full hover:bg-slate-800 text-slate-400"
                    >
                        <RefreshCw className={`${isRefetching ? 'animate-spin' : ''}`} size={12} />
                    </Button>
                </div>
                
                {count > 0 ? (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-400">
                        <span className="font-bold text-white">{count}</span> dossiers à traiter
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                          <button
                            onClick={() => setShowBatchConfirm(true)}
                            disabled={batchPayoutMutation.isPending}
                            className="px-2 py-1 text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/30 transition"
                          >
                            {batchPayoutMutation.isPending ? 'Traitement...' : `Décaisser (${selectedIds.size})`}
                          </button>
                        )}
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === count && count > 0}
                            onChange={toggleSelectAll}
                            className="w-3 h-3 rounded border-slate-600 text-orange-500 focus:ring-orange-500/30"
                          />
                          Tout
                        </label>
                      </div>
                    </div>
                ) : (
                    <div className="text-[10px] text-slate-500 italic">Aucun dossier en attente</div>
                )}
            </Card>

            {/* List */}
             <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar min-h-0">
                {count > 0 ? (
                    pendingCredits.map((credit) => (
                        <div
                            key={credit.id}
                            onClick={() => {
                                setSelectedCredit(credit);
                                setReceiptNumber('');
                                setShowPayoutConfirm(false);
                            }}
                            className={`p-3 rounded-xl border cursor-pointer transition-all group ${
                                selectedCredit?.id === credit.id
                                ? 'bg-orange-950/30 border-orange-500/50 shadow-lg shadow-orange-900/10'
                                : selectedIds.has(credit.id)
                                ? 'bg-orange-950/20 border-orange-500/30'
                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(credit.id)}
                                      onClick={(e) => toggleSelect(credit.id, e)}
                                      onChange={() => {}}
                                      className="w-3.5 h-3.5 rounded border-slate-600 text-orange-500 focus:ring-orange-500/30 shrink-0"
                                    />
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                                        {credit.client.photoUrl ? (
                                            <img src={credit.client.photoUrl} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <User size={14} className="text-slate-500" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-200 leading-tight">
                                            {formatClientName(credit.client.nom, credit.client.prenom)}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-mono">
                                            #{credit.numeroCredit || credit.numero_credit}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight size={14} className={`transition-transform duration-300 ${selectedCredit?.id === credit.id ? 'text-orange-400 rotate-90' : 'text-slate-600 group-hover:text-slate-400'}`} />
                            </div>
                            
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-950/30 px-1.5 py-0.5 rounded">
                                    <Clock size={10} />
                                    {credit.createdAt ? new Date(credit.createdAt).toLocaleDateString([], {day: '2-digit', month: '2-digit'}) : '-'}
                                </div>
                                <p className="text-sm font-bold text-orange-400 font-mono">
                                    {formatMoney(parseFloat(credit.montant))}
                                </p>
                            </div>
                        </div>
                    ))
                ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="p-3 bg-slate-900 rounded-full mb-3">
                            <CheckCircle size={24} className="text-slate-700" />
                        </div>
                        <p className="text-xs text-center font-medium">Tout est à jour</p>
                        <p className="text-[10px] text-center mt-1 opacity-70">Les nouveaux prêts apparaîtront ici</p>
                     </div>
                )}
             </div>
        </div>

        {/* RIGHT COL: Detail Cockpit (8 cols) */}
        <div className="lg:col-span-8 h-full flex flex-col">
            <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 h-full p-0 flex flex-col overflow-hidden relative">
                {selectedCredit ? (
                    <>
                        {/* Cockpit Header */}
                        <div className="p-4 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Banknote className="text-orange-400" size={20} />
                                Validation Décaissement
                            </h2>
                            <Badge variant="warning" value="En attente client" className="animate-pulse" />
                        </div>

                        {/* Main Cockpit Content */}
                        <div className="flex-1 p-6 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                {/* Zone Identité */}
                                <div className="space-y-4">
                                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bénéficiaire</h3>
                                     <div className="flex items-center gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                                         <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-700 overflow-hidden shrink-0">
                                            {selectedCredit.client.photoUrl ? (
                                                <img src={selectedCredit.client.photoUrl} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <User size={24} className="w-full h-full p-4 text-slate-500" />
                                            )}
                                         </div>
                                         <div className="min-w-0">
                                             <p className="text-lg font-bold text-white truncate">
                                                 {formatClientName(selectedCredit.client.nom, selectedCredit.client.prenom)}
                                             </p>
                                             <div className="flex flex-wrap gap-2 mt-1">
                                                <span className="text-xs text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                                                    ID: {selectedCredit.client.id.slice(0, 8)}...
                                                </span>
                                             </div>
                                         </div>
                                     </div>

                                     <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex gap-3">
                                         <AlertCircle className="text-orange-400 shrink-0 mt-0.5" size={16} />
                                         <div className="space-y-1">
                                             <p className="text-xs font-bold text-orange-200">Vérification Requise</p>
                                             <p className="text-[10px] text-orange-200/70 leading-relaxed">
                                                 Veuillez vérifier la pièce d'identité du client et confirmer qu'il correspond à la photo ci-dessus avant de procéder.
                                             </p>
                                         </div>
                                     </div>
                                </div>

                                {/* Zone Transaction */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Détails Transaction</h3>
                                    
                                    <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center">
                                        <p className="text-xs text-slate-500 mb-1">Montant à décaisser</p>
                                        <p className="text-4xl font-black text-white tracking-tight mb-2">
                                            {formatMoney(parseFloat(selectedCredit.montant))}
                                        </p>
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400">
                                            <CreditCard size={12} />
                                            Prêt #{selectedCredit.numeroCredit || selectedCredit.numero_credit}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-400 ml-1">Référence Reçu (Facultatif)</label>
                                        <div className="relative">
                                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                            <input
                                                type="text"
                                                value={receiptNumber}
                                                onChange={(e) => setReceiptNumber(e.target.value)}
                                                placeholder="ex: REC-123456"
                                                className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex gap-3 mt-auto">
                            <Button
                                variant="outline"
                                onClick={() => handleCancel(selectedCredit)}
                                className="flex-1 border-rose-900/30 text-rose-400 hover:bg-rose-950/30 hover:border-rose-800"
                            >
                                <XCircle className="mr-2" size={16} />
                                Annuler le Prêt
                            </Button>
                            
                            <Button
                                onClick={confirmPayout}
                                disabled={payoutMutation.isPending}
                                className="flex-[2] py-6 text-base font-bold tracking-wide bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-lg shadow-orange-900/20"
                            >
                                {payoutMutation.isPending ? (
                                    <><RefreshCw className="animate-spin mr-2" size={18} /> Traitement...</>
                                ) : (
                                    <><CheckCircle className="mr-2" size={18} /> CONFIRMER LE DÉCAISSEMENT</>
                                )}
                            </Button>
                        </div>
                    </>
                ) : (
                    /* Empty Selection State */
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                        <div className="w-24 h-24 bg-slate-950 rounded-full flex items-center justify-center mb-6 border border-slate-800 shadow-inner">
                            <Banknote size={40} className="text-slate-700" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-400 mb-2">Aucun prêt sélectionné</h2>
                        <p className="max-w-xs text-center text-sm opacity-70">
                            Sélectionnez un dossier dans la liste de gauche pour procéder au décaissement des fonds.
                        </p>
                    </div>
                )}
            </Card>
        </div>
      </div>

      {/* Cancel Confirmation Dialog (Keep existing modal for cancellation as it's destructive) */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Annuler le décaissement"
        message={
          selectedCredit
            ? `Voulez-vous vraiment annuler ce prêt de ${formatMoney(parseFloat(selectedCredit.montant))} ? Cette action est irréversible.`
            : ''
        }
        confirmText="Confirmer l'annulation"
        onConfirm={() => {
             if (selectedCredit) {
                 cancelMutation.mutate(selectedCredit.id);
             }
        }}
        onClose={() => {
          setShowCancelConfirm(false);
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
          return `Voulez-vous décaisser ${selectedIds.size} crédit(s) pour un total de ${formatMoney(totalMontant)} ? Cette action débitera le coffre-fort.`;
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
