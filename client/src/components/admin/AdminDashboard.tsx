import React, { useState, useEffect, useCallback, memo } from 'react';
import { Users, Activity, Shield, AlertCircle, CheckCircle, Clock, Database, Lock, UserCheck, HardDrive, Zap, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, LoadingSpinner, Button } from '../ui';
import { adminApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  todayLogins: number;
  todayOperations: number;
  activeRoles: Record<string, number>;
  recentActivity: ActivityLog[];
  systemHealth: {
    database: 'healthy' | 'warning' | 'error';
    security: 'secure' | 'warning' | 'critical';
    failedLoginsLast15m?: number;
    dbResponseTime?: number;
    serverUptime?: string;
    memoryPercent?: number;
  };
}

interface ActivityLog {
  id: string;
  userName: string;
  action: string;
  details: string;
  createdAt: string;
  ipAddress?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    todayLogins: 0,
    todayOperations: 0,
    activeRoles: {},
    recentActivity: [],
    systemHealth: { database: 'healthy', security: 'secure', dbResponseTime: 0, serverUptime: '0h 0m', memoryPercent: 0 }
  });
  const [loading, setLoading] = useState(true);
  
  // Pagination States
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PER_PAGE = 7;
  
  const [rolesPage, setRolesPage] = useState(1);
  const ROLES_PER_PAGE = 5;

  // P1.3: Single API call instead of 3 separate calls (reduces latency)
  const loadDashboardStats = useCallback(async () => {
    try {
      const data = await adminApi.getDashboardStats();
      setStats({
        totalUsers: data.totalUsers,
        activeUsers: data.activeUsers,
        inactiveUsers: data.inactiveUsers,
        todayLogins: data.todayLogins,
        todayOperations: data.todayOperations,
        activeRoles: data.activeRoles,
        recentActivity: data.recentActivity,
        systemHealth: data.systemHealth,
      });
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des statistiques'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardStats();
    const interval = setInterval(loadDashboardStats, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activePercent = stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;
  
  // Pagination Logic
  const activityTotalPages = Math.ceil(stats.recentActivity.length / ACTIVITY_PER_PAGE);
  const currentActivity = stats.recentActivity.slice(
      (activityPage - 1) * ACTIVITY_PER_PAGE,
      activityPage * ACTIVITY_PER_PAGE
  );

  const rolesEntries = Object.entries(stats.activeRoles).sort(([,a], [,b]) => b - a);
  const rolesTotalPages = Math.ceil(rolesEntries.length / ROLES_PER_PAGE);
  const currentRoles = rolesEntries.slice(
      (rolesPage - 1) * ROLES_PER_PAGE,
      rolesPage * ROLES_PER_PAGE
  );

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-1">

      {/* LEFT COLUMN: KPIs (3 cols) -> 2x2 Grid */}
      <div className="lg:col-span-3 flex flex-col h-full">
         <div className="grid grid-cols-2 gap-3 h-full">
            <CompactStatBox 
              icon={Users} 
              label="Utilisateurs" 
              value={stats.totalUsers} 
              subValue={`${activePercent}% actifs`} 
              color="primary" 
              className="h-full"
            />
            <CompactStatBox 
              icon={UserCheck} 
              label="Actifs" 
              value={stats.activeUsers} 
              subValue={`${stats.inactiveUsers} inactifs`}
              color="success" 
              className="h-full"
            />
            <CompactStatBox 
              icon={Activity} 
              label="Logins/J" 
              value={stats.todayLogins} 
              color="warning" 
              className="h-full"
            />
            <CompactStatBox 
              icon={Zap} 
              label="Ops/24h" 
              value={stats.todayOperations} 
              color="neutral" 
              className="h-full"
            />
         </div>
      </div>

      {/* MIDDLE COLUMN: Health & Roles (5 cols) */}
      <div className="lg:col-span-5 flex flex-col gap-4 h-full">
        
        {/* System Health */}
        <Card variant="glass" padding="sm" className="shrink-0 bg-surface-base/50">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-status-success" />
            <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">État du Système</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
             <HealthTile 
                label="Base de données"
                status={stats.systemHealth.database === 'healthy'}
                value={`${stats.systemHealth.dbResponseTime}ms`}
                icon={Database}
             />
             <HealthTile
                label="Sécurité"
                status={stats.systemHealth.security === 'secure'}
                value={stats.systemHealth.security === 'secure' ? 'Actif' : `${stats.systemHealth.failedLoginsLast15m || 0} échecs`}
                icon={Shield}
                alert={stats.systemHealth.security === 'critical'}
                warning={stats.systemHealth.security === 'warning'}
             />
             <HealthTile 
                label="Serveur"
                status={true}
                value={stats.systemHealth.serverUptime}
                icon={HardDrive}
             />
             <HealthTile
                label="Mémoire RAM"
                status={(stats.systemHealth.memoryPercent || 0) < 80}
                value={`${stats.systemHealth.memoryPercent}%`}
                icon={Activity}
                warning={(stats.systemHealth.memoryPercent || 0) >= 80 && (stats.systemHealth.memoryPercent || 0) < 90}
                alert={(stats.systemHealth.memoryPercent || 0) >= 90}
             />
          </div>
        </Card>

        {/* Roles Distribution */}
        <Card variant="default" padding="none" className="flex-1 min-h-0 flex flex-col overflow-hidden bg-surface-base/40 border-edge">
           <div className="p-3 border-b border-edge shrink-0 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">Rôles</h3>
              </div>
              
              {/* Roles Pagination Controls */}
              {rolesTotalPages > 1 && (
                  <div className="flex gap-1">
                      <button 
                        onClick={() => setRolesPage(p => Math.max(1, p - 1))}
                        disabled={rolesPage === 1}
                        className="p-1 hovered:bg-surface-elevated/50 rounded disabled:opacity-30"
                      >
                          <ChevronLeft size={14} className="text-content-muted" />
                      </button>
                      <button 
                        onClick={() => setRolesPage(p => Math.min(rolesTotalPages, p + 1))}
                        disabled={rolesPage === rolesTotalPages}
                        className="p-1 hovered:bg-surface-elevated/50 rounded disabled:opacity-30"
                      >
                           <ChevronRight size={14} className="text-content-muted" />
                      </button>
                  </div>
              )}
           </div>
           
           <div className="p-2 flex-1 flex flex-col gap-2 overflow-hidden justify-start">
             {currentRoles.length > 0 ? (
               currentRoles.map(([role, count]) => (
                 <div key={role} className="flex items-center justify-between p-2 rounded-lg bg-surface/50 border border-edge-subtle transition-colors">
                   <div className="flex items-center gap-2 truncate">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent/50"></div>
                      <span className="text-xs font-medium text-content-secondary truncate">{role}</span>
                   </div>
                   <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-accent/10 text-accent rounded-md text-[10px] font-bold border border-accent/20">
                     {count}
                   </span>
                 </div>
               ))
             ) : (
               <div className="flex flex-col items-center justify-center h-full text-content-muted">
                  <UserCheck size={20} className="mb-1 opacity-20" />
                  <p className="text-[10px]">Aucune donnée</p>
               </div>
             )}
           </div>
        </Card>
      </div>

      {/* RIGHT COLUMN: Activity Feed (4 cols) */}
      <div className="lg:col-span-4 h-full flex flex-col">
         <div className="bg-surface-base/80 border border-edge rounded-t-xl p-3 flex items-center justify-between shrink-0 backdrop-blur-sm">
            <div className="flex items-center gap-2">
               <Activity className="w-4 h-4 text-status-warning" />
               <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">Activité</h3>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-surface border border-edge text-[10px] text-content-muted font-mono">
                   Live
                </div>
                {/* Activity Pagination */}
                {activityTotalPages > 1 && (
                    <div className="flex gap-1 ml-2 border-l border-edge pl-2">
                        <button 
                             onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                             disabled={activityPage === 1}
                             className="p-0.5 hover:text-content-primary text-content-muted disabled:opacity-30"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-[10px] text-content-muted font-mono">{activityPage}/{activityTotalPages}</span>
                        <button 
                             onClick={() => setActivityPage(p => Math.min(activityTotalPages, p + 1))}
                             disabled={activityPage === activityTotalPages}
                             className="p-0.5 hover:text-content-primary text-content-muted disabled:opacity-30"
                        >
                             <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
         </div>
         
         <div className="flex-1 bg-surface-base/40 border-x border-b border-edge rounded-b-xl overflow-hidden p-2 flex flex-col gap-2">
             {currentActivity.length > 0 ? (
                 currentActivity.map((log) => (
                     <div key={log.id} className="p-2.5 rounded-lg bg-surface/40 border border-edge-subtle hover:bg-surface/80 transition-all group shrink-0">
                        <div className="flex justify-between items-start mb-0.5">
                           <span className="text-[11px] font-bold text-accent truncate max-w-[120px]">
                               {log.userName}
                           </span>
                            <span className="text-[10px] text-content-muted font-mono whitespace-nowrap">
                                {(() => {
                                  try {
                                    const date = new Date(log.createdAt);
                                    return !isNaN(date.getTime()) 
                                      ? format(date, 'HH:mm', { locale: fr }) 
                                      : '--:--';
                                  } catch (e) {
                                    return '--:--';
                                  }
                                })()}
                            </span>
                        </div>
                        <p className="text-[11px] text-content-secondary font-medium mb-0.5 truncate">
                            {log.action}
                        </p>
                        {log.details && (
                           <p className="text-[10px] text-content-muted truncate opacity-70">
                               {log.details}
                           </p>
                        )}
                     </div>
                 ))
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-content-muted">
                    <HistoryIcon />
                    <p className="text-xs mt-2">Aucune activité</p>
                 </div>
             )}
         </div>
      </div>

    </div>
  );
}

// === Helper Components ===

// P4.1: Memoized to prevent re-renders when parent state changes (pagination, etc.)
const CompactStatBox = memo(function CompactStatBox({
    icon: Icon, label, value, subValue, color, className = ''
}: {
    icon: any, label: string, value: number, subValue?: string, color: 'primary' | 'success' | 'warning' | 'neutral', className?: string
}) {
  const colorStyles = {
    primary: 'bg-gradient-to-br from-status-info/10 to-accent/5 border-status-info/20 text-status-info-text',
    success: 'bg-gradient-to-br from-status-success/10 to-accent/5 border-status-success/20 text-status-success-text',
    warning: 'bg-gradient-to-br from-status-warning/10 to-status-warning/5 border-status-warning/20 text-status-warning-text',
    neutral: 'bg-gradient-to-br from-surface-elevated/30 to-surface/30 border-edge-subtle text-content-secondary'
  };

  const iconColors = {
      primary: 'text-status-info',
      success: 'text-status-success',
      warning: 'text-status-warning',
      neutral: 'text-content-muted'
  };

  return (
    <div className={`p-3 rounded-xl border flex flex-col justify-center gap-1 transition-all hover:scale-[1.02] hover:shadow-lg ${colorStyles[color]} ${className}`}>
      <div className="flex justify-between items-center">
        <Icon size={16} className={`opacity-80 ${iconColors[color]}`} />
        {color === 'success' || color === 'primary' ? <TrendingUp size={14} className={`opacity-40 ${iconColors[color]}`} /> : null}
      </div>
      <div>
        <div className="text-2xl font-black tracking-tight">{value}</div>
        <p className="text-[10px] font-medium opacity-60 uppercase tracking-wider truncate">{label}</p>
        <div className={`text-[9px] mt-1 font-medium px-1.5 py-0.5 rounded bg-black/20 w-fit truncate ${iconColors[color]}`}>
            {subValue || '-'}
        </div>
      </div>
    </div>
  );
});

// P4.1: Memoized to prevent re-renders on health/roles state changes
const HealthTile = memo(function HealthTile({ label, status, value, icon: Icon, alert, warning }: { label: string, status: boolean, value?: string, icon: any, alert?: boolean, warning?: boolean }) {
    const bgClass = alert ? 'bg-status-danger-bg border-status-danger/30'
      : warning ? 'bg-status-warning-bg border-status-warning/30'
      : 'bg-surface/40 border-edge-subtle';
    const iconClass = alert ? 'bg-status-danger-bg text-status-danger'
      : warning ? 'bg-status-warning-bg text-status-warning'
      : status ? 'bg-status-success-bg text-status-success'
      : 'bg-status-danger-bg text-status-danger';
    const valueClass = alert ? 'text-status-danger'
      : warning ? 'text-status-warning'
      : 'text-content-secondary';
    const dotClass = alert ? 'bg-status-danger shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'
      : warning ? 'bg-status-warning shadow-[0_0_8px_rgba(245,158,11,0.6)]'
      : status ? 'bg-status-success shadow-[0_0_8px_rgba(16,185,129,0.6)]'
      : 'bg-status-danger shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse';

    return (
        <div className={`p-2.5 rounded-lg border flex items-center justify-between ${bgClass}`}>
            <div className="flex items-center gap-2.5">
                <div className={`p-1 rounded-md ${iconClass}`}>
                    <Icon size={12} />
                </div>
                <div>
                    <p className="text-[9px] text-content-muted font-bold uppercase">{label}</p>
                    <p className={`text-[11px] font-bold ${valueClass}`}>{value || (status ? 'OK' : 'Erreur')}</p>
                </div>
            </div>
            <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></div>
        </div>
    );
});

function HistoryIcon() {
    return (
        <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}
