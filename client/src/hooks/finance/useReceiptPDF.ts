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
          // P4.2: Optimized - single DOM pass instead of multiple querySelectorAll('*')
          // --- Helpers ---
          const OKL_REGEX = /ok(?:lch|lab)\(/i;
          const hasOkl = (v: string | null | undefined) => !!v && OKL_REGEX.test(v);

          const sanitizeColorFunctions = (v: string) =>
            v.replace(/oklch\([^)]*\)/gi, '#0f172a').replace(/oklab\([^)]*\)/gi, '#0f172a');

          // --- 1) Rendre le template visible si masqué hors print ---
          const root = doc.querySelector('[data-receipt-root]') as HTMLElement | null;
          if (root) {
            root.style.display = 'block';
            root.style.visibility = 'visible';
            root.style.opacity = '1';
          }

          // --- 2) Remove SVG gradients/filters upfront (single query) ---
          doc.querySelectorAll('svg linearGradient, svg radialGradient, svg filter').forEach((n) => n.remove());

          // --- 3) Single pass for all elements (merged from 3 separate loops) ---
          const svgColorAttrs = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
          const cssProps = [
            'color', 'background-color', 'border-top-color', 'border-right-color',
            'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color',
          ];
          const defaultView = doc.defaultView;

          // Use TreeWalker for efficient DOM traversal (faster than querySelectorAll)
          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
          let node: Element | null = walker.currentNode as Element;

          while (node) {
            const el = node as HTMLElement;
            const isSvgElement = el.namespaceURI === 'http://www.w3.org/2000/svg';

            // Patch inline style attribute
            const styleAttr = el.getAttribute('style');
            if (hasOkl(styleAttr)) {
              el.setAttribute('style', sanitizeColorFunctions(styleAttr!));
            }

            // SVG-specific: patch color attributes
            if (isSvgElement) {
              for (const attr of svgColorAttrs) {
                const v = el.getAttribute(attr);
                if (hasOkl(v)) el.setAttribute(attr, sanitizeColorFunctions(v!));
              }
            }

            // Computed styles fallback (only if defaultView available)
            if (defaultView && el.style) {
              try {
                const cs = defaultView.getComputedStyle(el);

                // Handle gradient backgrounds
                const bgImage = cs.getPropertyValue('background-image');
                if (bgImage && (hasOkl(bgImage) || bgImage.includes('gradient'))) {
                  el.style.setProperty('background-image', 'none', 'important');
                  const bgColor = cs.getPropertyValue('background-color');
                  if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
                    el.style.setProperty('background-color', '#ffffff', 'important');
                  }
                }

                // Fix oklch/oklab colors in computed styles
                for (const p of cssProps) {
                  const v = cs.getPropertyValue(p);
                  if (!hasOkl(v)) continue;

                  if (p === 'background-color') {
                    el.style.setProperty(p, '#ffffff', 'important');
                  } else if (p === 'color') {
                    el.style.setProperty(p, '#0f172a', 'important');
                  } else {
                    el.style.setProperty(p, '#cbd5e1', 'important');
                  }
                }
              } catch {
                // Skip elements that can't be styled
              }
            }

            node = walker.nextNode() as Element | null;
          }
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
