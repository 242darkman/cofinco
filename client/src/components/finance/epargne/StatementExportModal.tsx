import React, { useState } from 'react';
import { Download, Calendar, FileText, CheckCircle2, Table2 } from 'lucide-react';
import { Modal, Button, Input, SelectField } from '../../ui';
import { useLanguage } from '../../../contexts/LanguageContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addPdfLogoHeader } from '@/lib/pdf-logo';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries, loadExcelLibrary } from '@/lib/lazy-export';

interface StatementExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  compte: any;
  transactions: any[];
}

export default function StatementExportModal({ isOpen, onClose, compte, transactions }: StatementExportModalProps) {
  const { t } = useLanguage();
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formatType, setFormatType] = useState('pdf');

  const handleQuickSelect = (period: 'month' | 'quarter' | 'year') => {
    const end = new Date();
    let start = new Date();
    
    if (period === 'month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (period === 'quarter') {
      start = new Date(end.getFullYear(), end.getMonth() - 3, 1);
    } else if (period === 'year') {
      start = new Date(end.getFullYear(), 0, 1);
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const generatePDF = async () => {
    setIsGenerating(true);

    try {
      // P4.1: Lazy-load PDF libraries on demand
      const { jsPDF, autoTable } = await loadPDFLibraries();
      const doc = new jsPDF();

        // Header
        const clientName = `${compte.clients?.nom} ${compte.clients?.prenom || ''}`.trim();
        const compteNum = compte.numeroCompte || compte.numeroCompte;
        const startY = addPdfLogoHeader(doc, {
          title: 'Relevé de Compte',
          subtitle: `${clientName} — N° ${compteNum} — ${compte.typeCompte || compte.typeCompte}`,
          dateRight: `Période: ${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')}`,
        });

        // Filter transactions
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59);
        
        const filteredTransactions = transactions.filter(t => {
          const d = new Date(t.dateTransaction);
          return d >= start && d <= end;
        });
        
        // Table
        const tableBody = filteredTransactions.map(t => [
          format(new Date(t.dateTransaction), 'dd/MM/yyyy HH:mm'),
          t.typeTransaction,
          t.reference || '-',
          t.description || '-',
          t.montant > 0 ? `+${t.montant.toLocaleString('fr-FR')}` : `${t.montant.toLocaleString('fr-FR')}`,
          t.soldeApres ? `${t.soldeApres.toLocaleString('fr-FR')}` : '-'
        ]);
        
        autoTable(doc, {
          startY,
          head: [['Date', 'Type', 'Référence', 'Description', 'Montant (FCFA)', 'Solde (FCFA)']],
          body: tableBody,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [15, 23, 42], textColor: 255 },
          alternateRowStyles: { fillColor: [241, 245, 249] },
          columnStyles: {
            4: { halign: 'right', fontStyle: 'bold' },
            5: { halign: 'right' }
          }
        });
        
        // Summary
        const totalDepots = filteredTransactions
          .filter(t => t.montant > 0)
          .reduce((sum, t) => sum + t.montant, 0);
          
        const totalRetraits = filteredTransactions
          .filter(t => t.montant < 0)
          .reduce((sum, t) => sum + Math.abs(t.montant), 0);
          
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        
        doc.setFontSize(10);
        doc.text(`Total Dépôts: ${totalDepots.toLocaleString('fr-FR')} FCFA`, 14, finalY);
        doc.text(`Total Retraits: ${totalRetraits.toLocaleString('fr-FR')} FCFA`, 14, finalY + 6);
        
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Ce document est généré électroniquement et ne nécessite pas de signature.", 105, 280, { align: 'center' });
        
        doc.save(`Releve_${compte.numeroCompte || compte.numeroCompte}_${startDate}_${endDate}.pdf`);

      setIsGenerating(false);
      onClose();
    } catch (e) {
      console.error("PDF Generation error", e);
      setIsGenerating(false);
    }
  };

  const generateExcel = async () => {
    setIsGenerating(true);

    try {
      // P4.1: Lazy-load Excel library on demand
      const XLSX = await loadExcelLibrary();

      // Filter transactions by date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);

      const filteredTransactions = transactions.filter(t => {
        const d = new Date(t.dateTransaction);
        return d >= start && d <= end;
      });

      // Build header info rows
      const headerRows = [
        ['COFINCO - Relevé de Compte'],
        [],
        ['Client', `${compte.clients?.nom || ''} ${compte.clients?.prenom || ''}`],
        ['Compte N°', compte.numeroCompte || compte.numeroCompte],
        ['Type', compte.typeCompte || compte.typeCompte],
        ['Période', `${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')}`],
        ["Date d'émission", format(new Date(), 'dd/MM/yyyy HH:mm')],
        [],
      ];

      // Table header
      const tableHeader = ['Date', 'Type', 'Référence', 'Description', 'Montant (FCFA)', 'Solde (FCFA)'];

      // Table rows
      const tableRows = filteredTransactions.map(t => [
        format(new Date(t.dateTransaction), 'dd/MM/yyyy HH:mm'),
        t.typeTransaction,
        t.reference || '-',
        t.description || '-',
        t.montant,
        t.soldeApres ?? '-',
      ]);

      // Summary
      const totalDepots = filteredTransactions
        .filter(t => t.montant > 0)
        .reduce((sum: number, t: any) => sum + t.montant, 0);
      const totalRetraits = filteredTransactions
        .filter(t => t.montant < 0)
        .reduce((sum: number, t: any) => sum + Math.abs(t.montant), 0);

      const summaryRows = [
        [],
        ['Total Dépôts', '', '', '', totalDepots],
        ['Total Retraits', '', '', '', totalRetraits],
      ];

      // Build worksheet
      const wsData = [...headerRows, tableHeader, ...tableRows, ...summaryRows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Column widths
        ws['!cols'] = [
          { wch: 20 }, // Date
          { wch: 18 }, // Type
          { wch: 14 }, // Référence
          { wch: 30 }, // Description
          { wch: 18 }, // Montant
          { wch: 18 }, // Solde
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relevé');

        const filename = `Releve_${compte.numeroCompte || compte.numeroCompte}_${startDate}_${endDate}.xlsx`;
        XLSX.writeFile(wb, filename);

      setIsGenerating(false);
      onClose();
    } catch (e) {
      console.error("Excel Generation error", e);
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    if (formatType === 'excel') {
      generateExcel();
    } else {
      generatePDF();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exporter Relevé de Compte"
      size="md"
    >
      <div className="space-y-6">
        {/* Period Selection */}
        <div className="space-y-4">
          <label className="text-sm font-medium text-slate-300">Période</label>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => handleQuickSelect('month')}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
            >
              Ce mois
            </button>
            <button
              onClick={() => handleQuickSelect('quarter')}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
            >
              3 derniers mois
            </button>
            <button
              onClick={() => handleQuickSelect('year')}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
            >
              Cette année
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
               <label className="text-xs text-slate-400 mb-1 block">Date de début</label>
               <Input
                 type="date"
                 value={startDate}
                 onChange={(e) => setStartDate(e.target.value)}
               />
            </div>
            <div>
               <label className="text-xs text-slate-400 mb-1 block">Date de fin</label>
               <Input
                 type="date"
                 value={endDate}
                 onChange={(e) => setEndDate(e.target.value)}
               />
            </div>
          </div>
        </div>
        
        {/* Format Selection (Future proofing) */}
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Format</label>
          <div className="grid grid-cols-2 gap-4">
            <div 
              className={`
                border rounded-lg p-3 cursor-pointer transition flex items-center gap-3
                ${formatType === 'pdf' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-600'}
              `}
              onClick={() => setFormatType('pdf')}
            >
              <FileText className={formatType === 'pdf' ? 'text-emerald-400' : 'text-slate-400'} size={20} />
              <div>
                <div className={`font-medium ${formatType === 'pdf' ? 'text-white' : 'text-slate-400'}`}>PDF</div>
                <div className="text-[10px] text-slate-500">Document Adobe</div>
              </div>
              {formatType === 'pdf' && <CheckCircle2 className="ml-auto text-emerald-500" size={16} />}
            </div>
            
            <div
              className={`
                border rounded-lg p-3 cursor-pointer transition flex items-center gap-3
                ${formatType === 'excel' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-600'}
              `}
              onClick={() => setFormatType('excel')}
            >
              <Table2 className={formatType === 'excel' ? 'text-emerald-400' : 'text-slate-400'} size={20} />
              <div>
                <div className={`font-medium ${formatType === 'excel' ? 'text-white' : 'text-slate-400'}`}>Excel</div>
                <div className="text-[10px] text-slate-500">Classeur Microsoft</div>
              </div>
              {formatType === 'excel' && <CheckCircle2 className="ml-auto text-emerald-500" size={16} />}
            </div>
          </div>
        </div>
        
        <div className="pt-4 border-t border-slate-700 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={isGenerating}
            isLoading={isGenerating}
            icon={Download}
          >
            {isGenerating ? 'Génération...' : 'Télécharger'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
