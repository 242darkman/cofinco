import { useState, useEffect, useCallback } from 'react';
import {
  Search, ChevronLeft, ChevronRight, Eye,
  Download, RefreshCw, Calendar, Terminal, Activity, Clock
} from 'lucide-react';
import { FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import { auditApi } from '../../lib/api-client';
import { toast } from '../../lib/toast';

interface LogEntry {
  id: string;
  date: string;
  user: string;
  userEmail?: string;
  action: string;
  module: string;
  details: any;
  status: 'success' | 'error' | 'warning';
  ip?: string;
  userAgent?: string;
  errorMessage?: string;
  createdAt?: string;
}

interface AdminActivityLogsProps {
  /**
   * 'compact' - Simple card-based view for embedded use (e.g., AdminGestionAcces)
   * 'full' - Full-featured table view with pagination and details drawer (default)
   */
  variant?: 'compact' | 'full';
  /** Max items to show in compact mode (default: 50) */
  compactLimit?: number;
}

/**
 * Unified Activity Logs Component
 * Supports both compact (embedded) and full (standalone) modes
 */
export default function AdminActivityLogs({
  variant = 'full',
  compactLimit = 50
}: AdminActivityLogsProps) {
  // Pagination state (full mode)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(variant === 'compact' ? compactLimit : 10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterSuccess, setFilterSuccess] = useState('all');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Unique modules for filter dropdown
  const modules = Array.from(new Set(logs.map(l => l.module).filter(Boolean)));

  // Sanitize resource field — some legacy logs stored a JSON object instead of a module name
  const sanitizeModule = (raw: any): string => {
    if (!raw) return 'SYSTEM';
    const str = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        const parsed = typeof raw === 'object' ? raw : JSON.parse(str);
        return parsed.entityType || parsed.module || parsed.resource || 'SYSTEM';
      } catch { return 'SYSTEM'; }
    }
    return str;
  };

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      if (variant === 'compact') {
        // Simple fetch for compact mode
        const params: Record<string, string> = { limit: limit.toString() };
        if (filterModule) params.module = filterModule;
        if (filterSuccess !== 'all') params.success = filterSuccess;

        const data = await auditApi.getAll(params);
        const mappedLogs: LogEntry[] = (data || []).map((item: any) => {
          const ts = item.created_at || item.createdAt;
          return {
            id: item.id,
            date: (() => {
              try {
                const d = new Date(ts);
                return !isNaN(d.getTime()) ? d.toLocaleString('fr-FR') : '—';
              } catch { return '—'; }
            })(),
            user: item.user_nom ? `${item.user_prenom || ''} ${item.user_nom}`.trim() : item.user_email || item.userName || item.userEmail || 'Système',
            userEmail: item.user_email || item.userEmail,
            action: item.action || 'UNKNOWN',
            module: sanitizeModule(item.resource || item.module || item.entityType),
            details: item.details || {},
            status: item.statut === 'FAILURE' || item.success === false ? 'error' : 'success',
            errorMessage: item.errorMessage,
            createdAt: ts,
          };
        });
        setLogs(mappedLogs);
        setTotal(mappedLogs.length);
      } else {
        // Paginated fetch for full mode
        const response = await auditApi.getPaginated({
          page,
          limit,
          search
        });

        const mappedLogs: LogEntry[] = response.data.map((item: any) => {
          const ts = item.created_at || item.createdAt;
          return {
            id: item.id,
            date: (() => {
              try {
                const d = new Date(ts);
                return !isNaN(d.getTime()) ? d.toLocaleString('fr-FR') : '—';
              } catch { return '—'; }
            })(),
            user: item.user_nom ? `${item.user_prenom || ''} ${item.user_nom}`.trim() : item.userName || 'Système',
            action: item.action || 'UNKNOWN',
            module: sanitizeModule(item.resource || item.module || item.entityType),
            details: item.details || {},
            status: item.statut === 'FAILURE' || item.success === false ? 'error' : 'success',
            ip: item.ip_address || item.ipAddress || 'N/A',
            userAgent: item.user_agent || item.userAgent || ''
          };
        });

        setLogs(mappedLogs);

        if (response.meta?.pagination) {
          setTotal(response.meta.pagination.totalItems || 0);
        } else if ((response as any).pagination) {
          setTotal((response as any).pagination.total || 0);
        } else {
          setTotal(mappedLogs.length);
        }
      }
    } catch (error) {
      console.error("Erreur chargement logs:", error);
      toast.error("Impossible de charger l'historique");
    } finally {
      setLoading(false);
    }
  }, [variant, page, limit, search, filterModule, filterSuccess]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, variant === 'full' ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchLogs, variant]);

  const totalPages = Math.ceil(total / limit) || 1;

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'À l\'instant';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)}min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    return new Date(date).toLocaleDateString('fr-FR');
  };

  // ============================================
  // COMPACT MODE RENDER
  // ============================================
  if (variant === 'compact') {
    return (
      <div className="space-y-6">
        <FeatureHeader
          featureKey="admin.activity"
          title={`${FEATURE_DESCRIPTIONS['admin.activity'].title} (${logs.length})`}
          subtitle={FEATURE_DESCRIPTIONS['admin.activity'].subtitle}
          helpText={FEATURE_DESCRIPTIONS['admin.activity'].helpText}
          icon={<Activity size={28} className="text-accent" />}
          actions={
            <div className="flex gap-2 flex-wrap">
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="px-4 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm"
            >
              <option value="">Tous les modules</option>
              {modules.map(module => (
                <option key={module} value={module}>{module}</option>
              ))}
            </select>
            <select
              value={filterSuccess}
              onChange={(e) => setFilterSuccess(e.target.value)}
              className="px-4 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm"
            >
              <option value="all">Tous</option>
              <option value="true">Succès</option>
              <option value="false">Échecs</option>
            </select>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-4 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
            </select>
            </div>
          }
        />

        {loading ? (
          <div className="text-center py-12 text-content-muted">Chargement...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-content-muted">Aucune activité</div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div
                key={log.id}
                className={`bg-surface-elevated rounded-lg p-4 border-l-4 ${
                  log.status === 'success' ? 'border-status-success' : 'border-status-danger'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-content-primary font-bold">{log.userEmail || log.user || 'Utilisateur inconnu'}</span>
                      {log.module && (
                        <span className="px-2 py-1 bg-status-info-bg text-status-info rounded text-xs font-bold">
                          {log.module}
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        log.status === 'success'
                          ? 'bg-status-success-bg text-status-success'
                          : 'bg-status-danger-bg text-status-danger'
                      }`}>
                        {log.status === 'success' ? 'SUCCÈS' : 'ÉCHEC'}
                      </span>
                    </div>

                    <div className="text-content-secondary mb-2">{log.action}</div>

                    {log.errorMessage && (
                      <div className="text-sm text-status-danger bg-status-danger-bg rounded px-3 py-2">
                        {log.errorMessage}
                      </div>
                    )}

                    {log.details && Object.keys(log.details).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-sm text-content-muted cursor-pointer hover:text-content-secondary">
                          Voir détails
                        </summary>
                        <pre className="mt-2 text-xs text-content-muted bg-surface rounded p-3 overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-content-muted shrink-0">
                    <Clock size={14} />
                    <span>{log.createdAt ? formatTimeAgo(log.createdAt) : log.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // FULL MODE RENDER
  // ============================================
  return (
    <div className="flex flex-col h-full bg-surface-base text-content-primary overflow-y-auto overflow-x-hidden relative font-sans">

      {/* 1. TOOLBAR */}
      <div className="h-16 px-4 border-b border-edge flex items-center gap-3 bg-surface-base/50 flex-none">

         <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
            <input
              className="w-full h-10 bg-surface-base border border-edge rounded-lg pl-10 pr-4 text-sm focus:border-accent outline-none transition-all placeholder-content-muted text-content-secondary"
              placeholder="Rechercher par ID, User ou Action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
         </div>

         <div className="flex items-center gap-2">
            <button className="h-10 px-4 bg-surface-base border border-edge rounded-lg text-sm text-content-secondary hover:text-content-primary flex items-center gap-2 transition-colors">
               <Calendar size={16} /> <span className="hidden md:inline">Date</span>
            </button>
            <select
               className="h-10 bg-surface-base border border-edge rounded-lg px-3 text-sm text-content-secondary outline-none focus:border-accent cursor-pointer"
               value={limit}
               onChange={(e) => setLimit(Number(e.target.value))}
            >
               <option value={10}>10 lignes</option>
               <option value={15}>15 lignes</option>
               <option value={20}>20 lignes</option>
               <option value={50}>50 lignes</option>
            </select>
            <button
                className="h-10 px-4 bg-surface-base border border-edge rounded-lg text-sm text-content-secondary hover:text-status-success hover:border-status-success/50 flex items-center gap-2 transition-colors ml-auto"
                title="Exporter CSV"
            >
                <Download size={16} /> <span className="hidden md:inline">Export</span>
            </button>
            <button
                onClick={fetchLogs}
                className="h-10 w-10 flex items-center justify-center bg-accent hover:bg-accent-primary-hover rounded-lg text-white shadow-lg shadow-accent/20 transition-all"
            >
               <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
         </div>
      </div>

      {/* 2. TABLE AREA */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
         <div className="flex items-center px-4 py-3 bg-surface-base border-b border-edge text-xs font-bold text-content-muted uppercase tracking-wider shrink-0">
            <div className="w-36 lg:w-40 shrink-0">Date & Heure</div>
            <div className="w-40 lg:w-48 shrink-0">Utilisateur</div>
            <div className="w-28 lg:w-32 shrink-0 hidden md:block">Module</div>
            <div className="flex-1 min-w-0">Action</div>
            <div className="w-16 shrink-0 text-right">Détails</div>
         </div>

         <div className="flex-1 overflow-y-auto custom-scrollbar">
            {logs.map((log) => (
               <div
                 key={log.id}
                 onClick={() => setSelectedLog(log)}
                 className={`flex items-center px-4 py-2.5 border-b border-edge/50 hover:bg-surface/50 cursor-pointer transition-colors group text-sm ${selectedLog?.id === log.id ? 'bg-accent/10' : ''}`}
               >
                  <div className="w-36 lg:w-40 shrink-0 font-mono text-content-muted text-xs truncate pr-2">{log.date}</div>

                  <div className="w-40 lg:w-48 shrink-0 flex items-center gap-2 overflow-hidden pr-2">
                     <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${log.user === 'Système' ? 'bg-surface-elevated text-content-secondary' : 'bg-accent text-white'}`}>
                        {log.user.charAt(0)}
                     </div>
                     <span className="truncate text-content-secondary">{log.user}</span>
                  </div>

                  <div className="w-28 lg:w-32 shrink-0 hidden md:block pr-2 overflow-hidden">
                     <span className="inline-flex items-center justify-center max-w-full h-6 px-2.5 rounded text-[10px] bg-surface border border-edge text-content-muted font-mono truncate">
                        {(log.module || '').toUpperCase()}
                     </span>
                  </div>

                  <div className="flex-1 min-w-0 px-2 overflow-hidden">
                     <ActionBadge action={log.action} />
                  </div>

                  <div className="w-16 shrink-0 text-right">
                     <button className="p-1.5 text-content-muted hover:text-accent hover:bg-accent/10 rounded transition-colors">
                        <Eye size={16} />
                     </button>
                  </div>
               </div>
            ))}

            {!loading && logs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-content-muted">
                    <Terminal size={32} className="opacity-20 mb-2" />
                    <p className="text-sm">Aucun log trouvé</p>
                </div>
            )}

            {loading && (
                <div className="absolute inset-0 bg-surface-base/50 flex items-center justify-center backdrop-blur-sm z-10">
                    <div className="animate-spin text-accent">
                        <RefreshCw size={32} />
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* 3. FOOTER PAGINATION */}
      <div className="h-14 bg-surface-base border-t border-edge flex items-center justify-between px-4 flex-none z-10">
         <div className="text-xs text-content-muted">
            Affichage <span className="text-content-primary font-medium">{logs.length > 0 ? 1 + (page-1)*limit : 0}</span> à <span className="text-content-primary font-medium">{Math.min(page*limit, total)}</span> sur <span className="text-content-primary font-medium">{total}</span>
         </div>

         <div className="flex items-center gap-1">
            <button
               disabled={page === 1}
               onClick={() => setPage(p => Math.max(1, p - 1))}
               className="p-2 rounded-lg border border-edge hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-content-secondary"
            >
               <ChevronLeft size={16} />
            </button>
            <div className="px-4 text-sm font-mono text-content-secondary">
               Page {page} / {totalPages}
            </div>
            <button
               disabled={page >= totalPages}
               onClick={() => setPage(p => Math.min(totalPages, p + 1))}
               className="p-2 rounded-lg border border-edge hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-content-secondary"
            >
               <ChevronRight size={16} />
            </button>
         </div>
      </div>

      {/* 4. DETAIL DRAWER */}
      {selectedLog && (
         <>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in" onClick={() => setSelectedLog(null)} />
            <div className="absolute top-0 right-0 h-full w-full md:w-[450px] bg-surface-base border-l border-edge shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
               <div className="h-16 px-6 border-b border-edge flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-content-primary flex items-center gap-2">
                     <Terminal size={18} className="text-accent"/> Détails Techniques
                  </h3>
                  <button onClick={() => setSelectedLog(null)} className="text-content-muted hover:text-content-primary transition-colors">
                    <div className="p-1 hover:bg-surface rounded">
                        <ChevronRight size={20} />
                    </div>
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                     <DetailItem label="ID Event" value={selectedLog.id} />
                     <DetailItem label="Timestamp" value={selectedLog.date} />
                     <DetailItem label="Module" value={selectedLog.module} />
                     <DetailItem label="Action" value={selectedLog.action} />
                  </div>

                  {/* User Info */}
                   <div>
                     <label className="text-xs font-bold text-content-muted uppercase mb-2 block">Acteur</label>
                     <div className="flex items-center gap-3 p-3 bg-surface/50 rounded-lg border border-edge">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedLog.user === 'Système' ? 'bg-surface-elevated text-content-secondary' : 'bg-accent text-white'}`}>
                            {selectedLog.user.charAt(0)}
                        </div>
                        <div>
                            <div className="text-sm font-medium text-content-primary">{selectedLog.user}</div>
                            <div className="text-xs text-content-muted">User Agent Details below</div>
                        </div>
                     </div>
                  </div>

                  {/* JSON Payload */}
                  <div>
                     <label className="text-xs font-bold text-content-muted uppercase mb-2 block">Payload JSON</label>
                     <div className="bg-surface-base border border-edge rounded-xl p-4 overflow-x-auto relative group-code">
                        <pre className="text-xs font-mono text-status-success">
                            {JSON.stringify(selectedLog.details, null, 2)}
                        </pre>
                     </div>
                  </div>

                  {/* Additional Technical Info */}
                   <div>
                     <label className="text-xs font-bold text-content-muted uppercase mb-2 block">Headers & Context</label>
                     <div className="grid grid-cols-1 gap-2">
                        {selectedLog.userAgent && (
                            <div className="p-2 bg-surface/30 rounded border border-edge-subtle flex flex-col gap-1">
                                <span className="text-xs text-content-muted">User Agent</span>
                                <span className="text-xs text-content-secondary font-mono break-all">{selectedLog.userAgent}</span>
                            </div>
                        )}
                        {selectedLog.ip && (
                            <div className="p-2 bg-surface/30 rounded border border-edge-subtle flex justify-between">
                                <span className="text-xs text-content-muted">IP Address</span>
                                <span className="text-xs text-content-secondary font-mono">{selectedLog.ip}</span>
                            </div>
                         )}
                     </div>
                  </div>
               </div>

               {/* Drawer Footer */}
               <div className="p-4 border-t border-edge bg-surface-base flex justify-end gap-2 shrink-0">
                    <button onClick={() => setSelectedLog(null)} className="px-4 py-2 text-sm text-content-secondary hover:text-content-primary transition-colors">Fermer</button>
               </div>
            </div>
         </>
      )}

    </div>
  );
}

// --- Sub-Components ---

function ActionBadge({ action }: { action: string }) {
   const colors: Record<string, string> = {
      LOGIN: 'bg-status-info-bg text-status-info border-status-info/20',
      LOGOUT: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
      CREATE_COMPTE: 'bg-status-success-bg text-status-success border-status-success/20',
      RETRAIT_COMPTE: 'bg-status-danger/10 text-status-danger border-status-danger/20',
      UPDATE: 'bg-status-warning-bg text-status-warning border-status-warning/20',
      DELETE: 'bg-status-danger-bg text-status-danger border-status-danger/20',
      DEFAULT: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20'
   };

   let color = colors.DEFAULT;
   if (colors[action]) color = colors[action];
   else if (action.includes('CREATE') || action.includes('ADD')) color = colors.CREATE_COMPTE;
   else if (action.includes('DELETE') || action.includes('REMOVE')) color = colors.DELETE;
   else if (action.includes('UPDATE') || action.includes('EDIT')) color = colors.UPDATE;

   return (
      <span className={`inline-flex items-center justify-center max-w-full h-6 px-2.5 rounded-full text-[10px] font-bold border ${color} truncate`}>
         {action}
      </span>
   )
}

function DetailItem({ label, value }: { label: string, value: string }) {
   return (
      <div>
         <div className="text-[10px] text-content-muted uppercase font-bold mb-1">{label}</div>
         <div className="text-xs text-content-secondary font-mono break-all p-2 bg-surface/30 rounded border border-edge-subtle select-all">
            {value}
        </div>
      </div>
   )
}
