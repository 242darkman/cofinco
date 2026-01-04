import { lazy, ComponentType } from 'react';
import { MODULE_ACCESS } from './rbac-config';

// Lazy load components
const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const Credits = lazy(() => import('@/components/finance/credits/Credits'));
const Epargnes = lazy(() => import('@/components/finance/epargne/Epargnes'));
const Tontines = lazy(() => import('@/components/finance/tontine/Tontines'));
const Comptabilite = lazy(() => import('@/components/finance/accounting/ComptabiliteSageOHADA'));
const RessourcesHumaines = lazy(() => import('@/components/hr/RessourcesHumaines'));
const AgentTerrain = lazy(() => import('@/components/agent/AgentTerrain'));
const CaisseDashboard = lazy(() => import('@/components/finance/caisse/CaisseDashboard'));
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
  children?: RouteConfig[];
  defaultChild?: string;
}

/**
 * Configuration centrale des routes avec protection RBAC et sous-routes
 * Les routes utilisent désormais requiredModule qui référence MODULE_ACCESS
 */
export const ROUTES: RouteConfig[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    component: Dashboard,
    requiredModule: 'Dashboard',
    label: 'Dashboard',
    labelKey: 'menuDashboard',
  },
  {
    key: 'clients',
    path: '/clients',
    component: null,
    requiredModule: 'Clients',
    label: 'Clients',
    labelKey: 'menuClients',
    children: [
      { key: 'clients-list', path: '/clients', component: null, label: 'Liste', labelKey: 'liste' },
      { key: 'clients-map', path: '/clients/map', component: null, label: 'Carte', labelKey: 'carte' },
      { key: 'clients-stats', path: '/clients/stats', component: null, label: 'Statistiques', labelKey: 'statistiques' },
    ],
    defaultChild: 'clients-list',
  },
  {
    key: 'credits',
    path: '/credits',
    component: Credits,
    requiredModule: 'Crédits',
    label: 'Crédits',
    labelKey: 'menuCredits',
    children: [
      { key: 'credits-list', path: '/credits', component: Credits, label: 'Liste', labelKey: 'liste' },
      { key: 'credits-demandes', path: '/credits/demandes', component: null, label: 'Demandes', labelKey: 'demandes' },
      { key: 'credits-remboursements', path: '/credits/remboursements', component: null, label: 'Remboursements', labelKey: 'remboursements' },
    ],
    defaultChild: 'credits-list',
  },
  {
    key: 'epargnes',
    path: '/epargnes',
    component: Epargnes,
    requiredModule: 'Épargnes',
    label: 'Épargnes',
    labelKey: 'menuEpargnes',
    children: [
      { key: 'epargnes-list', path: '/epargnes', component: Epargnes, label: 'Comptes', labelKey: 'comptes' },
      { key: 'epargnes-transactions', path: '/epargnes/transactions', component: null, label: 'Transactions', labelKey: 'transactions' },
    ],
    defaultChild: 'epargnes-list',
  },
  {
    key: 'tontines',
    path: '/tontines',
    component: Tontines,
    requiredModule: 'Tontines',
    label: 'Tontines',
    labelKey: 'menuTontines',
  },
  {
    key: 'comptabilite',
    path: '/comptabilite',
    component: Comptabilite,
    requiredModule: 'Comptabilité',
    label: 'Comptabilité',
    labelKey: 'menuComptabilite',
    children: [
      { key: 'compta-journal', path: '/comptabilite', component: Comptabilite, label: 'Journal', labelKey: 'journal' },
      { key: 'compta-bilan', path: '/comptabilite/bilan', component: null, label: 'Bilan', labelKey: 'bilan' },
      { key: 'compta-tresorerie', path: '/comptabilite/tresorerie', component: null, label: 'Trésorerie', labelKey: 'tresorerie' },
    ],
    defaultChild: 'compta-journal',
  },
  {
    key: 'rh',
    path: '/rh',
    component: RessourcesHumaines,
    requiredModule: 'Admin',
    label: 'Ressources Humaines',
    labelKey: 'menuRH',
  },
  {
    key: 'agentTerrain',
    path: '/terrain',
    component: AgentTerrain,
    requiredModule: 'Terrain',
    label: 'Terrain',
    labelKey: 'menuTerrain',
    children: [
      { key: 'terrain-agents', path: '/terrain', component: AgentTerrain, label: 'Agents', labelKey: 'agents' },
      { key: 'terrain-visites', path: '/terrain/visites', component: null, label: 'Visites', labelKey: 'visites' },
      { key: 'terrain-zones', path: '/terrain/zones', component: null, label: 'Zones', labelKey: 'zones' },
    ],
    defaultChild: 'terrain-agents',
  },
  {
    key: 'caisse',
    path: '/caisse',
    component: CaisseDashboard,
    requiredModule: 'Caisse',
    label: 'Caisse',
    labelKey: 'menuCaisse',
    children: [
      { key: 'caisse-session', path: '/caisse', component: CaisseDashboard, label: 'Session', labelKey: 'session' },
      { key: 'caisse-operations', path: '/caisse/operations', component: null, label: 'Opérations', labelKey: 'operations' },
      { key: 'caisse-cloture', path: '/caisse/cloture', component: null, label: 'Clôture', labelKey: 'cloture' },
    ],
    defaultChild: 'caisse-session',
  },
  {
    key: 'transfert',
    path: '/transfert',
    component: TransfertArgent,
    requiredModule: 'Communications',
    label: 'Transferts',
    labelKey: 'menuTransfert',
  },
  {
    key: 'bourse',
    path: '/bourse',
    component: BourseModule,
    requireAdmin: true,
    label: 'Bourse',
    labelKey: 'menuBourse',
  },
  {
    key: 'rapports',
    path: '/rapports',
    component: ReportGenerator,
    requiredModule: 'Rapports',
    label: 'Rapports',
    labelKey: 'menuRapports',
    children: [
      { key: 'rapports-generator', path: '/rapports', component: ReportGenerator, label: 'Générateur', labelKey: 'generateur' },
      { key: 'rapports-analytics', path: '/rapports/analytics', component: null, label: 'Analytique', labelKey: 'analytique' },
    ],
    defaultChild: 'rapports-generator',
  },
  {
    key: 'administrateur',
    path: '/admin',
    component: AdminModuleComplet,
    requiredModule: 'Admin',
    label: 'Administration',
    labelKey: 'menuAdmin',
    children: [
      { key: 'admin-users', path: '/admin', component: AdminModuleComplet, label: 'Utilisateurs', labelKey: 'utilisateurs' },
      { key: 'admin-agences', path: '/admin/agences', component: null, label: 'Agences', labelKey: 'agences' },
      { key: 'admin-audit', path: '/admin/audit', component: null, label: 'Audit', labelKey: 'audit', requiredModule: 'Audit' },
    ],
    defaultChild: 'admin-users',
  },
  {
    key: 'parametres',
    path: '/parametres',
    component: ParametresModule,
    requiredModule: 'Paramètres',
    label: 'Paramètres',
    labelKey: 'menuParametres',
    children: [
      { key: 'params-general', path: '/parametres', component: ParametresModule, label: 'Général', labelKey: 'general' },
      { key: 'params-securite', path: '/parametres/securite', component: null, label: 'Sécurité', labelKey: 'securite' },
      { key: 'params-notifications', path: '/parametres/notifications', component: null, label: 'Notifications', labelKey: 'notifications' },
    ],
    defaultChild: 'params-general',
  },
  {
    key: 'messages',
    path: '/messages',
    component: MessagesModule,
    requiredModule: 'Communications',
    label: 'Messages',
    labelKey: 'menuMessages',
  },
  {
    key: 'profil',
    path: '/profil',
    component: UserProfile,
    label: 'Profil',
    labelKey: 'menuProfil',
  },
  {
    key: 'excel',
    path: '/excel',
    component: ExcelModule,
    requiredModule: 'Comptabilité',
    label: 'Excel',
    labelKey: 'menuExcel',
  },
];

/**
 * Vérifie si un utilisateur peut accéder à une route
 * Utilise désormais MODULE_ACCESS de rbac-config.ts
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

  // Vérifier via MODULE_ACCESS
  if (route.requiredModule) {
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
