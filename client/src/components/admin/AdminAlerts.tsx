import React, { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, Info, XCircle, Check } from 'lucide-react';
import { notificationApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  metadata?: any;
}

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const params: { type?: string; unread?: boolean } = {};
      if (showUnreadOnly) params.unread = true;

      const data = await notificationApi.getAll(params);

      setAlerts(data || []);
      setUnreadCount(data?.filter((a: Alert) => !a.is_read).length || 0);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des alertes'));
    }
  }, [showUnreadOnly]);

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
      case 'info': return 'border-blue-500 bg-blue-500/10';
      case 'warning': return 'border-cyan-500 bg-cyan-500/10';
      case 'critical': return 'border-blue-500 bg-blue-500/10';
      default: return 'border-slate-500 bg-slate-700';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'info': return <Info size={20} className="text-blue-400" />;
      case 'warning': return <AlertTriangle size={20} className="text-cyan-400" />;
      case 'critical': return <XCircle size={20} className="text-blue-400" />;
      default: return <Bell size={20} className="text-slate-400" />;
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
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell size={28} />
            Alertes ({alerts.length})
          </h3>
          {unreadCount > 0 && (
            <span className="px-3 py-1 bg-blue-500 text-white rounded-full text-sm font-bold">
              {unreadCount} non lues
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              showUnreadOnly
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {showUnreadOnly ? 'Toutes' : 'Non lues'}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition flex items-center gap-2"
            >
              <Check size={16} />
              Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
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
                      <h4 className="text-white font-bold">{alert.title}</h4>
                      {!alert.is_read && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-slate-300 text-sm mb-2">{alert.message}</p>
                    {alert.metadata && (
                      <details className="mt-2">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                          Détails
                        </summary>
                        <pre className="mt-2 text-xs text-slate-400 bg-slate-800 rounded p-2 overflow-x-auto">
                          {JSON.stringify(alert.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                    <div className="text-xs text-slate-400 mt-2">
                      {formatTimeAgo(alert.created_at)}
                    </div>
                  </div>
                </div>
                {!alert.is_read && (
                  <button
                    onClick={() => markAsRead(alert.id)}
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-semibold transition"
                  >
                    Marquer lu
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
