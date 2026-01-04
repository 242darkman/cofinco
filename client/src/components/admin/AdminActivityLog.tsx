import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Clock, User, Filter } from 'lucide-react';
import { auditApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

interface ActivityLog {
  id: string;
  user_id: string;
  user_email?: string;
  action: string;
  module?: string;
  details?: any;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export default function AdminActivityLog() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterModule, setFilterModule] = useState('');
  const [filterSuccess, setFilterSuccess] = useState('all');
  const [limit, setLimit] = useState(50);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: limit.toString() };
      if (filterModule) params.module = filterModule;
      if (filterSuccess !== 'all') params.success = filterSuccess;

      const data = await auditApi.getAll(params);
      setLogs(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des logs'));
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterSuccess, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const modules = Array.from(new Set(logs.map(l => l.module).filter(Boolean)));

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'À l\'instant';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)}min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    return new Date(date).toLocaleDateString('fr-FR');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity size={28} />
          Journal d'Activité ({logs.length})
        </h3>
        <div className="flex gap-2">
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
          >
            <option value="">Tous les modules</option>
            {modules.map(module => (
              <option key={module} value={module}>{module}</option>
            ))}
          </select>
          <select
            value={filterSuccess}
            onChange={(e) => setFilterSuccess(e.target.value)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
          >
            <option value="all">Tous</option>
            <option value="true">Succès</option>
            <option value="false">Échecs</option>
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Aucune activité</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div
              key={log.id}
              className={`bg-slate-700 rounded-lg p-4 border-l-4 ${
                log.success ? 'border-green-500' : 'border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white font-bold">{log.user_email || 'Utilisateur inconnu'}</span>
                    {log.module && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-bold">
                        {log.module}
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      log.success
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {log.success ? 'SUCCÈS' : 'ÉCHEC'}
                    </span>
                  </div>

                  <div className="text-slate-300 mb-2">{log.action}</div>

                  {log.error_message && (
                    <div className="text-sm text-blue-400 bg-blue-500/10 rounded px-3 py-2">
                      {log.error_message}
                    </div>
                  )}

                  {log.details && (
                    <details className="mt-2">
                      <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                        Voir détails
                      </summary>
                      <pre className="mt-2 text-xs text-slate-400 bg-slate-800 rounded p-3 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Clock size={14} />
                  <span>{formatTimeAgo(log.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
