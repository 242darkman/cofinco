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
      const receiptRoot = element.hasAttribute('data-receipt-root')
        ? element
        : element.querySelector<HTMLElement>('[data-receipt-root]');
      const canvasTarget = receiptRoot || element;

      const canvas = await html2canvas(canvasTarget, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          // --- Helpers ---
          const hasOkl = (v: string | null | undefined) =>
            !!v && (v.toLowerCase().includes('oklch(') || v.toLowerCase().includes('oklab('));

          // Remplace toute fonction oklch()/oklab() par une couleur sûre
          const sanitizeColorFunctions = (v: string) =>
            v
              .replace(/oklch\([^)]*\)/gi, '#0f172a') // slate-900-ish
              .replace(/oklab\([^)]*\)/gi, '#0f172a');

          // --- 1) rendre le template visible si masqué hors print ---
          const root = doc.querySelector('[data-receipt-root]') as HTMLElement | null;
          if (root) {
            root.style.display = 'block';
            root.style.visibility = 'visible';
            root.style.opacity = '1';
          }

          // --- 3) Patch des styles inline: style="...oklch(...)" ---
          doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
            const styleAttr = el.getAttribute('style');
            if (hasOkl(styleAttr)) {
              el.setAttribute('style', sanitizeColorFunctions(styleAttr!));
            }
          });

          // --- 4) Patch des attributs SVG qui peuvent contenir oklch/oklab ---
          // Important: html2canvas plante souvent ici (SVGElementContainer)
          const svgColorAttrs = [
            'fill',
            'stroke',
            'stop-color',
            'flood-color',
            'lighting-color',
            'color',
          ] as const;

          doc.querySelectorAll<SVGElement>('svg, svg *').forEach((el) => {
            for (const a of svgColorAttrs) {
              const v = el.getAttribute(a);
              if (hasOkl(v)) el.setAttribute(a, sanitizeColorFunctions(v!));
            }

            // style="" sur svg nodes aussi
            const styleAttr = el.getAttribute('style');
            if (hasOkl(styleAttr)) el.setAttribute('style', sanitizeColorFunctions(styleAttr!));
          });

          // --- 5) (Optionnel mais très efficace) neutraliser gradients & filters SVG ---
          doc.querySelectorAll('svg linearGradient, svg radialGradient, svg filter').forEach((n) => n.remove());

          // --- 6) Fallback via computed styles (quand accessible) ---
          const props = [
            'color',
            'background-color',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
            'outline-color',
            'text-decoration-color',
          ] as const;

          doc.querySelectorAll<HTMLElement>('*').forEach((node) => {
            const cs = doc.defaultView?.getComputedStyle(node);
            if (!cs) return;

            const bgImage = cs.getPropertyValue('background-image');
            if (bgImage && (hasOkl(bgImage) || bgImage.toLowerCase().includes('gradient'))) {
              node.style.setProperty('background-image', 'none', 'important');
              const bgColor = cs.getPropertyValue('background-color');
              if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
                node.style.setProperty('background-color', '#ffffff', 'important');
              }
            }

            for (const p of props) {
              const v = cs.getPropertyValue(p);
              if (!hasOkl(v)) continue;

              // Fallbacks simples
              if (p === 'background-color') {
                node.style.setProperty(p, '#ffffff', 'important');
              } else if (p === 'color') {
                node.style.setProperty(p, '#0f172a', 'important');
              } else {
                node.style.setProperty(p, '#cbd5e1', 'important'); // slate-300-ish
              }
            }
          });
        },
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Le canvas généré est vide ou invalide');
      }

      const imgData = canvas.toDataURL('image/png');
      
      if (!imgData || !imgData.startsWith('data:image/png;base64,')) {
        throw new Error('Les données de l\'image sont corrompues');
      }
      
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
        let position = 0;
        let heightLeft = imgHeight;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position -= pdfHeight;
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
