/**
 * Configuration RBAC : Modules accessibles par rôle
 */
import { SystemRole, normalizeRole } from '../types/roles';

export const APP_MODULES = [
  'Dashboard',
  'Caisse',
  'Crédits',
  'Remboursements',
  'Clients',
  'Comptes',
  'Tontines',
  'Comptabilité',
  'Agent Terrain',
  'CaisseAgent',
  'Transferts',
  'Virements Programmes',
  'Rapports',
  'RH',
  'Communications',
  'Bourse',
  'Loge',
  'Paramètres',
  'Administration',
  'Audit',
  'Messages',
  'Coffre-Fort',
  'Incidents',
  'Visites',
  'Prospection',
  'Paiements Agent',
  // New modules for CASL alignment
  'RBAC',
  'Maintenance',
  'Fidélité',
  'Régularisation',
  'Départements',
  'Employés',
  'Agences',
] as const;

export type AppModule = (typeof APP_MODULES)[number];

export type ModuleAccessConfig = Record<SystemRole, AppModule[]>;

/**
 * Liste des modules par rôle
 * Administrateur : Accès complet
 * Chef d'Agence : Tous modules sauf Paramètres système
 * Comptable : Comptabilité, Rapports, Dashboard
 * Gestionnaire Crédit : Crédits, Clients, Remboursements, Dashboard
 * Superviseur : Supervision équipe, Dashboard
 * agent_caisse : Clients, Comptes, Transactions, Caisse, Dashboard
 * Agent Terrain : Clients, Terrain, Communications, Dashboard
 */
export const MODULE_ACCESS: ModuleAccessConfig = {
  [SystemRole.ADMIN]: [
    'Dashboard',
    'Clients',
    'Crédits',
    'Comptes',
    'Tontines',
    'Comptabilité',
    'Remboursements',
    'Rapports',
    'Agent Terrain',
    'Communications',
    'Caisse',
    'CaisseAgent',
    'RH',
    'Paramètres',
    'Administration',
    'Coffre-Fort',
    'Incidents',
    'Visites',
    'Prospection',
    'Paiements Agent',
    'Virements Programmes',
    // New modules for CASL
    'RBAC',
    'Maintenance',
    'Fidélité',
    'Régularisation',
    'Départements',
    'Employés',
    'Agences',
  ],
  [SystemRole.CHEF_AGENCE]: [
    'Dashboard',
    'Clients',
    'Crédits',
    'Comptes',
    'Tontines',
    'Comptabilité',
    'Remboursements',
    'Rapports',
    'Agent Terrain',
    'Communications',
    'Caisse',
    'CaisseAgent',
    'Coffre-Fort',
    'Incidents',
    'Visites',
    'Prospection',
    'Paiements Agent',
    'RH',
    'Administration',
    'Virements Programmes'
  ],
  [SystemRole.COMPTABLE]: [
    'Dashboard',
    'Comptabilité',
    'Rapports',
    'Clients',
    'Communications',
    'RH'
  ],
  [SystemRole.GESTIONNAIRE_CREDIT]: [
    'Dashboard',
    'Clients',
    'Crédits',
    'Remboursements',
    'Rapports',
    'Communications',
    'RH'
  ],
  [SystemRole.SUPERVISEUR]: [
    'Dashboard',
    'Clients',
    'Agent Terrain',
    'CaisseAgent',
    'Rapports',
    'Communications',
    'RH'
  ],
  [SystemRole.CAISSIER]: [
    'Dashboard',
    'Clients',
    'Comptes',
    'Caisse',
    'Communications',
    'RH',
    'Virements Programmes'
  ],
  [SystemRole.AGENT_TERRAIN]: [
    'Dashboard',
    'Clients',
    'Agent Terrain',
    'CaisseAgent',
    'Incidents',
    'Visites',
    'Prospection',
    'Paiements Agent',
    'Communications',
    'RH'
  ],
  [SystemRole.CLIENT]: []
};

/**
 * Vérifie si un rôle a accès à un module
 */
export function canAccessModule(role: string, moduleName: AppModule): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  const allowedModules = MODULE_ACCESS[normalizedRole] || [];
  return allowedModules.includes(moduleName);
}

/**
 * Obtient la liste des modules accessibles pour un rôle
 */
