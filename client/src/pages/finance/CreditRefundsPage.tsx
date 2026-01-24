
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Clock, DollarSign, Search,
  UserCheck, Wallet, ArrowRightLeft, RefreshCw, Smartphone, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast, handleApiError } from '../../lib/toast';
import { usePermissions } from '../../components/auth/ProtectedFeature';
import { formatMoney, formatClientName } from '../../lib/format';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { authService } from '../../lib/auth';

type PaymentMethod = 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY';

// Safe date format helper to prevent crashes on invalid dates
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

interface CreditRefundRequest {
  id: string;
  demandeId: string;
  clientId: string;
  agenceId: string;
  montantEncaisse: string;
  montantRemboursable: string;
  montantNonRemboursable: string;
  statut: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING_CAISSE' | 'PAID' | 'CANCELLED';
  motifRejetCredit?: string;
  motifRemboursement?: string;
  makerId: string;
  makerAt?: string;
  checkerId?: string;
  checkerAt?: string;
  checkerDecision?: string;
  checkerComment?: string;
  paidAt?: string;
  paymentMethod?: string;
  paymentReference?: string;
  createdAt: string;
  clients: {
    nom: string;
    prenom?: string;
    phone?: string;
  };
  demande: {
    numeroDemande: string;
  };
}

