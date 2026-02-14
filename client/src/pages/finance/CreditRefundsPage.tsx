
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Clock, DollarSign, Search,
  UserCheck, Wallet, ArrowRightLeft, RefreshCw, Smartphone, AlertCircle, User
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

  // Listen for refund updates from other components to refresh data
  useEffect(() => {
    const handleRefundUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
    };
    window.addEventListener('refund-update', handleRefundUpdate);
    return () => window.removeEventListener('refund-update', handleRefundUpdate);
  }, [queryClient]);

  // Fetch Refunds
  const { data: refunds = [], isLoading, refetch } = useQuery<CreditRefundRequest[]>({
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
    },
    refetchInterval: 30000, // Polling every 30s as backup
  });

  // Approve handler
  const handleApprove = async () => {
    if (!selectedRefund) return;
    setLoadingAction(true);
    try {
      const res = await fetch(`/api/finance/credit-refunds/${selectedRefund.id}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to approve');
      }
      toast.success('Remboursement approuvé');
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowApproveDialog(false);
      window.dispatchEvent(new CustomEvent('refund-update'));
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setLoadingAction(false);
    }
  };

  // Pay handler
  const handlePay = async () => {
    if (!selectedRefund) return;
    setLoadingAction(true);
    try {
      const res = await fetch(`/api/finance/credit-refunds/${selectedRefund.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: paymentMethod })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to pay');
      }
      if (paymentMethod === 'CASH' || paymentMethod === 'MOBILE_MONEY') {
        toast.success('Envoyé en caisse', { description: 'En attente de validation.' });
      } else {
        toast.success('Paiement effectué', { description: 'Crédité sur compte courant.' });
      }
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowPayDialog(false);
      window.dispatchEvent(new CustomEvent('refund-update'));
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setLoadingAction(false);
    }
  };

  // Validate Caisse handler
  const handleValidateCaisse = async () => {
    if (!selectedRefund) return;

    // Check for active caisse session
    let sessionCaisseId: string | undefined;
    try {
      const res = await fetch(`/api/sessions-caisse/active`);
      if (res.ok) {
        const session = await res.json();
        if (session?.id) sessionCaisseId = session.id;
      }
    } catch (e) {
      console.error("Failed to check active session", e);
    }

    if (!sessionCaisseId) {
      toast.error("Vous devez avoir une caisse ouverte.");
      return;
    }

    setLoadingAction(true);
    try {
      const res = await fetch(`/api/finance/credit-refunds/${selectedRefund.id}/validate-caisse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCaisseId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Échec de la validation');
      }
      toast.success('Paiement validé');
      queryClient.invalidateQueries({ queryKey: ['credit-refunds'] });
      setShowValidateCaisseDialog(false);
      window.dispatchEvent(new CustomEvent('refund-update'));
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setLoadingAction(false);
    }
  };

  const filteredRefunds = refunds.filter(r => {
    if (searchTerm) {
       const searchLower = searchTerm.toLowerCase();
       const clientName = r.clients ? formatClientName(r.clients.nom, r.clients.prenom).toLowerCase() : '';
       return (
           clientName.includes(searchLower) ||
           (r.demande?.numeroDemande || '').toLowerCase().includes(searchLower)
       );
    }
    return true;
  });

  const getStatusBadge = (status: string, paymentMethod?: string) => {
    const baseClass = "px-2 py-0.5 rounded-full text-[10px] font-semibold";
    switch (status) {
      case 'SUBMITTED': return <span className={`${baseClass} bg-status-info-bg text-status-info`}>À Valider</span>;
      case 'APPROVED': return <span className={`${baseClass} bg-status-info-bg text-status-info`}>À Payer</span>;
      case 'PENDING_CAISSE':
        return (
          <span className={`${baseClass} bg-status-warning-bg text-status-warning inline-flex items-center gap-1`}>
            <AlertCircle size={10} />
            En Caisse
          </span>
        );
      case 'PAID': return <span className={`${baseClass} bg-status-success-bg text-status-success`}>Payé</span>;
      case 'REJECTED': return <span className={`${baseClass} bg-status-danger-bg text-status-danger`}>Rejeté</span>;
      default: return <span className={`${baseClass} bg-surface-elevated text-content-muted`}>{status}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-content-primary">Restitutions Frais</h1>
          <p className="text-content-muted text-[10px] sm:text-xs">Gérer les remboursements des frais de dossier</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-content-muted hidden sm:inline">
            {filteredRefunds.length} résultat{filteredRefunds.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => refetch()}
            className="p-2 bg-surface hover:bg-surface-elevated rounded-lg text-content-muted transition"
            title="Actualiser"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
        <div className="relative sm:w-64 lg:w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-input-bg border border-input-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex gap-1 sm:gap-1.5 text-xs overflow-x-auto no-scrollbar">
            {['all', 'SUBMITTED', 'APPROVED', 'PENDING_CAISSE', 'PAID'].map((status) => (
                <button
                    key={status}
                    onClick={() => setFilterStatut(status)}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
                        filterStatut === status
                        ? 'bg-accent-secondary text-white'
                        : 'bg-surface text-content-muted hover:bg-surface-elevated'
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

      {/* Content area — fills remaining space */}
      <div className="flex-1 min-h-0 bg-surface/50 rounded-xl border border-edge overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-content-muted" />
          </div>
        ) : filteredRefunds.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-muted gap-2">
            <DollarSign size={28} className="text-surface-elevated" />
            <p className="text-sm italic">Aucun remboursement</p>
          </div>
        ) : (
          <>
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-base/80 backdrop-blur text-content-muted text-xs border-b border-edge">
                    <th className="px-3 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Demande</th>
                    <th className="px-3 py-2.5 font-medium">Client</th>
                    <th className="px-3 py-2.5 font-medium text-right">Montant</th>
                    <th className="px-3 py-2.5 font-medium text-center">Statut</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-subtle">
                  {filteredRefunds.map((refund) => (
                    <tr key={refund.id} className="hover:bg-surface-elevated/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="text-content-secondary text-xs">{safeDateFormat(refund.createdAt, 'dd/MM/yy')}</div>
                        <div className="text-content-muted text-[10px]">{safeDateFormat(refund.createdAt, 'HH:mm')}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-accent text-xs">{refund.demande?.numeroDemande || '-'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0">
                            <User size={12} className="text-content-muted" />
                          </div>
                          <span className="text-content-primary text-xs font-medium truncate">
                            {refund.clients ? formatClientName(refund.clients.nom, refund.clients.prenom) : '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="text-content-primary font-semibold text-xs">{formatMoney(Number(refund.montantRemboursable))}</div>
                        <div className="text-content-muted text-[10px]">/{formatMoney(Number(refund.montantEncaisse))}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {getStatusBadge(refund.statut, refund.paymentMethod)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {refund.statut === 'SUBMITTED' && (
                            <button
                              onClick={() => { setSelectedRefund(refund); setShowApproveDialog(true); }}
                              className="p-1.5 bg-status-info-bg hover:bg-status-info-bg text-status-info rounded transition"
                              title="Valider"
                            >
                              <UserCheck size={14} />
                            </button>
                          )}
                          {refund.statut === 'APPROVED' && (
                            <button
                              onClick={() => { setSelectedRefund(refund); setShowPayDialog(true); }}
                              className="p-1.5 bg-status-success-bg hover:bg-status-success-bg text-status-success rounded transition"
                              title="Payer"
                            >
                              <Wallet size={14} />
                            </button>
                          )}
                          {refund.statut === 'PENDING_CAISSE' && (
                            <button
                              onClick={() => { setSelectedRefund(refund); setShowValidateCaisseDialog(true); }}
                              className="p-1.5 bg-status-warning-bg hover:bg-status-warning-bg text-status-warning rounded transition animate-pulse"
                              title="Valider le paiement"
                            >
                              <DollarSign size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden flex-1 overflow-y-auto divide-y divide-edge-subtle">
              {filteredRefunds.map((refund) => (
                <div key={refund.id} className="p-3 hover:bg-surface-elevated/20 transition-colors space-y-2">
                  {/* Row 1: Client + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0">
                        <User size={12} className="text-content-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-content-primary text-xs font-medium truncate">
                          {refund.clients ? formatClientName(refund.clients.nom, refund.clients.prenom) : '-'}
                        </p>
                        <p className="text-content-muted text-[10px] font-mono">{refund.demande?.numeroDemande || '-'}</p>
                      </div>
                    </div>
                    {getStatusBadge(refund.statut, refund.paymentMethod)}
                  </div>

                  {/* Row 2: Amount + Date + Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-content-primary font-semibold text-sm">{formatMoney(Number(refund.montantRemboursable))}</div>
                        <div className="text-content-muted text-[10px]">sur {formatMoney(Number(refund.montantEncaisse))}</div>
                      </div>
                      <div className="text-content-muted text-[10px]">
                        {safeDateFormat(refund.createdAt, 'dd/MM/yy HH:mm')}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {refund.statut === 'SUBMITTED' && (
                        <button
                          onClick={() => { setSelectedRefund(refund); setShowApproveDialog(true); }}
                          className="px-2.5 py-1.5 bg-status-info-bg hover:bg-status-info-bg text-status-info rounded-lg transition text-[10px] font-semibold flex items-center gap-1"
                        >
                          <UserCheck size={12} /> Valider
                        </button>
                      )}
                      {refund.statut === 'APPROVED' && (
                        <button
                          onClick={() => { setSelectedRefund(refund); setShowPayDialog(true); }}
                          className="px-2.5 py-1.5 bg-status-success-bg hover:bg-status-success-bg text-status-success rounded-lg transition text-[10px] font-semibold flex items-center gap-1"
                        >
                          <Wallet size={12} /> Payer
                        </button>
                      )}
                      {refund.statut === 'PENDING_CAISSE' && (
                        <button
                          onClick={() => { setSelectedRefund(refund); setShowValidateCaisseDialog(true); }}
                          className="px-2.5 py-1.5 bg-status-warning-bg hover:bg-status-warning-bg text-status-warning rounded-lg transition text-[10px] font-semibold flex items-center gap-1 animate-pulse"
                        >
                          <DollarSign size={12} /> Caisse
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Approve Dialog */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        onClose={() => setShowApproveDialog(false)}
        title="Valider le Remboursement"
        message={
           <div className="space-y-2">
              <p className="text-sm">
                Valider <span className="text-content-primary font-bold">{selectedRefund ? formatMoney(Number(selectedRefund.montantRemboursable)) : ''}</span> pour{' '}
                <span className="text-content-primary font-bold">{selectedRefund?.clients ? formatClientName(selectedRefund.clients.nom, selectedRefund.clients.prenom) : '-'}</span> ?
              </p>
              <p className="text-xs text-content-muted bg-surface-base/50 p-2 rounded border border-edge">
                Le dossier passera à l'étape de paiement.
              </p>
           </div>
        }
        confirmText="Valider"
        variant="success"
        onConfirm={handleApprove}
        isLoading={loadingAction}
      />

      {/* Pay Dialog - Compact */}
      {showPayDialog && selectedRefund && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
           <div className="bg-surface rounded-xl border border-edge w-full max-w-sm p-4 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                 <h3 className="text-base font-bold text-content-primary">Paiement</h3>
                 <button onClick={() => setShowPayDialog(false)} className="text-content-muted hover:text-content-primary"><XCircle size={20}/></button>
              </div>

              <div className="space-y-3">
                 <div className="bg-surface-elevated/50 p-3 rounded-lg flex justify-between items-center">
                    <span className="text-xs text-content-muted">À payer</span>
                    <span className="text-lg font-bold text-status-success">{formatMoney(Number(selectedRefund.montantRemboursable))}</span>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-xs font-medium text-content-muted">Méthode</label>
                    <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => setPaymentMethod('ACCOUNT')}
                          className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition text-xs ${
                            paymentMethod === 'ACCOUNT'
                             ? 'bg-status-info-bg border-status-info text-status-info'
                             : 'bg-surface-elevated border-edge-strong text-content-muted hover:bg-surface-subtle'
                          }`}
                        >
                            <ArrowRightLeft size={16} />
                            <span>Compte</span>
                        </button>
                        <button
                          onClick={() => setPaymentMethod('CASH')}
                          className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition text-xs ${
                            paymentMethod === 'CASH'
                             ? 'bg-status-success-bg border-status-success text-status-success'
                             : 'bg-surface-elevated border-edge-strong text-content-muted hover:bg-surface-subtle'
                          }`}
                        >
                            <DollarSign size={16} />
                            <span>Espèces</span>
                        </button>
                        <button
                          onClick={() => setPaymentMethod('MOBILE_MONEY')}
                          className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition text-xs ${
                            paymentMethod === 'MOBILE_MONEY'
                             ? 'bg-status-warning-bg border-status-warning text-status-warning'
                             : 'bg-surface-elevated border-edge-strong text-content-muted hover:bg-surface-subtle'
                          }`}
                        >
                            <Smartphone size={16} />
                            <span>Mobile</span>
                        </button>
                    </div>
                 </div>

                 <p className="text-[10px] text-content-muted text-center p-1.5 bg-surface-base/50 rounded border border-edge">
                    {paymentMethod === 'ACCOUNT'
                        ? 'Crédité sur le compte courant du client.'
                        : 'Envoyé en caisse pour validation.'}
                 </p>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-edge">
                 <button
                   onClick={() => setShowPayDialog(false)}
                   className="px-3 py-1.5 text-xs text-content-muted hover:bg-surface-elevated rounded transition"
                   disabled={loadingAction}
                 >
                   Annuler
                 </button>
                 <button
                   onClick={handlePay}
                   disabled={loadingAction}
                   className="px-4 py-1.5 bg-status-success hover:bg-status-success text-white text-xs font-medium rounded transition flex items-center gap-1.5"
                 >
                   {loadingAction ? <Clock className="animate-spin" size={12} /> : <CheckCircle size={12} />}
                   {paymentMethod === 'ACCOUNT' ? 'Payer' : 'Envoyer'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Validate Caisse Dialog - Compact */}
      {showValidateCaisseDialog && selectedRefund && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
           <div className="bg-surface rounded-xl border border-edge w-full max-w-sm p-4 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                 <h3 className="text-base font-bold text-content-primary">Validation Caisse</h3>
                 <button onClick={() => setShowValidateCaisseDialog(false)} className="text-content-muted hover:text-content-primary"><XCircle size={20}/></button>
              </div>

              <div className="space-y-3">
                 <div className="bg-status-warning-bg border border-status-warning/30 p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="text-status-warning flex-shrink-0 mt-0.5" size={16} />
                    <div>
                       <p className="text-status-warning font-medium text-xs">Paiement en attente</p>
                       <p className="text-[10px] text-content-muted">Confirmez avoir remis le montant au client.</p>
                    </div>
                 </div>

                 <div className="bg-surface-elevated/50 p-3 rounded-lg space-y-2 text-xs">
                    <div className="flex justify-between">
                       <span className="text-content-muted">Client</span>
                       <span className="text-content-primary font-medium">
                          {selectedRefund.clients ? formatClientName(selectedRefund.clients.nom, selectedRefund.clients.prenom) : '-'}
                       </span>
                    </div>
                    <div className="flex justify-between">
                       <span className="text-content-muted">Méthode</span>
                       <span className={selectedRefund.paymentMethod === 'MOBILE_MONEY' ? 'text-status-warning' : 'text-status-success'}>
                          {selectedRefund.paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'}
                       </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-edge-strong">
                       <span className="text-content-muted">Montant</span>
                       <span className="text-lg font-bold text-status-success">
                          {formatMoney(Number(selectedRefund.montantRemboursable))}
                       </span>
                    </div>
                 </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-edge">
                 <button
                   onClick={() => setShowValidateCaisseDialog(false)}
                   className="px-3 py-1.5 text-xs text-content-muted hover:bg-surface-elevated rounded transition"
                   disabled={loadingAction}
                 >
                   Annuler
                 </button>
                 <button
                   onClick={handleValidateCaisse}
                   disabled={loadingAction}
                   className="px-4 py-1.5 bg-status-warning hover:bg-status-warning text-white text-xs font-medium rounded transition flex items-center gap-1.5"
                 >
                   {loadingAction ? <Clock className="animate-spin" size={12} /> : <CheckCircle size={12} />}
                   Valider
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
