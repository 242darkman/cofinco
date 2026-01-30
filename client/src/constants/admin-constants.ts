/**
 * Constantes pour le module Admin
 */
import { SystemRole } from '@shared/types/roles';

export const ADMIN_ROLES = [
  SystemRole.ADMIN,
  SystemRole.CHEF_AGENCE,
  SystemRole.CAISSIER,
  SystemRole.AGENT_TERRAIN,
  SystemRole.COMPTABLE,
  SystemRole.GESTIONNAIRE_CREDIT,
  SystemRole.SUPERVISEUR
] as const;

export type AdminRole = typeof ADMIN_ROLES[number];

export const ROLE_COLORS: Record<SystemRole, string> = {
  [SystemRole.ADMIN]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [SystemRole.CHEF_AGENCE]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  [SystemRole.CAISSIER]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [SystemRole.AGENT_TERRAIN]: 'bg-green-500/20 text-green-400 border-green-500/30',
  [SystemRole.COMPTABLE]: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  [SystemRole.GESTIONNAIRE_CREDIT]: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  [SystemRole.SUPERVISEUR]: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  [SystemRole.CLIENT]: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export const CATEGORY_LABELS: Record<string, string> = {
  'principal': 'Modules Principaux',
  'gestion': 'Gestion',
  'Administrateur': 'Administration'
};

export const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3', permission: 'dashboard.view' },
  { id: 'profils', label: 'Personnel', icon: 'Award', permission: 'rh.view' },
  { id: 'users', label: 'Utilisateurs', icon: 'Users', permission: 'admin.users' },
  { id: 'logs', label: 'Logs', icon: 'Activity', permission: 'admin.logs' },
  { id: 'sessions', label: 'Sessions', icon: 'Monitor', permission: 'admin.settings' },
  { id: 'roles', label: 'Gestion des Accès', icon: 'Shield', permission: 'admin.roles' },
  { id: 'settings', label: 'Paramètres', icon: 'Settings', permission: 'admin.settings' },
  { id: 'maintenance', label: 'Maintenance', icon: 'Power', permission: 'admin.settings' },
  { id: 'caisses', label: 'Caisses', icon: 'Wallet', permission: 'caisse.manage' },
  { id: 'credits', label: 'Crédits', icon: 'CreditCard', permission: 'credits.view' },
  { id: 'tontines', label: 'Tontines', icon: 'Users', permission: 'tontines.manage' },
  { id: 'agences', label: 'Agences', icon: 'Building2', permission: 'admin.settings' },
  { id: 'zones', label: 'Zones', icon: 'MapPin', permission: 'admin.settings' },
  { id: 'notifications', label: 'Notifications', icon: 'MessageSquare', permission: 'admin.settings' },
  { id: 'updates', label: 'Version', icon: 'Package', permission: 'admin.settings' },
  { id: 'codes', label: 'Codes Caisse', icon: 'KeyRound', permission: 'caisse.manage' },
  { id: 'regularisation', label: 'Régularisation', icon: 'AlertTriangle', permission: 'admin.manage' },
  { id: 'client-credentials', label: 'Accès Clients', icon: 'Key', permission: 'admin.manage' },
  { id: 'product-rates', label: 'Taux Produits', icon: 'Percent', permission: 'admin.manage' }
] as const;

export type AdminTabId = typeof ADMIN_TABS[number]['id'];