export function getAccessibleModules(role: string): AppModule[] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];
  return MODULE_ACCESS[normalizedRole] || [];
}

/**
 * Configuration des permissions par action et module
 */
export type PermissionConfig = {
  [role in SystemRole]: {
    [module: string]: string[]; // Liste d'actions autorisées
  };
};

export const ROLE_PERMISSIONS: PermissionConfig = {
  [SystemRole.ADMIN]: {
    '*': ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export', 'reevaluations.view', 'reevaluations.create', 'reevaluations.validate', 'reevaluations.decide', 'caisseagent.approve', 'caisseagent.reject', 'supervision.view', 'transfert.init', 'transfert.validate', 'transfert.execute', 'config.view', 'config.edit']
  },
  [SystemRole.CHEF_AGENCE]: {
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
    'admin': ['users', 'logs'], // Gestion utilisateurs + logs, SANS settings/roles
    'coffre': ['view', 'transfert.init', 'transfert.validate', 'transfert.execute', 'config.view'],
    'incidents': ['view', 'manage', 'edit'],
    'visites': ['view'],
    'prospection': ['view'],
    'paiements': ['view'],
    'virements_programmes': ['view', 'edit'],
    // New modules for CASL
    'employes': ['view', 'create', 'edit'],
    'agences': ['view'],
    'regularisation': ['view', 'create', 'approve'],
  },
  [SystemRole.COMPTABLE]: {
    'clients': ['view'],
    'credits': ['view'],
    'epargnes': ['view'],
    'comptabilite': ['view', 'create', 'edit', 'export'],
    'rapports': ['view', 'export'],
    'rh': ['view'], // Pointage uniquement
    'regularisation': ['view'],
  },
  [SystemRole.GESTIONNAIRE_CREDIT]: {
    'clients': ['view', 'create', 'edit'],
    'credits': ['view', 'create', 'edit', 'approve', 'reevaluations.view', 'reevaluations.create', 'reevaluations.validate', 'reevaluations.decide'],
    'remboursements': ['view', 'create'],
    'rapports': ['view', 'export'],
    'rh': ['view'] // Pointage uniquement
  },
  [SystemRole.SUPERVISEUR]: {
    'clients': ['view'],
    'terrain': ['view', 'manage'],
    'tontines': ['view', 'manage'],
    'caisseagent': ['view', 'caisseagent.approve', 'caisseagent.reject'],
    'rapports': ['view'],
    'rh': ['view'] // Pointage uniquement
  },
  [SystemRole.CAISSIER]: {
    'clients': ['view', 'create'],
    'epargnes': ['view', 'create', 'edit'],
    'caisse': ['view', 'create', 'edit'],
    'remboursements': ['view', 'create'],
    'virements_programmes': ['view', 'edit'],
    'rh': ['view'] // Pointage uniquement
  },
  [SystemRole.AGENT_TERRAIN]: {
    'clients': ['view', 'create', 'edit'],
    'terrain': ['view', 'create'],
    'prospection': ['view', 'create'],
    'caisseagent': ['view', 'create'], // Peut créer des opérations, pas les approuver
    'incidents': ['view', 'create'],
    'visites': ['view', 'create'],
    'paiements': ['view', 'create'],
    'rh': ['view'] // Pointage uniquement
  },
  [SystemRole.CLIENT]: {}
};

/**
 * Vérifie si un rôle a une permission spécifique
 */
export function hasPermission(role: string, module: string, action: string): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  const rolePerms = ROLE_PERMISSIONS[normalizedRole];
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

/**
 * Metadata des Modules pour le seeding et l'UI
 */
export type ModuleSeed = {
  name: AppModule;
  description: string;
  icon: string;
  category: string;
  orderIndex: number;
};

