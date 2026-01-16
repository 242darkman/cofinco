import React, { useRef } from 'react';
import { Download, Share2, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal } from '@/components/ui';
import { factureApi } from '@/lib/api/factureApi';
import { ReceiptTemplate } from '@/components/ui/printable/ReceiptTemplate';
import { InvoiceTemplate } from '@/components/ui/printable/InvoiceTemplate';
import { useReceiptPDF } from '@/hooks/finance/useReceiptPDF';
import { toast } from 'sonner';

interface ReceiptViewerProps {
  isOpen: boolean;
  onClose: () => void;
  factureId: string;
  format?: 'ticket' | 'a4';
}

export const ReceiptViewer: React.FC<ReceiptViewerProps> = ({
  isOpen,
  onClose,
  factureId,
  format = 'a4'
}) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Fetch facture data
  const { data: facture, isLoading, error } = useQuery({
    queryKey: ['facture', factureId],
    queryFn: () => factureApi.getById(factureId),
    enabled: isOpen && !!factureId
  });

  // PDF generation hook
  const { downloadPDF } = useReceiptPDF({
    filename: facture ? `Recu-${facture.numero}` : 'recu',
    format
  });

  const handleDownload = () => {
    const ref = format === 'ticket' ? ticketRef : invoiceRef;
    downloadPDF(ref);
  };

  const handleShare = async () => {
    if (!facture) return;

    const shareData = {
      title: `Reçu ${facture.numero}`,
      text: `Reçu de paiement - Montant: ${facture.montantTotal} FCFA`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share error:', err);
        }
      }
    } else {
      await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}`);
      toast.success('Détails copiés !');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isLoading ? 'Chargement...' : `Reçu ${facture?.numero || ''}`}
      size="lg"
      footer={
        facture && !isLoading ? (
          <>
            <Button
              onClick={handleDownload}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Download size={16} className="mr-2" />
              Télécharger PDF
            </Button>
            <Button
              onClick={handleShare}
              variant="outline"
              className="flex-1"
            >
              <Share2 size={16} className="mr-2" />
              Partager
            </Button>
          </>
        ) : undefined
      }
    >
      {/* Hidden Print Templates (offscreen, not display:none) */}
      {facture && (
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
          <ReceiptTemplate ref={ticketRef} data={facture as any} />
          <InvoiceTemplate ref={invoiceRef} data={facture as any} />
        </div>
      )}

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-emerald-400" size={32} />
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-red-400">Erreur lors du chargement du reçu</p>
        </div>
      )}

      {facture && !isLoading && (
        <div className="bg-white rounded-lg p-6">
          {format === 'ticket' ? (
            <ReceiptTemplate data={facture as any} />
          ) : (
            <InvoiceTemplate data={facture as any} />
          )}
        </div>
      )}
    </Modal>
  );
};
