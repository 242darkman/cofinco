import React, { useState, useEffect } from 'react';
import { X, Search, Filter, ArrowDownLeft, ArrowUpRight, Calendar, Download, FileText } from 'lucide-react';
import { Badge } from '../ui';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface Transaction {
  id: string;
  createdAt: string; 
  montant: string | number;
  sens: 'CREDIT' | 'DEBIT';
  type: string;
  description?: string; // Sometimes inferred
  observations?: string; // From schema
  recu_numero?: string; // Usually mapped from reference_externe
  referenceExterne?: string;
  solde_apres?: string | number;
  typePaiement?: string;
  methodePaiement?: string;
}

interface AccountHistoryProps {
  compteId: string;
  numeroCompte: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountHistory({ compteId, numeroCompte, isOpen, onClose }: AccountHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && compteId) {
      fetchHistory();
    }
  }, [isOpen, compteId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comptes/${compteId}/transactions?limit=100`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  };

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

  // Safe formatting for amounts to avoid "77/000" or weird non-breaking spaces issues in PDF
  const formatMoney = (amount: string | number | undefined) => {
    if (amount === undefined || amount === null) return '-';
    const num = Number(amount);
    if (isNaN(num)) return '-';
    // Use space as separator explicitly, fix fixed decimals to 0 if integer-like currency (FCFA usually no decimals)
    return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s/g, ' '); 
  };

  const formattedTransactions = transactions.map(t => ({
    ...t,
    // Unified description logic: observations > description > typePaiement > type
    displayDescription: t.observations || t.description || t.typePaiement || t.type || 'Opération',
    displayRef: t.recu_numero || t.referenceExterne || '-'
  }));

  const filteredTransactions = formattedTransactions.filter(t => {
    const matchesFilter = filter === 'ALL' || t.sens === filter;
    
    const desc = t.displayDescription.toLowerCase();
    const ref = t.displayRef.toLowerCase();
    const term = searchTerm.toLowerCase();

    const matchesSearch = desc.includes(term) || ref.includes(term);
    return matchesFilter && matchesSearch;
  });

  const handleExportCSV = () => {
    const data = filteredTransactions.map(t => ({
      Date: safeFormatDate(t.createdAt),
      Description: t.displayDescription,
      Type: t.typePaiement || t.type,
      Reference: t.displayRef,
      Sens: t.sens,
      Montant: t.montant,
      Solde: t.solde_apres || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historique");
    XLSX.writeFile(wb, `historique_compte_${numeroCompte}_${format(new Date(), 'yyyyMMdd')}.csv`);
  };

  const handleExportPDF = () => {
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
      t.displayDescription,
      t.displayRef,
      t.sens === 'CREDIT' ? 'Dépôt' : 'Retrait',
      `${formatMoney(t.montant)} FCFA`,
      t.solde_apres ? `${formatMoney(t.solde_apres)} FCFA` : '-'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 44,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' }
      }
    });

    doc.save(`historique_compte_${numeroCompte}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-slate-800/50 border-b border-slate-700 p-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar size={20} className="text-cyan-400" />
              Historique des transactions
            </h2>
            <p className="text-sm text-slate-400 font-mono mt-1">N° {numeroCompte}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between shrink-0 bg-slate-900/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Rechercher une opération..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-cyan-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-700">
              {(['ALL', 'CREDIT', 'DEBIT'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f 
                      ? 'bg-slate-800 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {f === 'ALL' ? 'Tout' : f === 'CREDIT' ? 'Dépôts' : 'Retraits'}
                </button>
              ))}
            </div>
            
            <button 
                onClick={handleExportCSV}
                className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition flex items-center gap-2" 
                title="Export CSV"
            >
                <Download size={18} />
                <span className="hidden sm:inline text-xs font-medium">CSV</span>
            </button>
            
            <button 
                onClick={handleExportPDF}
                className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition flex items-center gap-2" 
                title="Export PDF"
            >
                <FileText size={18} />
                <span className="hidden sm:inline text-xs font-medium">PDF</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-0">
          {loading ? (
             <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
             </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
              <Filter size={32} className="mb-3 opacity-50" />
              <p>Aucune transaction trouvée</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-800/30 sticky top-0 backdrop-blur-md z-10">
                <tr>
                  <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">Date</th>
                  <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Montant</th>
                  <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right w-32">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 group transition-colors text-sm">
                    <td className="p-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                      {safeFormatDate(t.createdAt)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-start gap-3">
                         <div className={`mt-0.5 p-1.5 rounded-full shrink-0 ${
                             t.sens === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                         }`}>
                             {t.sens === 'CREDIT' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                         </div>
                         <div>
                             <p className="text-white font-medium">{t.displayDescription}</p>
                             <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                 {t.type} 
                                 {t.displayRef !== '-' && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">Ref: {t.displayRef}</span>}
                             </p>
                         </div>
                      </div>
                    </td>
                    <td className={`p-4 text-right font-medium whitespace-nowrap ${t.sens === 'CREDIT' ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {t.sens === 'CREDIT' ? '+' : '-'}{formatMoney(t.montant)} <span className="text-xs opacity-50">FCFA</span>
                    </td>
                    <td className="p-4 text-right font-mono text-slate-400 whitespace-nowrap">
                        {t.solde_apres ? formatMoney(t.solde_apres) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 text-xs text-center text-slate-500">
             Affichage des {filteredTransactions.length} dernières opérations
        </div>
      </div>
    </div>
  );
}
