import React, { useState, useEffect } from 'react';
import { X, Search, Filter, ArrowDownLeft, ArrowUpRight, Calendar, Download, FileText, Loader2 } from 'lucide-react';
import { Badge } from '../ui';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import AccountStatsChart from './AccountStatsChart';

// P3.3: Lazy-loaded export utilities (jsPDF ~500KB, xlsx ~500KB)
const loadExportLibraries = async () => {
  const [jsPDFModule, autoTableModule, xlsxModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('xlsx')
  ]);
  return {
    jsPDF: jsPDFModule.default,
    autoTable: autoTableModule.default,
    XLSX: xlsxModule
  };
};

interface Transaction {
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
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);


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
        const json = await res.json();
        setTransactions(json.data || json);
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

  const formatMoney = (amount: string | number | undefined) => {
    if (amount === undefined || amount === null) return '-';
    const num = Number(amount);
    if (isNaN(num)) return '-';
    return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s/g, ' '); 
  };

  const formattedTransactions = transactions.map(t => ({
    ...t,
    // Priorité: description (libellé bancaire généré par le serveur) > observations > fallbacks
    displayDescription: t.description || t.displayDescription || t.observations || t.typePaiement || t.type || 'Opération',
    displayRef: t.recuNumero || t.referenceExterne || '-'
  }));

  const filteredTransactions = formattedTransactions.filter(t => {
    const matchesFilter = filter === 'ALL' || t.sens === filter;
    
    // Safety check for undefined fields although mapped above
    const desc = (t.displayDescription || '').toLowerCase();
    const ref = (t.displayRef || '').toLowerCase();
    const term = searchTerm.toLowerCase();

    const matchesSearch = desc.includes(term) || ref.includes(term);
    return matchesFilter && matchesSearch;
  });

  // P3.3: Lazy-loaded CSV export
  const handleExportCSV = async () => {
    setExportingCSV(true);
    try {
      const { XLSX } = await loadExportLibraries();

      const data = filteredTransactions.map(t => ({
        Date: safeFormatDate(t.createdAt),
        Description: t.displayDescription,
        Type: t.typePaiement || t.type,
        Reference: t.displayRef,
        Sens: t.sens,
        Montant: t.montant,
        Solde: t.soldeApres || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Historique");
      XLSX.writeFile(wb, `historique_compte_${numeroCompte}_${format(new Date(), 'yyyyMMdd')}.csv`);
      toast.success('Export CSV terminé');
    } catch (error) {
      console.error('Erreur export CSV:', error);
      toast.error('Erreur lors de l\'export CSV');
    } finally {
      setExportingCSV(false);
    }
  };

  // P3.3: Lazy-loaded PDF export
  const handleExportPDF = async () => {
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
        t.displayDescription,
        t.displayRef,
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


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-base border border-edge rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-surface/50 border-b border-edge p-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-content-primary flex items-center gap-2">
              <Calendar size={20} className="text-accent" />
              Historique des transactions
            </h2>
            <p className="text-sm text-content-muted font-mono mt-1">N° {numeroCompte}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-content-primary"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-edge flex flex-col sm:flex-row gap-4 justify-between shrink-0 bg-surface-base/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 text-content-muted" size={16} />
            <input
              type="text"
              placeholder="Rechercher une opération..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-base border border-edge rounded-lg pl-9 pr-4 py-2 text-sm text-content-primary focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
              {(['ALL', 'CREDIT', 'DEBIT'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f 
                      ? 'bg-surface text-content-primary shadow-sm' 
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  {f === 'ALL' ? 'Tout' : f === 'CREDIT' ? 'Dépôts' : 'Retraits'}
                </button>
              ))}
            </div>
            
            <button
                onClick={handleExportCSV}
                disabled={exportingCSV}
                className="p-2 border border-edge rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export CSV"
            >
                {exportingCSV ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                <span className="hidden sm:inline text-xs font-medium">CSV</span>
            </button>

            <button
                onClick={handleExportPDF}
                disabled={exportingPDF}
                className="p-2 border border-edge rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export PDF"
            >
                {exportingPDF ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                <span className="hidden sm:inline text-xs font-medium">PDF</span>
            </button>
          </div>
        </div>

        {/* Chart & List */}
        <div className="flex-1 overflow-auto bg-surface-base/30">
          <div className="p-4 space-y-4">
             {/* Graphique */}
             <div className="bg-surface-base/50 border border-edge rounded-xl p-4">
                <AccountStatsChart compteId={compteId} filter={filter} />
             </div>

             {/* Table */}
             <div className="bg-surface-base/50 border border-edge rounded-xl overflow-hidden min-h-[300px]">
                {loading ? (
                  <div className="flex items-center justify-center h-40">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                    <Filter size={32} className="mb-3 opacity-50" />
                    <p>Aucune transaction trouvée</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-base sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-4 text-xs font-semibold text-content-muted uppercase tracking-wider w-32">Date</th>
                        <th className="p-4 text-xs font-semibold text-content-muted uppercase tracking-wider">Description</th>
                        <th className="p-4 text-xs font-semibold text-content-muted uppercase tracking-wider text-right">Montant</th>
                        <th className="p-4 text-xs font-semibold text-content-muted uppercase tracking-wider text-right w-32">Solde</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge">
                      {filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-surface/50 group transition-colors text-sm">
                          <td className="p-4 whitespace-nowrap text-content-muted font-mono text-xs">
                            {safeFormatDate(t.createdAt)}
                          </td>
                          <td className="p-4">
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 p-1.5 rounded-full shrink-0 ${
                                  t.sens === 'CREDIT' ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'
                              }`}>
                                  {t.sens === 'CREDIT' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                              </div>
                              <div>
                                  <p className="text-content-primary font-medium">{t.displayDescription}</p>
                                  <p className="text-xs text-content-muted mt-0.5 flex items-center gap-2">
                                      {t.type} 
                                      {t.displayRef !== '-' && <span className="px-1.5 py-0.5 rounded bg-surface text-[10px] text-content-muted">Ref: {t.displayRef}</span>}
                                  </p>
                              </div>
                            </div>
                          </td>
                          <td className={`p-4 text-right font-medium whitespace-nowrap ${t.sens === 'CREDIT' ? 'text-status-success' : 'text-content-secondary'}`}>
                            {t.sens === 'CREDIT' ? '+' : '-'}{formatMoney(t.montant)} <span className="text-xs opacity-50">FCFA</span>
                          </td>
                          <td className="p-4 text-right font-mono text-content-muted whitespace-nowrap">
                              {t.soldeApres ? formatMoney(t.soldeApres) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
             </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-edge bg-surface-base text-xs text-center text-content-muted">
             Affichage des {filteredTransactions.length} dernières opérations
        </div>
      </div>

    </div>
  );
}
