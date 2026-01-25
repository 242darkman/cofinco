import React from 'react';
import { X, User, Phone, Calendar, Hash, CreditCard, Wallet, Building2, FileText, Clock, CheckCircle2, XCircle, AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';

const AirtelLogo = ({ className = '' }: { className?: string }) => (
  <img src={airtelLogo} alt="Airtel Money" className={className} />
);

const MTNLogo = ({ className = '' }: { className?: string }) => (
  <img src={mtnLogo} alt="MTN MoMo" className={className} />
);

export interface PaymentAllocation {
  penalites: number;
  interets: number;
  principal: number;
  soldeAvant: string;
  soldeApres: string;
}

export interface PaymentDetailData {
  id: string;
  externalRef: string;
  provider: 'MTN' | 'AIRTEL';
  type: 'COLLECTION' | 'PAYOUT';
  status: string;
  amount: string;
  phone: string;
  providerRef?: string;
  providerTxnId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  initiatedAt?: string;
  confirmedAt?: string;
  // Linked entities
  client?: {
    id: string;
    nom: string;
    prenom?: string;
    phone?: string;
  };
  credit?: {
    id: string;
    numeroCredit: string;
    soldeRestant: string;
  };
  compte?: {
    id: string;
    numeroCompte: string;
    typeCompte: string;
  };
  tontine?: {
    id: string;
    nom: string;
  };
  // Allocation details (for credit repayments)
  allocation?: PaymentAllocation;
  // Agence
  agence?: {
    id: string;
    nom: string;
  };
}

export interface PaymentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentDetailData | null;
  onManualReconcile?: (decision: 'SUCCESS' | 'FAILED') => void;
  isAdmin?: boolean;
}

const statusBadge: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  CREATED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Clock },
  PENDING: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: Clock },
  SUCCESS: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle2 },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle },
  EXPIRED: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: Clock },
  REVERSED: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: AlertTriangle },
};

