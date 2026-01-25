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
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    animate: true,
  },
  PENDING: {
    icon: Loader2,
    title: 'En attente',
    description: 'Confirmez le paiement sur votre téléphone',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    animate: true,
  },
  SUCCESS: {
    icon: CheckCircle2,
    title: 'Paiement confirmé',
    description: 'La transaction a été validée avec succès',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  FAILED: {
    icon: XCircle,
    title: 'Paiement échoué',
    description: 'La transaction n\'a pas pu être complétée',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  EXPIRED: {
    icon: Clock,
    title: 'Paiement expiré',
    description: 'Le délai de confirmation a expiré',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  REVERSED: {
    icon: AlertTriangle,
    title: 'Paiement annulé',
    description: 'La transaction a été annulée par le provider',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
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
      <div className="relative bg-slate-900 rounded-2xl border border-slate-700/50 p-6 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
        {/* Close button (hidden during pending) */}
        {!isPending && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}

        {/* Provider Logo */}
        <div className="flex justify-center mb-4">
          {provider === 'MTN' ? (
            <div className="w-14 h-14 bg-yellow-500/10 rounded-full flex items-center justify-center">
              <MTNLogo className="h-8 w-8" />
            </div>
          ) : (
            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
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
        <p className="text-sm text-slate-400 text-center mb-4">
          {errorMessage || config.description}
        </p>

        {/* Amount */}
        <div className={`py-3 px-4 rounded-xl mb-4 ${config.bgColor} text-center`}>
          <p className="text-xs text-slate-400 mb-1">Montant</p>
          <p className={`text-2xl font-bold ${config.color}`}>
            {amount.toLocaleString()} <span className="text-sm">FCFA</span>
          </p>
        </div>

        {/* Phone */}
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-2">
          <span>Téléphone:</span>
          <span className="font-medium text-white">{phone}</span>
        </div>

        {/* Reference */}
        {reference && (
          <p className="text-[10px] text-slate-600 text-center mb-1">
            Réf: {reference.slice(0, 8)}...
          </p>
        )}

        {/* Provider Transaction ID */}
        {providerTxnId && (
          <p className="text-[10px] text-slate-500 text-center mb-4">
            ID Provider: {providerTxnId}
          </p>
        )}

        {/* Actions */}
        <div className="space-y-2 mt-4">
          {isPending && (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
            >
              Annuler
            </button>
          )}

          {isSuccess && (
            <>
              {onViewDetails && (
                <button
                  onClick={onViewDetails}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-all"
                >
                  Voir les détails
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
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
                  className={`w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r ${
                    provider === 'MTN'
                      ? 'from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500'
                      : 'from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500'
                  } transition-all`}
                >
                  Réessayer
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
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
