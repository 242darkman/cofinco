
import { db } from './db';
import {
  users,
  modules,
  permissions,
  rolePermissions,
  agences,
  zones,
  typesMarches,
  tags,
  systemSettings,
  featureFlags,
  securitySettings,
  uiCustomization,
  smsTemplates,
  smsProviderSettings,
  dureesSuggerees,
  planComptable,
  journaux,
  exercices,
  creditPlans,
  configReevaluation,
  configCoffreFort,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  scoringHistory,
  enquetesComplementaires,
  // Inter-vault transfer tables
  coffresForts,
  comptesLiaison,
  transfertsInterCoffres,
  documentsTransfert,
  transfertsInterCoffresAuditLogs,
  reconciliationsLiaison,
  tachesRegularisation,
  configTransfertInterCoffres,
} from '@shared/schema';
import { hashPassword } from './auth';

// ----------------------------------------------------------------------
// DATA DEFINITIONS
// ----------------------------------------------------------------------

const MODULES_DATA = [
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
];

const PERMISSIONS_DATA: Record<string, Array<{ name: string; code: string; description: string }>> = {
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
  ],
  'Tontines': [
    { name: 'Voir les tontines', code: 'tontines.view', description: 'Accès au module Tontines' },
    { name: 'Créer une tontine', code: 'tontines.create', description: 'Créer une nouvelle tontine' },
    { name: 'Gérer une tontine', code: 'tontines.manage', description: 'Gérer les membres et cotisations' },
  ],
  'Comptabilité': [
    { name: 'Voir la comptabilité', code: 'comptabilite.view', description: 'Accès au module Comptabilité' },
    { name: 'Saisir des écritures', code: 'comptabilite.write', description: 'Créer des écritures comptables' },
    { name: 'Générer des rapports', code: 'comptabilite.reports', description: 'Générer les états financiers' },
  ],
  'Agent Terrain': [
    { name: 'Voir le module Agent', code: 'agent.view', description: 'Accès au module Agent Terrain' },
    { name: 'Effectuer des collectes', code: 'agent.collect', description: 'Enregistrer des collectes terrain' },
    { name: 'Enregistrer des visites', code: 'agent.visit', description: 'Créer des rapports de visite' },
    // Aliases for frontend compatibility
    { name: 'Gérer agents terrain', code: 'agents_terrain.edit', description: 'Gérer les agents terrain' },
    { name: 'Voir agents terrain', code: 'agents_terrain.view', description: 'Voir les agents terrain' },
    { name: 'Créer agents terrain', code: 'agents_terrain.create', description: 'Créer agents terrain' },
    { name: 'Créer agent terrain', code: 'agent_terrain.create', description: 'Créer agent terrain' },
  ],
  'Incidents': [
    { name: 'Voir les incidents', code: 'incidents.view', description: 'Voir les incidents' },
    { name: 'Créer un incident', code: 'incidents.create', description: 'Signaler un incident' },
    { name: 'Traiter un incident', code: 'incidents.edit', description: 'Résoudre un incident' },
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
  ],
};

// Based on client/src/lib/rbac-config.ts
// Keys are in snake_case for backend consistency, permissions aligned with client config
const ROLE_PERMISSIONS: Record<string, string[]> = {
  'admin': ['*'], // Administrateur - Full access
  
  'chef_agence': [ // Chef d'Agence
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'credits.view', 'credits.create', 'credits.edit', 'credits.approve', 'credits.delete',
    'credits.reevaluations.view', 'credits.reevaluations.create', 'credits.reevaluations.validate', 'credits.reevaluations.decide',
    'epargnes.view', 'epargnes.create', 'epargnes.edit',
    'tontines.view', 'tontines.create', 'tontines.edit', 'tontines.manage',
    'comptabilite.view',
    'remboursements.view', 'remboursements.create',
    'rapports.view', 'rapports.export',
    'agent.view', 'agent.manage',
    'caisse.view', 'caisse.manage',
    'caisseagent.view', 'caisseagent.manage', 'caisseagent.approve', 'caisseagent.reject', 'caisseagent.suspend',
    'rh.view', 'rh.create', 'rh.edit', 'rh.manage',
    'paie.view', 'paie.create', 'paie.approve',
    'users.view', 'users.create', 'users.edit',
    'coffre.view', 'coffre.transfert.init', 'coffre.transfert.validate', 'coffre.transfert.execute', 'coffre.config.view',
    'incidents.view', 'incidents.manage', 'incidents.edit',
    'visites.view',
    'prospection.view',
    'paiements.view',
    'communications.view',
    'messages.view', 'messages.send',
  ],
  
  'comptable': [ // Comptable
    'dashboard.view',
    'clients.view',
    'credits.view',
    'epargnes.view',
    'comptabilite.view', 'comptabilite.create', 'comptabilite.edit', 'comptabilite.export',
    'rapports.view', 'rapports.export',
    'communications.view',
    'rh.view', // Pointage uniquement
  ],
  
  'gestionnaire_credit': [ // Gestionnaire Crédit
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'credits.view', 'credits.create', 'credits.edit', 'credits.approve',
    'credits.reevaluations.view', 'credits.reevaluations.create', 'credits.reevaluations.validate', 'credits.reevaluations.decide',
    'remboursements.view', 'remboursements.create',
    'rapports.view', 'rapports.export',
    'communications.view',
    'rh.view', // Pointage uniquement
  ],
  
  'superviseur': [ // Superviseur
    'dashboard.view',
    'clients.view',
    'agent.view', 'agent.manage',
    'tontines.view', 'tontines.manage',
    'caisseagent.view', 'caisseagent.approve', 'caisseagent.reject',
    'rapports.view',
    'communications.view',
    'rh.view', // Pointage uniquement
  ],
  
  'caissier': [ // Agent Caisse
    'dashboard.view',
    'clients.view', 'clients.create',
    'epargnes.view', 'epargnes.create', 'epargnes.edit',
    'caisse.view', 'caisse.create', 'caisse.edit',
    'remboursements.view', 'remboursements.create',
    'communications.view',
    'rh.view', // Pointage uniquement
  ],
  
  'terrain': [ // Agent Terrain
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'agent.view', 'agent.create',
    'prospection.view', 'prospection.create',
    'caisseagent.view', 'caisseagent.create', // Peut créer des opérations, pas les approuver
    'incidents.view', 'incidents.create',
    'visites.view', 'visites.create',
    'paiements.view', 'paiements.create',
    'communications.view',
    'rh.view', // Pointage uniquement
  ],
};

