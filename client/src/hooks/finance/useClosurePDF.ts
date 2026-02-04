/**
 * Hook pour générer les rapports PDF de clôture de session caisse
 * Inclut signature numérique et billetage détaillé
 */

import { addPdfLogoHeader, addPdfLogoFooter } from '../../lib/pdf-logo';
import { toast } from '../../lib/toast';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '../../lib/lazy-export';

interface BilletageRow {
  denomination: number;
  count: number;
  total: number;
}

interface ClosureReportData {
  // Session info
  sessionId: string;
  caisseNom: string;
  agenceNom: string;
  agenceCode?: string;

  // Cashier info
  caissierNom: string;
  caissierId: string;

  // Timing
  openedAt: string;
  closedAt: string;

  // Balances
  soldeOuverture: number;
  totalEntrees: number;
  totalSorties: number;
  soldeTheorique: number;
  soldePhysique: number;
  ecart: number;
  ecartJustification?: string;

  // Billetage
  billetage: Record<string, number>;

  // Transfers
  montantVersCoffre: number;
  montantReporte: number;

  // Mobile Money
  mmReconciliation?: {
    provider: string;
    expectedBalance: number;
    providerBalance: number | null;
    ecart: number;
    status: string;
  }[];

  // Signature
  signatureNumérique?: string;
  observations?: string;
}

const DENOMINATIONS = [
  { key: 'billets_10000', value: 10000, label: '10 000 FCFA' },
  { key: 'billets_5000', value: 5000, label: '5 000 FCFA' },
  { key: 'billets_1000', value: 1000, label: '1 000 FCFA' },
  { key: 'billets_500', value: 500, label: '500 FCFA' },
  { key: 'billets_200', value: 200, label: '200 FCFA' },
  { key: 'billets_100', value: 100, label: '100 FCFA' },
  { key: 'billets_50', value: 50, label: '50 FCFA' },
  { key: 'pieces_20', value: 20, label: '20 FCFA' },
  { key: 'pieces_10', value: 10, label: '10 FCFA' },
  { key: 'pieces_5', value: 5, label: '5 FCFA' },
];

const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount) + ' FCFA';
};

const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Generate a digital signature hash for audit purposes
 */
