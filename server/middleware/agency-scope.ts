/**
 * Agency Scope Enforcement Documentation & Configuration
 *
 * Ce fichier documente quelles routes requièrent un scope agence et fournit
 * des helpers pour auditer la conformité des routes.
 *
 * POLITIQUE DE SCOPE AGENCE:
 * - Les administrateurs (ADMIN) ont accès global (pas de filtre)
 * - Les autres rôles sont restreints à leur(s) agence(s) assignée(s)
 * - Certaines routes sont intentionnellement exemptées (données globales)
 */

/**
 * Routes DEVANT avoir un scope agence
 * Format: { method, path, entityField, description }
 */
export const ROUTES_REQUIRING_AGENCY_SCOPE = [
  // ============================================
  // CLIENTS
  // ============================================
  { method: 'GET', path: '/api/clients', entityField: 'agenceId', description: 'Liste des clients' },
  { method: 'POST', path: '/api/clients', entityField: 'agenceId', description: 'Création client' },
  { method: 'PUT', path: '/api/clients/:id', entityField: 'agenceId', description: 'Modification client' },

  // ============================================
  // CRÉDITS
  // ============================================
  { method: 'GET', path: '/api/credits', entityField: 'agenceId', description: 'Liste des crédits' },
  { method: 'POST', path: '/api/credits', entityField: 'agenceId', description: 'Création crédit' },
  { method: 'GET', path: '/api/demandes-credit', entityField: 'agenceId', description: 'Demandes de crédit' },

  // ============================================
  // ÉPARGNES / COMPTES
  // ============================================
  { method: 'GET', path: '/api/comptes', entityField: 'agenceId', description: 'Liste des comptes' },
  { method: 'POST', path: '/api/comptes', entityField: 'agenceId', description: 'Création compte' },
  { method: 'GET', path: '/api/comptes-epargne', entityField: 'agenceId', description: 'Comptes épargne' },

  // ============================================
  // TONTINES
  // ============================================
  { method: 'GET', path: '/api/tontines', entityField: 'agence', description: 'Liste des tontines' },
  { method: 'POST', path: '/api/tontines', entityField: 'agence', description: 'Création tontine' },
  { method: 'GET', path: '/api/tontines/:id/membres', entityField: 'agence', description: 'Membres tontine' },
  { method: 'GET', path: '/api/tontines/:id/contributions', entityField: 'agence', description: 'Contributions tontine' },

  // ============================================
  // CAISSE
  // ============================================
  { method: 'GET', path: '/api/caisse/sessions', entityField: 'agenceId', description: 'Sessions caisse' },
  { method: 'POST', path: '/api/caisse/sessions', entityField: 'agenceId', description: 'Ouverture session' },
  { method: 'GET', path: '/api/caisse/operations', entityField: 'agenceId', description: 'Opérations caisse' },

  // ============================================
  // EMPLOYÉS / RH
  // ============================================
  { method: 'GET', path: '/api/employes', entityField: 'agenceId', description: 'Liste employés' },
  { method: 'POST', path: '/api/employes', entityField: 'agenceId', description: 'Création employé' },

  // ============================================
  // MESSAGES / COMMUNICATIONS
  // ============================================
  { method: 'GET', path: '/api/conversations', entityField: 'agenceId', description: 'Conversations' },

  // ============================================
  // RÉÉVALUATIONS
  // ============================================
  { method: 'GET', path: '/api/reevaluations', entityField: 'agenceId', description: 'Réévaluations crédit' },

  // ============================================
  // AGENT TERRAIN
  // ============================================
  { method: 'GET', path: '/api/terrain/operations', entityField: 'agenceId', description: 'Opérations terrain' },
  { method: 'GET', path: '/api/terrain/visites', entityField: 'agenceId', description: 'Visites terrain' },

  // ============================================
  // COMPTABILITÉ
  // ============================================
  { method: 'GET', path: '/api/comptabilite/ecritures', entityField: 'agenceId', description: 'Écritures comptables' },
  { method: 'GET', path: '/api/comptabilite/journaux', entityField: 'agenceId', description: 'Journaux' },
] as const;

