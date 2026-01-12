import { lazy, ComponentType } from 'react';
import { MODULE_ACCESS } from './rbac-config';
import { authService } from './auth';

// Lazy load components
const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const Credits = lazy(() => import('@/components/finance/credits/Credits'));
const Epargnes = lazy(() => import('@/components/finance/epargne/Epargnes'));
const Tontines = lazy(() => import('@/components/finance/tontine/Tontines'));
const Comptabilite = lazy(() => import('@/components/finance/accounting/ComptabiliteSageOHADA'));
const RessourcesHumaines = lazy(() => import('@/components/hr/RessourcesHumaines'));
const AgentTerrain = lazy(() => import('@/components/agent/AgentTerrain'));
const CaisseDashboard = lazy(() => import('@/components/finance/caisse/CaisseDashboard'));
const CoffreFortDashboard = lazy(() => import('@/components/finance/caisse/CoffreFortDashboard').then(module => ({ default: module.CoffreFortDashboard })));
const TransfertArgent = lazy(() => import('@/components/finance/transfert/TransfertArgent'));
const BourseModule = lazy(() => import('@/components/finance/bourse/BourseModule'));
const ReportGenerator = lazy(() => import('@/components/shared/ReportGenerator'));
const AdminModuleComplet = lazy(() => import('@/components/admin/AdminModuleComplet'));
const ParametresModule = lazy(() => import('@/components/admin/settings/ParametresModule'));
const MessagesModule = lazy(() => import('@/components/shared/MessagesModule'));
const UserProfile = lazy(() => import('@/components/shared/UserProfile'));
const ExcelModule = lazy(() => import('@/components/shared/ExcelModule'));

export interface RouteConfig {
  key: string;
  path: string;
  component: React.LazyExoticComponent<ComponentType<any>> | null;
  requiredModule?: string; // Module from MODULE_ACCESS (source unique de vérité)
  requiredRoles?: string[]; // Override manuel (cas particuliers uniquement)
  requireAdmin?: boolean;
  label: string;
  labelKey?: string;
  group?: 'Principal' | 'Services Clients' | 'Opérations' | 'Gestion' | 'Système';
  children?: RouteConfig[];
  defaultChild?: string;
}

/**
 * Configuration centrale des routes avec protection RBAC et sous-routes
 * Les routes utilisent désormais requiredModule qui référence MODULE_ACCESS
 */
