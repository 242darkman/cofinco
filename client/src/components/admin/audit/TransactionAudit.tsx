import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Filter, Download, Search, FileSpreadsheet, FileText, Shield } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { auditApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface TransactionLog {
  id: string;
  timestamp: string;
  transaction_type: string;
  user_id: string;
  client_id: string;
  montant: number;
  devise: string;
  compte_source: string;
  compte_destination: string;
  statut_avant: string;
  statut_apres: string;
  reference: string;
  description: string;
}

export default function TransactionAudit() {
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    totalMontant: 0,
    credits: 0,
    debits: 0,
    epargnes: 0,
    tontines: 0
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filterType !== 'all') params.type = filterType;
      if (dateDebut) params.dateDebut = dateDebut;
      if (dateFin) params.dateFin = dateFin;

      const data = await auditApi.getAll(params);
      setTransactions(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des transactions'));
    } finally {
      setLoading(false);
    }
  }, [filterType, dateDebut, dateFin]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await auditApi.getAll();

      if (data) {
        const statsCalc = {
          total: data.length,
          totalMontant: data.reduce((sum: number, t: { montant?: number }) => sum + (t.montant || 0), 0),
          credits: data.filter((t: { transaction_type: string }) => t.transaction_type === 'CREDIT').length,
          debits: data.filter((t: { transaction_type: string }) => t.transaction_type === 'DEBIT').length,
          epargnes: data.filter((t: { transaction_type: string }) => t.transaction_type === 'EPARGNE').length,
          tontines: data.filter((t: { transaction_type: string }) => t.transaction_type === 'TONTINE').length
        };
        setStats(statsCalc);
      }
    } catch (error) {
      // Silent fail - stats are supplementary
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchStats();
  }, [fetchTransactions, fetchStats]);

  const filteredTransactions = transactions.filter(trans => {
    if (!searchTerm) return true;
    return (
      trans.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trans.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trans.compte_source?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trans.compte_destination?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const exportToCSV = () => {
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const BOM = '\uFEFF';
    const separator = ';';
    
    let csvContent = BOM;
    csvContent += `AUDIT DES TRANSACTIONS - COFIN${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Total: ${stats.total} | Montant: ${stats.totalMontant.toLocaleString()} FCFA${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Date${separator}Type${separator}Référence${separator}Compte Source${separator}Compte Dest.${separator}Montant${separator}Description\n`;
    
    filteredTransactions.forEach((trans, idx) => {
      csvContent += `${idx + 1}${separator}${new Date(trans.timestamp).toLocaleString('fr-FR')}${separator}${trans.transaction_type}${separator}${trans.reference || '-'}${separator}${trans.compte_source || '-'}${separator}${trans.compte_destination || '-'}${separator}${trans.montant?.toLocaleString() || 0} FCFA${separator}${trans.description || '-'}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');
    
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text("AUDIT DES TRANSACTIONS - COFIN", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date d'export: ${dateExport}`, 14, 28);
    doc.text(`Total: ${stats.total} | Montant: ${stats.totalMontant.toLocaleString()} FCFA`, 14, 34);
    
    const tableData = filteredTransactions.slice(0, 50).map((trans, idx) => [
      idx + 1,
      new Date(trans.timestamp).toLocaleDateString('fr-FR'),
      trans.transaction_type,
      trans.reference || '-',
      `${trans.montant?.toLocaleString() || 0} FCFA`
    ]);
    
    (doc as any).autoTable({
      head: [['N°', 'Date', 'Type', 'Référence', 'Montant']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });
    
    doc.save(`COFIN_Transactions_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportMenu(false);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: "Audit des Transactions COFIN",
      dateExport: new Date().toISOString(),
      statistiques: stats,
      transactions: filteredTransactions.map(trans => ({
        date: trans.timestamp,
        type: trans.transaction_type,
        reference: trans.reference,
        compteSource: trans.compte_source,
        compteDestination: trans.compte_destination,
        montant: trans.montant,
        devise: trans.devise,
        description: trans.description
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Transactions_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'CREDIT': return 'bg-green-500/20 text-green-400';
      case 'DEBIT': return 'bg-blue-500/20 text-blue-400';
      case 'EPARGNE': return 'bg-blue-500/20 text-blue-400';
      case 'TONTINE': return 'bg-emerald-500/20 text-emerald-400';
      case 'REMBOURSEMENT': return 'bg-emerald-500/20 text-emerald-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Audit des Transactions</h2>
            <p className="text-green-100">Traçabilité complète des opérations financières</p>
          </div>
          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition flex items-center gap-2 font-bold"
            >
              <Download size={20} />
              Exporter
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50 min-w-[200px]">
                <button onClick={exportToCSV} className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white">
                  <FileSpreadsheet size={18} className="text-green-400" />
                  <div><div className="font-semibold">Excel (CSV)</div><div className="text-xs text-slate-400">Tableur compatible</div></div>
                </button>
                <button onClick={exportToPDF} className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white border-t border-slate-700">
                  <FileText size={18} className="text-red-400" />
                  <div><div className="font-semibold">PDF</div><div className="text-xs text-slate-400">Document formaté</div></div>
                </button>
                <button onClick={exportToJSON} className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white border-t border-slate-700">
                  <Shield size={18} className="text-blue-400" />
                  <div><div className="font-semibold">JSON</div><div className="text-xs text-slate-400">Données structurées</div></div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Total Transactions</span>
            <DollarSign size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.total.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Montant Total</span>
            <TrendingUp size={24} />
          </div>
          <div className="text-2xl font-bold">{stats.totalMontant.toLocaleString()} FCFA</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Crédits</span>
            <TrendingUp size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.credits.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Débits</span>
            <TrendingDown size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.debits.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl p-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par référence, compte..."
                className="w-full pl-10 pr-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">Tous les types</option>
            <option value="CREDIT">Crédits</option>
            <option value="DEBIT">Débits</option>
            <option value="EPARGNE">Épargnes</option>
            <option value="TONTINE">Tontines</option>
            <option value="REMBOURSEMENT">Remboursements</option>
          </select>

          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <button
            onClick={fetchTransactions}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition flex items-center gap-2"
          >
            <Filter size={18} />
            Filtrer
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="text-slate-400 mt-4">Chargement des transactions...</p>
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Date/Heure</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Référence</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Montant</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Source</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Destination</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      Aucune transaction trouvée
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((trans) => (
                    <tr key={trans.id} className="hover:bg-slate-700/50 transition">
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {new Date(trans.timestamp).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${getTypeColor(trans.transaction_type)}`}>
                          {trans.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-cyan-400 font-mono text-sm">{trans.reference || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-white font-bold">{trans.montant?.toLocaleString() || 0} FCFA</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm">{trans.compte_source || '-'}</td>
                      <td className="px-4 py-3 text-slate-300 text-sm">{trans.compte_destination || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400"></span>
                          <span className="text-green-400 text-sm font-semibold">{trans.statut_apres || 'Complété'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-sm max-w-xs truncate">
                        {trans.description || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
</div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">Répartition par Type</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-700 rounded-xl">
              <span className="text-slate-300">Crédits</span>
              <span className="text-green-400 font-bold">{stats.credits}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700 rounded-xl">
              <span className="text-slate-300">Débits</span>
              <span className="text-blue-400 font-bold">{stats.debits}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700 rounded-xl">
              <span className="text-slate-300">Épargnes</span>
              <span className="text-blue-400 font-bold">{stats.epargnes}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700 rounded-xl">
              <span className="text-slate-300">Tontines</span>
              <span className="text-emerald-400 font-bold">{stats.tontines}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">Volume par Jour</h3>
          <div className="h-48 flex items-end justify-around gap-2">
            {[35, 52, 48, 65, 43, 58, 71].map((height, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-gradient-to-t from-green-600 to-emerald-500 rounded-t-lg transition-all hover:opacity-80"
                  style={{ height: `${height}%` }}
                ></div>
                <span className="text-xs text-slate-400">J-{6-index}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
