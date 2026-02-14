import React, { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, Info, XCircle, Check, Plus, Trash2, RefreshCw } from 'lucide-react';
import { alertsApi, notificationApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import CreateAlertModal from './alerts/CreateAlertModal';

interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  is_read: boolean;
  createdAt: string;
  metadata?: any;
}

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      // Try new alerts API first, fallback to notifications
      try {
        const data = await alertsApi.getAll(showUnreadOnly);
        setAlerts(data || []);
        setUnreadCount(data?.filter((a: Alert) => !a.is_read).length || 0);
      } catch {
        // Fallback to notification API
        const params: { type?: string; unread?: boolean } = {};
        if (showUnreadOnly) params.unread = true;
        const data = await notificationApi.getAll(params);
        setAlerts(data || []);
        setUnreadCount(data?.filter((a: Alert) => !a.is_read).length || 0);
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des alertes'));
    } finally {
      setLoading(false);
    }
  }, [showUnreadOnly]);

  const deleteAlert = useCallback(async (alertId: string) => {
    if (!confirm('Supprimer cette alerte?')) return;

    try {
      await alertsApi.delete(alertId);
      toast.success('Alerte supprimée');
      fetchAlerts();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la suppression'));
    }
  }, [fetchAlerts]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const markAsRead = useCallback(async (alertId: string) => {
    try {
      await notificationApi.markAsRead(alertId);
      fetchAlerts();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du marquage'));
    }
  }, [fetchAlerts]);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationApi.markAllAsRead();
      fetchAlerts();
      toast.success('Toutes les alertes ont été marquées comme lues');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du marquage'));
    }
  }, [fetchAlerts]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'info': return 'border-status-info bg-status-info-bg';
      case 'warning': return 'border-accent bg-accent/10';
      case 'critical': return 'border-status-info bg-status-info-bg';
      default: return 'border-edge-strong bg-surface-elevated';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'info': return <Info size={20} className="text-status-info" />;
      case 'warning': return <AlertTriangle size={20} className="text-accent" />;
      case 'critical': return <XCircle size={20} className="text-status-info" />;
      default: return <Bell size={20} className="text-content-muted" />;
    }
  };

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'À l\'instant';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)}min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    return new Date(date).toLocaleDateString('fr-FR');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-2xl font-bold text-content-primary flex items-center gap-2">
            <Bell size={28} />
            Alertes ({alerts.length})
          </h3>
          {unreadCount > 0 && (
            <span className="px-3 py-1 bg-status-info text-white rounded-full text-sm font-bold">
              {unreadCount} non lues
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="p-2 bg-surface-elevated hover:bg-surface-subtle text-content-secondary rounded-lg transition"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              showUnreadOnly
                ? 'bg-status-info text-white'
                : 'bg-surface-elevated text-content-secondary hover:bg-surface-subtle'
            }`}
          >
            {showUnreadOnly ? 'Toutes' : 'Non lues'}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-status-success hover:bg-status-success text-white rounded-lg font-semibold transition flex items-center gap-2"
            >
              <Check size={16} />
              Tout marquer lu
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-status-warning hover:bg-status-warning text-white rounded-lg font-semibold transition flex items-center gap-2"
          >
            <Plus size={16} />
            Nouvelle alerte
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-12 text-content-muted">
          {showUnreadOnly ? 'Aucune alerte non lue' : 'Aucune alerte'}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-lg p-4 border-l-4 ${getSeverityColor(alert.severity)} ${
                alert.is_read ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-content-primary font-bold">{alert.title}</h4>
                      {!alert.is_read && (
                        <span className="w-2 h-2 bg-status-info rounded-full"></span>
                      )}
                    </div>
                    <p className="text-content-secondary text-sm mb-2">{alert.message}</p>
                    {alert.metadata && (
                      <details className="mt-2">
                        <summary className="text-xs text-content-muted cursor-pointer hover:text-content-secondary">
                          Détails
                        </summary>
                        <pre className="mt-2 text-xs text-content-muted bg-surface rounded p-2 overflow-x-auto">
                          {JSON.stringify(alert.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                    <div className="text-xs text-content-muted mt-2">
                      {formatTimeAgo(alert.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!alert.is_read && (
                    <button
                      onClick={() => markAsRead(alert.id)}
                      className="px-3 py-1 bg-surface-subtle hover:bg-surface-muted0 text-content-primary rounded text-sm font-semibold transition"
                    >
                      Marquer lu
                    </button>
                  )}
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="p-2 text-status-danger hover:bg-status-danger-bg rounded transition"
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Alert Modal */}
      <CreateAlertModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchAlerts}
      />
    </div>
  );
}
