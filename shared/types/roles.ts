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
  CLIENT = 'CLIENT'
}

const SYSTEM_ROLE_VALUES = Object.values(SystemRole);

export const isSystemRole = (role?: string | null): role is SystemRole => {
  if (!role) return false;
  return SYSTEM_ROLE_VALUES.includes(role as SystemRole);
};

const ROLE_ALIASES: Record<string, SystemRole> = {
  'admin': SystemRole.ADMIN,
  'administrateur': SystemRole.ADMIN,
  'administrateur systeme': SystemRole.ADMIN,
  'administrateur système': SystemRole.ADMIN,
  'admin_generale': SystemRole.ADMIN,
  'admin générale': SystemRole.ADMIN,
  'admin generale': SystemRole.ADMIN,
  'direction': SystemRole.ADMIN,
  'directeur': SystemRole.ADMIN,
  'directeur financier': SystemRole.ADMIN,
  'chef': SystemRole.CHEF_AGENCE,
  'chef_agence': SystemRole.CHEF_AGENCE,
  'chef agence': SystemRole.CHEF_AGENCE,
  "chef d'agence": SystemRole.CHEF_AGENCE,
  'chef caisse': SystemRole.CAISSIER,
  'chef_caisse': SystemRole.CAISSIER,
  'caissier': SystemRole.CAISSIER,
  'caisse': SystemRole.CAISSIER,
  'agent caisse': SystemRole.CAISSIER,
  'agent_caisse': SystemRole.CAISSIER,
  'agent de caisse': SystemRole.CAISSIER,
  'agent terrain': SystemRole.AGENT_TERRAIN,
  'agent_terrain': SystemRole.AGENT_TERRAIN,
  'terrain': SystemRole.AGENT_TERRAIN,
  'agent': SystemRole.AGENT_TERRAIN,
  'comptable': SystemRole.COMPTABLE,
  'superviseur': SystemRole.SUPERVISEUR,
  'gestionnaire crédit': SystemRole.GESTIONNAIRE_CREDIT,
  'gestionnaire credit': SystemRole.GESTIONNAIRE_CREDIT,
  'gestionnaire_credit': SystemRole.GESTIONNAIRE_CREDIT,
  'credit': SystemRole.GESTIONNAIRE_CREDIT,
  'client': SystemRole.CLIENT
};

export const normalizeRole = (role?: string | null): SystemRole | undefined => {
  if (!role) return undefined;
  if (isSystemRole(role)) return role;
  const key = role.trim().toLowerCase();
  return ROLE_ALIASES[key];
};

export const hasRole = (role: string | null | undefined, ...allowed: SystemRole[]): boolean => {
  const normalized = normalizeRole(role);
  return !!normalized && allowed.includes(normalized);
};

export const isAdminRole = (role?: string | null): boolean => normalizeRole(role) === SystemRole.ADMIN;

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
  [SystemRole.CLIENT]: 'Client'
};

export const getRoleLabel = (role?: string | null): string => {
  const normalized = normalizeRole(role);
  if (normalized) return ROLE_LABELS[normalized];
  if (!role) return 'Inconnu';
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