function InfoRow({ icon: Icon, label, value, copyable }: {
  icon: React.ElementType;
  label: string;
  value: string | React.ReactNode;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value);
      toast.success('Copié');
    }
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-white font-medium truncate">{value || '-'}</p>
          {copyable && typeof value === 'string' && value && (
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-white transition-colors"
            >
              <Copy size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PaymentDetailModal({
  isOpen,
  onClose,
  payment,
  onManualReconcile,
  isAdmin = false,
}: PaymentDetailModalProps) {
  if (!isOpen || !payment) return null;

  const status = statusBadge[payment.status] || statusBadge.PENDING;
  const StatusIcon = status.icon;
  const isPending = payment.status === 'PENDING' || payment.status === 'CREATED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-900 rounded-2xl border border-slate-700/50 max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {payment.provider === 'MTN' ? (
              <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <MTNLogo className="h-6 w-6" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                <AirtelLogo className="h-6 w-6" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-white">
                {payment.type === 'COLLECTION' ? 'Collection' : 'Décaissement'}
              </h3>
              <p className="text-xs text-slate-500">{payment.provider} Mobile Money</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status & Amount Card */}
          <div className="bg-slate-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${status.bg} ${status.text}`}>
                <StatusIcon size={12} />
                {payment.status}
              </span>
              <span className="text-xs text-slate-500">
                {formatDate(payment.createdAt)}
              </span>
            </div>
            <p className="text-3xl font-bold text-white text-center">
              {Number(payment.amount).toLocaleString()} <span className="text-lg text-slate-400">FCFA</span>
            </p>
          </div>

          {/* Transaction Info */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Informations Transaction
            </h4>
            <div className="bg-slate-800/30 rounded-xl px-4 divide-y divide-slate-800">
              <InfoRow icon={Phone} label="Téléphone" value={payment.phone} copyable />
              <InfoRow icon={Hash} label="Référence" value={payment.externalRef} copyable />
              {payment.providerTxnId && (
                <InfoRow icon={FileText} label="ID Provider" value={payment.providerTxnId} copyable />
              )}
              {payment.initiatedAt && (
                <InfoRow icon={Clock} label="Initié le" value={formatDate(payment.initiatedAt)} />
              )}
              {payment.confirmedAt && (
                <InfoRow icon={CheckCircle2} label="Confirmé le" value={formatDate(payment.confirmedAt)} />
              )}
            </div>
          </div>

          {/* Client Info */}
          {payment.client && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Client
              </h4>
              <div className="bg-slate-800/30 rounded-xl px-4 divide-y divide-slate-800">
                <InfoRow
                  icon={User}
                  label="Nom"
                  value={`${payment.client.nom} ${payment.client.prenom || ''}`}
                />
                {payment.client.phone && (
                  <InfoRow icon={Phone} label="Téléphone" value={payment.client.phone} />
                )}
              </div>
            </div>
          )}

          {/* Credit Info with Allocation */}
          {payment.credit && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Crédit
              </h4>
              <div className="bg-slate-800/30 rounded-xl px-4 divide-y divide-slate-800">
                <InfoRow icon={CreditCard} label="N° Crédit" value={payment.credit.numeroCredit} />
                <InfoRow
                  icon={Wallet}
                  label="Solde restant"
                  value={`${Number(payment.credit.soldeRestant).toLocaleString()} FCFA`}
                />
              </div>

              {/* Allocation Breakdown */}
              {payment.allocation && (
                <div className="mt-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <h5 className="text-xs font-semibold text-emerald-400 mb-3">
                    Allocation du remboursement
                  </h5>
                  <div className="space-y-2">
                    {payment.allocation.penalites > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Pénalités</span>
                        <span className="text-red-400 font-medium">
                          {payment.allocation.penalites.toLocaleString()} F
                        </span>
                      </div>
                    )}
                    {payment.allocation.interets > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Intérêts</span>
                        <span className="text-amber-400 font-medium">
                          {payment.allocation.interets.toLocaleString()} F
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Principal</span>
                      <span className="text-emerald-400 font-medium">
                        {payment.allocation.principal.toLocaleString()} F
                      </span>
                    </div>
                    <div className="pt-2 border-t border-emerald-500/20 flex justify-between text-xs">
                      <span className="text-slate-500">
                        Solde: {Number(payment.allocation.soldeAvant).toLocaleString()} F
                      </span>
                      <span className="text-emerald-400">
                        → {Number(payment.allocation.soldeApres).toLocaleString()} F
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compte Info */}
          {payment.compte && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Compte Épargne
              </h4>
              <div className="bg-slate-800/30 rounded-xl px-4 divide-y divide-slate-800">
                <InfoRow icon={Wallet} label="N° Compte" value={payment.compte.numeroCompte} />
                <InfoRow icon={FileText} label="Type" value={payment.compte.typeCompte} />
              </div>
            </div>
          )}

          {/* Tontine Info */}
          {payment.tontine && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Tontine
              </h4>
              <div className="bg-slate-800/30 rounded-xl px-4">
                <InfoRow icon={Building2} label="Nom" value={payment.tontine.nom} />
              </div>
            </div>
          )}

          {/* Agence */}
          {payment.agence && (
            <InfoRow icon={Building2} label="Agence" value={payment.agence.nom} />
          )}

          {/* Error Info */}
          {payment.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <h5 className="text-xs font-semibold text-red-400 mb-1">Erreur</h5>
              {payment.errorCode && (
                <p className="text-xs text-slate-500 mb-1">Code: {payment.errorCode}</p>
              )}
              <p className="text-sm text-red-300">{payment.errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer - Admin Actions */}
        {isAdmin && isPending && onManualReconcile && (
          <div className="border-t border-slate-800 p-4">
            <p className="text-xs text-slate-500 mb-3 text-center">
              Réconciliation manuelle (Admin)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onManualReconcile('FAILED')}
                className="flex-1 py-2.5 rounded-xl font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all"
              >
                Marquer échoué
              </button>
              <button
                onClick={() => onManualReconcile('SUCCESS')}
                className="flex-1 py-2.5 rounded-xl font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all"
              >
                Marquer réussi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentDetailModal;
