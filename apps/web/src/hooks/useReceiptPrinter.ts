import { useRef, useCallback, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ReceiptData } from '../components/ui/printable/ReceiptTemplate';

export function usePrinter() {
  const componentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printData, setPrintData] = useState<any | null>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: printData
      ? (printData.title
          ? `Print-${printData.title}`
          : printData.transaction?.id
            ? `Document-${printData.transaction.id}`
            : `Document-${Date.now()}`)
      : 'Print-Document',
    onAfterPrint: () => {
      setIsPrinting(false);
    },
    onPrintError: (error) => {
      setIsPrinting(false);
      console.error('Print failed:', error);
    }
  });

  const print = useCallback((data: any) => {
    setPrintData(data);
    setIsPrinting(true);
    // Use a timeout to allow state to update and render the hidden template before printing
    setTimeout(() => {
      handlePrint();
    }, 100);
  }, [handlePrint]);

  return {
    componentRef,
    printData,
    print,
    isPrinting
  };
}
