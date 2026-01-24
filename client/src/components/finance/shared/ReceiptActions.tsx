import React, { useRef, useState, useCallback } from 'react';
import {
  Printer, FileText, Share2, Download, Copy, Receipt, Check, Mail
} from 'lucide-react';
import { ReceiptData, ReceiptTemplate } from '../../ui/printable/ReceiptTemplate';
import { InvoiceTemplate } from '../../ui/printable/InvoiceTemplate';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';
import { useReceiptPDF } from '@/hooks/finance/useReceiptPDF';

export interface ReceiptActionsProps {
  data: ReceiptData;
  /** Show preview of the receipt/invoice */
  showPreview?: boolean;
  /** Variant changes the visual style */
  variant?: 'default' | 'compact' | 'light';
  /** Show the reference badge with copy functionality */
  showReference?: boolean;
  /** Show email button */
  showEmail?: boolean;
  /** Custom class for the container */
  className?: string;
  /** Optional ID of the invoice from the backend */
  factureId?: string;
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
    return true;
  } catch {
    toast.error('Erreur lors de la copie');
    return false;
  }
};

/**
 * ReceiptActions - Shared component for viewing, printing, and exporting receipts/invoices.
 */
export const ReceiptActions: React.FC<ReceiptActionsProps> = ({
  data,
  showPreview = true,
  variant = 'default',
  showReference = false,
  showEmail = false,
  className = '',
  factureId
}) => {
  const [activeTab, setActiveTab] = useState<'ticket' | 'facture'>('ticket');
  const [copied, setCopied] = useState(false);

  // Extract values with defaults for type safety
  const reference = data.reference || '';
  const total = data.total || 0;
  const devise = data.devise || 'FCFA';
  const date = data.date ? new Date(data.date) : new Date();
  const type = data.type || '';

  // Refs for printing
  const ticketRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // PDF generation hook
  const { downloadPDF } = useReceiptPDF({
    filename: `${activeTab === 'ticket' ? 'Recu' : 'Facture'}-${reference}`,
    format: activeTab === 'ticket' ? 'ticket' : 'a4'
  });

  // Print handlers
  const handlePrintTicket = useReactToPrint({
    contentRef: ticketRef,
    documentTitle: `Ticket-${reference}`,
  });

  const handlePrintInvoice = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: `Facture-${reference}`,
  });

  const handlePrint = useCallback(() => {
    if (activeTab === 'ticket') {
      handlePrintTicket();
    } else {
      handlePrintInvoice();
    }
  }, [activeTab, handlePrintTicket, handlePrintInvoice]);

  // Copy reference
  const handleCopyReference = useCallback(async () => {
    if (!reference) return;
    const success = await copyToClipboard(reference, 'Référence');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [reference]);

  // Share functionality (Web Share API)
  const handleShare = useCallback(async () => {
    const shareData = {
      title: `Reçu ${type}`,
      text: `Transaction ${reference}\nMontant: ${formatMoney(total, devise)}\nDate: ${date.toLocaleDateString('fr-FR')}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      await copyToClipboard(shareData.text, 'Détails de la transaction');
    }
  }, [type, reference, total, devise, date]);

  // Download PDF
  const handleDownloadPDF = useCallback(() => {
    downloadPDF(activeTab === 'ticket' ? ticketRef : invoiceRef);
  }, [activeTab, downloadPDF]);

  // Email send (opens mail client)
  const handleSendEmail = useCallback(() => {
    const subject = encodeURIComponent(`Reçu Transaction ${reference}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVeuillez trouver ci-dessous les détails de la transaction:\n\n` +
      `Type: ${type}\n` +
      `Montant: ${formatMoney(total, devise)}\n` +
      `Référence: ${reference}\n` +
      `Date: ${date.toLocaleDateString('fr-FR')}\n\n` +
      `Cordialement`
    );

    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  }, [reference, type, total, devise, date]);

  const isDark = variant === 'default' || variant === 'compact';
  const isCompact = variant === 'compact';

  // Light variant styles (for TransactionDetailDrawer with light theme)
  const lightStyles = {
    container: 'bg-slate-50 dark:bg-slate-800/50',
    tabContainer: 'bg-slate-100 dark:bg-slate-950',
    tabActive: 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow',
    tabInactive: 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
    button: 'bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/50',
  };

  // Dark variant styles (for UniversalPaymentSuccessModal)
  const darkStyles = {
    container: 'bg-slate-900',
    tabContainer: 'bg-slate-950 border-slate-800',
    tabActive: 'bg-slate-800 text-white shadow-lg',
    tabInactive: 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50',
    button: 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border-slate-700/50',
  };

  const styles = isDark ? darkStyles : lightStyles;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Hidden Print Templates */}
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

      {/* Reference Badge */}
      {showReference && (
        <button
          onClick={handleCopyReference}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 active:scale-95 transition-all mx-auto"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 text-sm font-medium">Copié !</span>
            </>
          ) : (
            <>
              <span className="text-sm font-mono font-medium text-slate-300">
                {reference}
              </span>
              <Copy size={12} className="text-slate-400" />
            </>
          )}
        </button>
       )}

      {/* Print Options Section */}
      <div className="space-y-3">
        {!isCompact && (
          <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${isDark ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'}`}>
            Imprimer / Exporter
          </p>
        )}

        {/* Tabs: Ticket vs Facture */}
        <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl border ${styles.tabContainer}`}>
          <button
            onClick={() => setActiveTab('ticket')}
            className={`
              flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium
              transition-all duration-200
              ${activeTab === 'ticket' ? styles.tabActive : styles.tabInactive}
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
              ${activeTab === 'facture' ? styles.tabActive : styles.tabInactive}
            `}
          >
            <FileText size={16} />
            <span>Facture A4</span>
          </button>
        </div>

        {/* Primary Print Button */}
        <button
          onClick={handlePrint}
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
        <div className={`grid gap-3 ${showEmail ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button
            onClick={handleShare}
            className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-medium transition-all border active:scale-[0.98] ${styles.button}`}
          >
            <Share2 size={16} />
            <span>Partager</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-medium transition-all border active:scale-[0.98] ${styles.button}`}
          >
            <Download size={16} />
            <span>PDF</span>
          </button>
          {showEmail && (
            <button
              onClick={handleSendEmail}
              className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-medium transition-all border active:scale-[0.98] ${styles.button}`}
            >
              <Mail size={16} />
              <span>Email</span>
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {showPreview && activeTab === 'ticket' && (
        <div className={`rounded-xl border p-3 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/60'}`}>
          <p className={`text-[10px] uppercase tracking-wider mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'}`}>
            Prévisualisation Ticket
          </p>
          <div className="bg-white rounded-lg p-2">
            <ReceiptTemplate data={data} />
          </div>
        </div>
      )}

      {showPreview && activeTab === 'facture' && (
        <div className={`rounded-xl border p-3 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/60'}`}>
          <p className={`text-[10px] uppercase tracking-wider mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'}`}>
            Prévisualisation Facture
          </p>
          <div className="bg-white rounded-lg p-2 max-h-[300px] overflow-y-auto">
            <InvoiceTemplate data={data} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptActions;
