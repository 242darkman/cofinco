import React, { useState, useEffect, useCallback } from 'react';
import { Users, Activity, Shield, AlertCircle, CheckCircle, Clock, Database, Lock, UserCheck, HardDrive, Zap, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, LoadingSpinner, Button } from '../ui';
import { userApi, auditApi, healthApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { StatutUser } from '@shared/enum/status-constants';
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
    security: 'secure' | 'attention';
    dbResponseTime?: number;
    serverUptime?: string;
    memoryPercent?: number;
  };
}

interface ActivityLog {
  id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
  ip_address?: string;
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

  const loadDashboardStats = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [users, auditResponse, healthData] = await Promise.all([
        userApi.getAll().catch(() => []),
        auditApi.getAll().catch(() => ({ data: [] })),
        healthApi.check().catch(() => null)
      ]);
      // L'API audit retourne { data: [...], total, page, totalPages }
      const allLogs = Array.isArray(auditResponse) ? auditResponse : (auditResponse?.data || []);

      // Deduplicate Users for Count
      const uniqueUsers = Array.from(new Set(users.map((u: any) => u.id)))
        .map(id => users.find((u: any) => u.id === id));

      const totalUsers = uniqueUsers.length;
      const activeUsers = uniqueUsers.filter((u: any) => u.statut === StatutUser.ACTIVE).length;
      const inactiveUsers = totalUsers - activeUsers;

      const activeRoles: Record<string, number> = {};
      uniqueUsers.forEach((u: any) => {
        if (u.role) activeRoles[u.role] = (activeRoles[u.role] || 0) + 1;
      });

      const todayLogs = allLogs.filter((log: any) => new Date(log.createdAt || log.created_at) >= today);
      const todayLogins = todayLogs.filter((log: any) => log.action === 'LOGIN' || log.action === 'login').length;
      const todayOperations = todayLogs.length;

      // Ensure details are strings
      const recentActivity: ActivityLog[] = allLogs.slice(0, 50).map((log: any) => {
        let detailsStr = '';
        if (typeof log.details === 'string') {
           detailsStr = log.details;
        } else if (typeof log.details === 'object' && log.details !== null) {
           detailsStr = Object.values(log.details).filter(v => typeof v === 'string' || typeof v === 'number').join(' - ') || JSON.stringify(log.details);
        }

        return {
          id: log.id,
          user_name: log.userName || log.user_name || 'Système',
          action: String(log.action || 'Action inconnue'),
          details: detailsStr,
          created_at: log.createdAt || log.created_at,
          ip_address: log.ipAddress || log.ip_address
        };
      });

      const systemHealth = healthData ? {
        database: healthData.database?.status || 'healthy',
        security: healthData.security?.status || 'secure',
        dbResponseTime: healthData.database?.responseTime || 0,
        serverUptime: healthData.server?.uptime || '0h 0m',
        memoryPercent: healthData.server?.memory?.percent || 0
      } : { database: 'healthy' as const, security: 'secure' as const, dbResponseTime: 0, serverUptime: '0h 0m', memoryPercent: 0 };

