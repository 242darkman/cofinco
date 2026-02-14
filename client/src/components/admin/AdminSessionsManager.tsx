import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, LogOut, MapPin, Clock, AlertCircle, CheckCircle, XCircle, Smartphone, Tablet, Globe, Laptop, AlertTriangle, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Card, Button, IconButton, ResponsiveTable, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { sessionApi } from '../../lib/api-client';
import { getRoleBadgeStyle } from '../../lib/role-utils';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  location?: string;
  loginAt: string;
  lastActivity: string;
  status: 'active' | 'idle' | 'expired';
  sessionDuration: number;
}

export default function AdminSessionsManager() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canTerminateSessions = hasPermission('sessions', 'delete') || hasPermission('admin', 'manage');

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'idle'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const loadSessions = useCallback(async () => {
    try {
      const activeSessions = await sessionApi.getActive();

      // Transform session data from new active_sessions table
      const sessionsArray: UserSession[] = (activeSessions || []).map((session: any) => ({
        id: session.id,
        userId: session.userId,
        userName: session.user?.nom ? `${session.user.prenom || ''} ${session.user.nom}`.trim() : 'Utilisateur',
        userEmail: session.user?.email || '',
        userRole: session.user?.role || 'N/A',
        ipAddress: session.ipAddress || '',
        userAgent: session.userAgent || '',
        deviceType: session.deviceType || 'Desktop',
        browser: session.browser,
        os: session.os,
        location: session.location || session.user?.agence || '',
        loginAt: session.loginAt,
        lastActivity: session.lastActivity,
        status: session.status || 'active',
        sessionDuration: session.sessionDuration || 0
      }));

      setSessions(sessionsArray);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des sessions'));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 15000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const getDeviceType = (userAgent?: string): string => {
    if (!userAgent) return 'Unknown';
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet/i.test(userAgent)) return 'Tablet';
    return 'Desktop';
  };

  const getDeviceIcon = (type?: string) => {
    switch(type) {
      case 'Mobile': return Smartphone;
      case 'Tablet': return Tablet;
      case 'Desktop': return Laptop;
      default: return Globe;
    }
  };

  const terminateSession = useCallback((session: UserSession) => {
    openConfirm({
      title: 'Déconnecter cet utilisateur ?',
      message: `Êtes-vous sûr de vouloir déconnecter ${session.userName} ? L'utilisateur sera immédiatement déconnecté.`,
      variant: 'danger',
      confirmText: 'Déconnecter',
      onConfirm: async () => {
        try {
          await sessionApi.terminate(session.userId);
          toast.success('Session terminée avec succès');
          loadSessions();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la terminaison de la session'));
        }
      },
    });
  }, [openConfirm, loadSessions]);

  const filteredSessions = sessions.filter(s => {
    // Filter by Filter Tabs
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    
    // Filter by Search
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.userName.toLowerCase().includes(query) ||
      s.userEmail.toLowerCase().includes(query) ||
      s.userRole.toLowerCase().includes(query) ||
      (s.ipAddress && s.ipAddress.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

  const totalPages = Math.ceil(filteredSessions.length / pageSize);
  const paginatedSessions = filteredSessions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-status-success-bg text-status-success border-status-success/30';
      case 'idle': return 'bg-status-warning-bg text-status-warning border-status-warning/30';
      case 'expired': return 'bg-surface-subtle/40 text-content-muted border-edge-strong/30';
      default: return 'bg-surface-subtle/40 text-content-muted';
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface/80 backdrop-blur-sm border border-edge-subtle p-3 rounded-xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-status-success-bg rounded-lg flex items-center justify-center border border-status-success/20 shrink-0">
            <CheckCircle className="text-status-success" size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-content-primary">{sessions.filter(s => s.status === 'active').length}</p>
            <p className="text-[10px] text-content-muted font-medium uppercase tracking-wide">Sessions Actives</p>
          </div>
        </div>

        <div className="bg-surface/80 backdrop-blur-sm border border-edge-subtle p-3 rounded-xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-status-warning-bg rounded-lg flex items-center justify-center border border-status-warning/20 shrink-0">
            <Clock className="text-status-warning" size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-content-primary">{sessions.filter(s => s.status === 'idle').length}</p>
            <p className="text-[10px] text-content-muted font-medium uppercase tracking-wide">Inactives</p>
          </div>
        </div>

        <div className="bg-surface/80 backdrop-blur-sm border border-edge-subtle p-3 rounded-xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-status-info-bg rounded-lg flex items-center justify-center border border-status-info/20 shrink-0">
            <Monitor className="text-status-info" size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-content-primary">{sessions.length}</p>
            <p className="text-[10px] text-content-muted font-medium uppercase tracking-wide">Total Sessions</p>
          </div>
        </div>
      </div>

      <Card variant="default" padding="none" className="overflow-hidden">
        {/* Header & Filters */}
        <div className="p-2 border-b border-edge bg-surface-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-status-info-bg rounded-lg flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4 text-status-info" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-content-primary">Sessions Actives</h2>
                  <p className="text-[10px] text-content-muted">Surveillez les connexions en cours ({sessions.length})</p>
                </div>
              </div>
              
              <div className="flex bg-surface-base rounded-lg p-0.5 border border-edge self-start sm:self-auto">
                {[
                  { id: 'all', label: 'Toutes' },
                  { id: 'active', label: 'Actives' },
                  { id: 'idle', label: 'Inactives' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterStatus(tab.id as any)}
                    className={`
                      px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md transition-all
                      ${filterStatus === tab.id
                        ? 'bg-primary text-content-primary shadow-sm'
                        : 'text-content-muted hover:text-content-primary hover:bg-surface-muted'
                      }
                    `}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
          </div>

          <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par utilisateur, email, rôle ou IP..."
                className="w-full pl-9 pr-4 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
          </div>
        </div>

        {/* Content */}
        <div className="bg-surface-base min-h-[300px]">
          <ResponsiveTable
            data={paginatedSessions}
            loading={loading}
            emptyMessage="Aucune session en cours"
            columns={[
              {
                key: 'user',
                label: 'Utilisateur',
                primary: true,
                format: (_, session) => {
                  const style = getRoleBadgeStyle(session.userRole);
                  return (
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-content-primary">{session.userName}</span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-medium border whitespace-nowrap w-fit transition-colors ${style.classes}`}>
                        {style.label}
                      </span>
                    </div>
                  );
                }
              },
              {
                key: 'status',
                label: 'Statut',
                format: (status: string) => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium border ${getStatusColor(status)}`}>
                    {status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                )
              },
              {
                 key: 'context',
                 label: 'Contexte',
                 format: (_, session) => {
                   const Icon = getDeviceIcon(session.deviceType);
                   return (
                     <div className="flex flex-col text-xs">
                        <div className="flex items-center gap-2 text-content-secondary">
                          <Icon size={14} className="text-content-muted" />
                          <span>{session.browser || session.deviceType || 'Desktop'}</span>
                          {session.os && <span className="text-content-muted">• {session.os}</span>}
                        </div>
                        <span className="text-content-muted text-[10px]">{session.ipAddress || 'IP Masquée'}</span>
                     </div>
                   );
                 }
              },
              {
                key: 'activity',
                label: 'Activité',
                format: (_, session) => (
                  <div className="flex flex-col text-xs">
                     <span className="text-content-primary flex items-center gap-1">
                       <Clock size={12} className="text-content-muted" /> {formatDuration(session.sessionDuration)}
                     </span>
                     <span className="text-content-muted text-[10px]">
                       Dernière: {new Date(session.lastActivity).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                     </span>
                  </div>
                )
              },
              {
                key: 'actions',
                label: '',
                format: (_, session) => (
                  <div className="flex justify-end">
                    {canTerminateSessions && (
                      <IconButton
                        icon={LogOut}
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); terminateSession(session); }}
                        className="text-danger hover:bg-danger/10"
                        title="Déconnecter l'utilisateur"
                        aria-label="Déconnecter l'utilisateur"
                      />
                    )}
                  </div>
                )
              }
            ]}
          />
        </div>

        
        {/* Pagination Controls */}
        {/* Advanced Pagination Controls */}
        <div className="p-2 sm:p-3 border-t border-edge bg-surface-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Page info & size selector */}
            <div className="flex items-center gap-3 text-xs sm:text-sm text-content-muted">
              <span className="hidden sm:inline">
                {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredSessions.length)} sur {filteredSessions.length}
              </span>
              <span className="sm:hidden">
                Page {currentPage}/{totalPages}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-primary outline-none"
              >
                <option value={8}>8 / page</option>
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <IconButton
                icon={ChevronsLeft}
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="w-8 h-8 text-content-muted disabled:opacity-30"
                aria-label="Première page"
              />
              <IconButton
                icon={ChevronLeft}
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 text-content-muted disabled:opacity-30"
                aria-label="Page précédente"
              />
              
              <div className="flex items-center gap-1 mx-1">
                <span className="text-xs font-medium text-content-primary">
                  {currentPage}
                </span>
                <span className="text-xs text-content-muted">/ {Math.max(1, totalPages)}</span>
              </div>

              <IconButton
                icon={ChevronRight}
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="w-8 h-8 text-content-muted disabled:opacity-30"
                aria-label="Page suivante"
              />
              <IconButton
                icon={ChevronsRight}
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="w-8 h-8 text-content-muted disabled:opacity-30"
                aria-label="Dernière page"
              />
            </div>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
