import React from 'react';
import { X, CheckCircle2, XCircle, Loader2, Clock, AlertTriangle } from 'lucide-react';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';

const AirtelLogo = ({ className = '' }: { className?: string }) => (
  <img src={airtelLogo} alt="Airtel Money" className={className} />
);

const MTNLogo = ({ className = '' }: { className?: string }) => (
  <img src={mtnLogo} alt="MTN MoMo" className={className} />
);

export type PaymentStatus = 'CREATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'REVERSED';

export interface PaymentStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: PaymentStatus;
  provider: 'MTN' | 'AIRTEL';
  amount: number;
  phone: string;
  reference?: string;
  providerTxnId?: string;
  errorMessage?: string;
  clientFeeAmount?: number;
  montantNet?: number;
  onRetry?: () => void;
  onViewDetails?: () => void;
}

const statusConfig: Record<PaymentStatus, {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  bgColor: string;
  animate?: boolean;
}> = {
  CREATED: {
    icon: Clock,
    title: 'Initialisation',
    description: 'Préparation du paiement...',
    color: 'text-content-muted',
    bgColor: 'bg-surface-subtle/30',
    animate: true,
  },
  PENDING: {
    icon: Loader2,
    title: 'En attente',
    description: 'Confirmez le paiement sur votre téléphone',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    animate: true,
  },
  SUCCESS: {
    icon: CheckCircle2,
    title: 'Paiement confirmé',
    description: 'La transaction a été validée',
    color: 'text-status-success',
    bgColor: 'bg-status-success-bg',
  },
  FAILED: {
    icon: XCircle,
    title: 'Paiement échoué',
    description: 'La transaction n\'a pas pu être complétée',
    color: 'text-status-danger',
    bgColor: 'bg-status-danger-bg',
  },
  EXPIRED: {
    icon: Clock,
    title: 'Paiement expiré',
    description: 'Le délai de confirmation a expiré',
    color: 'text-status-warning',
    bgColor: 'bg-status-warning-bg',
  },
  REVERSED: {
    icon: AlertTriangle,
    title: 'Paiement annulé',
    description: 'La transaction a été annulée par le provider',
    color: 'text-status-warning',
    bgColor: 'bg-status-warning-bg',
  },
};

export function PaymentStatusModal({
  isOpen,
  onClose,
  status,
  provider,
  amount,
  phone,
  reference,
  providerTxnId,
  errorMessage,
  clientFeeAmount,
  montantNet,
  onRetry,
  onViewDetails,
}: PaymentStatusModalProps) {
  if (!isOpen) return null;

  const config = statusConfig[status];
  const Icon = config.icon;
  const isPending = status === 'CREATED' || status === 'PENDING';
  const isSuccess = status === 'SUCCESS';
  const isFailed = status === 'FAILED' || status === 'EXPIRED';

  const providerColor = provider === 'MTN' ? 'yellow' : 'red';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isPending ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-surface-base rounded-2xl border border-edge-subtle p-6 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
        {/* Close button (hidden during pending) */}
        {!isPending && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={18} />
          </button>
        )}

        {/* Provider Logo */}
        <div className="flex justify-center mb-4">
          {provider === 'MTN' ? (
            <div className="w-14 h-14 bg-status-warning-bg rounded-full flex items-center justify-center">
              <MTNLogo className="h-8 w-8" />
            </div>
          ) : (
            <div className="w-14 h-14 bg-status-danger-bg rounded-full flex items-center justify-center">
              <AirtelLogo className="h-8 w-8" />
            </div>
          )}
        </div>

        {/* Status Icon */}
        <div className={`flex justify-center mb-4`}>
          <div className={`p-3 rounded-full ${config.bgColor}`}>
            <Icon
              size={28}
              className={`${config.color} ${config.animate ? 'animate-spin' : ''}`}
            />
          </div>
        </div>

        {/* Status Title */}
        <h3 className={`text-lg font-bold text-center mb-1 ${config.color}`}>
          {config.title}
        </h3>

        {/* Status Description */}
        <p className="text-sm text-content-muted text-center mb-4">
          {errorMessage || config.description}
        </p>

        {/* Amount */}
        <div className={`py-3 px-4 rounded-xl mb-4 ${config.bgColor} text-center`}>
          <p className="text-xs text-content-muted mb-1">Montant</p>
          <p className={`text-2xl font-bold ${config.color}`}>
            {amount.toLocaleString()} <span className="text-sm">FCFA</span>
          </p>
        </div>

        {/* Fee info (on success with fees) */}
        {isSuccess && clientFeeAmount != null && clientFeeAmount > 0 && montantNet != null && (
          <p className="text-xs text-content-muted text-center mb-2">
            {montantNet.toLocaleString()} FCFA crédités (frais: {clientFeeAmount.toLocaleString()} FCFA)
          </p>
        )}

        {/* Phone */}
        <div className="flex items-center justify-center gap-2 text-sm text-content-muted mb-2">
          <span>Téléphone:</span>
          <span className="font-medium text-content-primary">{phone}</span>
        </div>

        {/* Reference */}
        {reference && (
          <p className="text-[10px] text-content-muted text-center mb-1">
            Réf: {reference.slice(0, 8)}...
          </p>
        )}

        {/* Provider Transaction ID */}
        {providerTxnId && (
          <p className="text-[10px] text-content-muted text-center mb-4">
            ID Provider: {providerTxnId}
          </p>
        )}

        {/* Actions */}
        <div className="space-y-2 mt-4">
          {isPending && (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-semibold text-content-muted bg-surface hover:bg-surface-elevated border border-edge transition-all"
            >
              Annuler
            </button>
          )}

          {isSuccess && (
            <>
              {onViewDetails && (
                <button
                  onClick={onViewDetails}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-status-success to-accent hover:from-status-success hover:to-accent transition-all"
                >
                  Voir les détails
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-content-muted bg-surface hover:bg-surface-elevated border border-edge transition-all"
              >
                Fermer
              </button>
            </>
          )}

          {isFailed && (
            <>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className={`w-full py-3 rounded-xl font-semibold text-content-primary bg-gradient-to-r ${
                    provider === 'MTN'
                      ? 'from-status-warning to-status-warning hover:from-status-warning hover:to-status-warning'
                      : 'from-status-danger to-status-danger hover:from-status-danger hover:to-status-danger'
                  } transition-all`}
                >
                  Réessayer
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-content-muted bg-surface hover:bg-surface-elevated border border-edge transition-all"
              >
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentStatusModal;
