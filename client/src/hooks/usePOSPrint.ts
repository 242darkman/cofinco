/**
 * usePOSPrint - POS Thermal Printer Service
 * 
 * Provides abstraction for printing receipts on POS devices.
 * Supports multiple backends: Browser Print, Bluetooth ESC/POS, USB Serial.
 */

import { useCallback, useState } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { ReceiptData } from '@/components/ui/printable/ReceiptTemplate';
import { currencySymbol } from '@shared/config/currency';

type PrintBackend = 'browser' | 'escpos' | 'usb';

interface POSPrintOptions {
  copies?: number;
  silent?: boolean;
  paperWidth?: number; // mm
}

interface POSPrintResult {
  success: boolean;
  error?: string;
}

export function usePOSPrint() {
  const { branding } = useBranding();
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  /**
   * Detect available print backend
   */
  const detectBackend = useCallback((): PrintBackend => {
    // Check for Bluetooth/SerialPort APIs (future)
    // For now, default to browser print
    return 'browser';
  }, []);

  /**
   * Format receipt data to printable HTML
   */
  const formatReceiptHTML = useCallback((data: ReceiptData): string => {
    const formatMoney = (amount: number) =>
      new Intl.NumberFormat('fr-FR').format(amount).replace(/[\u00A0\u202F]/g, ' ');

    const formatDate = (date: Date | string): string => {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const itemsTotal = data.items?.reduce((sum, item) => sum + (item.montant || 0), 0) || 0;
    const amount = data.transaction?.amount ?? data.total ?? itemsTotal;
    const reference = data.transaction?.id || data.reference || 'N/A';
    const type = data.transaction?.type || data.type || data.title || 'Transaction';
    const date = data.transaction?.date || data.date || new Date();
    const currency = data.devise || currencySymbol();
    const cashierName =
      data.transaction?.cashierName ||
      [data.agent?.prenom, data.agent?.nom].filter(Boolean).join(' ').trim() ||
      '';
    const clientName = [data.client?.nom, data.client?.prenom].filter(Boolean).join(' ').trim();
    const details =
      data.details?.length
        ? data.details
        : data.items?.map(item => ({
            label: item.details ? `${item.description} - ${item.details}` : item.description,
            value: `${formatMoney(item.montant)} ${currency}`
          })) || [];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reçu ${reference}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-width: 80mm;
            margin: 0 auto;
            padding: 5mm;
            color: #000;
            background: #fff;
          }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .title { font-size: 16px; font-weight: bold; }
          .subtitle { font-size: 10px; color: #666; }
          .info-row { display: flex; justify-content: space-between; margin: 4px 0; }
          .label { color: #666; }
          .value { font-weight: bold; text-align: right; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .total-row { font-size: 18px; font-weight: bold; text-align: center; margin: 12px 0; }
          .footer { text-align: center; font-size: 10px; color: #666; margin-top: 16px; }
          .qr { text-align: center; margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${branding.appName}</div>
          <div class="subtitle">${data.title || 'REÇU'}</div>
        </div>
        
        <div class="info-row">
          <span class="label">Ref:</span>
          <span class="value">${reference}</span>
        </div>
        <div class="info-row">
          <span class="label">Date:</span>
          <span class="value">${formatDate(date)}</span>
        </div>
        <div class="info-row">
          <span class="label">Type:</span>
          <span class="value">${type}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="info-row">
          <span class="label">Client:</span>
          <span class="value">${clientName}</span>
        </div>
        ${data.client?.telephone ? `
        <div class="info-row">
          <span class="label">Tél:</span>
          <span class="value">${data.client.telephone}</span>
        </div>
        ` : ''}
        
        <div class="divider"></div>
        
        ${details.map(detail => `
        <div class="info-row">
          <span>${detail.label}</span>
          <span class="value">${detail.value}</span>
        </div>
        `).join('') || ''}
        
        <div class="divider"></div>
        
        <div class="total-row">
          TOTAL: ${formatMoney(amount)} ${currency}
        </div>
        
        <div class="info-row">
          <span class="label">Mode:</span>
          <span class="value">${data.modePaiement || 'Espèces'}</span>
        </div>
        
        ${cashierName ? `
        <div class="info-row">
          <span class="label">Agent:</span>
          <span class="value">${cashierName}</span>
        </div>
        ` : ''}
        
        ${data.notes ? `
        <div class="divider"></div>
        <div style="font-size: 10px; color: #666;">${data.notes}</div>
        ` : ''}
        
        <div class="footer">
          <p>Merci pour votre confiance!</p>
          <p>--- FIN DU REÇU ---</p>
        </div>
      </body>
      </html>
    `;
  }, [branding.appName]);

  /**
   * Print receipt using browser print dialog
   */
  const printBrowser = useCallback(async (html: string, options: POSPrintOptions): Promise<POSPrintResult> => {
    try {
      const printWindow = window.open('', '_blank', 'width=300,height=600');
      if (!printWindow) {
        return { success: false, error: 'Popup bloqué. Autorisez les popups.' };
      }

      printWindow.document.write(html);
      printWindow.document.close();
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (options.silent) {
        printWindow.print();
        setTimeout(() => printWindow.close(), 1000);
      } else {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Main print function
   */
  const print = useCallback(async (
    data: ReceiptData, 
    options: POSPrintOptions = {}
  ): Promise<POSPrintResult> => {
    setIsPrinting(true);
    setLastError(null);

    try {
      const backend = detectBackend();
      const html = formatReceiptHTML(data);

      let result: POSPrintResult;

      switch (backend) {
        case 'escpos':
          // Future: ESC/POS Bluetooth implementation
          result = await printBrowser(html, options);
          break;
        case 'usb':
          // Future: USB Serial implementation
          result = await printBrowser(html, options);
          break;
        case 'browser':
        default:
          result = await printBrowser(html, options);
      }

      if (!result.success) {
        setLastError(result.error || 'Erreur impression');
      }

      return result;
    } catch (error: any) {
      const errorMsg = error.message || 'Erreur impression inconnue';
      setLastError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsPrinting(false);
    }
  }, [detectBackend, formatReceiptHTML, printBrowser]);

  /**
   * Auto-print on success (convenience wrapper)
   */
  const autoPrint = useCallback(async (data: ReceiptData) => {
    return print(data, { silent: true, copies: 1 });
  }, [print]);

  return {
    print,
    autoPrint,
    isPrinting,
    lastError,
    clearError: () => setLastError(null)
  };
}

export default usePOSPrint;
