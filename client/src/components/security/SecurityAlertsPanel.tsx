import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Shield, CheckCircle, Eye, Clock, Download, FileText, FileSpreadsheet } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import StatCard from '../ui/StatCard';
import Modal from '../ui/Modal';
import { notificationApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { ALL_STATUS_LABELS } from '../../lib/status-labels';
import { addPdfLogoHeader } from '@/lib/pdf-logo';
import { useBranding } from '@/contexts/BrandingContext';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '@/lib/lazy-export';

interface SecurityAlert {
  id: string;
  alertType: string;
  severity: string;
  userEmail: string;
  description: string;
  details: any;
  ipAddress: string;
  status: string;
  createdAt: string;
  resolvedAt: string;
  resolutionNotes: string;
}

export default function SecurityAlertsPanel() {
  const { branding } = useBranding();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolutionModal, setShowResolutionModal] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: { type?: string; unread?: boolean; since?: string } = { type: 'security' };
      const data = await notificationApi.getAll(params);
      let filteredData = data || [];

      if (filterSeverity !== 'all') {
        filteredData = filteredData.filter((a: SecurityAlert) => a.severity === filterSeverity);
      }
      if (filterStatus !== 'all') {
        filteredData = filteredData.filter((a: SecurityAlert) => a.status === filterStatus);
      }

      setAlerts(filteredData.slice(0, 50));
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement alertes'));
    } finally {
      setLoading(false);
    }
  }, [filterSeverity, filterStatus]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const resolveAlert = useCallback(async (alertId: string, notes: string) => {
    try {
      await notificationApi.markAsRead(alertId);
      toast.success('Alerte résolue avec succès !');
      fetchAlerts();
      setSelectedAlert(null);
      setShowResolutionModal(false);
      setResolutionNotes('');
    } catch (error: any) {
      toast.error(handleApiError(error, 'Erreur lors de la résolution'));
    }
  }, [fetchAlerts]);

  const markFalsePositive = useCallback(async (alertId: string) => {
    try {
      await notificationApi.markAsRead(alertId);
      toast.success('Marqué comme faux positif');
      fetchAlerts();
    } catch (error: any) {
      toast.error(handleApiError(error, 'Erreur mise à jour'));
    }
  }, [fetchAlerts]);


  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'MULTIPLE_LOGIN_FAILURES': 'Tentatives de connexion multiples',
      'SUSPICIOUS_ACTIVITY': 'Activité suspecte',
      'UNAUTHORIZED_ACCESS': 'Accès non autorisé',
      'LARGE_TRANSACTION': 'Transaction importante',
      'DATA_BREACH': 'Fuite de données',
      'UNUSUAL_HOURS': 'Heures inhabituelles',
      'PRIVILEGE_ESCALATION': 'Escalade de privilèges'
    };
    return labels[type] || type;
  };

  const exportToCSV = () => {
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const BOM = '\uFEFF';
    const separator = ';';
    
    let csvContent = BOM;
    csvContent += `RAPPORT D'ALERTES DE SÉCURITÉ - ${branding.appName}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Total alertes: ${alerts.length}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Date${separator}Type${separator}Sévérité${separator}Statut${separator}Utilisateur${separator}IP\n`;
    
    alerts.forEach((alert, idx) => {
      csvContent += `${idx + 1}${separator}${new Date(alert.createdAt).toLocaleString('fr-FR')}${separator}${getTypeLabel(alert.alertType)}${separator}${ALL_STATUS_LABELS[alert.severity] || alert.severity}${separator}${ALL_STATUS_LABELS[alert.status] || alert.status}${separator}${alert.userEmail || 'N/A'}${separator}${alert.ipAddress || '-'}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.appName}_Alertes_Securite_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportToPDF = async () => {
    // P4.1: Lazy-load PDF library
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const activeCount = alerts.filter(a => a.status === 'active').length;
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;

    const startY = addPdfLogoHeader(doc, {
      title: "RAPPORT D'ALERTES DE SÉCURITÉ",
      subtitle: `Total: ${alerts.length} | Actives: ${activeCount} | Critiques: ${criticalCount}`,
      dateRight: `Date: ${dateExport}`,
      appName: branding.appName,
    });

    const tableData = alerts.slice(0, 50).map((alert, idx) => [
      idx + 1,
      new Date(alert.createdAt).toLocaleString('fr-FR'),
      getTypeLabel(alert.alertType),
      alert.severity.toUpperCase(),
      alert.status,
      alert.userEmail || 'N/A'
    ]);

    autoTable(doc, {
      head: [['N°', 'Date', 'Type', 'Sévérité', 'Statut', 'Utilisateur']],
      body: tableData,
      startY,
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    doc.save(`${branding.appName}_Alertes_Securite_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportMenu(false);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: `Rapport d'Alertes de Sécurité ${branding.appName}`,
      dateExport: new Date().toISOString(),
      statistiques: {
        total: alerts.length,
        actives: alerts.filter(a => a.status === 'active').length,
        critiques: alerts.filter(a => a.severity === 'critical').length,
        resolues: alerts.filter(a => a.status === 'resolved').length
      },
      alertes: alerts.map(alert => ({
        id: alert.id,
        type: alert.alertType,
        typeLibelle: getTypeLabel(alert.alertType),
        severite: alert.severity,
        statut: alert.status,
        utilisateur: alert.userEmail,
        ip: alert.ipAddress,
        description: alert.description,
        dateCreation: alert.createdAt,
        dateResolution: alert.resolvedAt,
        notes: alert.resolutionNotes
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.appName}_Alertes_Securite_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical' && a.status === 'active').length,
    high: alerts.filter(a => a.severity === 'high' && a.status === 'active').length,
    active: alerts.filter(a => a.status === 'active').length
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-status-info to-accent rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1">Alertes de Sécurité</h2>
            <p className="text-status-info-text text-sm sm:text-base">Détection et gestion des menaces en temps réel</p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                variant="ghost" 
                className="bg-white/20 hover:bg-white/30 text-content-primary w-full sm:w-auto"
                icon={Download}
              >
                Export
              </Button>
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Alertes"
          value={stats.total}
          icon={Shield}
          color="neutral"
        />
        <StatCard
          title="Critiques"
          value={stats.critical}
          icon={AlertTriangle}
          color="danger"
        />
        <StatCard
          title="Élevées"
          value={stats.high}
          icon={AlertTriangle}
          color="warning"
        />
        <StatCard
          title="Actives"
          value={stats.active}
          icon={Clock}
          color="primary"
          trend={`${stats.active} en cours`}
        />
      </div>

      <Card>
        <Card.Header className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <span>Liste des Alertes</span>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="px-3 py-2 bg-surface text-content-primary rounded-lg border border-edge-strong focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                >
                    <option value="all">Sévérité (Toutes)</option>
                    <option value="critical">Critiques</option>
                    <option value="high">Élevées</option>
                    <option value="medium">Moyennes</option>
                    <option value="low">Faibles</option>
                </select>

                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 bg-surface text-content-primary rounded-lg border border-edge-strong focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                >
                    <option value="all">Statut (Tous)</option>
                    <option value="active">Actives</option>
                    <option value="investigating">En investigation</option>
                    <option value="resolved">Résolues</option>
                    <option value="false_positive">Faux positifs</option>
                </select>

                <Button onClick={fetchAlerts} size="sm" variant="secondary">
                    Actualiser
                </Button>
            </div>
        </Card.Header>
        <Card.Content className="space-y-3">

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-status-info mx-auto"></div>
            <p className="text-content-muted mt-4">Chargement des alertes...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle size={48} className="text-status-success mx-auto mb-4" />
                <p className="text-content-muted">Aucune alerte trouvée</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <Card
                  key={alert.id}
                  variant="glass"
                  className={`
                    border-l-4 cursor-pointer hover:bg-surface-elevated/30 transition-colors
                    ${alert.severity === 'critical' ? 'border-l-status-info' :
                      alert.severity === 'high' ? 'border-l-status-success' :
                      alert.severity === 'medium' ? 'border-l-accent' :
                      'border-l-edge-strong'}
                  `}
                  onClick={() => setSelectedAlert(alert)}
                  padding="sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <Badge 
                            value={alert.severity.toUpperCase()} 
                            variant={
                                alert.severity === 'critical' ? 'danger' : 
                                alert.severity === 'high' ? 'warning' : 
                                alert.severity === 'medium' ? 'info' : 'neutral'
                            }
                        />
                        <span className="text-content-muted text-xs">
                          {new Date(alert.createdAt).toLocaleString('fr-FR')}
                        </span>
                        {alert.status === 'active' && (
                          <Badge value="ACTIVE" variant="primary" className="animate-pulse" />
                        )}
                      </div>
                      <div className="text-content-primary font-bold text-base mb-1">
                        {getTypeLabel(alert.alertType)}
                      </div>
                      <div className="text-content-secondary text-sm mb-2">{alert.description}</div>
                      {alert.userEmail && (
                        <div className="text-xs text-content-muted">
                          Utilisateur: <span className="text-accent">{alert.userEmail}</span>
                        </div>
                      )}
                      {alert.ipAddress && (
                        <div className="text-xs text-content-muted">
                          IP: <span className="text-accent font-mono">{alert.ipAddress}</span>
                        </div>
                      )}
                    </div>
                    <Eye className="text-content-muted" size={18} />
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
        </Card.Content>
      </Card>

      <Modal
        isOpen={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title="Détails de l'Alerte"
        size="lg"
        variant={
            selectedAlert?.severity === 'critical' ? 'danger' :
            selectedAlert?.severity === 'high' ? 'warning' : 'default'
        }
      >
        {selectedAlert && (
          <div className="space-y-4">
              <div className="bg-surface rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-content-muted mb-1">Type</div>
                    <div className="text-content-primary font-semibold">{getTypeLabel(selectedAlert.alertType)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-content-muted mb-1">Sévérité</div>
                    <Badge 
                        value={selectedAlert.severity.toUpperCase()} 
                        variant={
                            selectedAlert.severity === 'critical' ? 'danger' : 
                            selectedAlert.severity === 'high' ? 'warning' : 
                            selectedAlert.severity === 'medium' ? 'info' : 'neutral'
                        }
                    />
                  </div>
                  <div>
                    <div className="text-sm text-content-muted mb-1">Date</div>
                    <div className="text-content-primary">{new Date(selectedAlert.createdAt).toLocaleString('fr-FR')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-content-muted mb-1">Statut</div>
                    <div className="text-content-primary capitalize">{ALL_STATUS_LABELS[selectedAlert.status] || selectedAlert.status}</div>
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-xl p-4">
                <div className="text-sm text-content-muted mb-2">Description</div>
                <div className="text-content-primary">{selectedAlert.description}</div>
              </div>

              {selectedAlert.details && (
                <div className="bg-surface rounded-xl p-4">
                  <div className="text-sm text-content-muted mb-2">Détails Techniques</div>
                  <pre className="text-accent text-xs sm:text-sm bg-surface-base p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedAlert.details, null, 2)}
                  </pre>
                </div>
              )}

              {selectedAlert.status === 'active' && !showResolutionModal && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowResolutionModal(true)}
                    variant="success"
                    fullWidth
                  >
                    Résoudre
                  </Button>
                  <Button
                    onClick={() => markFalsePositive(selectedAlert.id)}
                    variant="secondary"
                    fullWidth
                  >
                    Faux Positif
                  </Button>
                </div>
              )}

              {selectedAlert.status === 'active' && showResolutionModal && (
                <div className="bg-surface rounded-xl p-4 space-y-3">
                  <label className="block text-sm font-semibold text-content-secondary">Notes de résolution</label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full bg-surface-elevated border border-edge-strong rounded-lg px-4 py-3 text-content-primary placeholder-content-muted"
                    rows={3}
                    placeholder="Décrivez les actions entreprises pour résoudre cette alerte..."
                  />
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        if (resolutionNotes.trim()) {
                          resolveAlert(selectedAlert.id, resolutionNotes);
                        } else {
                          toast.warning('Veuillez entrer des notes de résolution');
                        }
                      }}
                      variant="success"
                      fullWidth
                    >
                      Confirmer Résolution
                    </Button>
                    <Button
                      onClick={() => {
                        setShowResolutionModal(false);
                        setResolutionNotes('');
                      }}
                      variant="ghost"
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {selectedAlert.resolutionNotes && (
                <div className="bg-status-success-bg border border-status-success/30 rounded-xl p-4">
                  <div className="text-sm text-status-success mb-2">Notes de Résolution</div>
                  <div className="text-content-primary">{selectedAlert.resolutionNotes}</div>
                  <div className="text-sm text-content-muted mt-2">
                    Résolu le: {new Date(selectedAlert.resolvedAt).toLocaleString('fr-FR')}
                  </div>
                </div>
              )}
          </div>
        )}
      </Modal>
    </div>
  );
}
