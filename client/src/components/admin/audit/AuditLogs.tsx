import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Filter, Download, Search, AlertTriangle, CheckCircle, XCircle, Clock, FileSpreadsheet, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { auditApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { ALL_STATUS_LABELS } from '../../../lib/status-labels';

interface AuditLog {
  id: string;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
  user_email?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  resource?: string;
  status?: string;
  ip_address?: string;
  error_message?: string;
}

const formatLogDate = (log: any) => {
  const value = log?.timestamp ?? log?.created_at ?? log?.createdAt;
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleString('fr-FR');
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    failure: 0,
    pending: 0
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filterAction !== 'all') params.action = filterAction;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (dateDebut) params.since = dateDebut;
      if (dateFin) params.until = dateFin;

      const data = await auditApi.getAll(params);
      setLogs(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des logs'));
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterStatus, dateDebut, dateFin]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await auditApi.getAll();

      if (data) {
        const statsCalc = {
          total: data.length,
          success: data.filter((l: AuditLog) => l.status === 'success').length,
          failure: data.filter((l: AuditLog) => l.status === 'failure').length,
          pending: data.filter((l: AuditLog) => l.status === 'pending').length
        };
        setStats(statsCalc);
      }
    } catch (error) {
      // Silent fail - stats are supplementary
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    return (
      log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.entity_type ?? log.resource ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const exportToCSV = () => {
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const BOM = '\uFEFF';
    const separator = ';';
    
    let csvContent = BOM;
    csvContent += `JOURNAL D'AUDIT - COFIN${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Total: ${stats.total} | Succès: ${stats.success} | Échecs: ${stats.failure}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Date/Heure${separator}Utilisateur${separator}Action${separator}Entité${separator}IP${separator}Statut${separator}Message\n`;
    
    filteredLogs.forEach((log, idx) => {
      csvContent += `${idx + 1}${separator}${formatLogDate(log)}${separator}${log.user_email || 'Système'}${separator}${log.action}${separator}${log.entity_type || log.resource || 'N/A'}${separator}${log.ip_address || '-'}${separator}${ALL_STATUS_LABELS[log.status || ''] || log.status}${separator}${log.error_message || '-'}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');
    
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text("JOURNAL D'AUDIT - COFIN", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date d'export: ${dateExport}`, 14, 28);
    doc.text(`Total: ${stats.total} | Succès: ${stats.success} | Échecs: ${stats.failure}`, 14, 34);
    
    const tableData = filteredLogs.slice(0, 50).map((log, idx) => [
      idx + 1,
      formatLogDate(log),
      log.user_email || 'Système',
      log.action,
      log.entity_type || log.resource || 'N/A',
      log.status
    ]);
    
    (doc as any).autoTable({
      head: [['N°', 'Date/Heure', 'Utilisateur', 'Action', 'Entité', 'Statut']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });
    
    doc.save(`COFIN_Audit_Logs_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportMenu(false);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: "Journal d'Audit COFIN",
      dateExport: new Date().toISOString(),
      statistiques: stats,
      logs: filteredLogs.map(log => ({
        date: log.timestamp ?? log.created_at ?? log.createdAt,
        utilisateur: log.user_email,
        action: log.action,
        entite: log.entity_type || log.resource || 'N/A',
        ip: log.ip_address,
        statut: log.status,
        message: log.error_message
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Audit_Logs_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="text-green-400" size={20} />;
      case 'failure': return <XCircle className="text-blue-400" size={20} />;
      case 'pending': return <Clock className="text-cyan-400" size={20} />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-500/20 text-green-400';
      case 'failure': return 'bg-blue-500/20 text-blue-400';
      case 'pending': return 'bg-cyan-500/20 text-cyan-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-emerald-600 to-cyan-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Journal d'Audit</h2>
            <p className="text-emerald-100">Suivi complet des actions système</p>
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
                <button
                  onClick={exportToCSV}
                  className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white"
                >
                  <FileSpreadsheet size={18} className="text-green-400" />
                  <div>
                    <div className="font-semibold">Excel (CSV)</div>
                    <div className="text-xs text-slate-400">Tableur compatible Excel</div>
                  </div>
                </button>
                <button
                  onClick={exportToPDF}
                  className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white border-t border-slate-700"
                >
                  <FileText size={18} className="text-red-400" />
                  <div>
                    <div className="font-semibold">PDF</div>
                    <div className="text-xs text-slate-400">Document formaté</div>
                  </div>
                </button>
                <button
                  onClick={exportToJSON}
                  className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white border-t border-slate-700"
                >
                  <Shield size={18} className="text-blue-400" />
                  <div>
                    <div className="font-semibold">JSON</div>
                    <div className="text-xs text-slate-400">Données structurées</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Total Actions</span>
            <Shield size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.total.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Succès</span>
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.success.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Échecs</span>
            <XCircle size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.failure.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-emerald-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">En Attente</span>
            <Clock size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.pending.toLocaleString()}</div>
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
                placeholder="Rechercher..."
                className="w-full pl-10 pr-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Toutes les actions</option>
            <option value="CREATE">Créations</option>
            <option value="UPDATE">Modifications</option>
            <option value="DELETE">Suppressions</option>
            <option value="LOGIN">Connexions</option>
            <option value="LOGOUT">Déconnexions</option>
            <option value="EXPORT">Exports</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="success">Succès</option>
            <option value="failure">Échecs</option>
            <option value="pending">En attente</option>
          </select>

          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Date début"
          />

          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Date fin"
          />

          <button
            onClick={fetchLogs}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition flex items-center gap-2"
          >
            <Filter size={18} />
            Filtrer
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
            <p className="text-slate-400 mt-4">Chargement des logs...</p>
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Date/Heure</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Entité</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">IP</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      Aucun log trouvé
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-700/50 transition">
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {formatLogDate(log)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-semibold">{log.user_email || 'Système'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-400">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{log.entity_type || log.resource || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.ip_address || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status || '' )}
                          <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${getStatusColor(log.status || '')}`}>
                            {ALL_STATUS_LABELS[log.status || ''] || log.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {log.error_message && (
                          <div className="flex items-center gap-2 text-blue-400 text-sm">
                            <AlertTriangle size={16} />
                            <span className="truncate max-w-xs">{log.error_message}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
