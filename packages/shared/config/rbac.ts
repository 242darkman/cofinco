/**
 * Configuration RBAC : Modules et Permissions pour CASL
 * =====================================================
 *
 * Ce fichier définit les modules et permissions de l'application.
 * Les permissions sont gérées via CASL (buildAbilityForUser) et stockées en BDD.
 *
 * IMPORTANT: Ne pas utiliser les fonctions legacy (MODULE_ACCESS, ROLE_PERMISSIONS).
 * Utiliser uniquement les hooks CASL (useAbility, useCan) côté client
 * et les middleware CASL (requireAbility) côté serveur.
 */
import { SystemRole } from '../types/roles';

/**
 * Liste des modules de l'application
 * Utilisée pour le seeding et l'UI admin
 */
export const APP_MODULES = [
  'Dashboard',
  'Caisse',
  'Crédits',
  'Remboursements',
  'Clients',
  'Comptes',
  'Tontines',
  'Cartes de Pointage',
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
  'Zones Commerciales',
  'Paiements Agent',
  'RBAC',
  'Maintenance',
  'Fidélité',
  'Régularisation',
  'Départements',
  'Employés',
  'Agences',
  'KPI',
] as const;

export type AppModule = (typeof APP_MODULES)[number];

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
  { name: 'CaisseAgent', description: 'Caisse des agents terrain', icon: 'Wallet', category: 'operations', orderIndex: 10 },
  { name: 'Transferts', description: 'Transferts d\'argent', icon: 'ArrowLeftRight', category: 'operations', orderIndex: 11 },
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
  { name: 'Prospection', description: 'Prospection et acquisition clients', icon: 'UserPlus', category: 'operations', orderIndex: 23 },
  { name: 'Zones Commerciales', description: 'Gestion des arrondissements et marchés', icon: 'MapPin', category: 'operations', orderIndex: 24 },
  { name: 'Paiements Agent', description: 'Paiements initiés par agents', icon: 'Banknote', category: 'finance', orderIndex: 25 },
  { name: 'Virements Programmes', description: 'Planification des virements internes', icon: 'CalendarClock', category: 'admin', orderIndex: 26 },
  // New modules for CASL alignment
  { name: 'RBAC', description: 'Gestion des rôles et permissions', icon: 'Key', category: 'admin', orderIndex: 27 },
  { name: 'Maintenance', description: 'Outils de maintenance système', icon: 'Wrench', category: 'admin', orderIndex: 28 },
  { name: 'Fidélité', description: 'Programme de fidélité', icon: 'Award', category: 'operations', orderIndex: 29 },
  { name: 'Régularisation', description: 'Régularisations comptables', icon: 'Scale', category: 'finance', orderIndex: 30 },
  { name: 'Départements', description: 'Gestion des départements', icon: 'Building2', category: 'admin', orderIndex: 31 },
  { name: 'Employés', description: 'Gestion des employés', icon: 'Users', category: 'admin', orderIndex: 32 },
  { name: 'Agences', description: 'Gestion des agences', icon: 'Building', category: 'admin', orderIndex: 33 },
  { name: 'KPI', description: 'Indicateurs clés de performance et pilotage', icon: 'BarChart3', category: 'general', orderIndex: 34 },
  { name: 'Cartes de Pointage', description: 'Épargne libre par cartes à 31 cases', icon: 'LayoutGrid', category: 'finance', orderIndex: 35 },
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
    { name: 'Effectuer des paiements caisse', code: 'caisse.paiement', description: 'Effectuer des paiements divers depuis la caisse' },
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
    { name: 'Suspendre un compte', code: 'comptes.suspend', description: 'Suspendre un compte client' },
    { name: 'Lever la suspension', code: 'comptes.unsuspend', description: 'Lever la suspension d\'un compte' },
    { name: 'Initier une clôture', code: 'comptes.close_initiate', description: 'Initier la clôture d\'un compte' },
    { name: 'Approuver une clôture', code: 'comptes.close_approve', description: 'Approuver la clôture d\'un compte (maker-checker)' },
    { name: 'Annuler une clôture', code: 'comptes.close_cancel', description: 'Annuler une demande de clôture en cours' },
  ],
  'Tontines': [
    { name: 'Voir les tontines', code: 'tontines.view', description: 'Accès au module Tontines' },
    { name: 'Créer une tontine', code: 'tontines.create', description: 'Créer une nouvelle tontine' },
    { name: 'Gérer une tontine', code: 'tontines.manage', description: 'Gérer les membres et cotisations' },
    { name: 'Modifier une tontine', code: 'tontines.edit', description: 'Modifier une tontine' },
  ],
  'Cartes de Pointage': [
    { name: 'Voir les cartes de pointage', code: 'cartespointage.view', description: 'Accès au module Cartes de Pointage' },
    { name: 'Ouvrir une carte', code: 'cartespointage.create', description: 'Ouvrir une nouvelle carte de pointage pour un client' },
    { name: 'Enregistrer un versement', code: 'cartespointage.deposit', description: 'Pointer une case (versement du montant unitaire)' },
    { name: 'Valider un retrait', code: 'cartespointage.withdraw', description: 'Retrait avec retenue d\'une échéance en commission et clôture de la carte' },
    { name: 'Gérer les cartes', code: 'cartespointage.manage', description: 'Gestion complète des cartes de pointage' },
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
    { name: 'Créer un agent', code: 'agent.create', description: 'Créer un nouvel agent terrain' },
    { name: 'Modifier un agent', code: 'agent.edit', description: 'Modifier un agent terrain' },
    { name: 'Gérer les agents', code: 'agent.manage', description: 'Gérer les agents terrain (supervision)' },
    { name: 'Effectuer des collectes', code: 'agent.collect', description: 'Enregistrer des collectes terrain' },
  ],
  'CaisseAgent': [
    { name: 'Voir caisse agent', code: 'caisseagent.view', description: 'Voir les caisses agents' },
    { name: 'Créer opération caisse agent', code: 'caisseagent.create', description: 'Créer opération caisse agent' },
    { name: 'Gérer caisse agent', code: 'caisseagent.manage', description: 'Gérer les caisses agents' },
    { name: 'Approuver opération caisse agent', code: 'caisseagent.approve', description: 'Approuver opération caisse agent' },
    { name: 'Rejeter opération caisse agent', code: 'caisseagent.reject', description: 'Rejeter opération caisse agent' },
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
    { name: 'Voir les prospections', code: 'prospection.view', description: 'Voir la liste des prospects' },
    { name: 'Créer une prospection', code: 'prospection.create', description: 'Enregistrer un nouveau prospect' },
    { name: 'Modifier une prospection', code: 'prospection.edit', description: 'Modifier les infos et statut d\'un prospect' },
    { name: 'Supprimer une prospection', code: 'prospection.delete', description: 'Supprimer un prospect' },
    { name: 'Convertir en client', code: 'prospection.convert', description: 'Convertir un prospect en client' },
    { name: 'Exporter les prospections', code: 'prospection.export', description: 'Exporter la liste des prospects' },
    { name: 'Voir les primes', code: 'prospection.primes.view', description: 'Voir les primes de prospection' },
    { name: 'Approuver les primes', code: 'prospection.primes.approve', description: 'Approuver une prime de prospection' },
    { name: 'Rejeter les primes', code: 'prospection.primes.reject', description: 'Rejeter une prime de prospection' },
    { name: 'Payer les primes', code: 'prospection.primes.pay', description: 'Valider le paiement d\'une prime' },
    { name: 'Voir config primes', code: 'prospection.config.view', description: 'Voir la configuration des primes' },
    { name: 'Modifier config primes', code: 'prospection.config.edit', description: 'Modifier la configuration des primes' },
    { name: 'Supervision prospection', code: 'prospection.supervision.view', description: 'Tableau de bord supervision prospection' },
  ],
  'Zones Commerciales': [
    { name: 'Voir les zones', code: 'zones.view', description: 'Voir arrondissements et marchés' },
    { name: 'Créer une zone', code: 'zones.create', description: 'Créer un arrondissement ou marché' },
    { name: 'Modifier une zone', code: 'zones.edit', description: 'Modifier un arrondissement ou marché' },
    { name: 'Désactiver une zone', code: 'zones.delete', description: 'Désactiver un arrondissement ou marché' },
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
    { name: 'Créer communication', code: 'communications.create', description: 'Créer une nouvelle communication' },
    { name: 'Modifier communication', code: 'communications.edit', description: 'Modifier une communication' },
    { name: 'Supprimer communication', code: 'communications.delete', description: 'Supprimer une communication' },
    { name: 'Diffusion en masse', code: 'communications.broadcast', description: 'Diffuser des messages à plusieurs destinataires' },
    { name: 'Programmer envoi', code: 'communications.schedule', description: 'Programmer des envois différés' },
    { name: 'Archiver communication', code: 'communications.archive', description: 'Archiver et restaurer des communications' },
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
    // Evacuation de cash (vide de coffre)
    { name: 'Voir évacuations', code: 'coffre.evacuation.view', description: 'Consulter les évacuations de coffre' },
    { name: 'Créer évacuation', code: 'coffre.evacuation.create', description: 'Créer une demande d\'évacuation de coffre' },
    { name: 'Approuver évacuation', code: 'coffre.evacuation.approve', description: 'Approuver ou rejeter une évacuation' },
    { name: 'Préparer évacuation', code: 'coffre.evacuation.prepare', description: 'Préparer physiquement l\'évacuation (billetage, scellé)' },
    { name: 'Dispatcher évacuation', code: 'coffre.evacuation.dispatch', description: 'Dispatcher les fonds (comptabilise la sortie)' },
    { name: 'Enregistrer dépôt', code: 'coffre.evacuation.deposit', description: 'Confirmer le dépôt à destination' },
    { name: 'Réconcilier évacuation', code: 'coffre.evacuation.reconcile', description: 'Réconcilier les montants évacués' },
    { name: 'Config évacuation', code: 'coffre.evacuation.config', description: 'Gérer la configuration des évacuations' },
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
    { name: 'Échanger des points', code: 'loyalty.redeem', description: 'Échanger des points contre des récompenses' },
    { name: 'Attribuer des points', code: 'loyalty.award', description: 'Attribuer des points bonus à un client' },
    { name: 'Ajuster les points', code: 'loyalty.adjust', description: 'Ajuster manuellement le solde de points' },
    { name: 'Expirer les points', code: 'loyalty.expire', description: 'Faire expirer les points d\'un client' },
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
    { name: 'Approuver agence', code: 'agences.approve', description: 'Approuver/rejeter une agence en attente de validation' },
    { name: 'Activer agence', code: 'agences.activate', description: 'Activer une agence après validation de la checklist' },
    { name: 'Suspendre agence', code: 'agences.suspend', description: 'Suspendre ou réactiver une agence' },
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
    // Épargnes / Comptes
    'epargnes.view', 'epargnes.create', 'epargnes.edit',
    'comptes.suspend', 'comptes.unsuspend',
    'comptes.close_initiate', 'comptes.close_approve', 'comptes.close_cancel',
    // Tontines
    'tontines.view', 'tontines.create', 'tontines.edit', 'tontines.manage',
    // Cartes de Pointage
    'cartespointage.view', 'cartespointage.create', 'cartespointage.deposit', 'cartespointage.withdraw', 'cartespointage.manage',
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
    'prospection.view', 'prospection.edit', 'prospection.convert', 'prospection.export',
    'prospection.primes.view', 'prospection.primes.approve', 'prospection.primes.reject', 'prospection.primes.pay',
    'prospection.config.view', 'prospection.config.edit',
    'prospection.supervision.view',
    'zones.view', 'zones.create', 'zones.edit',
    'paiements.view',
    // Virements Programmés
    'virements_programmes.view', 'virements_programmes.edit',
    // Communications
    'communications.view', 'communications.create', 'communications.edit', 'communications.delete',
    'communications.broadcast', 'communications.schedule', 'communications.archive',
    'messages.view', 'messages.send',
    // Fidélité
    'loyalty.view', 'loyalty.create', 'loyalty.edit', 'loyalty.delete', 'loyalty.manage',
    'loyalty.redeem', 'loyalty.award', 'loyalty.adjust', 'loyalty.expire',
    // New CASL modules
    'employes.view', 'employes.create', 'employes.edit',
    'agences.view', 'agences.create', 'agences.edit', 'agences.approve', 'agences.activate',
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
    'loyalty.view',
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
    'loyalty.view',
    'rh.view',
  ],
  [SystemRole.SUPERVISEUR]: [
    'dashboard.view',
    'clients.view',
    'agent.view', 'agent.manage',
    'tontines.view', 'tontines.manage',
    'cartespointage.view',
    'caisseagent.view', 'caisseagent.approve', 'caisseagent.reject',
    'comptes.close_approve',
    'prospection.view', 'prospection.edit',
    'prospection.primes.view', 'prospection.primes.approve', 'prospection.primes.reject',
    'prospection.supervision.view',
    'zones.view',
    'rapports.view',
    'communications.view', 'communications.broadcast', 'communications.schedule', 'communications.archive',
    'loyalty.view',
    'rh.view',
  ],
  [SystemRole.CAISSIER]: [
    'dashboard.view',
    'clients.view', 'clients.create',
    'epargnes.view', 'epargnes.create', 'epargnes.edit',
    'caisse.view', 'caisse.create', 'caisse.edit', 'caisse.paiement',
    'cartespointage.view', 'cartespointage.create', 'cartespointage.deposit', 'cartespointage.withdraw',
    'remboursements.view', 'remboursements.create',
    'virements_programmes.view', 'virements_programmes.edit',
    'communications.view',
    'loyalty.view', 'loyalty.redeem',
    'rh.view',
  ],
  [SystemRole.AGENT_TERRAIN]: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'agent.view', 'agent.collect',
    'prospection.view', 'prospection.create', 'prospection.edit', 'prospection.convert',
    'prospection.primes.view',
    'zones.view',
    'caisseagent.view', 'caisseagent.create',
    'incidents.view', 'incidents.create',
    'visites.view', 'visites.create',
    'paiements.view', 'paiements.create',
    'communications.view',
    'loyalty.view', 'loyalty.redeem',
    'rh.view',
  ],
  [SystemRole.AUDITEUR]: [
    'dashboard.view',
    // Clients
    'clients.view',
    // Crédits
    'credits.view', 'credits.reevaluations.view',
    // Épargnes / Comptes
    'epargnes.view',
    // Tontines
    'tontines.view',
    // Cartes de Pointage
    'cartespointage.view',
    // Comptabilité
    'comptabilite.view', 'comptabilite.export',
    // Caisse
    'caisse.view',
    // Caisse Agent
    'caisseagent.view',
    // Agent Terrain
    'agent.view',
    // Remboursements
    'remboursements.view',
    // Rapports
    'rapports.view', 'rapports.export',
    // RH / Paie
    'rh.view', 'paie.view',
    // Employés
    'employes.view',
    // Coffre-Fort
    'coffre.view', 'coffre.config.view',
    // Audit
    'audit.view', 'audit.export',
    // Administration (logs only)
    'admin.logs',
    // Communications
    'communications.view', 'messages.view',
    // Fidélité
    'loyalty.view',
    // Régularisation
    'regularisation.view',
    // Agences
    'agences.view',
    // Prospection
    'prospection.view', 'prospection.primes.view', 'prospection.supervision.view',
    // Zones / Visites / Paiements
    'zones.view', 'visites.view', 'paiements.view',
    // Incidents
    'incidents.view',
    // Transferts
    'transferts.view',
    // Virements Programmés
    'virements_programmes.view',
    // Départements
    'departments.view',
  ],
  [SystemRole.RH]: [
    'dashboard.view',
    // RH complet
    'rh.view', 'rh.create', 'rh.edit', 'rh.approve', 'rh.manage',
    // Paie complet
    'paie.view', 'paie.create', 'paie.edit', 'paie.approve',
    // Employés complet
    'employes.view', 'employes.create', 'employes.edit', 'employes.delete', 'employes.manage',
    // Départements
    'departments.view', 'departments.create', 'departments.edit', 'departments.manage',
    // Vues basiques
    'agences.view',
    'clients.view',
    'users.view',
    'communications.view', 'messages.view',
    'rapports.view', 'rapports.export',
    'loyalty.view',
  ],
  [SystemRole.SUPPORT_IT]: [
    'dashboard.view',
    // Administration
    'admin.users', 'admin.logs', 'admin.settings',
    'users.view', 'users.create', 'users.edit',
    // RBAC
    'rbac.view', 'permissions.view',
    // Maintenance complet
    'maintenance.view', 'maintenance.purge', 'maintenance.migrate', 'maintenance.seed', 'maintenance.manage',
    // Paramètres
    'parametres.view', 'parametres.edit',
    // Audit
    'audit.view', 'audit.export',
    // Vues basiques
    'agences.view',
    'communications.view', 'messages.view',
    // Stockage
    'loge.view', 'loge.upload',
  ],
  [SystemRole.CLIENT]: [
    'dashboard.view',
    // Consultation de ses propres produits financiers
    'credits.view',
    'remboursements.view',
    'epargnes.view',
    'tontines.view',
    // Communications et messagerie
    'communications.view', 'messages.view',
    // Programme de fidélité
    'loyalty.view',
  ]
};
