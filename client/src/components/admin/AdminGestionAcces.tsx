import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, Monitor, Activity, BarChart3, Bell, Plus, Edit2, Trash2, Lock, Unlock, Eye, LogOut, Download, Upload, RefreshCw, UserCheck, UserX, AlertTriangle, TrendingUp, Clock, MapPin, Smartphone } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import StatCard from '../ui/StatCard';
import TabGroup from '../ui/TabGroup';
import ConfirmDialog from '../ui/ConfirmDialog';
import AdminUserForm from './AdminUserForm';
import AdminActivityLogs from './AdminActivityLogs';
import AdminAlerts from './AdminAlerts';
import AdminPasswordReset from './AdminPasswordReset';
import AdminImportCSV from './AdminImportCSV';
import { ProtectedFeature, usePermissions } from '../auth/ProtectedFeature';
import { userApi, roleApi, auditApi, notificationApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { SystemRole, getRoleLabel, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';
import { ALL_STATUS_LABELS } from '../../lib/status-labels';

interface User {
  id: string;
  email: string;
  nom?: string;
  prenom?: string;
  role?: string;
  statut?: string;
  telephone?: string;
  createdAt: string;
  last_sign_in_at?: string;
  activeSessions?: number;
  lastActivity?: string;
  failedLogins24h?: number;
}

interface RoleOption {
  value: SystemRole;
  label: string;
}

interface Role {
  id: string;
  code: string;
  nom: string;
  description?: string;
  niveau: number;
  couleur?: string;
  actif: boolean;
}

interface Permission {
  id: string;
  code: string;
  nom: string;
  module: string;
  action: string;
}

interface UserSession {
  id: string;
  user_id: string;
  userEmail?: string;
  ipAddress?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  location_city?: string;
  location_country?: string;
  startedAt: string;
  last_activity_at: string;
  isActive: boolean;
}

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  lockedUsers: number;
  activeSessions: number;
  usersOnlineNow: number;
  newUsersToday: number;
  newUsersWeek: number;
  loginAttemptsToday: number;
  failedLoginsToday: number;
}

export default function AdminGestionAcces() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateUsers = hasPermission('users', 'create');
  const canEditUsers = hasPermission('users', 'edit');
  const canDeleteUsers = hasPermission('users', 'delete');
  const canManageUsers = hasPermission('users', 'manage');
  const canExportUsers = hasPermission('users', 'export');

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'sessions' | 'activity' | 'analytics' | 'alerts'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [userForPasswordReset, setUserForPasswordReset] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<SystemRole | ''>('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [roleDistribution, setRoleDistribution] = useState<any[]>([]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await userApi.getAll();
      setUsers(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des utilisateurs'));
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const data = await roleApi.getAll();
      setRoles((data || []) as Role[]);
    } catch (error) {
      // Silent fail - roles are optional
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await auditApi.getAll({ limit: '100' });
      const activeSessions = data?.filter((log: any) =>
        log.actionType === 'LOGIN' &&
        new Date(log.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ) || [];
      setSessions(activeSessions.map((s: any) => ({
        ...s,
        userEmail: s.userEmail,
        isActive: true
      })));
    } catch (error) {
      // Silent fail - sessions list is supplementary
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const usersData = await userApi.getAll();

      setStats({
        totalUsers: usersData.length,
        activeUsers: usersData.filter((u: User) => u.statut === StatutUser.ACTIVE).length,
        inactiveUsers: usersData.filter((u: User) => u.statut === StatutUser.INACTIVE).length,
        lockedUsers: usersData.filter((u: User) => u.statut === StatutUser.SUSPENDED).length,
        activeSessions: sessions.length,
        usersOnlineNow: sessions.filter(s => s.isActive).length,
        newUsersToday: usersData.filter((u: User) =>
          new Date(u.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length,
        newUsersWeek: usersData.filter((u: User) =>
          new Date(u.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length,
        loginAttemptsToday: 0,
        failedLoginsToday: 0
      });
    } catch (error) {
      // Silent fail - stats are supplementary
    }
  }, [sessions]);

  const fetchUnreadAlerts = useCallback(async () => {
    try {
      const data = await notificationApi.getAll({ unread: true });
      setUnreadAlerts(data?.length || 0);
    } catch (error) {
      // Silent fail - alerts count is supplementary
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchUsers(),
      fetchRoles(),
      fetchSessions(),
      fetchStats(),
      fetchUnreadAlerts()
    ]);
    setLoading(false);
  }, [fetchUsers, fetchRoles, fetchSessions, fetchStats, fetchUnreadAlerts]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      fetchSessions();
      fetchUnreadAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchSessions, fetchUnreadAlerts]);

  const blockUser = useCallback((userId: string) => {
    openConfirm({
      title: 'Bloquer cet utilisateur ?',
      message: 'L\'utilisateur ne pourra plus accéder à la plateforme.',
      variant: 'warning',
      confirmText: 'Bloquer',
      onConfirm: async () => {
        try {
          await userApi.update(userId, { statut: StatutUser.SUSPENDED });
          toast.success('Utilisateur bloqué');
          fetchUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors du blocage'));
        }
      },
    });
  }, [openConfirm, fetchUsers]);

  const unblockUser = useCallback(async (userId: string) => {
    try {
      await userApi.update(userId, { statut: StatutUser.ACTIVE });
      toast.success('Utilisateur débloqué');
      fetchUsers();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du déblocage'));
    }
  }, [fetchUsers]);

  const deleteUser = useCallback((userId: string, userEmail: string) => {
    openConfirm({
      title: 'Supprimer définitivement ?',
      message: `ATTENTION: Supprimer définitivement ${userEmail} ? Cette action est IRRÉVERSIBLE !`,
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await userApi.delete(userId);
          toast.success('Utilisateur supprimé');
          fetchUsers();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression de l\'accès'));
        }
      },
    });
  }, [openConfirm, fetchUsers]);

  const exportUsers = () => {
    const csv = [
      ['Email', 'Prénom', 'Nom', 'Rôle', 'Statut', 'Téléphone', 'Créé le', 'Sessions actives'].join(','),
      ...filteredUsers.map(u => [
        u.email,
        u.prenom || '',
        u.nom || '',
        u.role || '',
        ALL_STATUS_LABELS[u.statut || ''] || u.statut || '',
        u.telephone || '',
        new Date(u.createdAt).toLocaleDateString(),
        u.activeSessions || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utilisateurs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusColor = (statut?: string) => {
    switch (statut) {
      case StatutUser.ACTIVE:
        return 'bg-status-success-bg text-status-success';
      case StatutUser.INACTIVE:
        return 'bg-surface-subtle/40 text-content-muted';
      case StatutUser.SUSPENDED:
        return 'bg-status-info-bg text-status-info';
      default:
        return 'bg-surface-subtle/40 text-content-muted';
    }
  };

  const getRoleColor = (role?: string) => {
    const normalizedRole = normalizeRole(role);
    switch (normalizedRole) {
      case SystemRole.ADMIN:
        return '#1E293B';
      case SystemRole.CHEF_AGENCE:
        return '#059669';
      case SystemRole.CAISSIER:
        return '#2563EB';
      case SystemRole.AGENT_TERRAIN:
        return '#10B981';
      case SystemRole.COMPTABLE:
        return '#0EA5E9';
      case SystemRole.GESTIONNAIRE_CREDIT:
        return '#9333EA';
      case SystemRole.SUPERVISEUR:
        return '#64748B';
      case SystemRole.CLIENT:
        return '#94A3B8';
      default:
        return '#3B82F6';
    }
  };

  const formatTimeAgo = (date?: string) => {
    if (!date) return 'Jamais';
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'À l\'instant';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)}min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `Il y a ${Math.floor(seconds / 86400)}j`;
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const filteredUsers = users.filter(user => {
    const normalizedRole = normalizeRole(user.role);
    if (filterRole && normalizedRole !== filterRole) return false;
    if (filterStatus && user.statut !== filterStatus) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        user.email?.toLowerCase().includes(search) ||
        user.nom?.toLowerCase().includes(search) ||
        user.prenom?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const tabs = [
    { key: 'users', label: 'Utilisateurs', icon: Users },
    { key: 'roles', label: 'Rôles', icon: Shield },
    { key: 'sessions', label: 'Sessions', icon: Monitor },
    { key: 'activity', label: 'Activité', icon: Activity },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'alerts', label: 'Alertes', icon: Bell, badge: unreadAlerts }
  ];

  return (
    <div className="space-y-4 sm:space-y-6 font-sans selection:bg-accent-bg animate-in fade-in duration-500">
      
      {/* Header Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            title="Utilisateurs"
            value={stats.totalUsers}
            icon={Users}
            color="primary"
            trend={`${stats.activeUsers} actifs`}
            className="bg-surface-base/50 backdrop-blur-md border-edge/60"
          />
          <StatCard
            title="En Ligne"
            value={stats.usersOnlineNow}
            icon={UserCheck}
            color="success"
            trend={`${stats.activeSessions} sessions`}
            className="bg-surface-base/50 backdrop-blur-md border-edge/60"
          />
          <StatCard
            title="Nouveaux"
            value={stats.newUsersToday}
            icon={TrendingUp}
            color="primary"
            trend={`${stats.newUsersWeek} sem.`}
            className="bg-surface-base/50 backdrop-blur-md border-edge/60"
          />
          <StatCard
            title="Connexions"
            value={stats.loginAttemptsToday}
            icon={Activity}
            color="warning"
            trend="Auj."
            className="bg-surface-base/50 backdrop-blur-md border-edge/60"
          />
          <StatCard
            title="Échecs"
            value={stats.failedLoginsToday}
            icon={AlertTriangle}
            color="danger"
            trend={`${stats.lockedUsers} bloqués`}
            className="bg-surface-base/50 backdrop-blur-md border-edge/60"
          />
        </div>
      )}

      {/* Main Content Area */}
      <Card className="bg-surface-base/80 backdrop-blur-xl border-edge shadow-xl overflow-hidden min-h-[500px]">
        {/* Navigation Tabs */}
        <div className="p-2 border-b border-edge bg-surface-base/30 sticky top-0 z-10">
           <TabGroup
              activeTab={activeTab}
              onTabChange={(key) => setActiveTab(key as any)}
              tabs={tabs}
              variant="pills"
              size="sm"
              scrollable
           />
        </div>

        <div className="p-4 sm:p-6">
            {activeTab === 'users' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                      <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
                          <Users size={20} className="text-accent" />
                          Gestion des Utilisateurs
                          <span className="text-sm font-medium text-content-muted bg-surface px-2 py-0.5 rounded-full ml-2">{filteredUsers.length}</span>
                      </h3>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none min-w-[150px]">
                        <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher..."
                        className="w-full px-4 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-content-muted"
                        />
                    </div>
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value as SystemRole | '')}
                      className="px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:border-accent outline-none"
                    >
                      <option value="">Rôles</option>
                      {roles.map((role) => (
                        <option key={role.code} value={role.code}>{role.nom}</option>
                      ))}
                    </select>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary focus:border-accent outline-none"
                    >
                      <option value="">Statut</option>
                      <option value={StatutUser.ACTIVE}>Actif</option>
                      <option value={StatutUser.INACTIVE}>Inactif</option>
                      <option value={StatutUser.SUSPENDED}>Bloqué</option>
                    </select>

                    <div className="flex items-center gap-1 ml-auto sm:ml-2">
                        {canExportUsers && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={exportUsers}
                            className="h-9 w-9 p-0 rounded-lg border-edge text-content-muted hover:text-status-info hover:border-status-info/50"
                            title="Exporter CSV"
                        >
                            <Download size={16} />
                        </Button>
                        )}
                        {canCreateUsers && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowImportCSV(true)}
                            className="h-9 w-9 p-0 rounded-lg border-edge text-content-muted hover:text-status-success hover:border-status-success/50"
                            title="Importer CSV"
                        >
                            <Upload size={16} />
                        </Button>
                        )}
                        {canCreateUsers && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowUserForm(true)}
                            className="ml-2 shadow-lg shadow-accent/20"
                        >
                            <Plus size={16} className="mr-1.5" />
                            Nouveau
                        </Button>
                        )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-edge overflow-hidden bg-surface-base/30">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-surface-base/80 text-xs font-bold uppercase text-content-muted tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Utilisateur</th>
                            <th className="px-6 py-4">Rôle</th>
                            <th className="px-6 py-4 text-center">Statut</th>
                            <th className="px-6 py-4 text-center">Sessions</th>
                            <th className="px-6 py-4">Dernière Activité</th>
                            <th className="px-6 py-4 text-center">Échecs</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-edge">
                        {filteredUsers.map(user => (
                            <tr key={user.id} className="hover:bg-surface/50 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-content-muted font-bold border border-edge">
                                        {(user.prenom?.[0] || user.nom?.[0] || user.email[0]).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-content-primary group-hover:text-accent transition-colors">
                                            {user.nom || user.prenom ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Utilisateur'}
                                        </div>
                                        <div className="text-xs text-content-muted">{user.email}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                {user.role && (
                                <span
                                    className="px-2.5 py-1 rounded-md text-xs font-bold border"
                                    style={{
                                    backgroundColor: getRoleColor(user.role) + '10',
                                    color: getRoleColor(user.role),
                                    borderColor: getRoleColor(user.role) + '20'
                                    }}
                                >
                                    {getRoleLabel(user.role || '')}
                                </span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                                    user.statut === StatutUser.ACTIVE ? 'bg-status-success-bg text-status-success border-status-success/20' :
                                    user.statut === StatutUser.SUSPENDED ? 'bg-status-info-bg text-status-info border-status-info/20' :
                                    'bg-surface-subtle/30 text-content-muted border-edge-strong/20'
                                }`}>
                                {ALL_STATUS_LABELS[user.statut || ''] || user.statut || 'inconnu'}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                                {user.activeSessions ? (
                                    <span className="font-mono font-bold text-accent">{user.activeSessions}</span>
                                ) : (
                                    <span className="text-content-muted">-</span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <span className="text-content-muted font-medium text-xs whitespace-nowrap">{formatTimeAgo(user.lastActivity)}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                                {(user.failedLogins24h || 0) > 0 ? (
                                <span className="inline-flex items-center gap-1 text-status-warning font-bold text-xs bg-status-warning-bg px-2 py-0.5 rounded-full">
                                    <AlertTriangle size={12} />
                                    {user.failedLogins24h}
                                </span>
                                ) : (
                                <span className="text-content-muted">-</span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                {canEditUsers && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { setSelectedUser(user); setShowUserForm(true); }}
                                        className="h-8 w-8 p-0 text-content-muted hover:text-status-info hover:bg-status-info-bg"
                                    >
                                        <Edit2 size={14} />
                                    </Button>
                                )}
                                {canManageUsers && (
                                    <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => user.statut === StatutUser.SUSPENDED ? unblockUser(user.id) : blockUser(user.id)}
                                    className={`h-8 w-8 p-0 ${user.statut === StatutUser.SUSPENDED ? 'text-status-success hover:bg-status-success-bg' : 'text-status-warning hover:bg-status-warning-bg'}`}
                                    >
                                        {user.statut === StatutUser.SUSPENDED ? <Unlock size={14} /> : <Lock size={14} />}
                                    </Button>
                                )}
                                {canDeleteUsers && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteUser(user.id, user.email)}
                                        className="h-8 w-8 p-0 text-content-muted hover:text-status-danger hover:bg-status-danger-bg"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                )}
                                </div>
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
                    <Shield size={20} className="text-accent" />
                    Rôles & Permissions
                </h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roles.map(role => (
                    <Card key={role.id} variant="glass" padding="md" className="border-l-4 hover:border-l-4 transition-all" style={{ borderLeftColor: role.couleur }}>
                      <div className="flex justify-between items-start mb-3">
                         <h4 className="text-content-primary font-bold text-lg">{role.nom}</h4>
                         <span className="text-xs font-bold text-content-muted bg-surface px-2 py-1 rounded">NV {role.niveau}</span>
                      </div>
                      <p className="text-content-muted text-sm leading-relaxed mb-4">{role.description}</p>
                      
                      <div className="flex items-center justify-between text-xs text-content-muted pt-3 border-t border-edge">
                          <span>{role.actif ? 'Actif' : 'Inactif'}</span>
                          <span>{role.code}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'sessions' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
                    <Monitor size={20} className="text-status-success" />
                    Sessions Actives
                    <span className="text-sm font-medium text-content-muted bg-surface px-2 py-0.5 rounded-full ml-2">{sessions.length}</span>
                </h3>

                {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-content-muted">
                        <Monitor size={48} className="mb-4 opacity-20" />
                        <p>Aucune session active détectée</p>
                    </div>
                ) : (
                  <div className="grid gap-3">
                    {sessions.map(session => (
                      <Card key={session.id} variant="glass" padding="md" className="flex items-center justify-between group hover:border-edge-strong transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-status-success-bg text-status-success">
                                <Monitor size={20} />
                            </div>
                            <div>
                                <p className="text-content-primary font-bold">{session.userEmail}</p>
                                <div className="flex items-center gap-3 text-xs text-content-muted mt-1">
                                    <span className="flex items-center gap-1"><Clock size={12}/> {formatTimeAgo(session.startedAt)}</span>
                                    <span>•</span>
                                    <span>{session.ipAddress || 'IP Masquée'}</span>
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-content-muted hover:text-status-danger">
                          <LogOut size={18} />
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && <AdminActivityLogs variant="compact" />}
            {activeTab === 'alerts' && <AdminAlerts />}
            {activeTab === 'analytics' && (
              <div className="text-center py-20 text-content-muted">
                <BarChart3 size={64} className="mx-auto mb-6 opacity-20" />
                <h3 className="text-lg font-bold text-content-secondary mb-2">Analytics Avancés</h3>
                <p>Module en cours de développement</p>
              </div>
            )}
        </div>
      </Card>

      {showUserForm && (
        <AdminUserForm
          user={selectedUser}
          onClose={() => {
            setShowUserForm(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            fetchUsers();
            setShowUserForm(false);
            setSelectedUser(null);
          }}
        />
      )}

      {showPasswordReset && userForPasswordReset && (
        <AdminPasswordReset
          user={userForPasswordReset}
          onClose={() => {
            setShowPasswordReset(false);
            setUserForPasswordReset(null);
          }}
          onSuccess={() => {
            setShowPasswordReset(false);
            setUserForPasswordReset(null);
          }}
        />
      )}

      {showImportCSV && (
        <AdminImportCSV
          onClose={() => setShowImportCSV(false)}
          onSuccess={() => {
            fetchUsers();
            setShowImportCSV(false);
          }}
        />
      )}

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