/**
 * Routes intentionnellement EXEMPTÉES du scope agence
 * Ces routes retournent des données globales/système
 */
export const ROUTES_EXEMPT_FROM_AGENCY_SCOPE = [
  // Configuration système
  { path: '/api/modules', reason: 'Liste des modules système (globale)' },
  { path: '/api/permissions', reason: 'Catalogue des permissions (global)' },
  { path: '/api/roles', reason: 'Liste des rôles système (globale)' },
  { path: '/api/role-permissions', reason: 'Permissions par rôle (gestion admin)' },

  // Plan comptable OHADA
  { path: '/api/comptabilite/plan-ohada', reason: 'Plan comptable OHADA (standard national)' },
  { path: '/api/comptabilite/comptes', reason: 'Liste des comptes OHADA (templates)' },

  // Plans de crédit
  { path: '/api/credit-plans', reason: 'Plans de crédit (peuvent être globaux)' },

  // Paramètres système
  { path: '/api/settings', reason: 'Paramètres système (admin)' },

  // Agences (la liste elle-même)
  { path: '/api/agences', reason: 'Liste des agences (nécessaire pour sélecteur)' },

  // RBAC
  { path: '/api/rbac/*', reason: 'Gestion RBAC (admin uniquement)' },
  { path: '/api/user-permissions/*', reason: 'Permissions utilisateur (admin)' },

  // Authentification
  { path: '/api/auth/*', reason: 'Routes d\'authentification' },
  { path: '/api/my-permissions', reason: 'Permissions de l\'utilisateur connecté' },
] as const;

/**
 * Vérifier si une route nécessite un scope agence
 */
export function requiresAgencyScope(method: string, path: string): boolean {
  // Vérifier les exemptions
  const isExempt = ROUTES_EXEMPT_FROM_AGENCY_SCOPE.some(exempt => {
    if (exempt.path.endsWith('*')) {
      const prefix = exempt.path.slice(0, -1);
      return path.startsWith(prefix);
    }
    return path === exempt.path;
  });

  if (isExempt) return false;

  // Vérifier si c'est une route requérant un scope
  return ROUTES_REQUIRING_AGENCY_SCOPE.some(route => {
    // Normaliser le path pour la comparaison (remplacer :id par regex)
    const pattern = route.path.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return route.method === method && regex.test(path);
  });
}

/**
 * Obtenir la configuration de scope pour une route
 */
export function getAgencyScopeConfig(method: string, path: string) {
  return ROUTES_REQUIRING_AGENCY_SCOPE.find(route => {
    const pattern = route.path.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return route.method === method && regex.test(path);
  });
}

/**
 * RÉSUMÉ DE L'AUDIT DES ROUTES
 *
 * Routes avec scope agence implémenté:
 * - /api/clients (clients.ts) ✓
 * - /api/comptes (comptes.ts) ✓
 * - /api/tontines (tontines.ts) ✓
 * - /api/finance/* (finance.ts) ✓
 *
 * Routes MANQUANT le scope agence (à corriger):
 * - /api/conversations - server/routes/conversations.ts
 * - /api/reevaluations - server/routes/reevaluations.ts (certaines routes)
 * - /api/employes - server/routes/employes.ts (certaines routes GET)
 *
 * RECOMMANDATIONS:
 * 1. Ajouter requireAgenceAccess('agenceId') aux routes manquantes
 * 2. Pour les routes retournant des listes, utiliser req.agenceFilter dans la query
 * 3. Pour les routes de création/modification, utiliser validateAgenceIdAction()
 */

// Export type for documentation
export type AgencyScopeRoute = (typeof ROUTES_REQUIRING_AGENCY_SCOPE)[number];
export type AgencyExemptRoute = (typeof ROUTES_EXEMPT_FROM_AGENCY_SCOPE)[number];
