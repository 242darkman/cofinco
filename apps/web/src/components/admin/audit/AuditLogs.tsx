import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Filter, Download, Search, AlertTriangle, CheckCircle, XCircle, Clock, FileSpreadsheet, FileText } from 'lucide-react';
import { addPdfLogoHeader } from '@/lib/pdf-logo';
import { useBranding } from '@/contexts/BrandingContext';
import { auditApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { ALL_STATUS_LABELS } from '../../../lib/status-labels';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '@/lib/lazy-export';

interface AuditLog {
  id: string;
  timestamp?: string;
  createdAt?: string;
  userEmail?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  resource?: string;
  status?: string;
  ipAddress?: string;
  errorMessage?: string;
}

const formatLogDate = (log: any) => {
  const value = log?.timestamp ?? log?.createdAt;
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
  const { branding } = useBranding();
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
      log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.entityType ?? log.resource ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const exportToCSV = () => {
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const BOM = '\uFEFF';
    const separator = ';';
    
    let csvContent = BOM;
    csvContent += `JOURNAL D'AUDIT - ${branding.appName}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Total: ${stats.total} | Succès: ${stats.success} | Échecs: ${stats.failure}${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Date/Heure${separator}Utilisateur${separator}Action${separator}Entité${separator}IP${separator}Statut${separator}Message\n`;
    
    filteredLogs.forEach((log, idx) => {
      csvContent += `${idx + 1}${separator}${formatLogDate(log)}${separator}${log.userEmail || 'Système'}${separator}${log.action}${separator}${log.entityType || log.resource || 'N/A'}${separator}${log.ipAddress || '-'}${separator}${ALL_STATUS_LABELS[log.status || ''] || log.status}${separator}${log.errorMessage || '-'}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.appName}_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportToPDF = async () => {
    // P4.1: Lazy-load PDF library
    const { jsPDF } = await loadPDFLibraries();
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');

    const startY = addPdfLogoHeader(doc, {
      title: "JOURNAL D'AUDIT",
      subtitle: `Total: ${stats.total} | Succès: ${stats.success} | Échecs: ${stats.failure}`,
      dateRight: `Export: ${dateExport}`,
      appName: branding.appName,
    });

    const tableData = filteredLogs.slice(0, 50).map((log, idx) => [
      idx + 1,
      formatLogDate(log),
      log.userEmail || 'Système',
      log.action,
      log.entityType || log.resource || 'N/A',
      log.status
    ]);

    (doc as any).autoTable({
      head: [['N°', 'Date/Heure', 'Utilisateur', 'Action', 'Entité', 'Statut']],
      body: tableData,
      startY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });
    
    doc.save(`${branding.appName}_Audit_Logs_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportMenu(false);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: `Journal d'Audit ${branding.appName}`,
      dateExport: new Date().toISOString(),
      statistiques: stats,
      logs: filteredLogs.map(log => ({
        date: log.timestamp ?? log.createdAt,
        utilisateur: log.userEmail,
        action: log.action,
        entite: log.entityType || log.resource || 'N/A',
        ip: log.ipAddress,
        statut: log.status,
        message: log.errorMessage
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.appName}_Audit_Logs_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="text-status-success" size={20} />;
      case 'failure': return <XCircle className="text-status-info" size={20} />;
      case 'pending': return <Clock className="text-accent" size={20} />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-status-success-bg text-status-success';
      case 'failure': return 'bg-status-info-bg text-status-info';
      case 'pending': return 'bg-accent/10 text-accent';
      default: return 'bg-surface-subtle/40 text-content-muted';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-status-success to-accent rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Journal d'Audit</h2>
            <p className="text-status-success-text">Suivi complet des actions système</p>
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
                <button
                  onClick={exportToCSV}
                  className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary"
                >
                  <FileSpreadsheet size={18} className="text-status-success" />
                  <div>
                    <div className="font-semibold">Excel (CSV)</div>
                    <div className="text-xs text-content-muted">Tableur compatible Excel</div>
                  </div>
                </button>
                <button
                  onClick={exportToPDF}
                  className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary border-t border-edge"
                >
                  <FileText size={18} className="text-status-danger" />
                  <div>
                    <div className="font-semibold">PDF</div>
                    <div className="text-xs text-content-muted">Document formaté</div>
                  </div>
                </button>
                <button
                  onClick={exportToJSON}
                  className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary border-t border-edge"
                >
                  <Shield size={18} className="text-status-info" />
                  <div>
                    <div className="font-semibold">JSON</div>
                    <div className="text-xs text-content-muted">Données structurées</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-status-info to-accent rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Total Actions</span>
            <Shield size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.total.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-status-success to-status-success rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Succès</span>
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.success.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-status-info to-accent rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Échecs</span>
            <XCircle size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.failure.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-accent to-status-success rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">En Attente</span>
            <Clock size={24} />
          </div>
          <div className="text-3xl font-bold">{stats.pending.toLocaleString()}</div>
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
                placeholder="Rechercher..."
                className="w-full pl-10 pr-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
              />
            </div>
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
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
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
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
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
            placeholder="Date début"
          />

          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="px-4 py-3 bg-surface-elevated text-content-primary rounded-xl border border-edge-strong focus:outline-none focus:ring-2 focus:ring-status-success"
            placeholder="Date fin"
          />

          <button
            onClick={fetchLogs}
            className="px-6 py-3 bg-status-success hover:bg-status-success text-white rounded-xl transition flex items-center gap-2"
          >
            <Filter size={18} />
            Filtrer
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-status-success mx-auto"></div>
            <p className="text-content-muted mt-4">Chargement des logs...</p>
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead className="bg-surface-elevated">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Date/Heure</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Entité</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">IP</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-content-secondary">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-content-muted">
                      Aucun log trouvé
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-elevated/50 transition">
                      <td className="px-4 py-3 text-content-secondary text-sm">
                        {formatLogDate(log)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-content-primary font-semibold">{log.userEmail || 'Système'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-status-info-bg text-status-info">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-content-secondary">{log.entityType || log.resource || 'N/A'}</td>
                      <td className="px-4 py-3 text-content-muted font-mono text-xs">{log.ipAddress || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status || '' )}
                          <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${getStatusColor(log.status || '')}`}>
                            {ALL_STATUS_LABELS[log.status || ''] || log.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {log.errorMessage && (
                          <div className="flex items-center gap-2 text-status-info text-sm">
                            <AlertTriangle size={16} />
                            <span className="truncate max-w-xs">{log.errorMessage}</span>
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
