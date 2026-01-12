/**
 * Configuration RBAC : Modules accessibles par rôle
 */

export type ModuleAccessConfig = {
  [role: string]: string[];
};

/**
 * Liste des modules par rôle
 * Administrateur : Accès complet
 * Chef d'Agence : Tous modules sauf Paramètres système
 * Comptable : Comptabilité, Rapports, Dashboard
 * Gestionnaire Crédit : Crédits, Clients, Remboursements, Dashboard
 * Superviseur : Supervision équipe, Dashboard
 * Agent Caisse : Clients, Comptes, Transactions, Caisse, Dashboard
 * Agent Terrain : Clients, Terrain, Communications, Dashboard
 */
export const MODULE_ACCESS: ModuleAccessConfig = {
  'Administrateur': [
    'Dashboard',
    'Clients',
    'Crédits',
    'Comptes',
    'Tontines',
    'Comptabilité',
    'Remboursements',
    'Rapports',
    'Terrain',
    'Communications',
    'Caisse',
    'CaisseAgent',
    'RH',
    'Paramètres',
    'Admin',
    'Coffre-Fort',
    'Incidents',
    'Visites',
    'Prospection',
    'Paiements Agent'
  ],
  "Chef d'Agence": [
    'Dashboard',
    'Clients',
    'Crédits',
    'Comptes',
    'Tontines',
    'Comptabilité',
    'Remboursements',
    'Rapports',
    'Terrain',
    'Communications',
    'Caisse',
    'CaisseAgent',
    'Coffre-Fort',
    'Incidents',
    'Visites',
    'Prospection',
    'Paiements Agent',
    'RH',
    'Admin'
  ],
  'Comptable': [
    'Dashboard',
    'Comptabilité',
    'Rapports',
    'Clients',
    'Communications',
    'RH'
  ],
  'Gestionnaire Crédit': [
    'Dashboard',
    'Clients',
    'Crédits',
    'Remboursements',
    'Rapports',
    'Communications',
    'RH'
  ],
  'Superviseur': [
    'Dashboard',
    'Clients',
    'Terrain',
    'CaisseAgent',
    'Rapports',
    'Communications',
    'RH'
  ],
  'Agent Caisse': [
    'Dashboard',
    'Clients',
    'Comptes',
    'Caisse',
    'Communications',
    'RH'
  ],
  'Agent Terrain': [
    'Dashboard',
    'Clients',
    'Terrain',
    'CaisseAgent',
    'Incidents',
    'Visites',
    'Prospection',
    'Paiements Agent',
    'Communications',
    'RH'
  ]
};

/**
 * Vérifie si un rôle a accès à un module
 */
export function canAccessModule(role: string, moduleName: string): boolean {
  const allowedModules = MODULE_ACCESS[role] || [];
  return allowedModules.includes(moduleName);
}

/**
 * Obtient la liste des modules accessibles pour un rôle
 */
export function getAccessibleModules(role: string): string[] {
  return MODULE_ACCESS[role] || [];
}

/**
 * Configuration des permissions par action et module
 */
export type PermissionConfig = {
  [role: string]: {
    [module: string]: string[]; // Liste d'actions autorisées
  };
};

export const ROLE_PERMISSIONS: PermissionConfig = {
  'Administrateur': {
    '*': ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export', 'reevaluations.view', 'reevaluations.create', 'reevaluations.validate', 'reevaluations.decide', 'caisseagent.approve', 'caisseagent.reject']
  },
  "Chef d'Agence": {
    'clients': ['view', 'create', 'edit', 'delete'],
    'credits': ['view', 'create', 'edit', 'approve', 'delete', 'reevaluations.view', 'reevaluations.create', 'reevaluations.validate', 'reevaluations.decide'],
    'epargnes': ['view', 'create', 'edit'],
    'tontines': ['view', 'create', 'edit', 'manage'],
    'comptabilite': ['view'],
    'rapports': ['view', 'export'],
    'terrain': ['view', 'manage'],
    'caisse': ['view', 'manage'],
    'caisseagent': ['view', 'manage', 'caisseagent.approve', 'caisseagent.reject', 'caisseagent.suspend'],
    'rh': ['view', 'create', 'edit', 'manage'],
    'paie': ['view', 'create', 'approve'],
    'users': ['view', 'create', 'edit'],
    'coffre': ['view', 'transfert.init', 'transfert.validate', 'transfert.execute', 'config.view'],
    'incidents': ['view', 'manage', 'edit'],
    'visites': ['view'],
    'prospection': ['view'],
    'paiements': ['view']
  },
  'Comptable': {
    'clients': ['view'],
    'credits': ['view'],
    'epargnes': ['view'],
    'comptabilite': ['view', 'create', 'edit', 'export'],
    'rapports': ['view', 'export'],
    'rh': ['view'] // Pointage uniquement
  },
  'Gestionnaire Crédit': {
    'clients': ['view', 'create', 'edit'],
    'credits': ['view', 'create', 'edit', 'approve', 'reevaluations.view', 'reevaluations.create', 'reevaluations.validate', 'reevaluations.decide'],
    'remboursements': ['view', 'create'],
    'rapports': ['view', 'export'],
    'rh': ['view'] // Pointage uniquement
  },
  'Superviseur': {
    'clients': ['view'],
    'terrain': ['view', 'manage'],
    'tontines': ['view', 'manage'],
    'caisseagent': ['view', 'caisseagent.approve', 'caisseagent.reject'],
    'rapports': ['view'],
    'rh': ['view'] // Pointage uniquement
  },
  'Agent Caisse': {
    'clients': ['view', 'create'],
    'epargnes': ['view', 'create', 'edit'],
    'caisse': ['view', 'create', 'edit'],
    'remboursements': ['view', 'create'],
    'rh': ['view'] // Pointage uniquement
  },
  'Agent Terrain': {
    'clients': ['view', 'create', 'edit'],
    'terrain': ['view', 'create'],
    'prospection': ['view', 'create'],
    'caisseagent': ['view', 'create'], // Peut créer des opérations, pas les approuver
    'incidents': ['view', 'create'],
    'visites': ['view', 'create'],
    'paiements': ['view', 'create'],
    'rh': ['view'] // Pointage uniquement
  }
};

/**
 * Vérifie si un rôle a une permission spécifique
 */
export function hasPermission(role: string, module: string, action: string): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;

  // Check wildcard permissions (admins)
  if (rolePerms['*']) {
    return rolePerms['*'].includes(action);
  }

  // Check module-specific permissions
  const modulePerms = rolePerms[module.toLowerCase()];
  if (!modulePerms) return false;

  return modulePerms.includes(action);
}
