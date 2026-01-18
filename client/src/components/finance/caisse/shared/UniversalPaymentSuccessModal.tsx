import React, { useRef, useState, useEffect } from 'react';
import {
  CheckCircle2, Printer, FileText, Share2, Download, X, Copy,
  Smartphone, Receipt, ChevronDown, ChevronUp, Clock, User,
  Wallet, CreditCard, Building2, ArrowRight, Sparkles, Check
} from 'lucide-react';
import { Button } from '../../../ui';
import { ReceiptData, ReceiptTemplate } from '../../../ui/printable/ReceiptTemplate';
import { InvoiceTemplate } from '../../../ui/printable/InvoiceTemplate';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';
import { useReceiptPDF } from '@/hooks/finance/useReceiptPDF';
import { formatClientName } from '@/lib/format';

interface UniversalPaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  term?: string;
  data?: ReceiptData;
  factureId?: string; // ID de la facture générée par le backend
}

// Format money helper
const formatMoney = (amount: number, devise = 'FCFA') => {
  return `${new Intl.NumberFormat('fr-FR').format(amount)} ${devise}`;
};

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
  const [activeTab, setActiveTab] = useState<'ticket' | 'facture'>('ticket');
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // Refs for printing
  const ticketRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  
  // PDF generation hook
  const { downloadPDF } = useReceiptPDF({
    filename: data
      ? `${activeTab === 'ticket' ? 'Recu' : 'Facture'}-${data.reference}`
      : activeTab === 'ticket'
        ? 'Recu'
        : 'Facture',
    format: activeTab === 'ticket' ? 'ticket' : 'a4'
  });

  // Animation sequence
  useEffect(() => {
    if (isOpen) {
      setAnimationComplete(false);
      const timer = setTimeout(() => setAnimationComplete(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Print handlers
  const handlePrintTicket = useReactToPrint({
    contentRef: ticketRef,
    documentTitle: data ? `Ticket-${data.reference}` : 'Ticket',
  });

  const handlePrintInvoice = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: data ? `Facture-${data.reference}` : 'Facture',
  });

  // Copy reference
  const handleCopyReference = async () => {
    if (!data) return;
    await copyToClipboard(data.reference, 'Référence');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Share functionality (Web Share API)
  const handleShare = async () => {
    if (!data) return;

    const shareData = {
      title: `Reçu ${data.type}`,
      text: `Transaction ${data.reference}\nMontant: ${formatMoney(data.total, data.devise)}\nDate: ${new Date(data.date).toLocaleDateString('fr-FR')}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or error
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      await copyToClipboard(shareData.text, 'Détails de la transaction');
    }
  };

  if (!isOpen || !data) return null;

  const isDebit = ['Retrait', 'Décaissement', 'Prêt', 'Versement coffre'].some(
    type => data.type?.toLowerCase().includes(type.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Hidden Print Templates (offscreen, not display:none) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: '0',
          width: '210mm',
          background: 'white',
          zIndex: -1,
        }}
      >
        <ReceiptTemplate ref={ticketRef} data={data} />
        <InvoiceTemplate ref={invoiceRef} data={data} />
      </div>

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
                    {data.reference}
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
                    {isDebit ? '-' : '+'}{new Intl.NumberFormat('fr-FR').format(data.total)}
                    <span className="text-base sm:text-lg font-normal text-slate-500 ml-2">{data.devise || 'FCFA'}</span>
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
                    {new Date(data.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <span className="text-slate-600">•</span>
                <span className="text-sm text-slate-400">
                  {new Date(data.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
                    <span className="text-sm font-medium text-white">{data.type}</span>
                  </div>

                  {/* Mode de paiement */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-slate-500" />
                      <span className="text-sm text-slate-500">Mode</span>
                    </div>
                    <span className="text-sm font-medium text-white">{data.modePaiement}</span>
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
                            {new Intl.NumberFormat('fr-FR').format(item.montant)} F
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Print Options Tabs */}
            <div className="space-y-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold px-1">
                Imprimer / Exporter
              </p>

              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('ticket')}
                  className={`
                    flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${activeTab === 'ticket'
                      ? 'bg-slate-800 text-white shadow-lg'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }
                  `}
                >
                  <Receipt size={16} />
                  <span>Ticket</span>
                </button>
                <button
                  onClick={() => setActiveTab('facture')}
                  className={`
                    flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${activeTab === 'facture'
                      ? 'bg-slate-800 text-white shadow-lg'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }
                  `}
                >
                  <FileText size={16} />
                  <span>Facture A4</span>
                </button>
              </div>

              {/* Print Button */}
              <button
                onClick={activeTab === 'ticket' ? handlePrintTicket : handlePrintInvoice}
                className={`
                  w-full py-4 rounded-xl font-bold text-white
                  flex items-center justify-center gap-3
                  active:scale-[0.98] transition-all
                  ${activeTab === 'ticket'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25'
                  }
                `}
              >
                <Printer size={20} />
                <span>Imprimer {activeTab === 'ticket' ? 'Ticket' : 'Facture'}</span>
              </button>

              {/* Secondary Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-medium transition-all border border-slate-700/50 active:scale-[0.98]"
                >
                  <Share2 size={16} />
                  <span>Partager</span>
                </button>
                <button
                  onClick={() => downloadPDF(activeTab === 'ticket' ? ticketRef : invoiceRef)}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-medium transition-all border border-slate-700/50 active:scale-[0.98]"
                >
                  <Download size={16} />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {activeTab === 'ticket' && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                  Prévisualisation Ticket
                </p>
                <div className="bg-white rounded-lg p-2">
                  <ReceiptTemplate data={data} />
                </div>
              </div>
            )}
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
