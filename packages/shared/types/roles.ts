/**
 * Identifiants techniques des rôles (Immuables, utilisés en BDD et Code)
 */
export enum SystemRole {
  ADMIN = 'ADMIN',
  CHEF_AGENCE = 'CHEF_AGENCE',
  CAISSIER = 'CAISSIER',
  AGENT_TERRAIN = 'AGENT_TERRAIN',
  COMPTABLE = 'COMPTABLE',
  SUPERVISEUR = 'SUPERVISEUR',
  GESTIONNAIRE_CREDIT = 'GESTIONNAIRE_CREDIT',
  AUDITEUR = 'AUDITEUR',
  RH = 'RH',
  SUPPORT_IT = 'SUPPORT_IT',
  CLIENT = 'CLIENT'
}

const SYSTEM_ROLE_VALUES = Object.values(SystemRole);

/**
 * Rôles « opérateur plateforme » (éditeur) : seuls autorisés aux écrans et
 * endpoints d'exploitation (maintenance, version, provisioning tenant, reset
 * agence, synchronisation). L'admin tenant, même avec « manage all », en est
 * exclu. SOURCE UNIQUE partagée front + back — un seul point à modifier.
 */
export const PLATFORM_OPERATOR_ROLES: readonly SystemRole[] = [SystemRole.SUPPORT_IT];

/** Vrai si le rôle est un opérateur plateforme. */
export const isPlatformOperator = (role?: SystemRole | string | null): boolean =>
  !!role && (PLATFORM_OPERATOR_ROLES as readonly string[]).includes(role);

export const isSystemRole = (role?: string | null): role is SystemRole => {
  if (!role) return false;
  return SYSTEM_ROLE_VALUES.includes(role as SystemRole);
};

export const hasRole = (role: string | null | undefined, ...allowed: SystemRole[]): boolean => {
  if (!role) return false;
  return isSystemRole(role) && allowed.includes(role);
};

/**
 * Libellés d'affichage (Modifiables pour l'UI)
 */
export const ROLE_LABELS: Record<SystemRole, string> = {
  [SystemRole.ADMIN]: 'Administrateur Système',
  [SystemRole.CHEF_AGENCE]: "Chef d'Agence",
  [SystemRole.CAISSIER]: 'Agent de Caisse',
  [SystemRole.AGENT_TERRAIN]: 'Agent de Terrain',
  [SystemRole.COMPTABLE]: 'Comptable',
  [SystemRole.SUPERVISEUR]: 'Superviseur',
  [SystemRole.GESTIONNAIRE_CREDIT]: 'Gestionnaire de Crédit',
  [SystemRole.AUDITEUR]: 'Auditeur',
  [SystemRole.RH]: 'Responsable RH',
  [SystemRole.SUPPORT_IT]: 'Support Informatique',
  [SystemRole.CLIENT]: 'Client'
};

export const getRoleLabel = (role?: string | null): string => {
  if (!role) return 'Inconnu';
  if (isSystemRole(role)) return ROLE_LABELS[role];
  return role;
};

/**
 * Helper pour les listes déroulantes (Select UI)
 */
export const getRoleOptions = () => {
  return Object.values(SystemRole).map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
  }));
};
