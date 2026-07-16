import { lazy, ComponentType } from 'react';
import type { AppModule } from '@shared/config/rbac';
import { SystemRole } from '@shared/types/roles';
import { authService } from './auth';
import { Action, Subject, MODULE_TO_SUBJECT, Actions, Subjects } from './casl';
import type { AppAbility } from './casl';
import type { TenantFeatureKey, TenantFeatureFlags } from '@shared/tenant-config';

// Lazy load components
const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const Credits = lazy(() => import('@/components/finance/credits/Credits'));
const Comptes = lazy(() => import('@/components/finance/compte/Comptes'));
const Tontines = lazy(() => import('@/components/finance/tontine/Tontines'));
const CartesPointage = lazy(() => import('@/components/finance/carte-pointage/CartesPointage'));
const Comptabilite = lazy(() => import('@/components/finance/accounting/ComptabiliteSageOHADA'));
const RessourcesHumaines = lazy(() => import('@/components/hr/RessourcesHumaines'));
const AgentTerrainPortail = lazy(() => import('@/components/agent/AgentTerrainPortail'));
const AgentTerrain = lazy(() => import('@/components/agent/AgentTerrain'));
const ValidationsCenter = lazy(() => import('@/components/validations/ValidationsCenter'));
const CaisseDashboard = lazy(() => import('@/components/finance/caisse/CaisseDashboard'));
const CoffreFortDashboard = lazy(() => import('@/components/finance/caisse/CoffreFortDashboard').then(module => ({ default: module.CoffreFortDashboard })));
const TransfertArgent = lazy(() => import('@/components/finance/transfert/TransfertArgent'));
const ReportGenerator = lazy(() => import('@/components/shared/ReportGenerator'));
const AdminModuleComplet = lazy(() => import('@/components/admin/AdminModuleComplet'));
const MessagesModule = lazy(() => import('@/components/shared/MessagesModule'));
const UserProfile = lazy(() => import('@/components/shared/UserProfile'));
const CreditRefundsPage = lazy(() => import('@/pages/finance/CreditRefundsPage'));
const AdminVirementsProgrammes = lazy(() => import('@/components/admin/AdminVirementsProgrammes'));
// const ReconciliationPage = lazy(() => import('@/pages/finance/ReconciliationPage')); // Masqué temporairement
const TresoreriePage = lazy(() => import('@/pages/finance/TresoreriePage'));
const KpiDashboard = lazy(() => import('@/components/kpi/KpiDashboard'));
const MonEspace = lazy(() => import('@/components/mon-espace/MonEspace'));

/**
 * Mapping sous-route URL → sous-module interne
 */
export interface SubRouteMapping {
  path: string;
  subModule: string;
  label: string;
}

export interface RouteConfig {
  key: string;
  path: string; // Chemin URL réel (source unique de vérité)
  component: React.LazyExoticComponent<ComponentType<any>> | null;
  requiredModule?: AppModule; // Module from MODULE_ACCESS (source unique de vérité)
  requiredRoles?: SystemRole[]; // Override manuel (cas particuliers uniquement)
  requireAdmin?: boolean;
  // New CASL support
  requiredAbility?: { action: Action; subject: Subject }; // CASL ability check
  featureKey?: string; // Feature lock key (module lock)
  tenantFeature?: TenantFeatureKey;
  label: string;
  labelKey?: string;
  group?: 'Principal' | 'Services Clients' | 'Opérations' | 'Gestion' | 'Système';
  children?: RouteConfig[];
  defaultChild?: string;
  /** Sous-routes URL pour ce module (tabs, sous-vues). N'apparaissent pas dans la sidebar. */
  subRoutes?: SubRouteMapping[];
}

/**
 * Configuration centrale des routes — SOURCE UNIQUE DE VÉRITÉ
 *
 * Le champ `path` contient le vrai chemin URL visible par l'utilisateur.
 * Le champ `subRoutes` définit les sous-chemins URL (tabs, sous-vues).
 * Les fonctions getModuleFromPath() et getPathForModule() dérivent de ce tableau.
 */
