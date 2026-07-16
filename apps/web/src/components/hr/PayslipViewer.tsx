import React, { useRef, useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Download, Printer } from 'lucide-react';
import { Modal } from '@/components/ui';
import Button from '@/components/ui/Button';
import { PayslipTemplate, type PayslipData } from '@/components/ui/printable/PayslipTemplate';
import { useReceiptPDF } from '@/hooks/finance/useReceiptPDF';

interface PayslipViewerProps {
  isOpen: boolean;
  onClose: () => void;
  bulletinId: number | null;
}

export const PayslipViewer: React.FC<PayslipViewerProps> = ({
  isOpen,
  onClose,
  bulletinId,
}) => {
  const offscreenRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [data, setData] = useState<PayslipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch bulletin detail when opened
  useEffect(() => {
    if (isOpen && bulletinId) {
      setLoading(true);
      setError(null);
      fetch(`/api/hr/bulletins/${bulletinId}`)
        .then(r => {
          if (!r.ok) throw new Error('Erreur chargement bulletin');
          return r.json();
        })
        .then((d) => {
          setData(d);
          // Mark bulletin as read (fire-and-forget)
          fetch(`/api/hr/bulletins/${bulletinId}/mark-read`, {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {});
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [isOpen, bulletinId]);

  const filename = data
    ? `bulletin_${data.employe?.matricule || 'EMP'}_${data.bulletin.mois}`
    : 'bulletin';

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
      title={data ? `Bulletin ${data.bulletin.mois} — ${data.employe?.nom || ''}` : 'Bulletin de Paie'}
      size="xl"
      footer={
        data ? (
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
              loadingText="Génération..."
            >
              Télécharger PDF
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" tone="accent" />
          <span className="ml-2 text-content-muted">Chargement du bulletin...</span>
        </div>
      ) : error ? (
        <div className="text-center py-20 text-status-danger">{error}</div>
      ) : data ? (
        <>
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
            <PayslipTemplate ref={offscreenRef} data={data} />
          </div>

          {/* Hidden print-only render */}
          <div className="hidden print:block">
            <PayslipTemplate ref={printRef} data={data} />
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
                <PayslipTemplate data={data} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Modal>
  );
};
