import { ROLE_LABELS, SystemRole, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';

const ROLE_CLASSES: Record<SystemRole, string> = {
  [SystemRole.ADMIN]: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  [SystemRole.CHEF_AGENCE]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  [SystemRole.COMPTABLE]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  [SystemRole.GESTIONNAIRE_CREDIT]: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  [SystemRole.SUPERVISEUR]: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  [SystemRole.CAISSIER]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  [SystemRole.AGENT_TERRAIN]: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  [SystemRole.CLIENT]: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

/**
 * Retourne le label professionnel et les classes CSS pour un badge de rôle
 */
export const getRoleBadgeStyle = (role: string) => {
  if (!role) {
    return { label: 'Inconnu', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  }
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return { 
      label: role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' '), 
      classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' 
    };
  }

  return {
    label: ROLE_LABELS[normalizedRole],
    classes: ROLE_CLASSES[normalizedRole],
  };
};

export const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  'Actif': {
    label: 'Actif',
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  },
  'Inactif': {
    label: 'Inactif',
    classes: 'bg-red-500/10 text-red-400 border-red-500/20'
  }
};

/**
 * Retourne le label et les classes CSS pour un badge de statut
 */
export const getStatusBadgeStyle = (status: string) => {
  const s = (status || '').trim();
  const lower = s.toLowerCase();

  if (s === StatutUser.ACTIVE || lower === 'actif' || lower === 'active') {
    return STATUS_STYLES['Actif'];
  }
  if (s === StatutUser.INACTIVE || s === StatutUser.SUSPENDED || lower === 'inactif' || lower === 'inactive' || lower === 'bloqué' || lower === 'bloque') {
    return STATUS_STYLES['Inactif'];
  }

  return {
    label: s || 'N/A',
    classes: 'bg-slate-500/10 text-slate-400 border-slate-700/50'
  };
};
