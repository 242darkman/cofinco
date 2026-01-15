import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

interface UseReceiptPDFOptions {
  filename?: string;
  format?: 'a4' | 'ticket';
}

export const useReceiptPDF = (options: UseReceiptPDFOptions = {}) => {
  const { filename = 'recu', format = 'a4' } = options;

  /**
   * Generate and download PDF from a React ref
   */
  const downloadPDF = async (elementRef: React.RefObject<HTMLElement | null>) => {
    if (!elementRef.current) {
      toast.error('Impossible de générer le PDF');
      return;
    }

    try {
      toast.info('Génération du PDF en cours...');

      const element = elementRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      
      // Determine PDF dimensions based on format
      const pdf = format === 'ticket' 
        ? new jsPDF('p', 'mm', [80, 200]) // Ticket format (80mm width)
        : new jsPDF('p', 'mm', 'a4');      // A4 format

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      // Add image to PDF
      if (imgHeight <= pdfHeight) {
        // Single page
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
        // Multiple pages
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      // Download
      pdf.save(`${filename}-${Date.now()}.pdf`);
      toast.success('PDF téléchargé !');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erreur lors de la génération du PDF');
    }
  };

  /**
   * Print using browser's print dialog
   */
  const print = useReactToPrint({
    documentTitle: filename,
  });

  return {
    downloadPDF,
    print,
  };
};
