import React, { useState, useEffect, useCallback } from 'react';
import { Users, Activity, Shield, AlertCircle, CheckCircle, Clock, Database, Lock, UserCheck, HardDrive } from 'lucide-react';
import { Card, LoadingSpinner } from '../ui';
import { userApi, auditApi, healthApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

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

  const loadDashboardStats = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [users, allLogs, healthData] = await Promise.all([
        userApi.getAll().catch(() => []),
        auditApi.getAll().catch(() => []),
        healthApi.check().catch(() => null)
      ]);

      const totalUsers = users.length;
      const activeUsers = users.filter((u: any) => u.statut === 'Actif').length;
      const inactiveUsers = totalUsers - activeUsers;

      const activeRoles: Record<string, number> = {};
      users.forEach((u: any) => {
        if (u.role) activeRoles[u.role] = (activeRoles[u.role] || 0) + 1;
      });

      const todayLogs = allLogs.filter((log: any) => new Date(log.createdAt || log.created_at) >= today);
      const todayLogins = todayLogs.filter((log: any) => log.action === 'LOGIN' || log.action === 'login').length;
      const todayOperations = todayLogs.length;

      const recentActivity: ActivityLog[] = allLogs.slice(0, 5).map((log: any) => ({
        id: log.id,
        user_name: log.userName || log.user_name || 'Système',
        action: log.action,
        details: log.details || '',
        created_at: log.createdAt || log.created_at,
        ip_address: log.ipAddress || log.ip_address
      }));

      // Utiliser les données de santé réelles de l'API
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
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activePercent = stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactStatBox 
          icon={Users} 
          label="Utilisateurs" 
          value={stats.totalUsers} 
          subValue={`${activePercent}% actifs`} 
          color="primary" 
        />
        <CompactStatBox 
          icon={UserCheck} 
          label="Actifs" 
          value={stats.activeUsers} 
          color="success" 
        />
        <CompactStatBox 
          icon={Activity} 
          label="Connexions/J" 
          value={stats.todayLogins} 
          color="warning" 
        />
        <CompactStatBox 
          icon={Clock} 
          label="Opérations/J" 
          value={stats.todayOperations} 
          color="neutral" 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Role Distribution */}
        <Card variant="default" padding="sm" className="md:col-span-1">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-content-primary">Répartition Rôles</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(stats.activeRoles).length > 0 ? (
              Object.entries(stats.activeRoles).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between p-2 rounded-lg bg-surface-muted border border-edge">
                  <span className="text-xs font-medium text-content-primary truncate max-w-[120px]">{role}</span>
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[10px] font-bold">
                    {count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-content-muted text-center py-2">Aucune donnée</p>
            )}
          </div>
        </Card>

        {/* System Health */}
        <Card variant="default" padding="sm" className="md:col-span-1">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Database className="w-4 h-4 text-success" />
            <h3 className="text-sm font-bold text-content-primary">Santé Système</h3>
          </div>
          <div className="space-y-2">
            <HealthItem
              label="Base de données"
              status={stats.systemHealth.database === 'healthy'}
              icon={HardDrive}
              text={stats.systemHealth.dbResponseTime ? `${stats.systemHealth.dbResponseTime}ms` : undefined}
              alert={stats.systemHealth.database !== 'healthy'}
            />
            <HealthItem
              label="Sécurité Globale"
              status={stats.systemHealth.security === 'secure'}
              icon={Lock}
            />
            <HealthItem
              label="Serveur"
              status={true}
              icon={Activity}
              text={stats.systemHealth.serverUptime || 'Actif'}
            />
            <HealthItem
              label="Alertes Système"
              status={stats.inactiveUsers === 0}
              icon={AlertCircle}
              text={stats.inactiveUsers > 0 ? `${stats.inactiveUsers} inactifs` : '0 alerte'}
              alert={stats.inactiveUsers > 0}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

// === Helper Components ===

function CompactStatBox({ icon: Icon, label, value, subValue, color }: { icon: any, label: string, value: number, subValue?: string, color: 'primary' | 'success' | 'warning' | 'neutral' }) {
  const colorStyles = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    neutral: 'bg-surface-muted text-content-secondary border-edge'
  };

  return (
    <div className={`p-3 rounded-xl border ${colorStyles[color]} flex flex-col justify-between h-24`}>
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-medium opacity-80 uppercase tracking-wider">{label}</span>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        {subValue && <div className="text-[10px] opacity-70 mt-1">{subValue}</div>}
      </div>
    </div>
  );
}

function HealthItem({ label, status, icon: Icon, text, alert }: { label: string, status: boolean, icon: any, text?: string, alert?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted border border-edge">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-content-muted" />
        <span className="text-xs font-medium text-content-primary">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {text && <span className={`text-[10px] font-medium ${alert ? 'text-warning' : 'text-success'}`}>{text}</span>}
        {status ? (
          <CheckCircle size={14} className="text-success" />
        ) : (
          <AlertCircle size={14} className="text-warning" />
        )}
      </div>
    </div>
  );
}
