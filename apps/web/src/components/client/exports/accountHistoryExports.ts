import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ALL_STATUS_LABELS } from '../../../lib/status-labels';

const loadExportLibraries = async () => {
  const [jsPDFModule, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return {
    jsPDF: jsPDFModule.default,
    autoTable: autoTableModule.default,
  };
};

export interface TransactionExport {
  id: string;
  createdAt: string;
  montant: string | number;
  sens: 'CREDIT' | 'DEBIT';
  type: string;
  description?: string;
  observations?: string;
  recuNumero?: string;
  referenceExterne?: string;
  soldeApres?: string | number;
  typePaiement?: string;
  methodePaiement?: string;
  displayDescription?: string;
  displayRef?: string;
}

const safeFormatDate = (dateStr: string) => {
  try {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return format(date, 'dd/MM/yyyy HH:mm');
  } catch {
    return '-';
  }
};

const formatMoney = (amount: string | number | undefined) => {
  if (amount === undefined || amount === null) return '-';
  const num = Number(amount);
  if (isNaN(num)) return '-';
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s/g, ' '); 
};

export const exportAccountHistoryCSV = async (
  filteredTransactions: TransactionExport[],
  numeroCompte: string,
  setExportingCSV: (value: boolean) => void
) => {
  setExportingCSV(true);
  try {
    const { downloadCsv } = await import('@/lib/excel-export');

    const data = filteredTransactions.map(t => ({
      Date: safeFormatDate(t.createdAt),
      Description: t.displayDescription,
      Type: ALL_STATUS_LABELS[t.typePaiement || t.type || ''] || t.typePaiement || t.type,
      Reference: t.displayRef,
      Sens: t.sens,
      Montant: t.montant,
      Solde: t.soldeApres || '-'
    }));

    downloadCsv(`historique_compte_${numeroCompte}_${format(new Date(), 'yyyyMMdd')}.csv`, data);
    toast.success('Export CSV terminé');
  } catch (error) {
    console.error('Erreur export CSV:', error);
    toast.error('Erreur lors de l\'export CSV');
  } finally {
    setExportingCSV(false);
  }
};

export const exportAccountHistoryPDF = async (
  filteredTransactions: TransactionExport[],
  numeroCompte: string,
  setExportingPDF: (value: boolean) => void
) => {
  setExportingPDF(true);
  try {
    const { jsPDF, autoTable } = await loadExportLibraries();

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Historique de Compte', 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`N° Compte: ${numeroCompte}`, 14, 30);
    doc.text(`Date impression: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}`, 14, 36);

    const tableColumn = ["Date", "Description", "Ref", "Sens", "Montant", "Solde"];
    const tableRows = filteredTransactions.map(t => [
      safeFormatDate(t.createdAt),
      t.displayDescription || '-',
      t.displayRef || '-',
      t.sens === 'CREDIT' ? 'Dépôt' : 'Retrait',
      `${formatMoney(t.montant)} FCFA`,
      t.soldeApres ? `${formatMoney(t.soldeApres)} FCFA` : '-'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 44,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } }
    });

    doc.save(`historique_compte_${numeroCompte}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    toast.success('Export PDF terminé');
  } catch (error) {
    console.error('Erreur export PDF:', error);
    toast.error('Erreur lors de l\'export PDF');
  } finally {
    setExportingPDF(false);
  }
};