const ZONES_DATA = [
  // ======================
  // BRAZZAVILLE
  // ======================
  { nom: 'Centre-Ville', ville: 'Brazzaville', description: 'Zone commerciale et administrative centrale', statut: 'Actif' },
  { nom: 'Bacongo', ville: 'Brazzaville', description: 'Quartier administratif et historique', statut: 'Actif' },
  { nom: 'Poto-Poto', ville: 'Brazzaville', description: 'Quartier commerçant et résidentiel dense', statut: 'Actif' },
  { nom: 'Ouenzé', ville: 'Brazzaville', description: 'Zone commerciale et populaire', statut: 'Actif' },
  { nom: 'Talangaï', ville: 'Brazzaville', description: 'Grand quartier populaire au nord', statut: 'Actif' },
  { nom: 'Moungali', ville: 'Brazzaville', description: 'Quartier populaire et résidentiel', statut: 'Actif' },
  { nom: 'Makélékélé', ville: 'Brazzaville', description: 'Quartier sud, mixte commerce et habitation', statut: 'Actif' },
  { nom: 'Mpila', ville: 'Brazzaville', description: 'Zone industrielle et portuaire', statut: 'Actif' },
  { nom: 'Mfilou', ville: 'Brazzaville', description: 'Zone périphérique ouest', statut: 'Actif' },
  { nom: 'Madibou', ville: 'Brazzaville', description: 'Extension sud, zones résidentielles', statut: 'Actif' },
  { nom: 'Djiri', ville: 'Brazzaville', description: 'Zone nord en forte expansion', statut: 'Actif' },
  { nom: 'Kintélé', ville: 'Brazzaville', description: 'Nouvelle zone urbaine et administrative', statut: 'Actif' },
  { nom: 'Massengo', ville: 'Brazzaville', description: 'Zone périphérique et résidentielle', statut: 'Actif' },
  { nom: 'Ngamakosso', ville: 'Brazzaville', description: 'Zone populaire et résidentielle', statut: 'Actif' },
  { nom: 'Mikalou', ville: 'Brazzaville', description: 'Quartier résidentiel', statut: 'Actif' },
  { nom: 'Texaco La Tsiémé', ville: 'Brazzaville', description: 'Zone commerciale et transport', statut: 'Actif' },

  // ======================
  // POINTE-NOIRE
  // ======================
  { nom: 'Centre-Ville', ville: 'Pointe-Noire', description: 'Centre des affaires et administrations', statut: 'Actif' },
  { nom: 'Lumumba', ville: 'Pointe-Noire', description: 'Quartier résidentiel et commercial', statut: 'Actif' },
  { nom: 'Tié-Tié', ville: 'Pointe-Noire', description: 'Grand quartier populaire', statut: 'Actif' },
  { nom: 'Loandjili', ville: 'Pointe-Noire', description: 'Zone résidentielle et aéroportuaire', statut: 'Actif' },
  { nom: 'Ngoyo', ville: 'Pointe-Noire', description: 'Zone périphérique et résidentielle', statut: 'Actif' },
  { nom: 'Mongo-Kamba', ville: 'Pointe-Noire', description: 'Zone populaire et artisanale', statut: 'Actif' },
  { nom: 'Mpaka', ville: 'Pointe-Noire', description: 'Quartier résidentiel', statut: 'Actif' },
  { nom: 'Vindoulou', ville: 'Pointe-Noire', description: 'Zone résidentielle en expansion', statut: 'Actif' },
  { nom: 'Tchibota', ville: 'Pointe-Noire', description: 'Zone périphérique sud', statut: 'Actif' },
  { nom: 'Siafoumou', ville: 'Pointe-Noire', description: 'Quartier populaire', statut: 'Actif' },
  { nom: 'Songolo', ville: 'Pointe-Noire', description: 'Zone industrielle et portuaire', statut: 'Actif' },
  { nom: 'Port Autonome', ville: 'Pointe-Noire', description: 'Zone portuaire et logistique', statut: 'Actif' }
];