const generateSignature = (data: ClosureReportData): string => {
  const signatureData = `${data.sessionId}|${data.closedAt}|${data.soldePhysique}|${data.ecart}`;
  // Simple hash for demonstration - in production use crypto.subtle
  let hash = 0;
  for (let i = 0; i < signatureData.length; i++) {
    const char = signatureData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
};

export const useClosurePDF = () => {
  const generateClosureReport = async (data: ClosureReportData): Promise<void> => {
    try {
      toast.info('Génération du rapport de clôture...');

      // P4.1: Lazy-load PDF libraries
      const { jsPDF, autoTable } = await loadPDFLibraries();
      const doc = new jsPDF('p', 'mm', 'a4');
      const W = doc.internal.pageSize.getWidth();
      const signature = data.signatureNumérique || generateSignature(data);

      // Header
      let y = addPdfLogoHeader(doc, {
        title: 'RAPPORT DE CLÔTURE DE CAISSE',
        subtitle: `${data.agenceNom} - ${data.caisseNom}`,
        dateRight: formatDate(data.closedAt),
        headerHeight: 28,
      });

      // Session Info Box
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(10, y, W - 20, 32, 2, 2, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); // slate-800

      // Left column
      doc.text('Session:', 14, y + 7);
      doc.text('Caissier:', 14, y + 14);
      doc.text('Ouverture:', 14, y + 21);
      doc.text('Fermeture:', 14, y + 28);

      doc.setFont('helvetica', 'normal');
      doc.text(data.sessionId.slice(0, 8).toUpperCase(), 35, y + 7);
      doc.text(data.caissierNom, 35, y + 14);
      doc.text(formatDateTime(data.openedAt), 35, y + 21);
      doc.text(formatDateTime(data.closedAt), 35, y + 28);

      // Right column - Signature
      doc.setFont('helvetica', 'bold');
      doc.text('Signature:', W - 60, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`SIG-${signature}`, W - 60, y + 13);

      y += 38;

      // Résumé Financier
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('RÉSUMÉ FINANCIER', 10, y);
      y += 6;

      const summaryData = [
        ['Solde d\'ouverture', formatMoney(data.soldeOuverture)],
        ['Total Entrées', formatMoney(data.totalEntrees)],
        ['Total Sorties', formatMoney(data.totalSorties)],
        ['Solde Théorique', formatMoney(data.soldeTheorique)],
        ['Solde Physique (Compté)', formatMoney(data.soldePhysique)],
      ];

      autoTable(doc, {
        startY: y,
        head: [],
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { halign: 'right', cellWidth: 50 },
        },
        margin: { left: 10, right: W / 2 + 10 },
      });

      // Écart box
      const ecartY = y;
      const ecartColor = Math.abs(data.ecart) > 100
        ? [220, 38, 38] // red-600
        : data.ecart === 0
          ? [22, 163, 74] // green-600
          : [234, 179, 8]; // yellow-500

      doc.setFillColor(ecartColor[0], ecartColor[1], ecartColor[2]);
      doc.roundedRect(W / 2 + 5, ecartY, W / 2 - 15, 35, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('ÉCART DE CAISSE', W / 2 + 10, ecartY + 10);

      doc.setFontSize(16);
      const ecartText = data.ecart > 0 ? `+${formatMoney(data.ecart)}` : formatMoney(data.ecart);
      doc.text(ecartText, W / 2 + 10, ecartY + 22);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const statusText = data.ecart === 0 ? 'Parfait' : Math.abs(data.ecart) <= 100 ? 'Acceptable' : 'À vérifier';
      doc.text(statusText, W / 2 + 10, ecartY + 30);

      y = (doc as any).lastAutoTable?.finalY || y + 40;
      y += 10;

      // Billetage
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('DÉTAIL DU BILLETAGE', 10, y);
      y += 6;

      const billetageRows: BilletageRow[] = DENOMINATIONS.map(d => ({
        denomination: d.value,
        count: data.billetage[d.key] || 0,
        total: (data.billetage[d.key] || 0) * d.value,
      })).filter(r => r.count > 0);

      if (billetageRows.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Coupure', 'Quantité', 'Sous-total']],
          body: billetageRows.map(r => [
            r.denomination >= 500 ? `Billet ${r.denomination.toLocaleString('fr-FR')}` : `Pièce ${r.denomination}`,
            r.count.toString(),
            formatMoney(r.total),
          ]),
          foot: [['TOTAL', '', formatMoney(data.soldePhysique)]],
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
          footStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 50 },
            1: { halign: 'center', cellWidth: 30 },
            2: { halign: 'right', cellWidth: 40 },
          },
          margin: { left: 10, right: W / 2 + 10 },
        });
      }

      // Décision de trésorerie (right side)
      const treasuryY = y;
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(W / 2 + 5, treasuryY, W / 2 - 15, 45, 2, 2, 'F');

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DÉCISION DE TRÉSORERIE', W / 2 + 10, treasuryY + 8);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Transfert vers coffre:', W / 2 + 10, treasuryY + 18);
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoney(data.montantVersCoffre), W - 20, treasuryY + 18, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.text('Report jour suivant:', W / 2 + 10, treasuryY + 26);
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoney(data.montantReporte), W - 20, treasuryY + 26, { align: 'right' });

      doc.setDrawColor(148, 163, 184);
      doc.line(W / 2 + 10, treasuryY + 32, W - 15, treasuryY + 32);

      doc.setFontSize(10);
      doc.text('Total:', W / 2 + 10, treasuryY + 40);
      doc.text(formatMoney(data.montantVersCoffre + data.montantReporte), W - 20, treasuryY + 40, { align: 'right' });

      y = Math.max((doc as any).lastAutoTable?.finalY || y, treasuryY + 50) + 10;

      // Mobile Money Reconciliation (if any)
      if (data.mmReconciliation && data.mmReconciliation.length > 0) {
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('RÉCONCILIATION MOBILE MONEY', 10, y);
        y += 6;

        autoTable(doc, {
          startY: y,
          head: [['Fournisseur', 'Solde Attendu', 'Solde API', 'Écart', 'Statut']],
          body: data.mmReconciliation.map(r => [
            r.provider,
            formatMoney(r.expectedBalance),
            r.providerBalance !== null ? formatMoney(r.providerBalance) : 'N/A',
            formatMoney(r.ecart),
            r.status === 'MATCHED' ? 'OK' : r.status === 'API_FAILED' ? 'API Indisponible' : 'Écart',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: 10, right: 10 },
        });

        y = (doc as any).lastAutoTable?.finalY + 10;
      }

      // Observations & Justifications
      if (data.ecartJustification || data.observations) {
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('OBSERVATIONS', 10, y);
        y += 6;

        doc.setFillColor(254, 249, 195); // yellow-100
        doc.roundedRect(10, y, W - 20, 25, 2, 2, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(113, 63, 18); // yellow-800

        if (data.ecartJustification) {
          doc.text(`Justification écart: ${data.ecartJustification}`, 14, y + 8);
        }
        if (data.observations) {
          doc.text(`Notes: ${data.observations}`, 14, y + 16);
        }

        y += 30;
      }

      // Signature area
      y = Math.max(y, 240); // Ensure signature is near bottom

      doc.setDrawColor(203, 213, 225); // slate-300
      doc.line(10, y, 80, y);
      doc.line(W - 80, y, W - 10, y);

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Signature du Caissier', 10, y + 5);
      doc.text('Visa du Superviseur', W - 80, y + 5);

      // Digital signature footer
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Document généré automatiquement le ${new Date().toLocaleString('fr-FR')}`, 10, y + 15);
      doc.text(`Empreinte numérique: ${signature}`, 10, y + 20);

      // Footer
      addPdfLogoFooter(doc, 'Rapport de Clôture');

      // Download
      const filename = `cloture_${data.caisseNom.replace(/\s+/g, '_')}_${formatDate(data.closedAt).replace(/\//g, '-')}.pdf`;
      doc.save(filename);

      toast.success('Rapport de clôture téléchargé');
    } catch (error) {
      console.error('Error generating closure PDF:', error);
      toast.error('Erreur lors de la génération du rapport');
    }
  };

  return { generateClosureReport };
};

export type { ClosureReportData };
