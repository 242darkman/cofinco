/**
 * Constantes pour le module Admin
 */

export const ADMIN_ROLES = [
  'Administrateur',
  'Chef d\'Agence',
  'Agent Caisse',
  'Agent Terrain',
  'Comptable',
  'Gestionnaire Crédit',
  'Superviseur'
] as const;

export type AdminRole = typeof ADMIN_ROLES[number];

export const ROLE_COLORS: Record<string, string> = {
  'Administrateur': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Chef d\'Agence': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Agent Caisse': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Agent Terrain': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Comptable': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Gestionnaire Crédit': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Superviseur': 'bg-slate-500/20 text-slate-400 border-slate-500/30'
};

export const CATEGORY_LABELS: Record<string, string> = {
  'principal': 'Modules Principaux',
  'gestion': 'Gestion',
  'Administrateur': 'Administration'
};

export const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3' },
  { id: 'profils', label: 'Personnel', icon: 'Award' },
  { id: 'users', label: 'Utilisateurs', icon: 'Users' },
  { id: 'logs', label: 'Logs', icon: 'Activity' },
  { id: 'sessions', label: 'Sessions', icon: 'Monitor' },
  { id: 'roles', label: 'Gestion des Accès', icon: 'Shield' },
  { id: 'settings', label: 'Paramètres', icon: 'Settings' },
  { id: 'maintenance', label: 'Maintenance', icon: 'Power' },
  { id: 'caisses', label: 'Caisses', icon: 'Wallet' },
  { id: 'credits', label: 'Crédits', icon: 'CreditCard' },
  { id: 'tontines', label: 'Tontines', icon: 'Users' },
  { id: 'agences', label: 'Agences', icon: 'Building2' },
  { id: 'zones', label: 'Zones', icon: 'MapPin' },
  { id: 'sms', label: 'SMS', icon: 'MessageSquare', disabled: true },
  { id: 'updates', label: 'Version', icon: 'Package' },
  { id: 'codes', label: 'Codes Caisse', icon: 'KeyRound' },
  { id: 'validations', label: 'Validations', icon: 'CheckCircle' }
] as const;

export type AdminTabId = typeof ADMIN_TABS[number]['id'];
