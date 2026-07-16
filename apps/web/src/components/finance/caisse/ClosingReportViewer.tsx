import React, { useRef, useState, useEffect } from 'react';
import { Download, Printer } from 'lucide-react';
import { Modal } from '@/components/ui';
import Button from '@/components/ui/Button';
import { ClosingReportTemplate } from '@/components/ui/printable/ClosingReportTemplate';
import { useReceiptPDF } from '@/hooks/finance/useReceiptPDF';
import { type ClosureReportData, formatDate } from '@/hooks/finance/useClosurePDF';

interface ClosingReportViewerProps {
  isOpen: boolean;
  onClose: () => void;
  data: ClosureReportData;
}

export const ClosingReportViewer: React.FC<ClosingReportViewerProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const offscreenRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const filename = `cloture_${data.caisseNom.replace(/\s+/g, '_')}_${formatDate(data.closedAt).replace(/\//g, '-')}`;

  const { downloadPDF, print } = useReceiptPDF({
    filename,
    format: 'a4',
    contentRef: printRef,
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadPDF(offscreenRef);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (printRef.current) {
      print();
    }
  };

  // Scale-to-fit preview
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    if (!isOpen) return;
    const compute = () => {
      // A4 at 96dpi: 794 x 1123 px
      const s = Math.min(
        (window.innerWidth - 96) / 794,
        (window.innerHeight - 240) / 1123,
        1
      );
      setScale(Math.max(0.3, s));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rapport de Cloture"
      size="xl"
      footer={
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            onClick={handlePrint}
            className="flex-1"
            icon={Printer}
          >
            Imprimer
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 bg-status-success hover:bg-status-success text-white"
            icon={Download}
            isLoading={isDownloading}
            loadingText="Generation..."
          >
            Telecharger PDF
          </Button>
        </div>
      }
    >
      {/* Off-screen render for PDF generation */}
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
        <ClosingReportTemplate ref={offscreenRef} data={data} />
      </div>

      {/* Hidden print-only render */}
      <div className="hidden print:block">
        <ClosingReportTemplate ref={printRef} data={data} />
      </div>

      {/* On-screen preview with scale-to-fit */}
      <div className="no-print overflow-auto bg-surface-muted rounded-lg p-4 flex justify-center">
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            width: '210mm',
            minHeight: '297mm',
          }}
        >
          <div className="shadow-2xl rounded-lg overflow-hidden">
            <ClosingReportTemplate data={data} />
          </div>
        </div>
      </div>
    </Modal>
  );
};
