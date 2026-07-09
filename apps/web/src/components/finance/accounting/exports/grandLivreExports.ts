import { toast, handleApiError } from '../../../../lib/toast';
import { addPdfLogoHeader } from '../../../../lib/pdf-logo';
import { loadPDFLibraries } from '../../../../lib/lazy-export';

export interface GrandLivreEntryExport {
  id: string;
  dateEcriture: string;
  numeroPiece: string;
  journalCode: string;
  journalIntitule: string;
  ecritureLibelle: string;
  ligneLibelle: string;
  debit: number;
  credit: number;
  soldeProgressif: number;
  sourceType?: string;
  sourceId?: string;
  refExterne?: string;
}

export interface GrandLivreDataExport {
  compteId: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  sensNormal: string;
  soldeOuverture: number;
  totalDebits: number;
  totalCredits: number;
  soldeFinal: number;
  entries: GrandLivreEntryExport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const exportGrandLivreExcel = async (
  grandLivreData: GrandLivreDataExport,
  entries: GrandLivreEntryExport[],
  totalDebit: number,
  totalCredit: number,
  soldeFinal: number,
  soldeOuverture: number,
  dateDebut: string,
  dateFin: string
) => {
  if (!grandLivreData || entries.length === 0) {
    toast.warning('Aucune donnee a exporter');
    return;
  }

  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');

    const data = entries.map(m => ({
      'Date': new Date(m.dateEcriture).toLocaleDateString('fr-FR'),
      'N Piece': m.numeroPiece,
      'Journal': m.journalCode,
      'Libelle': m.ecritureLibelle || m.ligneLibelle,
      'Debit': m.debit,
      'Credit': m.credit,
      'Solde': m.soldeProgressif
    }));

    data.push({
      'Date': 'TOTAUX',
      'N Piece': '',
      'Journal': '',
      'Libelle': '',
      'Debit': totalDebit,
      'Credit': totalCredit,
      'Solde': soldeFinal
    });

    await downloadWorkbook(`Grand_Livre_${grandLivreData.numeroCompte}_${new Date().toISOString().split('T')[0]}.xlsx`, [{
      name: 'Grand Livre',
      titleRows: [
        [`Grand Livre - Compte ${grandLivreData.numeroCompte} - ${grandLivreData.intitule}`],
        [`Periode: ${dateDebut} au ${dateFin}`],
        [`Solde d'ouverture: ${soldeOuverture.toLocaleString('fr-FR')} FCFA`],
        [],
      ],
      rows: data,
    }]);
    toast.success('Export Excel reussi');
  } catch (error) {
    toast.error(handleApiError(error, "Erreur lors de l'export Excel"));
  }
};

export const exportGrandLivrePDF = async (
  grandLivreData: GrandLivreDataExport,
  entries: GrandLivreEntryExport[],
  totalDebit: number,
  totalCredit: number,
  soldeFinal: number,
  soldeOuverture: number,
  dateDebut: string,
  dateFin: string,
  branding: { appName: string }
) => {
  if (!grandLivreData || entries.length === 0) {
    toast.warning('Aucune donnee a exporter');
    return;
  }

  try {
    const { jsPDF } = await loadPDFLibraries();
    const doc = new jsPDF('landscape');

    const startY = addPdfLogoHeader(doc, {
      title: 'GRAND LIVRE',
      subtitle: `Compte: ${grandLivreData.numeroCompte} - ${grandLivreData.intitule}`,
      dateRight: `Période: ${dateDebut} au ${dateFin}`,
      appName: branding.appName,
    });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Solde d'ouverture: ${soldeOuverture.toLocaleString('fr-FR')} FCFA`, 14, startY);

    const tableY = startY + 8;
    doc.setFontSize(9);
    doc.setTextColor(255);
    doc.setFillColor(30, 58, 138);
    doc.rect(20, tableY, 257, 10, 'F');
    doc.text('Date', 25, tableY + 7);
    doc.text('N Piece', 50, tableY + 7);
    doc.text('Journal', 80, tableY + 7);
    doc.text('Libelle', 100, tableY + 7);
    doc.text('Debit', 180, tableY + 7);
    doc.text('Credit', 210, tableY + 7);
    doc.text('Solde', 245, tableY + 7);

    doc.setTextColor(0);
    let y = tableY + 17;
    const maxRows = Math.min(entries.length, 25);

    entries.slice(0, maxRows).forEach((m) => {
      doc.setFontSize(8);
      doc.text(new Date(m.dateEcriture).toLocaleDateString('fr-FR'), 25, y);
      doc.text(m.numeroPiece || '', 50, y);
      doc.text(m.journalCode || '', 80, y);
      doc.text((m.ecritureLibelle || m.ligneLibelle || '').substring(0, 40), 100, y);
      doc.text(m.debit > 0 ? m.debit.toLocaleString('fr-FR') : '-', 180, y);
      doc.text(m.credit > 0 ? m.credit.toLocaleString('fr-FR') : '-', 210, y);
      doc.text(m.soldeProgressif.toLocaleString('fr-FR'), 245, y);
      y += 7;
    });

    if (entries.length > maxRows) {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`... et ${entries.length - maxRows} autres mouvements`, 25, y);
      y += 10;
    }

    y += 5;
    doc.setFillColor(30, 58, 138);
    doc.rect(20, y - 5, 257, 12, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text('TOTAUX', 25, y + 3);
    doc.text(totalDebit.toLocaleString('fr-FR') + ' FCFA', 180, y + 3);
    doc.text(totalCredit.toLocaleString('fr-FR') + ' FCFA', 210, y + 3);
    doc.text(soldeFinal.toLocaleString('fr-FR') + ' FCFA', 245, y + 3);

    doc.save(`Grand_Livre_${grandLivreData.numeroCompte}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Export PDF reussi');
  } catch (error) {
    toast.error(handleApiError(error, "Erreur lors de l'export PDF"));
  }
};