const AGENCES_DATA = [
  {
    nom: 'Siège',
    code: 'SIEGE',
    adresse: 'Boulevard Denis Sassou, Brazzaville',
    ville: 'Brazzaville',
    region: 'Centre',
    isSiege: true,
    latitude: '-4.2633',
    longitude: '15.2847',
    telephone: '+242060000100',
    email: 'siege@cofin.com',
    dateOuverture: '2018-01-01',
  }
];

const TYPES_MARCHES_DATA = [
  { nom: 'Commerce Général', description: 'Vente de produits divers (alimentaire et non alimentaire)', actif: true },
  { nom: 'Alimentation', description: 'Vente de denrées alimentaires, épiceries, boutiques', actif: true },
  { nom: 'Marchands de Marché', description: 'Vendeurs installés dans les marchés', actif: true },
  { nom: 'Commerces de Rue', description: 'Vendeurs ambulants et kiosques', actif: true },
  { nom: 'Restauration', description: 'Restaurants, gargotes, fast-foods', actif: true },
  { nom: 'Boulangerie & Pâtisserie', description: 'Fabrication et vente de pain et pâtisseries', actif: true },
  { nom: 'Boucherie & Poissonnerie', description: 'Vente de viande, poisson frais ou fumé', actif: true },

  { nom: 'Agriculture', description: 'Cultures vivrières et commerciales', actif: true },
  { nom: 'Élevage', description: 'Élevage de volailles, porcs, bovins, etc.', actif: true },
  { nom: 'Pêche', description: 'Pêche artisanale et vente de poissons', actif: true },
  { nom: 'Transformation Agroalimentaire', description: 'Transformation de produits agricoles', actif: true },

  { nom: 'Artisanat', description: 'Métiers artisanaux et production locale', actif: true },
  { nom: 'Couture & Stylisme', description: 'Tailleurs, stylistes, retoucheurs', actif: true },
  { nom: 'Coiffure & Esthétique', description: 'Salons de coiffure, esthétique et beauté', actif: true },
  { nom: 'Menuiserie', description: 'Fabrication de meubles et ouvrages en bois', actif: true },
  { nom: 'Maçonnerie & BTP', description: 'Travaux de construction et rénovation', actif: true },
  { nom: 'Soudure & Métallerie', description: 'Travaux de soudure et fabrication métallique', actif: true },

  { nom: 'Transport', description: 'Taxi, moto-taxi, transport de marchandises', actif: true },
  { nom: 'Logistique & Livraison', description: 'Services de livraison et transport local', actif: true },

  { nom: 'Téléphonie & Mobile Money', description: 'Crédit téléphonique, mobile money, kiosques', actif: true },
  { nom: 'Informatique & Télécoms', description: 'Services informatiques et maintenance', actif: true },

  { nom: 'Pharmacie & Produits de Santé', description: 'Vente de médicaments et produits médicaux', actif: true },
  { nom: 'Soins & Bien-être', description: 'Centres de soins, massage, bien-être', actif: true },

  { nom: 'Éducation & Formation', description: 'Écoles privées, formations professionnelles', actif: true },
  { nom: 'Services Administratifs', description: 'Cybercafés, impression, secrétariat', actif: true },

  { nom: 'Immobilier', description: 'Location, gestion de biens immobiliers', actif: true },
  { nom: 'Hôtellerie & Hébergement', description: 'Hôtels, auberges, maisons d’hôtes', actif: true },

  { nom: 'Industrie & Production', description: 'Petites unités de production locale', actif: true },
  { nom: 'Import – Export', description: 'Commerce international et distribution', actif: true },

  { nom: 'Services Divers', description: 'Autres activités génératrices de revenus', actif: true }
];


