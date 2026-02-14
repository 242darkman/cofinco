import { ROLE_LABELS, SystemRole, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';

const ROLE_CLASSES: Record<SystemRole, string> = {
  [SystemRole.ADMIN]: 'bg-accent/10 text-accent border-accent/20',
  [SystemRole.CHEF_AGENCE]: 'bg-status-success-bg text-status-success border-status-success/20',
  [SystemRole.COMPTABLE]: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  [SystemRole.GESTIONNAIRE_CREDIT]: 'bg-status-info-bg text-status-info border-status-info/20',
  [SystemRole.SUPERVISEUR]: 'bg-accent/10 text-accent border-accent/20',
  [SystemRole.CAISSIER]: 'bg-status-info-bg text-status-info border-status-info/20',
  [SystemRole.AGENT_TERRAIN]: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  [SystemRole.CLIENT]: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
};

/**
 * Retourne le label professionnel et les classes CSS pour un badge de rôle
 */
export const getRoleBadgeStyle = (role: string) => {
  if (!role) {
    return { label: 'Inconnu', classes: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20' };
  }
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return { 
      label: role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' '), 
      classes: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20' 
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
    classes: 'bg-status-success-bg text-status-success border-status-success/20'
  },
  'Inactif': {
    label: 'Inactif',
    classes: 'bg-status-danger-bg text-status-danger border-status-danger/20'
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
    classes: 'bg-surface-subtle/30 text-content-muted border-edge-subtle'
  };
};