export const MODULES_DATA: ModuleSeed[] = [
  { name: 'Dashboard', description: 'Vue d\'ensemble des indicateurs', icon: 'LayoutDashboard', category: 'general', orderIndex: 1 },
  { name: 'Caisse', description: 'Gestion des opérations de caisse', icon: 'Wallet', category: 'operations', orderIndex: 2 },
  { name: 'Crédits', description: 'Gestion des crédits et prêts', icon: 'CreditCard', category: 'finance', orderIndex: 3 },
  { name: 'Remboursements', description: 'Suivi des remboursements', icon: 'Banknote', category: 'finance', orderIndex: 4 },
  { name: 'Clients', description: 'Gestion des clients', icon: 'Users', category: 'operations', orderIndex: 5 },
  { name: 'Comptes', description: 'Gestion des comptes épargne', icon: 'PiggyBank', category: 'finance', orderIndex: 6 },
  { name: 'Tontines', description: 'Gestion des tontines', icon: 'UsersRound', category: 'finance', orderIndex: 7 },
  { name: 'Comptabilité', description: 'Module de comptabilité', icon: 'Calculator', category: 'finance', orderIndex: 8 },
  { name: 'Agent Terrain', description: 'Module agent terrain', icon: 'MapPin', category: 'operations', orderIndex: 9 },
  { name: 'Transferts', description: 'Transferts d\'argent', icon: 'ArrowLeftRight', category: 'operations', orderIndex: 10 },
  { name: 'Rapports', description: 'Génération de rapports', icon: 'BarChart3', category: 'general', orderIndex: 11 },
  { name: 'RH', description: 'Ressources humaines', icon: 'Briefcase', category: 'admin', orderIndex: 12 },
  { name: 'Communications', description: 'Messagerie et communications', icon: 'MessageCircle', category: 'general', orderIndex: 13 },
  { name: 'Bourse', description: 'Portefeuilles boursiers', icon: 'LineChart', category: 'finance', orderIndex: 14 },
  { name: 'Loge', description: 'Stockage et documents', icon: 'Archive', category: 'general', orderIndex: 15 },
  { name: 'Paramètres', description: 'Paramètres système', icon: 'Settings', category: 'admin', orderIndex: 16 },
  { name: 'Administration', description: 'Administration système', icon: 'Shield', category: 'admin', orderIndex: 17 },
  { name: 'Audit', description: 'Traçabilité et conformité', icon: 'FileSearch', category: 'admin', orderIndex: 18 },
  { name: 'Messages', description: 'Messagerie interne', icon: 'Mail', category: 'general', orderIndex: 19 },
  { name: 'Coffre-Fort', description: 'Gestion du coffre-fort', icon: 'Lock', category: 'finance', orderIndex: 20 },
  { name: 'Incidents', description: 'Gestion des incidents terrain', icon: 'AlertTriangle', category: 'operations', orderIndex: 21 },
  { name: 'Visites', description: 'Visites clients terrain', icon: 'Map', category: 'operations', orderIndex: 22 },
  { name: 'Prospection', description: 'Prospection nouveaux clients', icon: 'UserPlus', category: 'operations', orderIndex: 23 },
  { name: 'Paiements Agent', description: 'Paiements initiés par agents', icon: 'Banknote', category: 'finance', orderIndex: 24 },
  { name: 'Virements Programmes', description: 'Planification des virements internes', icon: 'CalendarClock', category: 'admin', orderIndex: 25 },
  // New modules for CASL alignment
  { name: 'RBAC', description: 'Gestion des rôles et permissions', icon: 'Key', category: 'admin', orderIndex: 26 },
  { name: 'Maintenance', description: 'Outils de maintenance système', icon: 'Wrench', category: 'admin', orderIndex: 27 },
  { name: 'Fidélité', description: 'Programme de fidélité', icon: 'Award', category: 'operations', orderIndex: 28 },
  { name: 'Régularisation', description: 'Régularisations comptables', icon: 'Scale', category: 'finance', orderIndex: 29 },
  { name: 'Départements', description: 'Gestion des départements', icon: 'Building2', category: 'admin', orderIndex: 30 },
  { name: 'Employés', description: 'Gestion des employés', icon: 'Users', category: 'admin', orderIndex: 31 },
  { name: 'Agences', description: 'Gestion des agences', icon: 'Building', category: 'admin', orderIndex: 32 },
];

/**
 * Metadata des Permissions pour le seeding et l'UI
 */
export type PermissionSeed = { name: string; code: string; description: string };