      setStats({
        totalUsers, activeUsers, inactiveUsers, todayLogins, todayOperations, activeRoles, recentActivity,
        systemHealth
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
        <Card variant="glass" padding="sm" className="shrink-0 bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">État du Système</h3>
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
                value="Actif"
                icon={Shield}
             />
             <HealthTile 
                label="Serveur"
                status={true}
                value={stats.systemHealth.serverUptime}
                icon={HardDrive}
             />
             <HealthTile 
                label="Mémoire"
                status={(stats.systemHealth.memoryPercent || 0) < 80}
                value={`${stats.systemHealth.memoryPercent}%`}
                icon={Activity}
                alert={(stats.systemHealth.memoryPercent || 0) >= 80}
             />
          </div>
        </Card>

        {/* Roles Distribution */}
        <Card variant="default" padding="none" className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-900/40 border-slate-800">
           <div className="p-3 border-b border-slate-800 shrink-0 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Rôles</h3>
              </div>
              
              {/* Roles Pagination Controls */}
              {rolesTotalPages > 1 && (
                  <div className="flex gap-1">
                      <button 
                        onClick={() => setRolesPage(p => Math.max(1, p - 1))}
                        disabled={rolesPage === 1}
                        className="p-1 hovered:bg-slate-700/50 rounded disabled:opacity-30"
                      >
                          <ChevronLeft size={14} className="text-slate-400" />
                      </button>
                      <button 
                        onClick={() => setRolesPage(p => Math.min(rolesTotalPages, p + 1))}
                        disabled={rolesPage === rolesTotalPages}
                        className="p-1 hovered:bg-slate-700/50 rounded disabled:opacity-30"
                      >
                           <ChevronRight size={14} className="text-slate-400" />
                      </button>
                  </div>
              )}
           </div>
           
           <div className="p-2 flex-1 flex flex-col gap-2 overflow-hidden justify-start">
             {currentRoles.length > 0 ? (
               currentRoles.map(([role, count]) => (
                 <div key={role} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 transition-colors">
                   <div className="flex items-center gap-2 truncate">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50"></div>
                      <span className="text-xs font-medium text-slate-300 truncate">{role}</span>
                   </div>
                   <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-indigo-500/10 text-indigo-400 rounded-md text-[10px] font-bold border border-indigo-500/20">
                     {count}
                   </span>
                 </div>
               ))
             ) : (
               <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <UserCheck size={20} className="mb-1 opacity-20" />
                  <p className="text-[10px]">Aucune donnée</p>
               </div>
             )}
           </div>
        </Card>
      </div>

      {/* RIGHT COLUMN: Activity Feed (4 cols) */}
      <div className="lg:col-span-4 h-full flex flex-col">
         <div className="bg-slate-900/80 border border-slate-700 rounded-t-xl p-3 flex items-center justify-between shrink-0 backdrop-blur-sm">
            <div className="flex items-center gap-2">
               <Activity className="w-4 h-4 text-amber-400" />
               <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Activité</h3>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">
                   Live
                </div>
                {/* Activity Pagination */}
                {activityTotalPages > 1 && (
                    <div className="flex gap-1 ml-2 border-l border-slate-700 pl-2">
                        <button 
                             onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                             disabled={activityPage === 1}
                             className="p-0.5 hover:text-white text-slate-500 disabled:opacity-30"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">{activityPage}/{activityTotalPages}</span>
                        <button 
                             onClick={() => setActivityPage(p => Math.min(activityTotalPages, p + 1))}
                             disabled={activityPage === activityTotalPages}
                             className="p-0.5 hover:text-white text-slate-500 disabled:opacity-30"
                        >
                             <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
         </div>
         
         <div className="flex-1 bg-slate-900/40 border-x border-b border-slate-700 rounded-b-xl overflow-hidden p-2 flex flex-col gap-2">
             {currentActivity.length > 0 ? (
                 currentActivity.map((log) => (
                     <div key={log.id} className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/80 transition-all group shrink-0">
                        <div className="flex justify-between items-start mb-0.5">
                           <span className="text-[11px] font-bold text-indigo-400 truncate max-w-[120px]">
                               {log.user_name}
                           </span>
                           <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                               {format(new Date(log.created_at), 'HH:mm', { locale: fr })}
                           </span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-medium mb-0.5 truncate">
                            {log.action}
                        </p>
                        {log.details && (
                           <p className="text-[10px] text-slate-500 truncate opacity-70">
                               {log.details}
                           </p>
                        )}
                     </div>
                 ))
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-slate-500">
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

function CompactStatBox({ 
    icon: Icon, label, value, subValue, color, className = '' 
}: { 
    icon: any, label: string, value: number, subValue?: string, color: 'primary' | 'success' | 'warning' | 'neutral', className?: string 
}) {
  const colorStyles = {
    primary: 'bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border-blue-500/20 text-blue-100',
    success: 'bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20 text-emerald-100',
    warning: 'bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20 text-amber-100',
    neutral: 'bg-gradient-to-br from-slate-700/30 to-slate-800/30 border-slate-700/50 text-slate-200'
  };

  const iconColors = {
      primary: 'text-blue-400',
      success: 'text-emerald-400',
      warning: 'text-amber-400',
      neutral: 'text-slate-400'
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
}

function HealthTile({ label, status, value, icon: Icon, alert }: { label: string, status: boolean, value?: string, icon: any, alert?: boolean }) {
    return (
        <div className={`p-2.5 rounded-lg border flex items-center justify-between ${
            alert ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/40 border-slate-700/50'
        }`}>
            <div className="flex items-center gap-2.5">
                <div className={`p-1 rounded-md ${status ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    <Icon size={12} />
                </div>
                <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">{label}</p>
                    <p className={`text-[11px] font-bold ${alert ? 'text-red-400' : 'text-slate-200'}`}>{value || (status ? 'OK' : 'Erreur')}</p>
                </div>
            </div>
            {status ? (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
            ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse"></div>
            )}
        </div>
    )
}

function HistoryIcon() {
    return (
        <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}
