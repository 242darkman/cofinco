import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2, X, Copy,
  ChevronDown, ChevronUp, Clock, User,
  Wallet, CreditCard, Building2, ArrowRight, Sparkles, Check, Receipt
} from 'lucide-react';
import { ReceiptData } from '../../../ui/printable/ReceiptTemplate';
import { toast } from 'sonner';
import { formatClientName } from '@/lib/format';
import { ReceiptActions } from '../../shared/ReceiptActions';
import { currencySymbol } from '@shared/config/currency';

// Sparkle position configuration
interface SparkleConfig {
  top: string;
  left?: string;
  right?: string;
  size: number;
  color: string;
  delay: string;
}

// Generate random sparkle positions
const generateSparklePositions = (isDebit: boolean): SparkleConfig[] => {
  const colors = isDebit
    ? ['text-status-warning/40', 'text-status-warning/30', 'text-status-warning/30']
    : ['text-status-success/40', 'text-accent/30', 'text-accent/30'];

  return Array.from({ length: 5 }, (_, i) => ({
    top: `${Math.random() * 70 + 10}%`,
    ...(Math.random() > 0.5
      ? { left: `${Math.random() * 30 + 5}%` }
      : { right: `${Math.random() * 30 + 5}%` }),
    size: Math.floor(Math.random() * 8) + 10,
    color: colors[i % colors.length],
    delay: `${i * 150}ms`,
  }));
};

export interface UniversalPaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  data?: ReceiptData;
  factureId?: string;
  /** Optional term/label for display (unused but kept for compat) */
  term?: string;
}