export const PERMISSIONS_DATA: Partial<Record<AppModule, PermissionSeed[]>> = {
  'Dashboard': [
    { name: 'Voir le tableau de bord', code: 'dashboard.view', description: 'Accès au tableau de bord' },
  ],
  'Caisse': [
    { name: 'Voir la caisse', code: 'caisse.view', description: 'Accès au module Caisse' },
    { name: 'Créer une caisse', code: 'caisse.create', description: 'Créer une nouvelle caisse' },
    { name: 'Modifier une caisse', code: 'caisse.edit', description: 'Modifier une caisse' },
    { name: 'Gérer une caisse', code: 'caisse.manage', description: 'Administration d\'une caisse' },
    { name: 'Ouvrir une session', code: 'caisse.open', description: 'Ouvrir une session de caisse' },
    { name: 'Fermer une session', code: 'caisse.close', description: 'Fermer une session de caisse' },
    { name: 'Effectuer des dépôts', code: 'caisse.deposit', description: 'Enregistrer des dépôts' },
    { name: 'Effectuer des retraits', code: 'caisse.withdraw', description: 'Enregistrer des retraits' },
    { name: 'Effectuer des transferts', code: 'caisse.transfer', description: 'Effectuer des transferts' },
    { name: 'Créer des paiements', code: 'paiements.create', description: 'Effectuer des paiements divers' },
  ],
  'Crédits': [
    { name: 'Voir les crédits', code: 'credits.view', description: 'Accès au module Crédits' },
    { name: 'Créer une demande', code: 'credits.create', description: 'Créer une demande de crédit' },
    { name: 'Approuver un crédit', code: 'credits.approve', description: 'Approuver une demande de crédit' },
    { name: 'Rejeter un crédit', code: 'credits.reject', description: 'Rejeter une demande de crédit' },
    { name: 'Décaisser un crédit', code: 'credits.disburse', description: 'Décaisser un crédit approuvé' },
    { name: 'Collecter remboursements', code: 'credits.collect', description: 'Enregistrer les remboursements' },
    { name: 'Voir les réévaluations', code: 'credits.reevaluations.view', description: 'Accès aux réévaluations' },
    { name: 'Créer une réévaluation', code: 'credits.reevaluations.create', description: 'Demander une réévaluation' },
    { name: 'Valider éligibilité', code: 'credits.reevaluations.validate', description: 'Valider l\'éligibilité d\'une réévaluation' },
    { name: 'Décision comité', code: 'credits.reevaluations.decide', description: 'Prendre la décision finale sur une réévaluation' },
    { name: 'Modifier une demande', code: 'credits.edit', description: 'Modifier une demande de crédit' },
    { name: 'Supprimer une demande', code: 'credits.delete', description: 'Supprimer une demande de crédit' },
  ],
  'Remboursements': [
    { name: 'Voir les remboursements', code: 'remboursements.view', description: 'Accès au module Remboursements' },
    { name: 'Créer un remboursement', code: 'remboursements.create', description: 'Enregistrer un remboursement' },
  ],
  'Clients': [
    { name: 'Voir les clients', code: 'clients.view', description: 'Accès au module Clients' },
    { name: 'Créer un client', code: 'clients.create', description: 'Créer un nouveau client' },
    { name: 'Modifier un client', code: 'clients.edit', description: 'Modifier les informations client' },
    { name: 'Supprimer un client', code: 'clients.delete', description: 'Supprimer un client' },
  ],
  'Comptes': [
    { name: 'Voir les épargnes', code: 'epargnes.view', description: 'Accès au module Comptes' },
    { name: 'Créer un compte', code: 'epargnes.create', description: 'Ouvrir un compte épargne' },
    { name: 'Effectuer un dépôt', code: 'epargnes.deposit', description: 'Créditer un compte épargne' },
    { name: 'Effectuer un retrait', code: 'epargnes.withdraw', description: 'Débiter un compte épargne' },
    { name: 'Modifier un compte', code: 'epargnes.edit', description: 'Modifier un compte épargne' },
  ],
  'Tontines': [
    { name: 'Voir les tontines', code: 'tontines.view', description: 'Accès au module Tontines' },
    { name: 'Créer une tontine', code: 'tontines.create', description: 'Créer une nouvelle tontine' },
    { name: 'Gérer une tontine', code: 'tontines.manage', description: 'Gérer les membres et cotisations' },
    { name: 'Modifier une tontine', code: 'tontines.edit', description: 'Modifier une tontine' },
  ],
  'Comptabilité': [
    { name: 'Voir la comptabilité', code: 'comptabilite.view', description: 'Accès au module Comptabilité' },
    { name: 'Saisir des écritures', code: 'comptabilite.write', description: 'Créer des écritures comptables' },
    { name: 'Générer des rapports', code: 'comptabilite.reports', description: 'Générer les états financiers' },
    { name: 'Créer exercice', code: 'comptabilite.create', description: 'Créer exercice ou journal' },
    { name: 'Modifier écriture', code: 'comptabilite.edit', description: 'Modifier écriture' },
    { name: 'Exporter comptabilité', code: 'comptabilite.export', description: 'Exporter données comptables' },
  ],
  'Agent Terrain': [
    { name: 'Voir le module Agent', code: 'agent.view', description: 'Accès au module Agent Terrain' },
    { name: 'Effectuer des collectes', code: 'agent.collect', description: 'Enregistrer des collectes terrain' },
    { name: 'Enregistrer des visites', code: 'agent.visit', description: 'Créer des rapports de visite' },
    { name: 'Gérer agents terrain', code: 'agents_terrain.edit', description: 'Gérer les agents terrain' },
    { name: 'Voir agents terrain', code: 'agents_terrain.view', description: 'Voir les agents terrain' },
    { name: 'Créer agents terrain', code: 'agents_terrain.create', description: 'Créer agents terrain' },
    { name: 'Créer agent terrain', code: 'agent_terrain.create', description: 'Créer agent terrain' },
    { name: 'Créer agent', code: 'agent.create', description: 'Créer un agent' },
    { name: 'Gérer agents', code: 'agent.manage', description: 'Gérer les agents' },
    // Caisse Agent sub-permissions
    { name: 'Voir caisse agent', code: 'caisseagent.view', description: 'Voir les caisses agents' },
    { name: 'Créer op caisse agent', code: 'caisseagent.create', description: 'Créer opération caisse agent' },
    { name: 'Gérer caisse agent', code: 'caisseagent.manage', description: 'Gérer les caisses agents' },
    { name: 'Approuver op caisse agent', code: 'caisseagent.approve', description: 'Approuver opération caisse agent' },
    { name: 'Rejeter op caisse agent', code: 'caisseagent.reject', description: 'Rejeter opération caisse agent' },
    { name: 'Suspendre caisse agent', code: 'caisseagent.suspend', description: 'Suspendre une caisse agent' },
  ],
  'Incidents': [
    { name: 'Voir les incidents', code: 'incidents.view', description: 'Voir les incidents' },
    { name: 'Créer un incident', code: 'incidents.create', description: 'Signaler un incident' },
    { name: 'Traiter un incident', code: 'incidents.edit', description: 'Résoudre un incident' },
    { name: 'Gérer incidents', code: 'incidents.manage', description: 'Gérer les incidents' },
  ],
  'Visites': [
    { name: 'Voir les visites', code: 'visites.view', description: 'Voir les visites' },
    { name: 'Créer une visite', code: 'visites.create', description: 'Enregistrer une visite' },
  ],
  'Prospection': [
    { name: 'Voir les prospections', code: 'prospection.view', description: 'Voir les prospections' },
    { name: 'Créer une prospection', code: 'prospection.create', description: 'Enregistrer un prospect' },
  ],
  'Paiements Agent': [
    { name: 'Voir les paiements', code: 'paiements.view', description: 'Voir les paiements agent' },
    { name: 'Créer un paiement', code: 'paiements.create', description: 'Encaisser un paiement' },
  ],
  'Transferts': [
    { name: 'Voir les transferts', code: 'transferts.view', description: 'Accès au module Transferts' },
    { name: 'Envoyer un transfert', code: 'transferts.send', description: 'Initier un transfert' },
    { name: 'Recevoir un transfert', code: 'transferts.receive', description: 'Valider une réception' },
  ],
  'Virements Programmes': [
    { name: 'Voir les virements programmés', code: 'virements_programmes.view', description: 'Accès à la liste des virements programmés' },
    { name: 'Modifier les virements programmés', code: 'virements_programmes.edit', description: 'Modifier ou mettre en pause un virement programmé' },
  ],
  'Rapports': [
    { name: 'Voir les rapports', code: 'rapports.view', description: 'Accès au module Rapports' },
    { name: 'Exporter les rapports', code: 'rapports.export', description: 'Télécharger les rapports' },
    { name: 'Planifier des rapports', code: 'rapports.schedule', description: 'Programmer l\'envoi automatique' },
  ],
  'RH': [
    { name: 'Voir les RH', code: 'rh.view', description: 'Accès au module RH' },
    { name: 'Créer', code: 'rh.create', description: 'Créer un élément RH' },
    { name: 'Modifier', code: 'rh.edit', description: 'Modifier un élément RH' },
    { name: 'Valider', code: 'rh.approve', description: 'Valider une action RH' },
    { name: 'Gérer RH', code: 'rh.manage', description: 'Gérer les ressources humaines' },
    // Paie sub-permissions
    { name: 'Voir la paie', code: 'paie.view', description: 'Accès au module Paie' },
    { name: 'Créer fiche paie', code: 'paie.create', description: 'Créer fiche de paie' },
    { name: 'Approuver paie', code: 'paie.approve', description: 'Valider la paie' },
    { name: 'Modifier paie', code: 'paie.edit', description: 'Modifier fiche de paie' },
  ],
  'Communications': [
    { name: 'Voir les communications', code: 'communications.view', description: 'Accès au module communications' },
    { name: 'Envoyer des messages', code: 'communications.send', description: 'Envoyer des messages' },
  ],
  'Bourse': [
    { name: 'Voir les portefeuilles', code: 'bourse.view', description: 'Accès au module Bourse' },
    { name: 'Passer des ordres', code: 'bourse.trade', description: 'Passer des ordres boursiers' },
  ],
  'Loge': [
    { name: 'Voir la loge', code: 'loge.view', description: 'Accès au stockage' },
    { name: 'Uploader des fichiers', code: 'loge.upload', description: 'Uploader des documents' },
    { name: 'Supprimer des fichiers', code: 'loge.delete', description: 'Supprimer des documents' },
  ],
  'Paramètres': [
    { name: 'Voir les paramètres', code: 'parametres.view', description: 'Accès aux paramètres système' },
    { name: 'Modifier les paramètres', code: 'parametres.edit', description: 'Modifier les paramètres système' },
  ],
  'Administration': [
    { name: 'Gérer les utilisateurs', code: 'admin.users', description: 'Accès gestion utilisateurs' },
    { name: 'Voir les utilisateurs', code: 'users.view', description: 'Voir la liste des utilisateurs' },
    { name: 'Créer utilisateurs', code: 'users.create', description: 'Créer des utilisateurs' },
    { name: 'Modifier utilisateurs', code: 'users.edit', description: 'Modifier des utilisateurs' },
    { name: 'Supprimer utilisateurs', code: 'users.delete', description: 'Supprimer des utilisateurs' },
    { name: 'Gérer les rôles', code: 'admin.roles', description: 'Gérer les rôles et permissions' },
    { name: 'Paramètres système', code: 'admin.settings', description: 'Configurer l\'application' },
    { name: 'Consulter les logs', code: 'admin.logs', description: 'Voir l\'historique des actions' },
  ],
  'Audit': [
    { name: 'Voir l\'audit', code: 'audit.view', description: 'Consulter les journaux d\'audit' },
    { name: 'Exporter les audits', code: 'audit.export', description: 'Exporter les logs d\'audit' },
  ],
  'Messages': [
    { name: 'Voir les messages', code: 'messages.view', description: 'Accès à la messagerie' },
    { name: 'Envoyer des messages', code: 'messages.send', description: 'Envoyer un message' },
  ],
  'Coffre-Fort': [
    { name: 'Voir le coffre', code: 'coffre.view', description: 'Accès au module Coffre-Fort' },
    { name: 'Initier transfert', code: 'coffre.transfert.init', description: 'Demander un transfert de fonds' },
    { name: 'Valider transfert', code: 'coffre.transfert.validate', description: 'Valider une demande de transfert' },
    { name: 'Exécuter transfert', code: 'coffre.transfert.execute', description: 'Exécuter un transfert validé' },
    { name: 'Voir configuration', code: 'coffre.config.view', description: 'Voir la configuration du coffre' },
    { name: 'Modifier configuration', code: 'coffre.config.edit', description: 'Modifier la configuration du coffre' },
    { name: 'Supervision Trésorerie', code: 'coffre.supervision.view', description: 'Vue globale trésorerie' },
  ],
  // New modules for CASL alignment
  'RBAC': [
    { name: 'Voir les rôles', code: 'rbac.view', description: 'Accès à la gestion des rôles' },
    { name: 'Créer un rôle', code: 'rbac.create', description: 'Créer un nouveau rôle' },
    { name: 'Modifier un rôle', code: 'rbac.edit', description: 'Modifier un rôle existant' },
    { name: 'Supprimer un rôle', code: 'rbac.delete', description: 'Supprimer un rôle' },
    { name: 'Gérer les rôles', code: 'rbac.manage', description: 'Administration complète RBAC' },
    { name: 'Voir les permissions', code: 'permissions.view', description: 'Voir la liste des permissions' },
    { name: 'Assigner permissions', code: 'permissions.assign', description: 'Assigner des permissions aux rôles' },
  ],
  'Maintenance': [
    { name: 'Voir maintenance', code: 'maintenance.view', description: 'Accès au module maintenance' },
    { name: 'Purger données', code: 'maintenance.purge', description: 'Supprimer des données obsolètes' },
    { name: 'Migrer données', code: 'maintenance.migrate', description: 'Migrer des données' },
    { name: 'Initialiser données', code: 'maintenance.seed', description: 'Initialiser des données de base' },
    { name: 'Gérer maintenance', code: 'maintenance.manage', description: 'Administration de la maintenance' },
  ],
  'Fidélité': [
    { name: 'Voir fidélité', code: 'loyalty.view', description: 'Accès au programme de fidélité' },
    { name: 'Créer récompense', code: 'loyalty.create', description: 'Créer une récompense' },
    { name: 'Modifier récompense', code: 'loyalty.edit', description: 'Modifier une récompense' },
    { name: 'Supprimer récompense', code: 'loyalty.delete', description: 'Supprimer une récompense' },
    { name: 'Gérer fidélité', code: 'loyalty.manage', description: 'Gérer le programme de fidélité' },
  ],
  'Régularisation': [
    { name: 'Voir régularisations', code: 'regularisation.view', description: 'Accès aux régularisations' },
    { name: 'Créer régularisation', code: 'regularisation.create', description: 'Créer une régularisation' },
    { name: 'Approuver régularisation', code: 'regularisation.approve', description: 'Approuver une régularisation' },
    { name: 'Rejeter régularisation', code: 'regularisation.reject', description: 'Rejeter une régularisation' },
    { name: 'Gérer régularisations', code: 'regularisation.manage', description: 'Administration des régularisations' },
  ],
  'Départements': [
    { name: 'Voir départements', code: 'departments.view', description: 'Accès à la liste des départements' },
    { name: 'Créer département', code: 'departments.create', description: 'Créer un département' },
    { name: 'Modifier département', code: 'departments.edit', description: 'Modifier un département' },
    { name: 'Supprimer département', code: 'departments.delete', description: 'Supprimer un département' },
    { name: 'Gérer départements', code: 'departments.manage', description: 'Gérer les départements' },
  ],
  'Employés': [
    { name: 'Voir employés', code: 'employes.view', description: 'Accès à la liste des employés' },
    { name: 'Créer employé', code: 'employes.create', description: 'Créer un employé' },
    { name: 'Modifier employé', code: 'employes.edit', description: 'Modifier un employé' },
    { name: 'Supprimer employé', code: 'employes.delete', description: 'Supprimer un employé' },
    { name: 'Gérer employés', code: 'employes.manage', description: 'Gérer les employés' },
  ],
  'Agences': [
    { name: 'Voir agences', code: 'agences.view', description: 'Accès à la liste des agences' },
    { name: 'Créer agence', code: 'agences.create', description: 'Créer une agence' },
    { name: 'Modifier agence', code: 'agences.edit', description: 'Modifier une agence' },
    { name: 'Supprimer agence', code: 'agences.delete', description: 'Supprimer une agence' },
    { name: 'Gérer agences', code: 'agences.manage', description: 'Gérer les agences' },
  ],
};

