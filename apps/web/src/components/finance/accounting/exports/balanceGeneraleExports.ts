import { toast, handleApiError } from '../../../../lib/toast';
import { addPdfLogoHeader } from '../../../../lib/pdf-logo';
import { loadPDFLibraries } from '../../../../lib/lazy-export';

export interface BalanceCompteExport {
  compteId: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  sensNormal: string;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

export interface BalanceTotauxExport {
  debit: number;
  credit: number;
  solde_debiteur: number;
  solde_crediteur: number;
}

export const exportBalanceGeneraleExcel = async (
  filteredBalance: BalanceCompteExport[],
  totaux: BalanceTotauxExport
) => {
  if (filteredBalance.length === 0) {
    toast.warning('Aucune donnee a exporter');
    return;
  }
  try {
    const { downloadWorkbook } = await import('@/lib/excel-export');

    const data = filteredBalance.map(compte => ({
      'N Compte': compte.numeroCompte || '',
      'Intitule': compte.intitule,
      'Type': compte.typeCompte || '',
      'Total Debit': compte.totalDebit ?? 0,
      'Total Credit': compte.totalCredit ?? 0,
      'Solde Debiteur': compte.soldeDebiteur ?? 0,
      'Solde Crediteur': compte.soldeCrediteur ?? 0
    }));

    data.push({
      'N Compte': 'TOTAUX',
      'Intitule': '',
      'Type': '',
      'Total Debit': totaux.debit,
      'Total Credit': totaux.credit,
      'Solde Debiteur': totaux.solde_debiteur,
      'Solde Crediteur': totaux.solde_crediteur
    });

    await downloadWorkbook(`Balance_Generale_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`, [
      { name: 'Balance Générale', rows: data },
    ]);
    toast.success('Export Excel réussi');
  } catch (error) {
    toast.error(handleApiError(error, "Erreur lors de l'export Excel"));
  }
};

export const exportBalanceGeneralePDF = async (
  filteredBalance: BalanceCompteExport[],
  totaux: BalanceTotauxExport,
  dateDebut: string,
  dateFin: string,
  isEquilibre: boolean,
  branding: { appName: string },
  formatMontant: (montant: number) => string
) => {
  if (filteredBalance.length === 0) {
    toast.warning('Aucune donnée à exporter');
    return;
  }
  try {
    const { jsPDF } = await loadPDFLibraries();
    const doc = new jsPDF('landscape');

    const startY = addPdfLogoHeader(doc, {
      title: 'BALANCE GÉNÉRALE OHADA',
      subtitle: 'Système Comptable OHADA',
      dateRight: `Période: ${dateDebut} au ${dateFin}`,
      appName: branding.appName,
    });

    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.setFillColor(30, 58, 138);
    doc.rect(20, startY, 257, 10, 'F');
    doc.text('N° Compte', 25, startY + 7);
    doc.text('Intitule', 60, startY + 7);
    doc.text('Type', 140, startY + 7);
    doc.text('Debit', 175, startY + 7);
    doc.text('Credit', 205, startY + 7);
    doc.text('Solde D.', 235, startY + 7);
    doc.text('Solde C.', 260, startY + 7);

    doc.setTextColor(0);
    let y = startY + 17;
    const maxRows = Math.min(filteredBalance.length, 20);

    filteredBalance.slice(0, maxRows).forEach((compte) => {
      doc.setFontSize(9);
      doc.text(compte.numeroCompte || '', 25, y);
      doc.text((compte.intitule || '').substring(0, 40), 60, y);
      doc.text(compte.typeCompte || '', 140, y);
      doc.text((compte.totalDebit ?? 0).toLocaleString('fr-FR'), 175, y);
      doc.text((compte.totalCredit ?? 0).toLocaleString('fr-FR'), 205, y);
      doc.text((compte.soldeDebiteur ?? 0).toLocaleString('fr-FR'), 235, y);
      doc.text((compte.soldeCrediteur ?? 0).toLocaleString('fr-FR'), 260, y);
      y += 8;
    });

    if (filteredBalance.length > maxRows) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`... et ${filteredBalance.length - maxRows} autres comptes`, 25, y);
      y += 10;
    }

    y += 5;
    doc.setFillColor(30, 58, 138);
    doc.rect(20, y - 5, 257, 12, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text('TOTAUX', 25, y + 3);
    doc.text(formatMontant(totaux.debit), 175, y + 3);
    doc.text(formatMontant(totaux.credit), 205, y + 3);
    doc.text(formatMontant(totaux.solde_debiteur), 235, y + 3);
    doc.text(formatMontant(totaux.solde_crediteur), 260, y + 3);

    y += 20;
    doc.setFontSize(10);
    if (isEquilibre) {
      doc.setTextColor(0);
      doc.setFillColor(34, 197, 94);
    } else {
      doc.setTextColor(255);
      doc.setFillColor(239, 68, 68);
    }
    doc.rect(20, y, 100, 12, 'F');
    doc.text(isEquilibre ? 'Balance Equilibree' : 'Balance Desequilibree', 25, y + 8);

    doc.save(`Balance_Generale_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Export PDF réussi');
  } catch (error) {
    toast.error(handleApiError(error, "Erreur lors de l'export PDF"));
  }
};
