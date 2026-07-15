import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Filter, Download, Search, FileSpreadsheet, FileText, Shield } from 'lucide-react';
import { addPdfLogoHeader } from '@/lib/pdf-logo';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
import { auditApi } from '../../../lib/api-client';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '@/lib/lazy-export';
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
  const branding = useDocumentBranding();
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
    csvContent += `AUDIT DES TRANSACTIONS - ${branding.appName}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
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
    link.download = `${branding.appName}_Transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportToPDF = async () => {
    // P4.1: Lazy-load PDF library
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');

    const startY = addPdfLogoHeader(doc, {
      title: 'AUDIT DES TRANSACTIONS',
      subtitle: `Total: ${stats.total} | Montant: ${stats.totalMontant.toLocaleString()} FCFA`,
      dateRight: `Export: ${dateExport}`,
      appName: branding.appName,
    });

    const tableData = filteredTransactions.slice(0, 50).map((trans, idx) => [
      idx + 1,
      new Date(trans.timestamp).toLocaleDateString('fr-FR'),
      trans.transaction_type,
      trans.reference || '-',
      `${trans.montant?.toLocaleString() || 0} FCFA`
    ]);

    autoTable(doc, {
      head: [['N°', 'Date', 'Type', 'Référence', 'Montant']],
      body: tableData,
      startY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    doc.save(`${branding.appName}_Transactions_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportMenu(false);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: `Audit des Transactions ${branding.appName}`,
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
    link.download = `${branding.appName}_Transactions_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'CREDIT': return 'bg-status-success-bg text-status-success';
      case 'DEBIT': return 'bg-status-info-bg text-status-info';
      case 'EPARGNE': return 'bg-status-info-bg text-status-info';
      case 'TONTINE': return 'bg-status-success-bg text-status-success';
      case 'REMBOURSEMENT': return 'bg-status-success-bg text-status-success';
      default: return 'bg-surface-subtle/40 text-content-muted';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-status-success to-status-success rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Audit des Transactions</h2>
            <p className="text-status-success-text">Traçabilité complète des opérations financières</p>
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
              <div className="absolute right-0 top-full mt-2 bg-surface rounded-xl shadow-xl border border-edge overflow-hidden z-50 min-w-[200px]">
                <button onClick={exportToCSV} className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary">
                  <FileSpreadsheet size={18} className="text-status-success" />
                  <div><div className="font-semibold">Excel (CSV)</div><div className="text-xs text-content-muted">Tableur compatible</div></div>
                </button>
                <button onClick={exportToPDF} className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary border-t border-edge">
                  <FileText size={18} className="text-status-danger" />
                  <div><div className="font-semibold">PDF</div><div className="text-xs text-content-muted">Document formaté</div></div>
                </button>
                <button onClick={exportToJSON} className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary border-t border-edge">
                  <Shield size={18} className="text-status-info" />
                  <div><div className="font-semibold">JSON</div><div className="text-xs text-content-muted">Données structurées</div></div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-status-info to-accent rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Total Transactions</span>
            <DollarSign size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.total.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-status-success to-status-success rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Montant Total</span>
            <TrendingUp size={24} />
          </div>
          <div className="text-2xl font-bold">{stats.totalMontant.toLocaleString()} FCFA</div>
        </div>

        <div className="bg-gradient-to-br from-status-success to-status-success rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Crédits</span>
            <TrendingUp size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.credits.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-status-info to-accent rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Débits</span>
            <TrendingDown size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.debits.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par référence, compte..."
                className="w-full pl-10 pr-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
              />
            </div>
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
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
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
          />

          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
          />

          <button
            onClick={fetchTransactions}
            className="px-6 py-3 bg-status-success hover:bg-status-success text-white rounded-xl transition flex items-center gap-2"
          >
            <Filter size={18} />
            Filtrer
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-status-success mx-auto"></div>
            <p className="text-content-muted mt-4">Chargement des transactions...</p>
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead className="bg-surface-elevated">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Date/Heure</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Référence</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-content-secondary">Montant</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Source</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Destination</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-content-muted">
                      Aucune transaction trouvée
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((trans) => (
                    <tr key={trans.id} className="hover:bg-surface-elevated/50 transition">
                      <td className="px-4 py-3 text-content-secondary text-sm">
                        {new Date(trans.timestamp).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${getTypeColor(trans.transaction_type)}`}>
                          {trans.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-accent font-mono text-sm">{trans.reference || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-content-primary font-bold">{trans.montant?.toLocaleString() || 0} FCFA</span>
                      </td>
                      <td className="px-4 py-3 text-content-secondary text-sm">{trans.compte_source || '-'}</td>
                      <td className="px-4 py-3 text-content-secondary text-sm">{trans.compte_destination || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-status-success"></span>
                          <span className="text-status-success text-sm font-semibold">{trans.statut_apres || 'Complété'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-content-muted text-sm max-w-xs truncate">
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
        <div className="bg-surface rounded-2xl p-6">
          <h3 className="text-xl font-bold text-content-primary mb-4">Répartition par Type</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-xl">
              <span className="text-content-secondary">Crédits</span>
              <span className="text-status-success font-bold">{stats.credits}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-xl">
              <span className="text-content-secondary">Débits</span>
              <span className="text-status-info font-bold">{stats.debits}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-xl">
              <span className="text-content-secondary">Épargnes</span>
              <span className="text-status-info font-bold">{stats.epargnes}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-xl">
              <span className="text-content-secondary">Tontines</span>
              <span className="text-status-success font-bold">{stats.tontines}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl p-6">
          <h3 className="text-xl font-bold text-content-primary mb-4">Volume par Jour</h3>
          <div className="h-48 flex items-end justify-around gap-2">
            {[35, 52, 48, 65, 43, 58, 71].map((height, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-gradient-to-t from-status-success to-status-success rounded-t-lg transition-all hover:opacity-80"
                  style={{ height: `${height}%` }}
                ></div>
                <span className="text-xs text-content-muted">J-{6-index}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