/**
 * Configuration des permissions par rôle pour le Seeding (Codes plats)
 * Cette configuration doit être synchronisée avec ROLE_PERMISSIONS (Logique UI)
 */
export const SEED_ROLE_PERMISSIONS: Record<SystemRole, string[]> = {
  [SystemRole.ADMIN]: ['*'],
  [SystemRole.CHEF_AGENCE]: [
    'dashboard.view',
    // Administration - Gestion utilisateurs + logs uniquement (PAS settings/roles)
    'admin.users', 'admin.logs',
    'users.view', 'users.create', 'users.edit',
    // Clients
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    // Crédits
    'credits.view', 'credits.create', 'credits.edit', 'credits.approve', 'credits.delete',
    'credits.reevaluations.view', 'credits.reevaluations.create', 'credits.reevaluations.validate', 'credits.reevaluations.decide',
    // Épargnes
    'epargnes.view', 'epargnes.create', 'epargnes.edit',
    // Tontines
    'tontines.view', 'tontines.create', 'tontines.edit', 'tontines.manage',
    // Comptabilité
    'comptabilite.view',
    // Remboursements
    'remboursements.view', 'remboursements.create',
    // Rapports
    'rapports.view', 'rapports.export',
    // Agent Terrain
    'agent.view', 'agent.manage',
    // Caisse
    'caisse.view', 'caisse.manage',
    // Caisse Agent
    'caisseagent.view', 'caisseagent.manage', 'caisseagent.approve', 'caisseagent.reject', 'caisseagent.suspend',
    // RH
    'rh.view', 'rh.create', 'rh.edit', 'rh.manage',
    // Paie
    'paie.view', 'paie.create', 'paie.approve',
    // Coffre-Fort
    'coffre.view', 'coffre.transfert.init', 'coffre.transfert.validate', 'coffre.transfert.execute', 'coffre.config.view',
    // Incidents
    'incidents.view', 'incidents.manage', 'incidents.edit',
    // Visites & Prospection
    'visites.view',
    'prospection.view',
    'paiements.view',
    // Virements Programmés
    'virements_programmes.view', 'virements_programmes.edit',
    // Communications
    'communications.view',
    'messages.view', 'messages.send',
    // New CASL modules
    'employes.view', 'employes.create', 'employes.edit',
    'agences.view',
    'regularisation.view', 'regularisation.create', 'regularisation.approve',
  ],
  [SystemRole.COMPTABLE]: [
    'dashboard.view',
    'clients.view',
    'credits.view',
    'epargnes.view',
    'comptabilite.view', 'comptabilite.create', 'comptabilite.edit', 'comptabilite.export',
    'rapports.view', 'rapports.export',
    'communications.view',
    'rh.view',
    // CASL additions
    'regularisation.view',
  ],
  [SystemRole.GESTIONNAIRE_CREDIT]: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'credits.view', 'credits.create', 'credits.edit', 'credits.approve',
    'credits.reevaluations.view', 'credits.reevaluations.create', 'credits.reevaluations.validate', 'credits.reevaluations.decide',
    'remboursements.view', 'remboursements.create',
    'rapports.view', 'rapports.export',
    'communications.view',
    'rh.view',
  ],
  [SystemRole.SUPERVISEUR]: [
    'dashboard.view',
    'clients.view',
    'agent.view', 'agent.manage',
    'tontines.view', 'tontines.manage',
    'caisseagent.view', 'caisseagent.approve', 'caisseagent.reject',
    'rapports.view',
    'communications.view',
    'rh.view',
  ],
  [SystemRole.CAISSIER]: [
    'dashboard.view',
    'clients.view', 'clients.create',
    'epargnes.view', 'epargnes.create', 'epargnes.edit',
    'caisse.view', 'caisse.create', 'caisse.edit',
    'remboursements.view', 'remboursements.create',
    'virements_programmes.view', 'virements_programmes.edit',
    'communications.view',
    'rh.view',
  ],
  [SystemRole.AGENT_TERRAIN]: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'agent.view', 'agent.create',
    'prospection.view', 'prospection.create',
    'caisseagent.view', 'caisseagent.create',
    'incidents.view', 'incidents.create',
    'visites.view', 'visites.create',
    'paiements.view', 'paiements.create',
    'communications.view',
    'rh.view',
  ],
  [SystemRole.CLIENT]: []
};
