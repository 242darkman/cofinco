import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, X, Copy,
  ChevronDown, ChevronUp, Clock, User,
  Wallet, CreditCard, Building2, ArrowRight, Sparkles, Check, Receipt
} from 'lucide-react';
import { ReceiptData } from '../../../ui/printable/ReceiptTemplate';
import { toast } from 'sonner';
import { formatClientName } from '@/lib/format';
import { ReceiptActions } from '../../shared/ReceiptActions';

interface UniversalPaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  term?: string;
  data?: ReceiptData;
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
  data
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

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
    if (!data || !data.reference) return;
    await copyToClipboard(data.reference, 'Référence');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !data) return null;

  // Extract values with defaults for type safety
  const reference = data.reference || '';
  const total = data.total || 0;
  const devise = data.devise || 'FCFA';
  const date = data.date ? new Date(data.date) : new Date();
  const type = data.type || '';
  const modePaiement = data.modePaiement || 'Espèces';

  const isDebit = ['Retrait', 'Décaissement', 'Prêt', 'Versement coffre'].some(
    t => type.toLowerCase().includes(t.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Modal Container - Mobile: Bottom sheet, Desktop: Centered */}
      <div className="bg-slate-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-500 max-h-[95vh] flex flex-col">

        {/* Mobile Handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-slate-700" />
        </div>

        {/* Success Animation Header */}
        <div className="relative bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent p-6 sm:p-8 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl" />
            {/* Confetti-like particles */}
            {animationComplete && (
              <>
                <Sparkles className="absolute top-4 right-8 text-emerald-400/40 animate-bounce" size={16} />
                <Sparkles className="absolute top-12 left-12 text-cyan-400/30 animate-bounce delay-100" size={12} />
                <Sparkles className="absolute bottom-8 right-16 text-amber-400/30 animate-bounce delay-200" size={14} />
              </>
            )}
          </div>

          {/* Close button - Desktop */}
          <button
            onClick={onClose}
            className="hidden sm:flex absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800/50 hover:bg-slate-700 items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <X size={16} />
          </button>

          {/* Success Icon with Animation */}
          <div className="relative flex flex-col items-center">
            <div className={`
              relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mb-4
              ${isDebit ? 'bg-amber-500' : 'bg-emerald-500'}
              shadow-[0_0_40px_rgba(16,185,129,0.4)]
              ring-4 ring-white/10
              transform transition-all duration-700
              ${animationComplete ? 'scale-100' : 'scale-0'}
            `}>
              {/* Ripple effect */}
              <div className={`absolute inset-0 rounded-full ${isDebit ? 'bg-amber-500' : 'bg-emerald-500'} animate-ping opacity-20`} />
              <CheckCircle2 size={40} className="text-white relative z-10" strokeWidth={2.5} />
            </div>

            <h2 className={`
              text-xl sm:text-2xl font-bold text-white mb-2
              transform transition-all duration-500 delay-200
              ${animationComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}>
              {isDebit ? 'Décaissement Effectué' : 'Paiement Réussi'}
            </h2>

            {/* Reference Badge - Tappable to copy */}
            <button
              onClick={handleCopyReference}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-full
                ${isDebit ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30'}
                border backdrop-blur-sm
                active:scale-95 transition-all
                transform duration-500 delay-300
                ${animationComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
              `}
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">Copié !</span>
                </>
              ) : (
                <>
                  <span className={`text-sm font-mono font-medium ${isDebit ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {reference}
                  </span>
                  <Copy size={12} className={isDebit ? 'text-amber-400/60' : 'text-emerald-400/60'} />
                </>
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
                ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20'
                : 'bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/20'
              }
            `}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Montant</p>
                  <p className={`text-3xl sm:text-4xl font-bold tabular-nums tracking-tight ${isDebit ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {isDebit ? '-' : '+'}{new Intl.NumberFormat('fr-FR').format(total)}
                    <span className="text-base sm:text-lg font-normal text-slate-500 ml-2">{devise}</span>
                  </p>
                </div>
                <div className={`
                  p-3 rounded-xl
                  ${isDebit ? 'bg-amber-500/20' : 'bg-emerald-500/20'}
                `}>
                  <Wallet size={24} className={isDebit ? 'text-amber-400' : 'text-emerald-400'} />
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-700/50">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-500" />
                  <span className="text-sm text-slate-400">
                    {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <span className="text-slate-600">•</span>
                <span className="text-sm text-slate-400">
                  {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Expandable Details Section */}
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full p-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-sm font-medium text-slate-300">Détails de la transaction</span>
                {showDetails ? (
                  <ChevronUp size={18} className="text-slate-500" />
                ) : (
                  <ChevronDown size={18} className="text-slate-500" />
                )}
              </button>

              {showDetails && (
                <div className="p-4 space-y-3 bg-slate-900/50 animate-in slide-in-from-top-2 duration-200">
                  {/* Type */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <Receipt size={14} className="text-slate-500" />
                      <span className="text-sm text-slate-500">Type</span>
                    </div>
                    <span className="text-sm font-medium text-white">{type}</span>
                  </div>

                  {/* Mode de paiement */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-slate-500" />
                      <span className="text-sm text-slate-500">Mode</span>
                    </div>
                    <span className="text-sm font-medium text-white">{modePaiement}</span>
                  </div>

                  {/* Client */}
                  {data.client && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-500" />
                        <span className="text-sm text-slate-500">Client</span>
                      </div>
                      <span className="text-sm font-medium text-white">
                        {formatClientName(data.client.nom, data.client.prenom)}
                      </span>
                    </div>
                  )}

                  {/* Agent */}
                  {data.agent && (
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-slate-500" />
                        <span className="text-sm text-slate-500">Agent</span>
                      </div>
                      <span className="text-sm font-medium text-white">
                        {data.agent.prenom} {data.agent.nom}
                      </span>
                    </div>
                  )}

                  {/* Items breakdown */}
                  {data.items && data.items.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Détail</p>
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between py-1.5 text-sm">
                          <span className="text-slate-400">{item.description}</span>
                          <span className="text-white font-mono">
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
            />
          </div>
        </div>

        {/* Fixed Footer - Close Button */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="w-full py-4 flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors rounded-xl hover:bg-slate-800/50 active:scale-[0.98]"
          >
            <span>Fermer et Nouvelle Opération</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
