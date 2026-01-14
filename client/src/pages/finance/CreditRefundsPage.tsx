
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CheckCircle, XCircle, Clock, DollarSign, Search, Filter, 
  ChevronRight, AlertTriangle, UserCheck, Wallet, ArrowRightLeft, RefreshCw 
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast, handleApiError } from '../../lib/toast';
import { usePermissions } from '../../components/auth/ProtectedFeature';
import { formatMoney, formatClientName } from '../../lib/format';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { authService } from '../../lib/auth';

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
  statut: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CANCELLED';
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
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'ACCOUNT'>('ACCOUNT');
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
    onSuccess: () => {
      toast.success('Paiement effectué avec succès');
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowPayDialog(false);
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
    
    // Check for active session if CASH
    let sessionCaisseId = undefined;
    if (paymentMethod === 'CASH') {
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
           toast.error("Vous devez avoir une caisse ouverte pour payer en espèces.");
           return;
       }
    }

    setLoadingAction(true);
    try {
      await payMutation.mutateAsync({ 
          id: selectedRefund.id, 
          method: paymentMethod,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">À Valider</span>;
      case 'APPROVED': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400">À Payer</span>;
      case 'PAID': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">Payé</span>;
      case 'REJECTED': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">Rejeté</span>;
      default: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Remboursements Crédit</h1>
          <p className="text-slate-400">Gestion des remboursements de frais pour demandes rejetées</p>
        </div>
        <button 
           onClick={() => queryClient.invalidateQueries({ queryKey: ['credit-refunds'] })}
           className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
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
            {['all', 'SUBMITTED', 'APPROVED', 'PAID'].map((status) => (
                <button
                    key={status}
                    onClick={() => setFilterStatut(status)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        filterStatut === status 
                        ? 'bg-cyan-600 text-white' 
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                >
                    {status === 'all' ? 'Tous' : status === 'SUBMITTED' ? 'À Valider' : status === 'APPROVED' ? 'À Payer' : 'Payés'}
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
                        {getStatusBadge(refund.statut)}
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
                                 title="Payer"
                               >
                                  <Wallet size={18} />
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
                    <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setPaymentMethod('ACCOUNT')}
                          className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition ${
                            paymentMethod === 'ACCOUNT' 
                             ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                             : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                            <ArrowRightLeft size={24} />
                            <span className="text-sm font-medium">Virement Compte</span>
                        </button>
                        <button
                          onClick={() => setPaymentMethod('CASH')}
                          className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition ${
                            paymentMethod === 'CASH' 
                             ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                             : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                            <DollarSign size={24} />
                            <span className="text-sm font-medium">Espèces (Caisse)</span>
                        </button>
                    </div>
                 </div>

                 <div className="text-xs text-slate-500 text-center">
                    {paymentMethod === 'ACCOUNT' 
                        ? 'Le montant sera crédité sur le compte courant du client.'
                        : 'Nécessite une caisse ouverte. Un mouvement de débit sera créé.'}
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
                   Confirmer Paiement
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
