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
  [SystemRole.ADMIN]: 'bg-status-info-bg text-status-info border-status-info/30',
  [SystemRole.CHEF_AGENCE]: 'bg-status-success-bg text-status-success border-status-success/30',
  [SystemRole.CAISSIER]: 'bg-status-info-bg text-status-info border-status-info/30',
  [SystemRole.AGENT_TERRAIN]: 'bg-status-success-bg text-status-success border-status-success/30',
  [SystemRole.COMPTABLE]: 'bg-accent/10 text-accent border-accent/30',
  [SystemRole.GESTIONNAIRE_CREDIT]: 'bg-accent/10 text-accent border-accent/30',
  [SystemRole.SUPERVISEUR]: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
  [SystemRole.AUDITEUR]: 'bg-status-warning-bg text-status-warning border-status-warning/30',
  [SystemRole.RH]: 'bg-status-success-bg text-status-success border-status-success/30',
  [SystemRole.SUPPORT_IT]: 'bg-status-info-bg text-status-info border-status-info/30',
  [SystemRole.CLIENT]: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
};

export const CATEGORY_LABELS: Record<string, string> = {
  'principal': 'Modules Principaux',
  'gestion': 'Gestion',
  'Administrateur': 'Administration'
};

export const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3', permission: 'dashboard.view' },
  { id: 'profils', label: 'Personnel', icon: 'Award', permission: 'rh.view' },
  { id: 'logs', label: 'Logs', icon: 'Activity', permission: 'admin.logs' },
  { id: 'sessions', label: 'Sessions', icon: 'Monitor', permission: 'admin.settings' },
  { id: 'roles', label: 'Gestion des Accès', icon: 'Shield', permission: 'admin.roles' },
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
  { id: 'product-rates', label: 'Taux Produits', icon: 'Percent', permission: 'admin.manage' },
  { id: 'zones-commerciales', label: 'Arrondissements & Marchés', icon: 'MapPin', permission: 'zones.view' },
  { id: 'payment-methods', label: 'Paiements', icon: 'CreditCard', permission: 'admin.settings' },
  { id: 'currency', label: 'Devise', icon: 'Coins', permission: 'admin.settings' },
  { id: 'branding', label: 'Branding', icon: 'Palette', permission: 'admin.settings' },
  { id: 'tenant', label: 'Tenant & Modules', icon: 'Settings', permission: 'admin.settings' },
  { id: 'reset-agence', label: 'Reset Agence', icon: 'RotateCcw', permission: 'admin.manage' },
  { id: 'scoring', label: 'Scoring', icon: 'BarChart3', permission: 'loyalty.view' },
  { id: 'sync', label: 'Synchronisation', icon: 'CloudUpload', permission: 'admin.settings' },
] as const;

export type AdminTabId = typeof ADMIN_TABS[number]['id'];