// Copy to clipboard helper
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copié !`);
  } catch {
    toast.error('Erreur lors de la copie');
  }
};

export const UniversalPaymentSuccessModal: React.FC<UniversalPaymentSuccessModalProps> = ({
  isOpen,
  onClose,
  data,
  factureId
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // Extract values with defaults for type safety
  const reference = data?.reference || '';
  const total = data?.total || 0;
  const devise = data?.devise || currencySymbol();
  const date = data?.date ? new Date(data.date) : new Date();
  const type = data?.type || '';
  const modePaiement = data?.modePaiement || 'Espèces';

  const isDebit = ['Retrait', 'Décaissement', 'Prêt', 'Versement coffre'].some(
    t => type.toLowerCase().includes(t.toLowerCase())
  );

  // Generate random sparkle positions (memoized per open state)
  const sparklePositions = useMemo(
    () => (isOpen ? generateSparklePositions(isDebit) : []),
    [isOpen, isDebit]
  );

  // Animation sequence
  useEffect(() => {
    if (isOpen) {
      setAnimationComplete(false);
      const timer = setTimeout(() => setAnimationComplete(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Copy reference
  const handleCopyReference = async () => {
    if (!reference) {
      toast.error('Aucune référence à copier');
      return;
    }
    await copyToClipboard(reference, 'Référence');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if reference is available for copy
  const hasReference = Boolean(reference && reference !== 'N/A');

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Modal Container - Mobile: Bottom sheet, Desktop: Centered */}
      <div className="bg-surface-base w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-500 max-h-[95vh] flex flex-col">

        {/* Mobile Handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-surface-elevated" />
        </div>

        {/* Success Animation Header */}
        <div className="relative bg-gradient-to-br from-status-success/20 via-emerald-500/10 to-transparent p-6 sm:p-8 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0 overflow-hidden">
            <div className={`absolute -top-20 -right-20 w-40 h-40 ${isDebit ? 'bg-status-warning-bg' : 'bg-status-success-bg'} rounded-full blur-3xl animate-pulse`} />
            <div className={`absolute -bottom-10 -left-10 w-32 h-32 ${isDebit ? 'bg-status-warning-bg' : 'bg-accent/10'} rounded-full blur-2xl`} />
            {/* Confetti-like particles with randomized positions */}
            {animationComplete && sparklePositions.map((sparkle, index) => (
              <Sparkles
                key={index}
                className={`absolute animate-bounce ${sparkle.color}`}
                style={{
                  top: sparkle.top,
                  left: sparkle.left,
                  right: sparkle.right,
                  animationDelay: sparkle.delay,
                }}
                size={sparkle.size}
              />
            ))}
          </div>

          {/* Close button - Desktop */}
          <button
            onClick={onClose}
            className="hidden sm:flex absolute top-4 right-4 w-8 h-8 rounded-full bg-surface/50 hover:bg-surface-elevated items-center justify-center text-content-muted hover:text-content-primary transition-all"
          >
            <X size={16} />
          </button>

          {/* Success Icon with Animation */}
          <div className="relative flex flex-col items-center">
            <div className={`
              relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mb-4
              ${isDebit ? 'bg-status-warning' : 'bg-status-success'}
              shadow-[0_0_40px_rgba(16,185,129,0.4)]
              ring-4 ring-white/10
              transform transition-all duration-700
              ${animationComplete ? 'scale-100' : 'scale-0'}
            `}>
              {/* Ripple effect */}
              <div className={`absolute inset-0 rounded-full ${isDebit ? 'bg-status-warning' : 'bg-status-success'} animate-ping opacity-20`} />
              <CheckCircle2 size={40} className="text-content-primary relative z-10" strokeWidth={2.5} />
            </div>

            <h2 className={`
              text-xl sm:text-2xl font-bold text-content-primary mb-2
              transform transition-all duration-500 delay-200
              ${animationComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}>
              {isDebit ? 'Décaissement Effectué' : 'Paiement Réussi'}
            </h2>

            {/* Reference Badge - Tappable to copy */}
            <button
              onClick={handleCopyReference}
              disabled={!hasReference}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-full
                ${isDebit ? 'bg-status-warning-bg border-status-warning/30' : 'bg-status-success-bg border-status-success/30'}
                border backdrop-blur-sm
                transition-all
                transform duration-500 delay-300
                ${animationComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
                ${hasReference ? 'active:scale-95 cursor-pointer' : 'cursor-default opacity-70'}
              `}
            >
              {copied ? (
                <>
                  <Check size={12} className="text-status-success" />
                  <span className="text-status-success text-sm font-medium">Copié !</span>
                </>
              ) : hasReference ? (
                <>
                  <span className={`text-sm font-mono font-medium ${isDebit ? 'text-status-warning' : 'text-status-success'}`}>
                    {reference}
                  </span>
                  <Copy size={12} className={isDebit ? 'text-status-warning/60' : 'text-status-success/60'} />
                </>
              ) : (
                <span className="text-sm text-content-muted italic">
                  Référence non disponible
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 sm:p-6 space-y-4">

            {/* Amount Display - Large and Clear */}
            <div className={`
              p-4 sm:p-5 rounded-2xl
              ${isDebit
                ? 'bg-gradient-to-br from-status-warning/10 to-status-warning/5 border border-status-warning/20'
                : 'bg-gradient-to-br from-status-success/10 to-accent/5 border border-status-success/20'
              }
            `}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-content-muted uppercase tracking-wider mb-1">Montant</p>
                  <p className={`text-3xl sm:text-4xl font-bold tabular-nums tracking-tight ${isDebit ? 'text-status-warning' : 'text-status-success'}`}>
                    {isDebit ? '-' : '+'}{new Intl.NumberFormat('fr-FR').format(total)}
                    <span className="text-base sm:text-lg font-normal text-content-muted ml-2">{devise}</span>
                  </p>
                </div>
                <div className={`
                  p-3 rounded-xl
                  ${isDebit ? 'bg-status-warning-bg' : 'bg-status-success-bg'}
                `}>
                  <Wallet size={24} className={isDebit ? 'text-status-warning' : 'text-status-success'} />
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-edge-subtle">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-content-muted" />
                  <span className="text-sm text-content-muted">
                    {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <span className="text-content-muted">•</span>
                <span className="text-sm text-content-muted">
                  {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Expandable Details Section */}
            <div className="rounded-xl border border-edge overflow-hidden">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full p-4 flex items-center justify-between bg-surface/30 hover:bg-surface/50 transition-colors"
              >
                <span className="text-sm font-medium text-content-secondary">Détails de la transaction</span>
                {showDetails ? (
                  <ChevronUp size={18} className="text-content-muted" />
                ) : (
                  <ChevronDown size={18} className="text-content-muted" />
                )}
              </button>

              {showDetails && (
                <div className="p-4 space-y-3 bg-surface-base/50 animate-in slide-in-from-top-2 duration-200">
                  {/* Type */}
                  <div className="flex items-center justify-between py-2 border-b border-edge/50">
                    <div className="flex items-center gap-2">
                      <Receipt size={14} className="text-content-muted" />
                      <span className="text-sm text-content-muted">Type</span>
                    </div>
                    <span className="text-sm font-medium text-content-primary">{type}</span>
                  </div>

                  {/* Mode de paiement */}
                  <div className="flex items-center justify-between py-2 border-b border-edge/50">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-content-muted" />
                      <span className="text-sm text-content-muted">Mode</span>
                    </div>
                    <span className="text-sm font-medium text-content-primary">{modePaiement}</span>
                  </div>

                  {/* Client */}
                  {data.client && (
                    <div className="flex items-center justify-between py-2 border-b border-edge/50">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-content-muted" />
                        <span className="text-sm text-content-muted">Client</span>
                      </div>
                      <span className="text-sm font-medium text-content-primary">
                        {formatClientName(data.client?.nom || '', data.client?.prenom)}
                      </span>
                    </div>
                  )}

                  {/* Agent */}
                  {data.agent && (
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-content-muted" />
                        <span className="text-sm text-content-muted">Agent</span>
                      </div>
                      <span className="text-sm font-medium text-content-primary">
                        {data.agent.prenom} {data.agent.nom}
                      </span>
                    </div>
                  )}

                  {/* Items breakdown */}
                  {data.items && data.items.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-edge">
                      <p className="text-xs text-content-muted uppercase tracking-wider mb-2">Détail</p>
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between py-1.5 text-sm">
                          <span className="text-content-muted">{item.description}</span>
                          <span className="text-content-primary font-mono">
                            {new Intl.NumberFormat('fr-FR').format(item.montant || 0)} F
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Receipt Actions - Shared Component */}
            <ReceiptActions
              data={data}
              showPreview={true}
              variant="default"
              factureId={factureId}
            />
          </div>
        </div>

        {/* Fixed Footer - Close Button */}
        <div className="p-4 border-t border-edge bg-surface-base/95 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="w-full py-4 flex items-center justify-center gap-2 text-content-muted hover:text-content-primary text-sm font-medium transition-colors rounded-xl hover:bg-surface/50 active:scale-[0.98]"
          >
            <span>Fermer et Nouvelle Opération</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