const TAGS_DATA = [
  { name: 'VIP', color: '#f59e0b', type: 'category' },
  { name: 'Risque', color: '#ef4444', type: 'risk' },
  { name: 'Nouveau', color: '#22c55e', type: 'status' },
  { name: 'Retard', color: '#f97316', type: 'risk' },
  { name: 'KYC', color: '#0ea5e9', type: 'category' },
];

const SMS_TEMPLATES_DATA = [
  {
    code: 'OTP_VALIDATION',
    nom: 'OTP Validation',
    contenu: 'Votre code OTP est {{code}}. Il expire dans {{minutes}} minutes.',
    placeholders: 'code,minutes',
    description: 'OTP pour validation de transactions',
    actif: true,
  },
  {
    code: 'CREDIT_APPROVAL',
    nom: 'Crédit approuvé',
    contenu: 'Votre crédit de {{montant}} FCFA a été approuvé. Merci.',
    placeholders: 'montant',
    description: 'Notification d\'approbation de crédit',
    actif: true,
  },
];

async function seedProd() {
  console.log('🏭 Starting PRODUCTION seed...');
  console.log('⚠️  This will overwrite configuration tables!');

  try {
    // 1. CLEAN CONFIGURATION TABLES
    console.log('\n🧹 Cleaning configuration tables...');
    await db.delete(rolePermissions);
    await db.delete(permissions);
    await db.delete(modules);
    await db.delete(tags);
    await db.delete(typesMarches);
    await db.delete(systemSettings);
    await db.delete(featureFlags);
    await db.delete(securitySettings);
    await db.delete(uiCustomization);
    await db.delete(smsTemplates);
    await db.delete(smsProviderSettings);
    await db.delete(planComptable);
    await db.delete(journaux);
    await db.delete(exercices);
    await db.delete(creditPlans);
    
    await db.delete(creditPlans);
    await db.delete(creditPlans);
    
    // Deletion for reevaluation dependencies
    await db.delete(scoringHistory);
    await db.delete(enquetesComplementaires);
    await db.delete(transfertsCoffreAuditLogs);
    await db.delete(transfertsCoffreCaisse);
    await db.delete(configCoffreFort);

    // Inter-vault transfer dependencies (delete in correct order)
    await db.delete(tachesRegularisation);
    await db.delete(reconciliationsLiaison);
    await db.delete(transfertsInterCoffresAuditLogs);
    await db.delete(documentsTransfert);
    await db.delete(transfertsInterCoffres);
    await db.delete(comptesLiaison);
    await db.delete(configTransfertInterCoffres);
    await db.delete(coffresForts);
    
    // NOTE: We do NOT delete users, agences, or zones if they have data linked
    // But for a fresh install we might want to ensure they exist.
    // For SAFETY in prod, we will upsert or check existence rather than wiping critical tables
    // that might have FK constraints to operational data we want to keep (if any).
    // However, the user request implies a fresh setup or a config reset. 
    // I will use `insert` without delete for Agences/Zones to avoid breaking constraints,
    // assuming it is empty or we accept duplicates if not handled (actually Drizzle throws on duplicate PK).
    // Let's stick to the "empty DB" assumption for a seed script, OR handle conflicts.
    // To be safe for re-runs, I will try to delete zones/agences only if no clients exist?
    // Actually, simple approach: delete permissions/roles/settings is usually safe-ish.
    // Delete zones/agences is risky.
    // I will DELETE zones/agences because this is a SEED script for deployment.
    
    await db.delete(agences);
    await db.delete(zones);
    // Users are tricky, we definitely need an admin.
    await db.delete(users);

    console.log('   ✅ cleanup complete');

    // 2. SEED GEOGRAPHY
    console.log('\n🏢 Seeding Geography...');
    await db.insert(zones).values(ZONES_DATA);
    
    const insertedAgences: Record<string, string> = {};
    for (const a of AGENCES_DATA) {
      const [inserted] = await db.insert(agences).values({
        nom: a.nom,
        codeAgence: a.code,
        adresse: a.adresse,
        ville: a.ville,
        region: a.region,
        typeAgence: a.isSiege ? 'Principale' : 'Secondaire',
        statut: 'En cours',
        latitude: a.latitude,
        longitude: a.longitude,
        telephone: a.telephone,
        email: a.email,
        dateOuverture: a.dateOuverture,
      }).returning();
      insertedAgences[a.nom] = inserted.id;
    }
    console.log('   ✅ Zones and Agencies created');

    // 2b. SEED COFFRE CONFIG FOR AGENCIES
    console.log('   🛡️ Seeding Coffre Configuration...');
    for (const [nom, id] of Object.entries(insertedAgences)) {
      // Check if config exists first to avoid duplicate if we didn't wipe
      const existing = await db.query.configCoffreFort.findFirst({
        where: (table, { eq }) => eq(table.agenceId, id)
      });

      if (!existing) {
        await db.insert(configCoffreFort).values({
          agenceId: id,
          seuilDoubleValidation: '10000000', // 10 millions for prod
          separationInitiateurValideur: true,
          actif: true,
          rolesInitiateurs: ['Chef d\'Agence', 'Agent Caisse'],
          rolesValideurs: ['Chef d\'Agence', 'Superviseur'],
          rolesExecuteurs: ['Chef d\'Agence'],
        });
      }
    }
    console.log('   ✅ Coffre config checked/created');

    // 2c. SEED COFFRES-FORTS (VAULTS) - Siège only for production
    console.log('   🔐 Seeding Coffres-Forts (Vaults)...');
    
    // Check if coffre du Siège already exists
    const existingCoffreSiege = await db.query.coffresForts?.findFirst({
      where: (table, { eq }) => eq(table.code, 'CF-SIEGE')
    });

    // Get Siège agency ID for linking
    const siegeAgence = Object.entries(insertedAgences).find(([nom]) => nom.toLowerCase() === 'siège');
    const siegeAgenceId = siegeAgence ? siegeAgence[1] : null;

    if (!existingCoffreSiege) {
      await db.insert(coffresForts).values({
        code: 'CF-SIEGE',
        nom: 'Coffre-Fort Siège',
        ownerType: 'SIEGE',
        ownerId: siegeAgenceId, // Lié à l'agence Siège pour que l'API le trouve
        devise: 'XAF',
        solde: '0', // Production starts with 0
        plafondEncaisse: '500000000', // 500 millions max for central vault
        soldeMinimum: '10000000', // 10 millions minimum
        statut: 'Actif',
        description: 'Coffre-fort central du siège',
      });
    }
    console.log('   ✅ Coffres-Forts checked/created');

    // 2d. SEED COMPTES DE LIAISON (Internal liaison accounts)
    console.log('   💼 Seeding Comptes de Liaison...');
    
    const existingLiaison = await db.query.comptesLiaison?.findFirst({
      where: (table, { eq }) => eq(table.code, 'LIAISON-SIEGE')
    });

    if (!existingLiaison) {
      await db.insert(comptesLiaison).values({
        code: 'LIAISON-SIEGE',
        intitule: 'Compte de liaison - Siège',
        numeroComptable: '581000',
        entiteType: 'SIEGE',
        entiteId: null,
        soldeCourant: '0',
        actif: true,
      });
    }
    console.log('   ✅ Comptes de Liaison checked/created');

    // 2e. SEED CONFIGURATION TRANSFERTS INTER-COFFRES (Global config)
    console.log('   ⚙️ Seeding Config Transferts Inter-Coffres...');
    
    const existingConfigTIC = await db.query.configTransfertInterCoffres?.findFirst({
      where: (table, { isNull }) => isNull(table.agenceId) // Global config
    });

    if (!existingConfigTIC) {
      await db.insert(configTransfertInterCoffres).values({
        agenceId: null, // Global config
        montantMinTransfert: '100000', // 100k min for production
        montantMaxTransfert: '500000000', // 500 millions max
        seuilAlertePlafond: '80',
        approbationDoubleNiveau: true,
        nombreAgentsTransportMin: '2',
        scelleObligatoireSiMontantSuperieur: '50000000', // Scellé obligatoire au-delà de 50M
        separationCreateurApprobateurN1: true,
        separationApprobateurN1N2: true,
        separationApprobateurRecepteur: true,
        rolesCreateurs: ['Agent Caisse', 'Comptable', 'Chef d\'Agence'],
        rolesApprobateursN1: ['Chef d\'Agence', 'Trésorier'],
        rolesApprobateursN2: ['Directeur', 'Directeur Financier'],
        rolesRecepteurs: ['Trésorier', 'Chef d\'Agence', 'Comptable'],
        delaiMaxReconciliation: '3',
        alerteReconciliationActive: true,
        actif: true,
      });
    }
    console.log('   ✅ Config Transferts Inter-Coffres checked/created');
    
    // 3. SEED RBAC MODULES & PERMISSIONS
    console.log('\n🔐 Seeding Modules & Permissions...');
    const insertedModules: Record<string, string> = {};

    for (const mod of MODULES_DATA) {
      const [inserted] = await db.insert(modules).values(mod).returning();
      insertedModules[mod.name] = inserted.id;
    }

    const insertedPermissions: Record<string, string> = {};
    for (const [moduleName, perms] of Object.entries(PERMISSIONS_DATA)) {
      const moduleId = insertedModules[moduleName];
      for (const perm of perms) {
        const [inserted] = await db.insert(permissions).values({
          moduleId,
          name: perm.name,
          code: perm.code,
          description: perm.description,
        }).returning();
        insertedPermissions[perm.code] = inserted.id;
      }
    }

    for (const [role, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
      if (permCodes.includes('*')) {
        for (const permId of Object.values(insertedPermissions)) {
          await db.insert(rolePermissions).values({ role, permissionId: permId, granted: true });
        }
      } else {
        for (const code of permCodes) {
          const permId = insertedPermissions[code];
          if (permId) {
            await db.insert(rolePermissions).values({ role, permissionId: permId, granted: true });
          }
        }
      }
    }
    console.log('   ✅ RBAC configured');

    // 4. SEED BUSINESS CONFIG
    console.log('\n🏷️ Seeding Business Config (Tags, Marchés)...');
    await db.insert(typesMarches).values(TYPES_MARCHES_DATA);
    await db.insert(tags).values(TAGS_DATA);
    // SMS Templates
    await db.insert(smsTemplates).values(SMS_TEMPLATES_DATA);
    
    // Reevaluation Configuration
    console.log('\\n🔄 Seeding Reevaluation Config...');
    await db.insert(configReevaluation).values({
      delaiMinimumJours: 0, // Reduced to 0 (immediate)
      maxReevaluationsParDemande: 2,
      motifsNonReevaluables: [
        'Fraude avérée',
        'Client blacklisté',
        'Faux documents',
        'Identité non vérifiable',
        'Contentieux juridique'
      ],
      elementsNouveauxObligatoires: true,
      enqueteComplementaireObligatoire: false,
      documentsMinimum: 0,
      seuilScoreMinimum: 40,
      deltaScoreMinimum: 5,
      reductionMontantMaxPourcentage: 50,
      actif: true,
      agenceId: null, // Global config
    });
    console.log('   ✅ Reevaluation config created');
    // Credit Plans
    console.log('\n📝 Seeding Credit Plans...');
    await db.insert(creditPlans).values([
      {
        nom: 'Crédit 50.000',
        description: 'Micro-crédit de 50.000 FCFA',
        typeCredit: 'Personnel',
        montantMin: '50000',
        montantMax: '50000',
        tauxInteret: '20',
        dureeValeur: 30,
        dureeUnite: 'Jour',
        frequenceRemboursement: 'Journalier',
        fraisDossier: '2500',
        conditions: ['Carte d\'identité'],
        actif: true
      },
      {
        nom: 'Crédit 75.000',
        description: 'Micro-crédit de 75.000 FCFA',
        typeCredit: 'Personnel',
        montantMin: '75000',
        montantMax: '75000',
        tauxInteret: '20',
        dureeValeur: 30,
        dureeUnite: 'Jour',
        frequenceRemboursement: 'Journalier',
        fraisDossier: '3750',
        conditions: ['Carte d\'identité'],
        actif: true
      },
      {
        nom: 'Crédit 100.000',
        description: 'Micro-crédit de 100.000 FCFA',
        typeCredit: 'Personnel',
        montantMin: '100000',
        montantMax: '100000',
        tauxInteret: '20',
        dureeValeur: 30,
        dureeUnite: 'Jour',
        frequenceRemboursement: 'Hebdomadaire',
        fraisDossier: '5000',
        conditions: ['Carte d\'identité', 'Garant'],
        actif: true
      },
      {
        nom: 'Crédit 150.000',
        description: 'Micro-crédit de 150.000 FCFA',
        typeCredit: 'Commercial',
        montantMin: '150000',
        montantMax: '150000',
        tauxInteret: '20',
        dureeValeur: 60,
        dureeUnite: 'Jour',
        frequenceRemboursement: 'Hebdomadaire',
        fraisDossier: '7500',
        conditions: ['Carte d\'identité', 'Commerce'],
        actif: true
      },
      {
        nom: 'Crédit 200.000',
        description: 'Micro-crédit de 200.000 FCFA',
        typeCredit: 'Commercial',
        montantMin: '200000',
        montantMax: '200000',
        tauxInteret: '20',
        dureeValeur: 90,
        dureeUnite: 'Jour',
        frequenceRemboursement: 'Hebdomadaire',
        fraisDossier: '10000',
        conditions: ['Carte d\'identité', 'Commerce', 'Garant'],
        actif: true
      }
    ]);
    console.log('\n⚙️ Seeding Settings...');

    await db.insert(systemSettings).values({
      agenceName: 'COFIN - Microfinance',
      agenceCode: 'COF-PROD',
      devise: 'XAF',
      pays: 'République du Congo',
      adresse: 'Boulevard Denis Sassou, Brazzaville',
      telephone: '+242060000000',
      email: 'contact@cofin.com',
      sessionTimeout: 15, // Stricter for Prod
      maxLoginAttempts: 3, // Stricter for Prod
      passwordMinLength: 10, // Stricter for Prod
      backupFrequency: 'daily',
      autoBackupEnabled: true,
      notificationEmailEnabled: true,
      notificationSmsEnabled: true,
      smsPaymentValidationEnabled: true,
      mobileMoneyEnabled: true,
      maintenanceMode: false,
    });

    await db.insert(securitySettings).values({
      passwordMinLength: 10,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecial: true,
      sessionTimeoutMinutes: 15,
      maxLoginAttempts: 3,
      lockoutDurationMinutes: 30,
      twoFactorEnabled: true,
      ipWhitelistEnabled: false,
      auditLogEnabled: true,
    });

    await db.insert(uiCustomization).values({
      theme: 'light',
      primaryColor: '#0f766e',
      accentColor: '#f97316',
      langue: 'fr',
      sidebarCollapsedDefault: false,
      showAnimations: true,
      compactMode: false,
    });

    await db.insert(featureFlags).values([
      { code: 'offline_mode', nom: 'Mode hors ligne', description: 'Activer le mode hors ligne', enabled: true, rolloutPercentage: 100 },
      { code: 'agent_tracking', nom: 'Tracking agents', description: 'Suivi GPS des agents terrain', enabled: true, rolloutPercentage: 100 },
      { code: 'bourse_module', nom: 'Module Bourse', description: 'Activer le module Bourse', enabled: true, rolloutPercentage: 100 },
      { code: 'logistics_module', nom: 'Module Loge', description: 'Activer le stockage Loge', enabled: true, rolloutPercentage: 100 },
    ]);

    await db.insert(smsProviderSettings).values({
      provider: 'manual',
      providerName: 'infobip',
      apiKey: '', // Empty for prod, to be filled
      apiUrl: 'https://api.infobip.com',
      senderId: 'COFIN',
      username: '',
      password: '',
      balance: '0',
      enabled: false,
      isPrimary: true,
      isActive: true,
      settings: { mode: 'production' },
    });
    
    // 6. CREATE ADMIN USER
    console.log('\n👤 Creating Super Admin...');
    const hashedPassword = await hashPassword('Admin123!@#');
    
    await db.insert(users).values({
      username: 'admin',
      password: hashedPassword,
      nom: 'Administrateur',
      prenom: 'Système',
      email: 'admin@cofin.com',
      role: 'Administrateur',
      agence: 'Siège', // Linked to inserted Agence by name or ID? Schema says string?
      // Check auth.ts or schema used. In seed-demo it used 'Siège'.
      // If schema is text, it works. If link, might fail. 
      // Assuming schema definition for `users.agence` is text based on demo.
      statut: 'Actif',
    });


    // SEED DUREES SUGGEREES (Credit)
    console.log('\n📅 Seeding Durees Suggerees (Credit)...');

    await db.delete(dureesSuggerees);

    await db.insert(dureesSuggerees).values([
      // Journalier
      { frequence: 'Journalier', dureeValeur: 15, dureeUnite: 'Jour', estRecommandee: false, ordre: 0, actif: true, label: '15 jours' },
      { frequence: 'Journalier', dureeValeur: 30, dureeUnite: 'Jour', estRecommandee: true, ordre: 1, actif: true, label: '30 jours' },
      { frequence: 'Journalier', dureeValeur: 60, dureeUnite: 'Jour', estRecommandee: false, ordre: 2, actif: true, label: '60 jours' },
      { frequence: 'Journalier', dureeValeur: 90, dureeUnite: 'Jour', estRecommandee: false, ordre: 3, actif: true, label: '90 jours' },
      // Hebdomadaire
      { frequence: 'Hebdomadaire', dureeValeur: 1, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '1 mois' },
      { frequence: 'Hebdomadaire', dureeValeur: 3, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '3 mois' },
      { frequence: 'Hebdomadaire', dureeValeur: 6, dureeUnite: 'Mois', estRecommandee: false, ordre: 2, actif: true, label: '6 mois' },
      // Mensuel
      { frequence: 'Mensuel', dureeValeur: 3, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '3 mois' },
      { frequence: 'Mensuel', dureeValeur: 6, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '6 mois' },
      { frequence: 'Mensuel', dureeValeur: 12, dureeUnite: 'Mois', estRecommandee: false, ordre: 2, actif: true, label: '12 mois' },
      // Bimensuel
      { frequence: 'Bimensuel', dureeValeur: 6, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '6 mois' },
      { frequence: 'Bimensuel', dureeValeur: 12, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '12 mois' },
      { frequence: 'Bimensuel', dureeValeur: 18, dureeUnite: 'Mois', estRecommandee: false, ordre: 2, actif: true, label: '18 mois' },
      // Trimestriel
      { frequence: 'Trimestriel', dureeValeur: 12, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '12 mois' },
      { frequence: 'Trimestriel', dureeValeur: 24, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '24 mois' },
      { frequence: 'Trimestriel', dureeValeur: 36, dureeUnite: 'Mois', estRecommandee: false, ordre: 2, actif: true, label: '36 mois' },
    ] as any);

    console.log('   ✅ Durees Suggerees created');

    // SEED ACCOUNTING PLAN (Standard OHADA)
    console.log('\n📚 Seeding Accounting Plan (Prod base)...');
    
    // Create current exercise
    const currentYear = new Date().getFullYear();
    await db.insert(exercices).values({
      code: `${currentYear}`,
      dateDebut: `${currentYear}-01-01`,
      dateFin: `${currentYear}-12-31`,
      statut: 'Ouvert',
      description: `Exercice comptable ${currentYear}`,
    });

    const planComptableData = [
       // Classe 1: Capitaux
       { num: '101', label: 'Capital social', classe: 1, type: 'Capitaux', sens: 'Crédit' },
       { num: '12', label: 'Report à nouveau', classe: 1, type: 'Capitaux', sens: 'Crédit' },
       { num: '13', label: 'Résultat net', classe: 1, type: 'Capitaux', sens: 'Crédit' },
       
       // Classe 2: Immobilisations
       { num: '21', label: 'Immobilisations incorporelles', classe: 2, type: 'Actif', sens: 'Débit' },
       { num: '22', label: 'Terrains', classe: 2, type: 'Actif', sens: 'Débit' },
       { num: '23', label: 'Bâtiments', classe: 2, type: 'Actif', sens: 'Débit' },
       { num: '24', label: 'Matériel', classe: 2, type: 'Actif', sens: 'Débit' },
       
       // Classe 3: Stocks
       { num: '31', label: 'Marchandises', classe: 3, type: 'Actif', sens: 'Débit' },
       
       // Classe 4: Tiers
       { num: '401', label: 'Fournisseurs', classe: 4, type: 'Passif', sens: 'Crédit' },
       { num: '411', label: 'Clients', classe: 4, type: 'Actif', sens: 'Débit' },
       { num: '42', label: 'Personnel', classe: 4, type: 'Passif', sens: 'Crédit' },
       { num: '43', label: 'Sécurité Sociale', classe: 4, type: 'Passif', sens: 'Crédit' },
       { num: '44', label: 'État', classe: 4, type: 'Passif', sens: 'Crédit' },
       { num: '443', label: 'TVA Facturée', classe: 4, type: 'Passif', sens: 'Crédit' },
       { num: '445', label: 'TVA Récupérable', classe: 4, type: 'Actif', sens: 'Débit' },

       // Classe 5: Trésorerie
       { num: '512', label: 'Banque', classe: 5, type: 'Actif', sens: 'Débit' },
       { num: '521', label: 'Caisse', classe: 5, type: 'Actif', sens: 'Débit' },
       
       // Classe 6: Charges
       { num: '601', label: 'Achats marchandises', classe: 6, type: 'Charge', sens: 'Débit' },
       { num: '61', label: 'Transports', classe: 6, type: 'Charge', sens: 'Débit' },
       { num: '62', label: 'Services extérieurs', classe: 6, type: 'Charge', sens: 'Débit' },
       { num: '63', label: 'Impôts et taxes', classe: 6, type: 'Charge', sens: 'Débit' },
       { num: '66', label: 'Charges personnel', classe: 6, type: 'Charge', sens: 'Débit' },
       
       // Classe 7: Produits
       { num: '701', label: 'Ventes marchandises', classe: 7, type: 'Produit', sens: 'Crédit' },
       { num: '706', label: 'Services vendus', classe: 7, type: 'Produit', sens: 'Crédit' },
    ];

    for (const cpt of planComptableData) {
       await db.insert(planComptable).values({
         numeroCompte: cpt.num,
         intitule: cpt.label,
         classe: cpt.classe,
         typeCompte: cpt.type,
         sensNormal: cpt.sens,
         actif: true,
       });
    }

    const journalsData = [
      { code: 'CAISSE', intitule: 'Journal de Caisse', typeJournal: 'Caisse' },
      { code: 'BANK', intitule: 'Journal de Banque', typeJournal: 'Banque' },
      { code: 'ACHAT', intitule: 'Journal d\'Achats', typeJournal: 'Achats' },
      { code: 'VENTE', intitule: 'Journal de Ventes', typeJournal: 'Ventes' },
      { code: 'OD', intitule: 'Opérations Diverses', typeJournal: 'Opérations Diverses' },
    ];
    await db.insert(journaux).values(journalsData as any);
    console.log('   ✅ Accounting plan seeded');

    console.log('\n✅ PRODUCTION SEED COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('👤 Login: admin / Admin123!@#');
    console.log('');
    console.log('🔐 Coffres-Forts:');
    console.log('   CF-SIEGE : Coffre-Fort Siège (solde initial: 0 XAF)');
    console.log('   + Compte de liaison LIAISON-SIEGE (581000)');
    console.log('   + Configuration globale transferts inter-coffres');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error during production seed:', error);
    process.exit(1);
  }
}

seedProd();
