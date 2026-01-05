import { useRef, useCallback, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ReceiptData } from '../components/ui/printable/ReceiptTemplate';

export function useReceiptPrinter() {
  const componentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: receiptData ? `Recu-${receiptData.reference}` : 'Recu-COFIN',
    onAfterPrint: () => {
      setIsPrinting(false);
    },
    onPrintError: (error) => {
      setIsPrinting(false);
      console.error('Print failed:', error);
    }
  });

  const printReceipt = useCallback((data: ReceiptData) => {
    setReceiptData(data);
    setIsPrinting(true);
    // Use a timeout to allow state to update and render the hidden template before printing
    setTimeout(() => {
      handlePrint();
    }, 100);
  }, [handlePrint]);

  return {
    componentRef,
    receiptData,
    printReceipt,
    isPrinting
  };
}
