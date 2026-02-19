import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { factureApi } from '@/lib/api/factureApi';

export const useReceiptActions = () => {
  const [viewingFactureId, setViewingFactureId] = useState<string | undefined>(undefined);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  /**
   * Open receipt viewer modal
   */
  const handleView = useCallback((factureId: string) => {
    setViewingFactureId(factureId);
    setIsViewerOpen(true);
  }, []);

  /**
   * Download receipt as PDF
   */
  const handleDownload = useCallback(async (factureId: string) => {
    try {
      toast.info('Génération du PDF...');
      
      const blob = await factureApi.downloadPDF(factureId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Recu-${factureId}-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF téléchargé !');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Erreur lors du téléchargement');
    }
  }, []);

  /**
   * Share receipt (mobile native or fallback)
   */
  const handleShare = useCallback(async (factureId: string) => {
    try {
      const facture = await factureApi.getById(factureId);
      
      const shareData = {
        title: `Reçu ${facture.numero}`,
        text: `Reçu de paiement - Montant: ${facture.montantTotal} FCFA`,
        url: window.location.href
      };

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(
          `${shareData.title}\n${shareData.text}\n${shareData.url}`
        );
        toast.success('Copié', { duration: 1500 });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing:', error);
        toast.error('Erreur lors du partage');
      }
    }
  }, []);

  /**
   * Close viewer modal
   */
  const handleCloseViewer = useCallback(() => {
    setIsViewerOpen(false);
    setViewingFactureId(undefined);
  }, []);

  return {
    viewingFactureId,
    isViewerOpen,
    handleView,
    handleDownload,
    handleShare,
    handleCloseViewer
  };
};