export const ROUTES: RouteConfig[] = [
  // --- Tableau de bord ---
  {
    key: 'dashboard',
    path: '/',
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
    subRoutes: [
      { path: '/clients/nouveau', subModule: 'new', label: 'Nouveau client' },
      { path: '/clients/:id/overview', subModule: 'overview', label: 'Vue d\'ensemble' },
      { path: '/clients/:id/profil', subModule: 'profil', label: 'Profil & Situation' },
      { path: '/clients/:id/coordonnees', subModule: 'coordonnees', label: 'Coordonnées' },
      { path: '/clients/:id/kyc-legal', subModule: 'kyc-legal', label: 'Dossier KYC' },
      { path: '/clients/:id/references', subModule: 'references', label: 'Références' },
      { path: '/clients/:id/comptes', subModule: 'comptes', label: 'Comptes' },
      { path: '/clients/:id/kyc', subModule: 'kyc', label: 'Documents KYC' },
      { path: '/clients/:id/notes', subModule: 'notes', label: 'Notes' },
      { path: '/clients/:id/transactions', subModule: 'transactions', label: 'Transactions' },
      { path: '/clients/:id/enquetes', subModule: 'enquetes', label: 'Enquêtes' },
      { path: '/clients/:id/alertes', subModule: 'alertes', label: 'Alertes' },
      { path: '/clients/:id/score', subModule: 'score', label: 'Score' },
    ],
  },
  {
    key: 'credits',
    path: '/credits',
    component: Credits,
    requiredModule: 'Crédits',
    label: 'Crédits',
    labelKey: 'menuCredits',
    group: 'Services Clients',
    tenantFeature: 'enableCredits',
    subRoutes: [
      { path: '/credits/synthese', subModule: 'dashboard', label: 'Synthèse' },
      { path: '/credits/portefeuille', subModule: 'credits', label: 'Portefeuille' },
      { path: '/credits/a-traiter', subModule: 'demandes', label: 'À traiter' },
      { path: '/credits/enquetes', subModule: 'enquetes', label: 'Enquêtes' },
      { path: '/credits/approbation', subModule: 'approbation', label: 'Approbation' },
      { path: '/credits/comite', subModule: 'commission', label: 'Comité' },
      { path: '/credits/reevaluations', subModule: 'reevaluations', label: 'Réévaluations' },
      { path: '/credits/remboursements', subModule: 'remboursements', label: 'Remboursements' },
      { path: '/credits/echeancier', subModule: 'echeancier', label: 'Échéancier' },
      { path: '/credits/archives', subModule: 'archives', label: 'Archives' },
    ],
  },
  {
    key: 'remboursements',
    path: '/remboursements',
    component: CreditRefundsPage,
    requiredModule: 'Remboursements',
    label: 'Restitutions (Refus)',
    labelKey: 'menuRemboursements',
    group: 'Services Clients',
    tenantFeature: 'enableCredits',
  },
  {
    key: 'comptes',
    path: '/comptes',
    component: Comptes,
    requiredModule: 'Comptes',
    label: 'Comptes',
    labelKey: 'menuCompte',
    group: 'Services Clients',
    tenantFeature: 'enableComptes',
    subRoutes: [
      { path: '/comptes/tous', subModule: 'comptes', label: 'Tous les comptes' },
    ],
  },
  {
    key: 'tontines',
    path: '/tontines',
    component: Tontines,
    requiredModule: 'Tontines',
    label: 'Tontines',
    labelKey: 'menuTontines',
    group: 'Services Clients',
    tenantFeature: 'enableTontine',
  },
  {
    key: 'cartes-pointage',
    path: '/cartes-pointage',
    component: CartesPointage,
    requiredModule: 'Cartes de Pointage',
    label: 'Cartes de Pointage',
    labelKey: 'menuCartesPointage',
    group: 'Services Clients',
    tenantFeature: 'enableCartesPointage',
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
    tenantFeature: 'enableCaisse',
    subRoutes: [
      { path: '/caisse/demandes', subModule: 'demandes', label: 'Demandes' },
      { path: '/caisse/operations', subModule: 'operations', label: 'Opérations' },
      { path: '/caisse/infos-client', subModule: 'infos-client', label: 'Info Client' },
      { path: '/caisse/especes', subModule: 'especes', label: 'Espèces' },
      { path: '/caisse/mobilemoney', subModule: 'mobilemoney', label: 'Mobile Money' },
      { path: '/caisse/historique', subModule: 'historique', label: 'Historique' },
      { path: '/caisse/transferts', subModule: 'transferts', label: 'Transferts' },
      { path: '/caisse/etats', subModule: 'etats', label: 'États de caisse' },
      { path: '/caisse/supervision', subModule: 'supervision', label: 'Supervision' },
      { path: '/caisse/audit', subModule: 'audit', label: 'Audit' },
      { path: '/caisse/rapprochement', subModule: 'rapprochement', label: 'Rapprochement' },
    ],
  },
  {
    key: 'agentTerrain',
    path: '/operations-terrain',
    component: AgentTerrain,
    requiredModule: 'Agent Terrain',
    label: 'Agent de Terrain',
    labelKey: 'menuAgentTerrain',
    group: 'Opérations',
    tenantFeature: 'enableFieldAgents',
  },
  {
    key: 'agentModules',
    path: '/agent-terrain',
    component: AgentTerrainPortail,
    requiredModule: 'Agent Terrain',
    label: 'Gestion Agent',
    labelKey: 'menuAgentModules',
    group: 'Opérations',
    tenantFeature: 'enableFieldAgents',
    subRoutes: [
      { path: '/agent-terrain/dashboard', subModule: 'dashboard', label: 'Tableau de bord' },
      { path: '/agent-terrain/session', subModule: 'session', label: 'Session' },
      { path: '/agent-terrain/reports', subModule: 'reports', label: 'Rapports' },
      { path: '/agent-terrain/leaderboard', subModule: 'leaderboard', label: 'Classement' },
      { path: '/agent-terrain/prospections', subModule: 'prospections', label: 'Prospections' },
      { path: '/agent-terrain/commissions', subModule: 'commissions', label: 'Commissions' },
      { path: '/agent-terrain/planning', subModule: 'planning', label: 'Planning' },
      { path: '/agent-terrain/gps', subModule: 'gps', label: 'Géolocalisation' },
      { path: '/agent-terrain/rapports', subModule: 'rapports', label: 'Stats' },
      { path: '/agent-terrain/formations', subModule: 'formations', label: 'Formations' },
      { path: '/agent-terrain/materiel', subModule: 'materiel', label: 'Matériel' },
      { path: '/agent-terrain/incidents', subModule: 'incidents', label: 'Incidents' },
      { path: '/agent-terrain/objectifs', subModule: 'objectifs', label: 'Objectifs' },
      { path: '/agent-terrain/supervision-prospection', subModule: 'supervision-prospection', label: 'Supervision' },
      ...(import.meta.env.DEV ? [{ path: '/agent-terrain/tracking-debug', subModule: 'tracking-debug', label: 'Tracking Debug' }] : []),
    ],
  },
  {
    key: 'validations',
    path: '/validations',
    component: ValidationsCenter,
    requiredAbility: { action: Actions.APPROVE, subject: Subjects.OPERATION_TERRAIN },
    label: 'Validations',
    labelKey: 'menuValidations',
    group: 'Opérations',
    subRoutes: [
      { path: '/validations/collectes', subModule: 'collectes', label: 'Collectes Agents' },
      { path: '/validations/clotures', subModule: 'clotures', label: 'Clôtures Comptes' },
      { path: '/validations/ouvertures', subModule: 'ouvertures', label: 'Créations Comptes' },
    ],
  },
  {
    key: 'transfert',
    path: '/transferts',
    component: TransfertArgent,
    requiredModule: 'Communications',
    label: 'Transferts',
    labelKey: 'menuTransfert',
    group: 'Opérations',
    tenantFeature: 'enableTransfert',
  },
  {
    key: 'coffre',
    path: '/coffre-fort',
    component: CoffreFortDashboard,
    requiredModule: 'Coffre-Fort',
    label: 'Coffre-Fort',
    labelKey: 'menuCoffre',
    group: 'Opérations',
    tenantFeature: 'enableCoffreFort',
  },
  {
    key: 'tresorerie',
    path: '/tresorerie',
    component: TresoreriePage,
    requiredModule: 'Caisse',
    label: 'Trésorerie',
    labelKey: 'menuTresorerie',
    group: 'Opérations',
    tenantFeature: 'enableTresorerie',
  },
  // {
  //   key: 'reconciliation',
  //   path: '/reconciliation',
  //   component: ReconciliationPage,
  //   requiredModule: 'Administration',
  //   label: 'Réconciliation MM',
  //   labelKey: 'menuReconciliation',
  //   group: 'Opérations',
  // }, // Masqué temporairement
  {
    key: 'virements_programmes',
    path: '/virements-programmes',
    component: AdminVirementsProgrammes,
    requiredModule: 'Virements Programmes',
    label: 'Virements Programmés',
    labelKey: 'menuVirementsProgrammes',
    group: 'Opérations',
    tenantFeature: 'enableVirementsProgrammes',
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
    tenantFeature: 'enableComptabilite',
    subRoutes: [
      { path: '/comptabilite/journal', subModule: 'journal', label: 'Journal' },
      { path: '/comptabilite/grand-livre', subModule: 'grand-livre', label: 'Grand Livre' },
      { path: '/comptabilite/balance', subModule: 'balance', label: 'Balance' },
    ],
  },
  {
    key: 'rapports',
    path: '/rapports',
    component: ReportGenerator,
    requiredModule: 'Rapports',
    label: 'Rapports',
    labelKey: 'menuRapports',
    group: 'Gestion',
    tenantFeature: 'enableRapports',
  },
  {
    key: 'kpi',
    path: '/kpi',
    component: KpiDashboard,
    requiredModule: 'KPI',
    requiredAbility: { action: Actions.VIEW, subject: Subjects.KPI },
    label: 'KPI & Pilotage',
    labelKey: 'menuKPI',
    group: 'Gestion',
    tenantFeature: 'enableKpi',
  },
  {
    key: 'rh',
    path: '/ressources-humaines',
    component: RessourcesHumaines,
    requiredModule: 'Administration',
    label: 'Personnel',
    labelKey: 'menuRH',
    group: 'Gestion',
    tenantFeature: 'enableRH',
    subRoutes: [
      { path: '/ressources-humaines/tableau-de-bord', subModule: 'dashboard', label: 'Tableau de bord' },
      { path: '/ressources-humaines/employes', subModule: 'list', label: 'Employés' },
      { path: '/ressources-humaines/presence', subModule: 'presence', label: 'Présence' },
      { path: '/ressources-humaines/conges', subModule: 'conges', label: 'Congés' },
      { path: '/ressources-humaines/formations', subModule: 'formations', label: 'Formations' },
      { path: '/ressources-humaines/sanctions', subModule: 'sanctions', label: 'Sanctions' },
      { path: '/ressources-humaines/avantages', subModule: 'avantages', label: 'Avantages & Primes' },
      { path: '/ressources-humaines/paie', subModule: 'paie', label: 'Paie & Docs' },
      { path: '/ressources-humaines/postes', subModule: 'postes', label: 'Postes' },
      { path: '/ressources-humaines/recrutement', subModule: 'recrutement', label: 'Recrutement' },
      { path: '/ressources-humaines/rapports', subModule: 'rapports', label: 'Rapports' },
      { path: '/ressources-humaines/mes-documents', subModule: 'mes-documents', label: 'Documents' },
      { path: '/ressources-humaines/evaluations', subModule: 'evaluations', label: 'Évaluations' },
      { path: '/ressources-humaines/temps-projet', subModule: 'temps-projet', label: 'Temps Projet' },
      { path: '/ressources-humaines/organigramme', subModule: 'organigramme', label: 'Organigramme' },
      { path: '/ressources-humaines/direction', subModule: 'direction-generale', label: 'Direction' },
    ],
  },
  // --- Système ---
  {
    key: 'administrateur',
    path: '/administration',
    component: AdminModuleComplet,
    requiredModule: 'Administration',
    label: 'Administration',
    labelKey: 'menuAdmin',
    group: 'Système',
    subRoutes: [
      { path: '/administration/dashboard', subModule: 'dashboard', label: 'Dashboard' },
      { path: '/administration/personnel', subModule: 'profils', label: 'Personnel' },
      { path: '/administration/utilisateurs', subModule: 'users', label: 'Utilisateurs' },
      { path: '/administration/logs', subModule: 'logs', label: 'Logs' },
      { path: '/administration/sessions', subModule: 'sessions', label: 'Sessions' },
      { path: '/administration/acces', subModule: 'roles', label: 'Gestion des Accès' },
      { path: '/administration/maintenance', subModule: 'maintenance', label: 'Maintenance' },
      { path: '/administration/caisses', subModule: 'caisses', label: 'Caisses' },
      { path: '/administration/credits', subModule: 'credits', label: 'Crédits' },
      { path: '/administration/tontines', subModule: 'tontines', label: 'Tontines' },
      { path: '/administration/agences', subModule: 'agences', label: 'Agences' },
      { path: '/administration/zones', subModule: 'zones', label: 'Zones' },
      { path: '/administration/notifications', subModule: 'notifications', label: 'Notifications' },
      { path: '/administration/version', subModule: 'updates', label: 'Version' },
      { path: '/administration/codes-caisse', subModule: 'codes', label: 'Codes Caisse' },
      { path: '/administration/regularisation', subModule: 'regularisation', label: 'Régularisation' },
      { path: '/administration/acces-clients', subModule: 'client-credentials', label: 'Accès Clients' },
      { path: '/administration/taux-produits', subModule: 'product-rates', label: 'Taux Produits' },
      { path: '/administration/zones-commerciales', subModule: 'zones-commerciales', label: 'Arrondissements & Marchés' },
      { path: '/administration/paiements', subModule: 'payment-methods', label: 'Paiements' },
      { path: '/administration/devise', subModule: 'currency', label: 'Devise' },
      { path: '/administration/societe', subModule: 'company-info', label: 'Société' },
      { path: '/administration/tenant', subModule: 'tenant', label: 'Tenant & Modules' },
      { path: '/administration/reset-agence', subModule: 'reset-agence', label: 'Reset Agence' },
      { path: '/administration/scoring', subModule: 'scoring', label: 'Scoring' },
    ],
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
    key: 'mon-espace',
    path: '/mon-espace',
    component: MonEspace,
    label: 'Mon Espace',
    labelKey: 'menuMonEspace',
    group: 'Système',
    tenantFeature: 'enableRH',
    subRoutes: [
      { path: '/mon-espace/dashboard', subModule: 'dashboard', label: 'Dashboard' },
      { path: '/mon-espace/coordonnees', subModule: 'coordonnees', label: 'Coordonnées' },
      { path: '/mon-espace/presence', subModule: 'presence', label: 'Présence' },
      { path: '/mon-espace/conges', subModule: 'conges', label: 'Congés' },
      { path: '/mon-espace/equipe', subModule: 'equipe', label: 'Mon Équipe' },
      { path: '/mon-espace/bulletins', subModule: 'bulletins', label: 'Bulletins' },
      { path: '/mon-espace/documents', subModule: 'documents', label: 'Documents' },
      { path: '/mon-espace/evaluations', subModule: 'evaluations', label: 'Évaluations' },
      { path: '/mon-espace/offres', subModule: 'offres', label: 'Offres' },
    ],
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
 * Vérifie si un utilisateur peut accéder à une route via CASL ability
 */
export function canAccessRoute(route: RouteConfig, ability: AppAbility): boolean {
  // Admin (manage all)
  if (ability.can(Actions.MANAGE, Subjects.ALL)) {
    return true;
  }

  // Route réservée admin uniquement
  if (route.requireAdmin) {
    return false;
  }

  // CASL requiredAbility check
  if (route.requiredAbility) {
    return ability.can(route.requiredAbility.action, route.requiredAbility.subject);
  }

  // Convert requiredModule to CASL subject
  if (route.requiredModule) {
    const subject = MODULE_TO_SUBJECT[route.requiredModule];
    if (subject) {
      return ability.can(Actions.VIEW, subject);
    }
  }

  // Role check for specific routes
  if (route.requiredRoles && route.requiredRoles.length > 0) {
    const user = authService.getCurrentUser();
    if (!user) return false;
    return route.requiredRoles.includes(user.role);
  }

  // Par défaut, accessible à tous (routes publiques comme profil)
  return true;
}

export function isRouteEnabledForTenant(
  route: RouteConfig,
  features: TenantFeatureFlags,
): boolean {
  return !route.tenantFeature || features[route.tenantFeature] === true;
}

/**
 * Obtient les routes accessibles via CASL ability (avec enfants filtrés)
 */
export function getAccessibleRoutes(ability: AppAbility): RouteConfig[] {
  return ROUTES
    .filter(route => canAccessRoute(route, ability))
    .map(route => ({
      ...route,
      children: route.children?.filter(child => canAccessRoute(child, ability)),
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

// ============================================================
// URL ↔ Module mapping (source unique de vérité)
// Remplace l'ancien fichier config/routes.tsx
// ============================================================

interface UrlRouteEntry {
  path: string;
  moduleKey: string;
  subModule?: string;
}

/**
 * Table de mapping URL plate dérivée de ROUTES + leurs subRoutes.
 * Triée du plus spécifique (chemin le plus long) au plus générique.
 */
const _urlMap: UrlRouteEntry[] = ROUTES.flatMap(route => {
  const entries: UrlRouteEntry[] = [
    { path: route.path, moduleKey: route.key },
  ];
  if (route.subRoutes) {
    entries.push(
      ...route.subRoutes.map(sr => ({
        path: sr.path,
        moduleKey: route.key,
        subModule: sr.subModule,
      }))
    );
  }
  return entries;
}).sort((a, b) => b.path.length - a.path.length);

/**
 * Match un pattern de chemin avec paramètres (ex: /clients/:id/details) contre un chemin réel.
 * Retourne les paramètres extraits ou null si pas de match.
 */
function matchPathPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Obtenir la configuration module à partir d'un chemin URL.
 * Tente d'abord un match exact, puis un match paramétrique (routes avec :param).
 */
export function getModuleFromPath(path: string): { moduleKey: string; subModule?: string; params?: Record<string, string> } | null {
  // 1. Match exact
  const match = _urlMap.find(r => r.path === path);
  if (match) {
    return { moduleKey: match.moduleKey, subModule: match.subModule };
  }

  // 2. Match paramétrique (routes avec :param)
  for (const entry of _urlMap) {
    if (!entry.path.includes(':')) continue;
    const params = matchPathPattern(entry.path, path);
    if (params) {
      return { moduleKey: entry.moduleKey, subModule: entry.subModule, params };
    }
  }

  // 3. Fallback: sous-route inconnue → résoudre vers le module parent
  // Ex: /clients/uuid/details (supprimé) → module "clients" avec params.id
  const firstSegment = path.split('/').filter(Boolean)[0];
  if (firstSegment) {
    const baseRoute = _urlMap.find(entry => !entry.subModule && entry.path === `/${firstSegment}`);
    if (baseRoute) {
      const parts = path.split('/').filter(Boolean);
      const params: Record<string, string> = {};
      if (parts.length >= 2) params.id = parts[1];
      return { moduleKey: baseRoute.moduleKey, subModule: undefined, params };
    }
  }

  return null;
}

/**
 * Obtenir le chemin URL pour un module donné, avec sous-module optionnel.
 * Si params est fourni, remplace les segments :param dans le chemin.
 */
export function getPathForModule(moduleKey: string, subModule?: string, params?: Record<string, string>): string {
  if (subModule) {
    const route = ROUTES.find(r => r.key === moduleKey);
    const sub = route?.subRoutes?.find(sr => sr.subModule === subModule);
    if (sub) {
      let path = sub.path;
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          path = path.replace(`:${key}`, value);
        }
      }
      return path;
    }
  }
  const route = ROUTES.find(r => r.key === moduleKey);
  return route?.path || '/';
}

/**
 * Vérifier si un chemin correspond à un module/sous-module.
 * Supporte les routes paramétrées (ex: /clients/:id/details match /clients/abc/details).
 */
export function isActiveRoute(
  currentPath: string,
  moduleKey: string,
  subModule?: string
): boolean {
  const resolved = getModuleFromPath(currentPath);
  if (!resolved) return false;
  if (subModule) {
    return resolved.moduleKey === moduleKey && resolved.subModule === subModule;
  }
  return resolved.moduleKey === moduleKey;
}
