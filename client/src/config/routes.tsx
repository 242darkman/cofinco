/**
 * Configuration centralisée des routes de l'application
 * URLs professionnelles sans IDs apparents
 */

export interface RouteConfig {
  path: string;
  moduleKey: string;
  subModule?: string;
  label: string;
  requireAuth?: boolean;
}

/**
 * Routes principales de l'application
 * Format: /module-name pour une structure propre et professionnelle
 */
export const APP_ROUTES: RouteConfig[] = [
  // Dashboard
  {
    path: '/',
    moduleKey: 'dashboard',
    label: 'Tableau de bord',
    requireAuth: true,
  },

  // Gestion des clients
  {
    path: '/clients',
    moduleKey: 'clients',
    label: 'Clients',
    requireAuth: true,
  },
  {
    path: '/clients/nouveau',
    moduleKey: 'clients',
    subModule: 'new',
    label: 'Nouveau client',
    requireAuth: true,
  },

  // Caisse
  {
    path: '/caisse',
    moduleKey: 'caisse',
    label: 'Caisse',
    requireAuth: true,
  },
  {
    path: '/caisse/mobile-money',
    moduleKey: 'caisse',
    subModule: 'mobile-money',
    label: 'Mobile Money',
    requireAuth: true,
  },
  {
    path: '/caisse/especes',
    moduleKey: 'caisse',
    subModule: 'especes',
    label: 'Espèces',
    requireAuth: true,
  },
  {
    path: '/caisse/historique',
    moduleKey: 'caisse',
    subModule: 'historique',
    label: 'Historique',
    requireAuth: true,
  },
  {
    path: '/caisse/etats',
    moduleKey: 'caisse',
    subModule: 'etats',
    label: 'États de caisse',
    requireAuth: true,
  },
  {
    path: '/caisse/supervision',
    moduleKey: 'caisse',
    subModule: 'supervision',
    label: 'Supervision',
    requireAuth: true,
  },
  {
    path: '/caisse/audit',
    moduleKey: 'caisse',
    subModule: 'audit',
    label: 'Audit',
    requireAuth: true,
  },

  // Crédits
  {
    path: '/credits',
    moduleKey: 'credits',
    label: 'Crédits',
    requireAuth: true,
  },
  {
    path: '/credits/demandes',
    moduleKey: 'credits',
    subModule: 'demandes',
    label: 'Demandes de crédit',
    requireAuth: true,
  },
  {
    path: '/credits/portefeuille',
    moduleKey: 'credits',
    subModule: 'portefeuille',
    label: 'Portefeuille',
    requireAuth: true,
  },

  // Remboursements
  {
    path: '/remboursements',
    moduleKey: 'remboursements',
    label: 'Remboursements',
    requireAuth: true,
  },

  // Épargnes
  {
    path: '/epargnes',
    moduleKey: 'epargnes',
    label: 'Comptes d\'épargne',
    requireAuth: true,
  },
  {
    path: '/epargnes/comptes',
    moduleKey: 'epargnes',
    subModule: 'comptes',
    label: 'Tous les comptes',
    requireAuth: true,
  },

  // Tontines
  {
    path: '/tontines',
    moduleKey: 'tontines',
    label: 'Tontines',
    requireAuth: true,
  },

  // Coffre-Fort
  {
    path: '/coffre-fort',
    moduleKey: 'coffre',
    label: 'Coffre-Fort',
    requireAuth: true,
  },

  // Transferts
  {
    path: '/transferts',
    moduleKey: 'transfert',
    label: 'Transferts',
    requireAuth: true,
  },

  // Trésorerie
  {
    path: '/tresorerie',
    moduleKey: 'tresorerie',
    label: 'Trésorerie',
    requireAuth: true,
  },

  // Réconciliation Mobile Money
  {
    path: '/reconciliation',
    moduleKey: 'reconciliation',
    label: 'Réconciliation MM',
    requireAuth: true,
  },

  // Comptabilité
  {
    path: '/comptabilite',
    moduleKey: 'comptabilite',
    label: 'Comptabilité',
    requireAuth: true,
  },
  {
    path: '/comptabilite/journal',
    moduleKey: 'comptabilite',
    subModule: 'journal',
    label: 'Journal',
    requireAuth: true,
  },
  {
    path: '/comptabilite/grand-livre',
    moduleKey: 'comptabilite',
    subModule: 'grand-livre',
    label: 'Grand Livre',
    requireAuth: true,
  },
  {
    path: '/comptabilite/balance',
    moduleKey: 'comptabilite',
    subModule: 'balance',
    label: 'Balance',
    requireAuth: true,
  },

  // Agent de terrain
  {
    path: '/agent-terrain',
    moduleKey: 'agentTerrain',
    label: 'Agent de terrain',
    requireAuth: true,
  },

  // Gestion des agents
  {
    path: '/gestion-agents',
    moduleKey: 'agentModules',
    label: 'Gestion des agents',
    requireAuth: true,
  },

  // Validations
  {
    path: '/validations',
    moduleKey: 'agentValidations',
    label: 'Validations',
    requireAuth: true,
  },

  // Virements programmés
  {
    path: '/virements-programmes',
    moduleKey: 'virements_programmes',
    label: 'Virements programmés',
    requireAuth: true,
  },

  // Ressources Humaines
  {
    path: '/ressources-humaines',
    moduleKey: 'rh',
    label: 'Ressources Humaines',
    requireAuth: true,
  },

  // Rapports
  {
    path: '/rapports',
    moduleKey: 'rapports',
    label: 'Rapports',
    requireAuth: true,
  },

  // Administration
  {
    path: '/administration',
    moduleKey: 'administrateur',
    label: 'Administration',
    requireAuth: true,
  },

  // Profil utilisateur
  {
    path: '/profil',
    moduleKey: 'profil',
    label: 'Mon profil',
    requireAuth: true,
  },

  // Messages
  {
    path: '/messages',
    moduleKey: 'messages',
    label: 'Messages',
    requireAuth: true,
  },
];

/**
 * Obtenir le chemin URL pour un module donné
 */
export function getPathForModule(moduleKey: string, subModule?: string): string {
  // Chercher d'abord une route avec sous-module si fourni
  if (subModule) {
    const routeWithSub = APP_ROUTES.find(
      r => r.moduleKey === moduleKey && r.subModule === subModule
    );
    if (routeWithSub) return routeWithSub.path;
  }

  // Sinon, chercher la route principale du module
  const route = APP_ROUTES.find(
    r => r.moduleKey === moduleKey && !r.subModule
  );

  return route?.path || '/';
}

/**
 * Obtenir la configuration de module à partir d'un chemin URL
 */
export function getModuleFromPath(path: string): { moduleKey: string; subModule?: string } | null {
  const route = APP_ROUTES.find(r => r.path === path);
  if (!route) return null;

  return {
    moduleKey: route.moduleKey,
    subModule: route.subModule,
  };
}

/**
 * Vérifier si un chemin correspond à un module/sous-module
 */
export function isActiveRoute(
  currentPath: string,
  moduleKey: string,
  subModule?: string
): boolean {
  const route = APP_ROUTES.find(
    r => r.moduleKey === moduleKey && r.subModule === subModule
  );

  return route?.path === currentPath;
}
