import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Filter, Download, Search, Calendar, User, Eye, X } from 'lucide-react';
import { Card, Button, SelectField, Modal, ResponsiveTable } from '../ui';
import { auditApi, userApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'VIEW' | 'EXPORT' | 'OTHER';
  module: string;
  details: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  metadata?: any;
}

const formatLogDate = (log?: Partial<ActivityLog> | null) => {
  const value = log?.created_at ?? (log as any)?.createdAt ?? (log as any)?.timestamp;
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleString('fr-FR');
};

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [filterModule, setFilterModule] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT', 'OTHER'];
  const modules = ['Caisse', 'Clients', 'Crédits', 'Épargnes', 'Tontines', 'Comptabilité', 'Administration'];

  const loadUsers = useCallback(async () => {
    try {
      const data = await userApi.getAll();
      setUsers(data || []);
    } catch (error) {
      // Silent fail - users are optional for filtering
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await auditApi.getAll({ limit: 500 });
      const mapped = (data || []).map((log: any) => {
        const actionRaw = String(log.action_type ?? log.action ?? 'OTHER').toUpperCase();
        const allowed = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT', 'OTHER'];
        const actionType = allowed.includes(actionRaw) ? (actionRaw as ActivityLog['action_type']) : 'OTHER';
        const createdAt = log.created_at ?? log.createdAt ?? log.timestamp ?? null;
        return {
          id: log.id,
          user_id: log.user_id ?? log.userId ?? '',
          user_name: log.user_name ?? log.userName ?? 'Système',
          user_email: log.user_email ?? log.userEmail ?? '',
          action: log.action ?? '',
          action_type: actionType,
          module: log.module ?? log.resource ?? 'N/A',
          details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details ?? {}),
          ip_address: log.ip_address ?? log.ipAddress ?? '',
          user_agent: log.user_agent ?? log.userAgent ?? '',
          created_at: createdAt || new Date().toISOString(),
          metadata: log.metadata ?? null,
        } as ActivityLog;
      });
      setLogs(mapped);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des logs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadLogs();
  }, [loadUsers, loadLogs]);

  useEffect(() => {
    applyFilters();
  }, [logs, searchQuery, filterUser, filterAction, filterModule, dateFrom, dateTo]);

  const applyFilters = () => {
    let filtered = [...logs];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        (log.user_name || '').toLowerCase().includes(query) ||
        (log.action || '').toLowerCase().includes(query) ||
        (log.details || '').toLowerCase().includes(query) ||
        (log.ip_address || '').includes(query)
      );
    }

    if (filterUser !== 'all') {
      filtered = filtered.filter(log => log.user_id === filterUser);
    }

    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action_type === filterAction);
    }

    if (filterModule !== 'all') {
      filtered = filtered.filter(log => log.module === filterModule);
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter((log) => {
        const date = new Date(log.created_at);
        return !Number.isNaN(date.getTime()) && date >= fromDate;
      });
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59);
      filtered = filtered.filter((log) => {
        const date = new Date(log.created_at);
        return !Number.isNaN(date.getTime()) && date <= toDate;
      });
    }

    setFilteredLogs(filtered);
  };

  const exportLogs = () => {
    const csv = [
      ['Date', 'Utilisateur', 'Email', 'Action', 'Type', 'Module', 'Détails', 'IP'].join(','),
      ...filteredLogs.map(log => [
        formatLogDate(log),
        log.user_name,
        log.user_email,
        log.action,
        log.action_type,
        log.module,
        `"${(log.details || '').replace(/"/g, '""')}"`,
        log.ip_address || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `logs_activite_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'CREATE': return 'text-green-400 bg-green-500/20';
      case 'UPDATE': return 'text-blue-400 bg-blue-500/20';
      case 'DELETE': return 'text-blue-400 bg-blue-500/20';
      case 'LOGIN': return 'text-cyan-400 bg-cyan-500/20';
      case 'LOGOUT': return 'text-slate-400 bg-slate-500/20';
      case 'VIEW': return 'text-emerald-400 bg-emerald-500/20';
      case 'EXPORT': return 'text-cyan-400 bg-cyan-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const tableColumns = [
    { 
      key: 'created_at', 
      label: 'Date/Heure', 
      format: (val: any, item: ActivityLog) => formatLogDate(item),
    },
    { 
      key: 'user_name', 
      label: 'Utilisateur',
      primary: true,
      format: (_: any, item: ActivityLog) => (
        <div>
          <p className="font-semibold text-white">{item.user_name}</p>
          <p className="text-xs text-slate-500">{item.user_email}</p>
        </div>
      )
    },
    { 
      key: 'action_type', 
      label: 'Type',
      format: (val: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getActionColor(val)}`}>
          {val}
        </span>
      )
    },
    { key: 'action', label: 'Action' },
    { key: 'module', label: 'Module' },
    { 
      key: 'details', 
      label: 'Détails',
      hideOnMobile: true,
      format: (val: string) => <span className="max-w-xs truncate block">{typeof val === 'object' ? JSON.stringify(val) : val}</span>
    }
  ];

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterUser, filterAction, filterModule, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="h-full flex flex-col space-y-2">
      <Card variant="default" padding="none" className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Header & Controls */}
        <div className="p-4 border-b border-edge bg-surface-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-content-primary">Logs d'Activité</h2>
                <p className="text-xs sm:text-sm text-content-muted">Historique des actions ({filteredLogs.length})</p>
              </div>
            </div>
            <div className="flex gap-2">
               <Button
                variant="secondary"
                size="sm"
                icon={Filter}
                onClick={() => setShowFilters(!showFilters)}
                className={`shadow-sm ${showFilters ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
              >
                Filtres
              </Button>
              <Button
                variant="success"
                size="sm"
                icon={Download}
                onClick={exportLogs}
                className="shadow-lg shadow-success/20"
              >
                Exporter
              </Button>
            </div>
          </div>

          <div className="space-y-3">
             {/* Search Bar - Always Visible */}
             <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher dans les logs..."
                className="w-full pl-10 pr-4 py-2 bg-surface-base border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
            </div>

            {/* Collapsible Advanced Filters */}
            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-edge animate-in slide-in-from-top-2 duration-200">
                <SelectField
                  label="Utilisateur"
                  name="filterUser"
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  options={[
                    { value: 'all', label: 'Tous les utilisateurs' },
                    ...users.map(u => ({ value: u.id, label: `${u.nom} ${u.prenom}` }))
                  ]}
                  containerClassName="mt-0"
                />

                <SelectField
                  label="Type d'action"
                  name="filterAction"
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  options={[
                    { value: 'all', label: 'Tous les types' },
                    ...actionTypes.map(t => ({ value: t, label: t }))
                  ]}
                  containerClassName="mt-0"
                />

                <SelectField
                  label="Module"
                  name="filterModule"
                  value={filterModule}
                  onChange={(e) => setFilterModule(e.target.value)}
                  options={[
                    { value: 'all', label: 'Tous les modules' },
                    ...modules.map(m => ({ value: m, label: m }))
                  ]}
                  containerClassName="mt-0"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div className="w-full">
                     <label className="block text-xs font-semibold text-content-secondary mb-1.5">Début</label>
                     <div className="relative">
                       <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                      />
                     </div>
                  </div>
                  <div className="w-full">
                     <label className="block text-xs font-semibold text-content-secondary mb-1.5">Fin</label>
                     <div className="relative">
                       <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary focus:border-primary outline-none"
                      />
                     </div>
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                   <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterUser('all');
                      setFilterAction('all');
                      setFilterModule('all');
                      setDateFrom('');
                      setDateTo('');
                      setCurrentPage(1);
                    }}
                    className="text-content-muted hover:text-content-primary"
                  >
                    Réinitialiser tout
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-content-muted text-sm mt-3">Chargement de l'historique...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <Activity size={48} className="opacity-20 mb-4" />
            <p className="text-sm">Aucun log trouvé pour ces critères</p>
          </div>
        ) : (
           <div className="bg-surface-base flex-1 flex flex-col overflow-hidden min-h-0">
             <div className="flex-1 overflow-y-auto custom-scrollbar">
               <ResponsiveTable
                data={paginatedLogs}
                columns={tableColumns}
                loading={loading}
                emptyMessage="Aucun log trouvé"
                mobileBreakpoint="md"
                actions={(item) => (
                  <div className="flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Eye}
                      onClick={() => setSelectedLog(item)}
                      className="text-cyan-400 hover:bg-cyan-500/10 w-8 h-8 p-0"
                      aria-label="Voir détails"
                    />
                  </div>
                )}
              />
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-edge flex items-center justify-between bg-surface-muted/10">
                <p className="text-xs text-content-muted hidden sm:block">
                  Affichage de <span className="font-medium text-content-primary">{(currentPage - 1) * itemsPerPage + 1}</span> à <span className="font-medium text-content-primary">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> sur {filteredLogs.length}
                </p>
                <div className="flex items-center gap-2 mx-auto sm:mx-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="h-8 px-3"
                  >
                    Précédent
                  </Button>
                  <span className="text-sm font-medium text-content-primary px-2">
                    Page {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="h-8 px-3"
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Log Details Modal */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title="Détails de l'activité"
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface-muted rounded-lg border border-edge">
              <div className="w-10 h-10 rounded-full bg-surface-base flex items-center justify-center border border-edge">
                <User className="text-content-secondary" size={20} />
              </div>
              <div>
                <p className="font-semibold text-content-primary">{selectedLog.user_name}</p>
                <p className="text-xs text-content-muted">{selectedLog.user_email}</p>
              </div>
              <div className="ml-auto text-right">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getActionColor(selectedLog.action_type)}`}>
                  {selectedLog.action_type}
                </span>
                <p className="text-xs text-content-muted mt-1">{formatLogDate(selectedLog)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-surface-muted/50 rounded-lg border border-edge">
                <p className="text-xs font-semibold text-content-muted uppercase mb-1">Module</p>
                <p className="text-sm font-medium text-content-primary flex items-center gap-2">
                   {selectedLog.module || 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-surface-muted/50 rounded-lg border border-edge">
                <p className="text-xs font-semibold text-content-muted uppercase mb-1">IP</p>
                <p className="text-sm font-medium text-content-primary font-mono">{selectedLog.ip_address || 'N/A'}</p>
              </div>
            </div>

            <div className="p-3 bg-surface-muted/50 rounded-lg border border-edge">
               <p className="text-xs font-semibold text-content-muted uppercase mb-1">Action</p>
               <p className="text-sm text-content-primary">{selectedLog.action}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-content-muted uppercase mb-2">Détails techniques</p>
              <div className="bg-surface-base p-3 rounded-lg border border-edge overflow-x-auto">
                <pre className="text-xs text-content-secondary font-mono whitespace-pre-wrap break-all">
                  {typeof selectedLog.details === 'object' ? JSON.stringify(selectedLog.details, null, 2) : selectedLog.details}
                </pre>
              </div>
            </div>
            
            {selectedLog.metadata && (
              <div>
                <p className="text-xs font-semibold text-content-muted uppercase mb-2">Métadonnées</p>
                <div className="bg-surface-base p-3 rounded-lg border border-edge overflow-x-auto">
                  <pre className="text-xs text-content-secondary font-mono">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