export default function CreditRefundsPage() {
  const queryClient = useQueryClient();
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedRefund, setSelectedRefund] = useState<CreditRefundRequest | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showValidateCaisseDialog, setShowValidateCaisseDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ACCOUNT');
  const [loadingAction, setLoadingAction] = useState(false);

  const user = authService.getCurrentUser();

  // Fetch Refunds
  const { data: refunds = [], isLoading } = useQuery<CreditRefundRequest[]>({
    queryKey: ['credit-refunds', filterStatut],
    queryFn: async () => {
      let url = '/api/finance/credit-refunds';
      if (filterStatut !== 'all') {
        url += `?statut=${filterStatut}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch refunds');
      const data = await res.json();
      // Transform nested response: {refund, demande, client} -> flat structure
      return data.map((item: any) => ({
        ...item.refund,
        demande: item.demande,
        clients: item.client,
      }));
    }
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/finance/credit-refunds/${id}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to approve');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Remboursement approuvé avec succès');
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowApproveDialog(false);
      // Notify sidebar to refresh badge count
      window.dispatchEvent(new CustomEvent('refund-update'));
    },
    onError: (err) => {
      toast.error(handleApiError(err));
    }
  });

  // Pay Mutation
  const payMutation = useMutation({
    mutationFn: async ({ id, method, sessionCaisseId }: { id: string, method: string, sessionCaisseId?: string }) => {
      const res = await fetch(`/api/finance/credit-refunds/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, sessionCaisseId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to pay');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      const method = variables.method;
      if (method === 'CASH' || method === 'MOBILE_MONEY') {
        toast.success('Demande de paiement envoyée', {
          description: 'Le remboursement est en attente de validation par la caisse.'
        });
      } else {
        toast.success('Paiement effectué avec succès', {
          description: 'Le montant a été crédité sur le compte courant du client.'
        });
      }
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowPayDialog(false);
      window.dispatchEvent(new CustomEvent('refund-update'));
    },
    onError: (err) => {
      toast.error(handleApiError(err));
    }
  });

  // Validate Caisse Mutation (for caissier to confirm cash/mobile money payment)
  const validateCaisseMutation = useMutation({
    mutationFn: async ({ id, sessionCaisseId }: { id: string, sessionCaisseId: string }) => {
      const res = await fetch(`/api/finance/credit-refunds/${id}/validate-caisse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCaisseId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Échec de la validation');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Paiement validé avec succès', {
        description: 'Le remboursement a été effectué au client.'
      });
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowValidateCaisseDialog(false);
      window.dispatchEvent(new CustomEvent('refund-update'));
    },
    onError: (err) => {
      toast.error(handleApiError(err));
    }
  });

  const handleApprove = async () => {
    if (!selectedRefund) return;
    setLoadingAction(true);
    try {
      await approveMutation.mutateAsync(selectedRefund.id);
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePay = async () => {
    if (!selectedRefund) return;

    setLoadingAction(true);
    try {
      // For ACCOUNT: execute immediately
      // For CASH/MOBILE_MONEY: send to caisse for validation
      await payMutation.mutateAsync({
          id: selectedRefund.id,
          method: paymentMethod
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleValidateCaisse = async () => {
    if (!selectedRefund) return;

    // Check for active caisse session
    let sessionCaisseId: string | undefined;
    try {
      const res = await fetch(`/api/sessions-caisse/active`);
      if (res.ok) {
        const session = await res.json();
        if (session && session.id) {
          sessionCaisseId = session.id;
        }
      }
    } catch (e) {
      console.error("Failed to check active session", e);
    }

    if (!sessionCaisseId) {
      toast.error("Vous devez avoir une caisse ouverte pour valider ce paiement.");
      return;
    }

    setLoadingAction(true);
    try {
      await validateCaisseMutation.mutateAsync({
        id: selectedRefund.id,
        sessionCaisseId
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const filteredRefunds = refunds.filter(r => {
    if (searchTerm) {
       const searchLower = searchTerm.toLowerCase();
       return (
           (r.clients?.nom || '').toLowerCase().includes(searchLower) ||
           (r.demande?.numeroDemande || '').toLowerCase().includes(searchLower)
       );
    }
    return true;
  });

  const getStatusBadge = (status: string, paymentMethod?: string) => {
    switch (status) {
      case 'SUBMITTED': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">À Valider</span>;
      case 'APPROVED': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400">À Payer</span>;
      case 'PENDING_CAISSE':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 flex items-center gap-1">
            <AlertCircle size={12} />
            {paymentMethod === 'MOBILE_MONEY' ? 'En attente Mobile Money' : 'En attente Caisse'}
          </span>
        );
      case 'PAID': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">Payé</span>;
      case 'REJECTED': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">Rejeté</span>;
      default: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 truncate">Restitutions de Frais de Dossier</h1>
          <p className="text-slate-400 text-sm md:text-base">Gérer les remboursements des frais d'engagement pour les dossiers rejetés</p>
        </div>
        <button
           onClick={() => queryClient.invalidateQueries({ queryKey: ['credit-refunds'] })}
           className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
           title="Actualiser"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher (Client, Demande)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        
        <div className="flex gap-2 text-sm overflow-x-auto pb-1">
            {['all', 'SUBMITTED', 'APPROVED', 'PENDING_CAISSE', 'PAID'].map((status) => (
                <button
                    key={status}
                    onClick={() => setFilterStatut(status)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        filterStatut === status
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                >
                    {status === 'all' ? 'Tous'
                     : status === 'SUBMITTED' ? 'À Valider'
                     : status === 'APPROVED' ? 'À Payer'
                     : status === 'PENDING_CAISSE' ? 'En Caisse'
                     : 'Payés'}
                </button>
            ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 text-slate-400 text-sm border-b border-slate-700">
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Demande</th>
                <th className="p-4 font-semibold">Client</th>
                <th className="p-4 font-semibold text-right">Montant</th>
                <th className="p-4 font-semibold text-center">Statut</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {isLoading ? (
                 <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">Chargement...</td>
                 </tr>
              ) : filteredRefunds.length === 0 ? (
                 <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 italic">Aucun remboursement trouvé</td>
                 </tr>
              ) : (
                 filteredRefunds.map((refund, index) => (
                    <tr key={refund.id || `refund-${index}`} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 text-slate-300">
                        {safeDateFormat(refund.createdAt, 'dd/MM/yyyy')}
                        <div className="text-xs text-slate-500">{safeDateFormat(refund.createdAt, 'HH:mm')}</div>
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-cyan-400 font-medium">{refund.demande?.numeroDemande || '-'}</span>
                      </td>
                      <td className="p-4 text-white font-medium">
                        {refund.clients ? formatClientName(refund.clients.nom, refund.clients.prenom) : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="font-bold text-white">{formatMoney(Number(refund.montantRemboursable))}</div>
                        <div className="text-xs text-slate-500">sur {formatMoney(Number(refund.montantEncaisse))}</div>
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(refund.statut, refund.paymentMethod)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                           {refund.statut === 'SUBMITTED' && (
                               <button
                                 onClick={() => { setSelectedRefund(refund); setShowApproveDialog(true); }}
                                 className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition"
                                 title="Valider"
                               >
                                  <UserCheck size={18} />
                               </button>
                           )}
                           {refund.statut === 'APPROVED' && (
                               <button
                                 onClick={() => { setSelectedRefund(refund); setShowPayDialog(true); }}
                                 className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition"
                                 title="Choisir méthode de paiement"
                               >
                                  <Wallet size={18} />
                               </button>
                           )}
                           {refund.statut === 'PENDING_CAISSE' && (
                               <button
                                 onClick={() => { setSelectedRefund(refund); setShowValidateCaisseDialog(true); }}
                                 className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition animate-pulse"
                                 title="Valider le paiement en caisse"
                               >
                                  <DollarSign size={18} />
                               </button>
                           )}
                        </div>
                      </td>
                    </tr>
                 ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve Dialog */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        onClose={() => setShowApproveDialog(false)}
        title="Valider le Remboursement"
        message={
           <div>
              <p>Êtes-vous sûr de vouloir valider le remboursement de <span className="text-white font-bold">{selectedRefund ? formatMoney(Number(selectedRefund.montantRemboursable)) : ''}</span> pour <span className="text-white font-bold">{selectedRefund?.clients ? formatClientName(selectedRefund.clients.nom, selectedRefund.clients.prenom) : '-'}</span> ?</p>
              <div className="mt-2 text-sm text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700">
                Action irréversible. Le dossier passera à l'étape de paiement.
              </div>
           </div>
        }
        confirmText="Valider"
        variant="success"
        onConfirm={handleApprove}
        isLoading={loadingAction}
      />

      {/* Pay Dialog */}
      {showPayDialog && selectedRefund && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
           <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6 space-y-6 shadow-2xl">
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold text-white">Paiement Remboursement</h3>
                 <button onClick={() => setShowPayDialog(false)} className="text-slate-400 hover:text-white"><XCircle size={24}/></button>
              </div>
              
              <div className="space-y-4">
                 <div className="bg-slate-700/50 p-4 rounded-lg flex justify-between items-center">
                    <div>
                       <div className="text-sm text-slate-400">Montant à payer</div>
                       <div className="text-2xl font-bold text-emerald-400">{formatMoney(Number(selectedRefund.montantRemboursable))}</div>
                    </div>
                    <Wallet className="text-emerald-500/50" size={32} />
                 </div>

                 <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-300">Méthode de Paiement</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setPaymentMethod('ACCOUNT')}
                          className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition ${
                            paymentMethod === 'ACCOUNT'
                             ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                             : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                            <ArrowRightLeft size={22} />
                            <span className="text-xs font-medium text-center">Virement Compte</span>
                        </button>
                        <button
                          onClick={() => setPaymentMethod('CASH')}
                          className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition ${
                            paymentMethod === 'CASH'
                             ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                             : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                            <DollarSign size={22} />
                            <span className="text-xs font-medium text-center">Espèces</span>
                        </button>
                        <button
                          onClick={() => setPaymentMethod('MOBILE_MONEY')}
                          className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition ${
                            paymentMethod === 'MOBILE_MONEY'
                             ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                             : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                            <Smartphone size={22} />
                            <span className="text-xs font-medium text-center">Mobile Money</span>
                        </button>
                    </div>
                 </div>

                 <div className="text-xs text-slate-500 text-center p-2 bg-slate-900/50 rounded border border-slate-700">
                    {paymentMethod === 'ACCOUNT'
                        ? '💳 Le montant sera crédité directement sur le compte courant du client.'
                        : paymentMethod === 'CASH'
                        ? '💵 La caisse devra valider le paiement en espèces avant finalisation.'
                        : '📱 La caisse devra valider le paiement Mobile Money avant finalisation.'}
                 </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
                 <button
                   onClick={() => setShowPayDialog(false)}
                   className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition"
                   disabled={loadingAction}
                 >
                   Annuler
                 </button>
                 <button
                   onClick={handlePay}
                   disabled={loadingAction}
                   className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition flex items-center gap-2"
                 >
                   {loadingAction ? <Clock className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                   {paymentMethod === 'ACCOUNT' ? 'Confirmer Paiement' : 'Envoyer à la Caisse'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Validate Caisse Dialog */}
      {showValidateCaisseDialog && selectedRefund && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
           <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6 space-y-6 shadow-2xl">
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold text-white">Validation Caisse</h3>
                 <button onClick={() => setShowValidateCaisseDialog(false)} className="text-slate-400 hover:text-white"><XCircle size={24}/></button>
              </div>

              <div className="space-y-4">
                 <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg">
                    <div className="flex items-start gap-3">
                       <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                       <div>
                          <div className="text-amber-400 font-semibold mb-1">Paiement en attente de validation</div>
                          <div className="text-sm text-slate-300">
                             Ce remboursement nécessite votre validation pour être effectué.
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="bg-slate-700/50 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400">Client</span>
                       <span className="text-white font-medium">
                          {selectedRefund.clients ? formatClientName(selectedRefund.clients.nom, selectedRefund.clients.prenom) : '-'}
                       </span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400">Méthode</span>
                       <span className={`font-medium ${selectedRefund.paymentMethod === 'MOBILE_MONEY' ? 'text-orange-400' : 'text-emerald-400'}`}>
                          {selectedRefund.paymentMethod === 'MOBILE_MONEY' ? '📱 Mobile Money' : '💵 Espèces'}
                       </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-600">
                       <span className="text-slate-400">Montant à payer</span>
                       <span className="text-2xl font-bold text-emerald-400">
                          {formatMoney(Number(selectedRefund.montantRemboursable))}
                       </span>
                    </div>
                 </div>

                 <div className="text-xs text-slate-500 text-center">
                    En validant, vous confirmez avoir remis le montant au client.
                 </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
                 <button
                   onClick={() => setShowValidateCaisseDialog(false)}
                   className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition"
                   disabled={loadingAction}
                 >
                   Annuler
                 </button>
                 <button
                   onClick={handleValidateCaisse}
                   disabled={loadingAction}
                   className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition flex items-center gap-2"
                 >
                   {loadingAction ? <Clock className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                   Valider le Paiement
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