export const ROUTES: RouteConfig[] = [
  // --- Tableau de bord ---
  {
    key: 'dashboard',
    path: '/dashboard',
    component: Dashboard,
    requiredModule: 'Dashboard',
    label: 'Tableau de bord',
    labelKey: 'menuDashboard',
    group: 'Principal',
  },

  // --- Produits Financiers ---
  {
    key: 'clients',
    path: '/clients',
    component: null,
    requiredModule: 'Clients',
    label: 'Clients',
    labelKey: 'menuClients',
    group: 'Services Clients',
  },
  {
    key: 'credits',
    path: '/credits',
    component: Credits,
    requiredModule: 'Crédits',
    label: 'Crédits',
    labelKey: 'menuCredits',
    group: 'Services Clients',
  },
  {
    key: 'epargnes',
    path: '/epargnes',
    component: Epargnes,
    requiredModule: 'Comptes',
    label: 'Comptes',
    labelKey: 'menuCompte',
    group: 'Services Clients',
  },
  {
    key: 'tontines',
    path: '/tontines',
    component: Tontines,
    requiredModule: 'Tontines',
    label: 'Tontines',
    labelKey: 'menuTontines',
    group: 'Services Clients',
  },

  // --- Opérations ---
  {
    key: 'caisse',
    path: '/caisse',
    component: CaisseDashboard,
    requiredModule: 'Caisse',
    label: 'Caisse',
    labelKey: 'menuCaisse',
    group: 'Opérations',
  },
  {
    key: 'agentTerrain',
    path: '/terrain',
    component: AgentTerrain,
    requiredModule: 'Terrain',
    label: 'Collecte terrain',
    labelKey: 'menuTerrain',
    group: 'Opérations',
  },
  {
    key: 'transfert',
    path: '/transfert',
    component: TransfertArgent,
    requiredModule: 'Communications',
    label: 'Transferts',
    labelKey: 'menuTransfert',
    group: 'Opérations',
  },
  {
    key: 'coffre',
    path: '/coffre',
    component: CoffreFortDashboard,
    requiredModule: 'Coffre-Fort',
    label: 'Coffre-Fort',
    labelKey: 'menuCoffre',
    group: 'Opérations',
  },

  // --- Gestion ---
  {
    key: 'comptabilite',
    path: '/comptabilite',
    component: Comptabilite,
    requiredModule: 'Comptabilité',
    label: 'Comptabilité',
    labelKey: 'menuComptabilite',
    group: 'Gestion',
  },
  {
    key: 'rapports',
    path: '/rapports',
    component: ReportGenerator,
    requiredModule: 'Rapports',
    label: 'Rapports',
    labelKey: 'menuRapports',
    group: 'Gestion',
  },
  {
    key: 'excel',
    path: '/excel',
    component: ExcelModule,
    requiredModule: 'Comptabilité',
    label: 'Import/Export',
    labelKey: 'menuExcel',
    group: 'Gestion',
  },
  {
    key: 'rh',
    path: '/rh',
    component: RessourcesHumaines,
    requiredModule: 'Admin',
    label: 'Personnel',
    labelKey: 'menuRH',
    group: 'Gestion',
  },
  {
    key: 'bourse',
    path: '/bourse',
    component: BourseModule,
    requireAdmin: true,
    label: 'Bourse',
    labelKey: 'menuBourse',
    group: 'Gestion',
  },

  // --- Système ---
  {
    key: 'administrateur',
    path: '/admin',
    component: AdminModuleComplet,
    requiredModule: 'Admin',
    label: 'Administration',
    labelKey: 'menuAdmin',
    group: 'Système',
  },
  {
    key: 'parametres',
    path: '/parametres',
    component: ParametresModule,
    requiredModule: 'Paramètres',
    label: 'Paramètres',
    labelKey: 'menuParametres',
    group: 'Système',
  },
  {
    key: 'messages',
    path: '/messages',
    component: MessagesModule,
    requiredModule: 'Communications',
    label: 'Messages',
    labelKey: 'menuMessages',
    group: 'Système',
  },
  {
    key: 'profil',
    path: '/profil',
    component: UserProfile,
    label: 'Mon profil',
    labelKey: 'menuProfil',
    group: 'Système',
  },
];

/**
 * Vérifie si un utilisateur peut accéder à une route
 * Utilise authService.canAccessModule() qui prend en compte :
 * - Les permissions du rôle (MODULE_ACCESS)
 * - Les permissions personnalisées de l'utilisateur (depuis la BDD)
 */
export function canAccessRoute(route: RouteConfig, userRole: string): boolean {
  // Admin a accès à tout
  if (userRole === 'Administrateur') {
    return true;
  }

  // Route réservée admin uniquement
  if (route.requireAdmin) {
    return false;
  }

  // Override avec requiredRoles si spécifié (cas particuliers)
  if (route.requiredRoles && route.requiredRoles.length > 0) {
    return route.requiredRoles.includes(userRole);
  }

  // Vérifier via authService qui combine permissions rôle + custom
  if (route.requiredModule) {
    // Utiliser authService s'il est initialisé (utilisateur connecté)
    if (authService.isAuthenticated()) {
      return authService.canAccessModule(route.requiredModule);
    }
    // Fallback sur MODULE_ACCESS statique si pas authentifié
    const allowedModules = MODULE_ACCESS[userRole] || [];
    return allowedModules.includes(route.requiredModule);
  }

  // Par défaut, accessible à tous (routes publiques comme profil)
  return true;
}

/**
 * Obtient les routes accessibles pour un rôle (avec enfants filtrés)
 */
export function getAccessibleRoutes(userRole: string): RouteConfig[] {
  return ROUTES
    .filter(route => canAccessRoute(route, userRole))
    .map(route => ({
      ...route,
      children: route.children?.filter(child => canAccessRoute(child, userRole)),
    }));
}

/**
 * Trouve une route par clé
 */
export function getRouteByKey(key: string): RouteConfig | undefined {
  for (const route of ROUTES) {
    if (route.key === key) return route;
    if (route.children) {
      const child = route.children.find(c => c.key === key);
      if (child) return child;
    }
  }
  return undefined;
}

/**
 * Trouve la route parente d'une sous-route
 */
export function getParentRoute(childKey: string): RouteConfig | undefined {
  return ROUTES.find(route => 
    route.children?.some(child => child.key === childKey)
  );
}
