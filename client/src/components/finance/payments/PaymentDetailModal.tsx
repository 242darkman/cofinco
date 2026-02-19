import React from 'react';
import { X, User, Phone, Calendar, Hash, CreditCard, Wallet, Building2, FileText, Clock, CheckCircle2, XCircle, AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
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
  // Cofinco client-facing fees
  feeOption?: string | null;
  clientFeeAmount?: string | null;
  clientFeeRate?: string | null;
  montantBrut?: string | null;
  montantNet?: string | null;
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
  CREATED: { bg: 'bg-surface-subtle/40', text: 'text-content-muted', icon: Clock },
  PENDING: { bg: 'bg-accent/10', text: 'text-accent', icon: Clock },
  SUCCESS: { bg: 'bg-status-success-bg', text: 'text-status-success', icon: CheckCircle2 },
  FAILED: { bg: 'bg-status-danger-bg', text: 'text-status-danger', icon: XCircle },
  EXPIRED: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: Clock },
  REVERSED: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: AlertTriangle },
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
      toast.success('Copié', { duration: 1500 });
    }
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={16} className="text-content-muted mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-content-muted uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-content-primary font-medium truncate">{value || '-'}</p>
          {copyable && typeof value === 'string' && value && (
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-surface-elevated/50 text-content-muted hover:text-content-primary transition-colors"
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
      <div className="relative bg-surface-base rounded-2xl border border-edge-subtle max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
          <div className="flex items-center gap-3">
            {payment.provider === 'MTN' ? (
              <div className="w-10 h-10 bg-status-warning-bg rounded-full flex items-center justify-center">
                <MTNLogo className="h-6 w-6" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-status-danger-bg rounded-full flex items-center justify-center">
                <AirtelLogo className="h-6 w-6" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-content-primary">
                {payment.type === 'COLLECTION' ? 'Collection' : 'Décaissement'}
              </h3>
              <p className="text-xs text-content-muted">{payment.provider} Mobile Money</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status & Amount Card */}
          <div className="bg-surface/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${status.bg} ${status.text}`}>
                <StatusIcon size={12} />
                {ALL_STATUS_LABELS[payment.status] || payment.status}
              </span>
              <span className="text-xs text-content-muted">
                {formatDate(payment.createdAt)}
              </span>
            </div>
            <p className="text-3xl font-bold text-content-primary text-center">
              {Number(payment.amount).toLocaleString()} <span className="text-lg text-content-muted">FCFA</span>
            </p>
          </div>

          {/* Fee Breakdown (if Cofinco client fees apply) */}
          {payment.clientFeeAmount && Number(payment.clientFeeAmount) > 0 && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <h5 className="text-xs font-semibold text-accent mb-3">
                Détails frais Mobile Money
              </h5>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Montant brut</span>
                  <span className="text-content-primary font-medium">
                    {Number(payment.montantBrut || 0).toLocaleString()} FCFA
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">
                    Frais MM ({payment.clientFeeRate || '0'}%)
                  </span>
                  <span className="text-status-warning font-medium">
                    {Number(payment.clientFeeAmount).toLocaleString()} FCFA
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-accent/20">
                  <span className="text-content-muted">
                    {payment.type === 'COLLECTION' ? 'Montant crédité' : 'Montant reçu'}
                  </span>
                  <span className="text-content-primary font-bold">
                    {Number(payment.montantNet || 0).toLocaleString()} FCFA
                  </span>
                </div>
                <p className="text-[10px] text-content-muted mt-1">
                  {payment.feeOption === 'CLIENT_PAYS'
                    ? 'Client paie les frais en plus du montant'
                    : 'Frais déduits du montant'}
                </p>
              </div>
            </div>
          )}

          {/* Transaction Info */}
          <div>
            <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
              Informations Transaction
            </h4>
            <div className="bg-surface/30 rounded-xl px-4 divide-y divide-edge">
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
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                Client
              </h4>
              <div className="bg-surface/30 rounded-xl px-4 divide-y divide-edge">
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
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                Crédit
              </h4>
              <div className="bg-surface/30 rounded-xl px-4 divide-y divide-edge">
                <InfoRow icon={CreditCard} label="N° Crédit" value={payment.credit.numeroCredit} />
                <InfoRow
                  icon={Wallet}
                  label="Solde restant"
                  value={`${Number(payment.credit.soldeRestant).toLocaleString()} FCFA`}
                />
              </div>

              {/* Allocation Breakdown */}
              {payment.allocation && (
                <div className="mt-3 bg-status-success/5 border border-status-success/20 rounded-xl p-4">
                  <h5 className="text-xs font-semibold text-status-success mb-3">
                    Allocation du remboursement
                  </h5>
                  <div className="space-y-2">
                    {payment.allocation.penalites > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-content-muted">Pénalités</span>
                        <span className="text-status-danger font-medium">
                          {payment.allocation.penalites.toLocaleString()} F
                        </span>
                      </div>
                    )}
                    {payment.allocation.interets > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-content-muted">Intérêts</span>
                        <span className="text-status-warning font-medium">
                          {payment.allocation.interets.toLocaleString()} F
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-content-muted">Principal</span>
                      <span className="text-status-success font-medium">
                        {payment.allocation.principal.toLocaleString()} F
                      </span>
                    </div>
                    <div className="pt-2 border-t border-status-success/20 flex justify-between text-xs">
                      <span className="text-content-muted">
                        Solde: {Number(payment.allocation.soldeAvant).toLocaleString()} F
                      </span>
                      <span className="text-status-success">
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
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                Compte Épargne
              </h4>
              <div className="bg-surface/30 rounded-xl px-4 divide-y divide-edge">
                <InfoRow icon={Wallet} label="N° Compte" value={payment.compte.numeroCompte} />
                <InfoRow icon={FileText} label="Type" value={payment.compte.typeCompte} />
              </div>
            </div>
          )}

          {/* Tontine Info */}
          {payment.tontine && (
            <div>
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                Tontine
              </h4>
              <div className="bg-surface/30 rounded-xl px-4">
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
            <div className="bg-status-danger-bg border border-status-danger/20 rounded-xl p-4">
              <h5 className="text-xs font-semibold text-status-danger mb-1">Erreur</h5>
              {payment.errorCode && (
                <p className="text-xs text-content-muted mb-1">Code: {payment.errorCode}</p>
              )}
              <p className="text-sm text-status-danger">{payment.errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer - Admin Actions */}
        {isAdmin && isPending && onManualReconcile && (
          <div className="border-t border-edge p-4">
            <p className="text-xs text-content-muted mb-3 text-center">
              Réconciliation manuelle (Admin)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onManualReconcile('FAILED')}
                className="flex-1 py-2.5 rounded-xl font-semibold text-status-danger bg-status-danger-bg hover:bg-status-danger-bg border border-status-danger/30 transition-all"
              >
                Marquer échoué
              </button>
              <button
                onClick={() => onManualReconcile('SUCCESS')}
                className="flex-1 py-2.5 rounded-xl font-semibold text-status-success bg-status-success-bg hover:bg-status-success-bg border border-status-success/30 transition-all"
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
