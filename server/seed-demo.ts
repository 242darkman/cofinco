import { db } from './db';
import {
  users,
  loginAttempts,
  userPermissions,
  activeSessions,
  modules,
  permissions,
  rolePermissions,
  agences,
  userAgences,
  zones,
  clients,
  typesMarches,
  tags,
  clientTags,
  clientActivities,
  historiquePoints,
  interestRates,
  demandesCredit,
  enquetesCredit,
  credits,
  remboursements,
  comptesEpargne,
  transactionsEpargne,
  objectifsEpargne,
  plansEpargne,
  sessionsCaisse,
  operationsCaisse,
  caisseTransferts,
  agentsTerrain,
  objectifsMensuels,
  prospections,
  visitesTerrain,
  paiementsTerrain,
  agentLocationLogs,
  caisses,
  caisseSecurityCodes,
  caisseCodeUsages,
  codeGenerationPermissions,
  posDevices,
  shiftsCaisse,
  caisseAssignations,
  comptageBillets,
  modelesFactures,
  factures,
  lignesFactures,
  tontines,
  membresTontine,
  contributionsTontine,
  tontineRegles,
  tontinePenalites,
  tontineDistributions,
  tontineAlertes,
  kycLevels,
  transferts,
  transfertAuditLogs,
  transfertLimits,
  transfertWebhooks,
  transfertBlacklist,
  transfertReconciliation,
  otpValidations,
  systemSettings,
  featureFlags,
  securitySettings,
  uiCustomization,
  notifications,
  auditLogs,
  pushSubscriptions,
  notificationPreferences,
  pushNotificationLogs,
  smsTemplates,
  smsNotifications,
  smsProviderSettings,
  messages,
  demandesConges,
  formations,
  formationParticipants,
  sanctions,
  candidatures,
  bulletinsPaie,
  avantages,
  avantagesEmployes,
  presences,
  horairesTravail,
  exercices,
  comptes,
  journaux,
  ecritures,
  lignesEcritures,
  declarationsTva,
  documents,
  logeSettings,
  employes,
  portefeuillesBourse,
  positionsBourse,
  ordresBourse,
  transactionsBourse,
  watchlistBourse,
} from '@shared/schema';
import { hashPassword, ROLES } from './auth';
import { eq } from 'drizzle-orm';
import { faker } from '@faker-js/faker/locale/fr';

// Configure faker pour reproductibilité
faker.seed(12345);

// =====================================================
// FAKER HELPERS - Données réalistes pour le Congo
// =====================================================

// Noms et prénoms congolais réalistes
const CONGOLESE_LAST_NAMES = [
  'Mbemba', 'Ngoma', 'Makosso', 'Koumba', 'Nkounkou', 'Moukassa', 'Banzouzi', 'Ndinga',
  'Mvoula', 'Makoundi', 'Massamba', 'Nsimba', 'Mbamba', 'Nkouka', 'Kaya', 'Bongo',
  'Okemba', 'Itoua', 'Mabanza', 'Nzaba', 'Malonga', 'Mpassi', 'Bokilo', 'Mounzeo',
  'Nzila', 'Ngoyi', 'Bikindou', 'Mouyabi', 'Ossete', 'Ngouabi', 'Elenga', 'Obambi',
  'Mboungou', 'Tsika', 'Loubaki', 'Milandou', 'Mayala', 'Ngolali', 'Batchi', 'Mfoutou',
  'Ndoudi', 'Nzoulani', 'Louzolo', 'Pangou', 'Mberi', 'Kokolo', 'Bouka', 'Mampouya',
  'Loufoua', 'Tati', 'Ondongo', 'Makita', 'Bouanga', 'Mouanda', 'Kimbembe', 'Mbika',
];

const CONGOLESE_MALE_NAMES = [
  'Jean', 'Pierre', 'Paul', 'Michel', 'David', 'Emmanuel', 'Joseph', 'François',
  'Gervais', 'Serge', 'Alain', 'Christian', 'Patrick', 'Rodrigue', 'Éric', 'Brice',
  'Junior', 'Didier', 'Claude', 'Gilbert', 'Arnaud', 'Fabrice', 'Landry', 'Guy',
  'Marcel', 'Léon', 'André', 'Alphonse', 'Lucien', 'Henri', 'Nicolas', 'Sylvain',
];

const CONGOLESE_FEMALE_NAMES = [
  'Marie', 'Aya', 'Flora', 'Clarisse', 'Sarah', 'Alice', 'Cécile', 'Béatrice',
  'Chancelle', 'Ornella', 'Grâce', 'Esther', 'Ruth', 'Naomi', 'Linda', 'Élodie',
  'Claudine', 'Sylvie', 'Justine', 'Pascaline', 'Nadège', 'Merveille', 'Gloria', 'Laetitia',
  'Prisca', 'Christelle', 'Josiane', 'Bernadette', 'Solange', 'Pélagie', 'Blanche', 'Henriette',
];

const BRAZZAVILLE_QUARTIERS = [
  'Poto-Poto', 'Bacongo', 'Moungali', 'Ouenzé', 'Talangaï', 'Mfilou', 'Makélékélé',
  'Mpila', 'Diata', 'Ngamakosso', 'Mikalou', 'Kinsoundi', 'Madibou', 'Massengo',
];

const PROFESSIONS = [
  'Commerçant', 'Couturier', 'Mécanicien', 'Coiffeur', 'Restaurateur', 'Maraîcher',
  'Transporteur', 'Artisan', 'Boulanger', 'Électricien', 'Menuisier', 'Plombier',
  'Vendeur ambulant', 'Agriculteur', 'Pêcheur', 'Éleveur', 'Salarié', 'Fonctionnaire',
  'Enseignant', 'Infirmier', 'Technicien', 'Chauffeur', 'Agent de sécurité', 'Comptable',
];

const CREDIT_TYPES = [
  'Crédit stock', 'Crédit équipement', 'Crédit fonds de roulement', 'Crédit investissement',
  'Crédit commerce', 'Crédit agriculture', 'Crédit élevage', 'Crédit artisanat',
  'Crédit urgence', 'Crédit consommation', 'Crédit scolaire', 'Crédit habitat',
];

const CREDIT_OBJECTS = [
  'Achat de marchandises', 'Renouvellement stock', 'Extension activité', 'Achat équipement',
  'Fonds de roulement', 'Approvisionnement', 'Matériel professionnel', 'Rénovation boutique',
  'Achat véhicule commercial', 'Stock saisonnier', 'Diversification activité', 'Frais scolaires',
  'Frais médicaux', 'Événement familial', 'Travaux maison', 'Achat terrain',
];

const EPARGNE_TYPES = ['Epargne Simple', 'Epargne Projet', 'Epargne Bloquée', 'Compte Courant'];
const SEGMENTS = ['Standard', 'Premium', 'VIP'];
const CREDIT_STATUSES = ['En attente', 'Approuvé', 'Actif', 'En retard', 'Soldé', 'Rejeté', 'Annulé'];
const PAYMENT_METHODS = ['Espèces', 'Mobile Money', 'Virement', 'Chèque'];

// Fonctions helper pour générer des données aléatoires
const randomFromArray = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomBetween = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const generateCongolesePhone = (): string => {
  const prefixes = ['06', '05', '04'];
  const prefix = randomFromArray(prefixes);
  const number = String(randomBetween(10000000, 99999999));
  return `+242${prefix}${number.substring(0, 7)}`;
};

const generateCongoleseName = (gender: 'male' | 'female' = Math.random() > 0.5 ? 'male' : 'female') => {
  const prenom = gender === 'male'
    ? randomFromArray(CONGOLESE_MALE_NAMES)
    : randomFromArray(CONGOLESE_FEMALE_NAMES);
  const nom = randomFromArray(CONGOLESE_LAST_NAMES);
  return { nom, prenom, gender };
};

// Coordonnées GPS de Brazzaville avec variance
const generateBrazzavilleCoords = () => {
  const baseLat = -4.2634;
  const baseLng = 15.2429;
  const variance = 0.05;
  return {
    latitude: (baseLat + (Math.random() - 0.5) * variance * 2).toFixed(6),
    longitude: (baseLng + (Math.random() - 0.5) * variance * 2).toFixed(6),
  };
};

// Générer un montant arrondi réaliste
const generateRealisticAmount = (min: number, max: number, roundTo: number = 5000): string => {
  const raw = randomBetween(min, max);
  return String(Math.round(raw / roundTo) * roundTo);
};

// Générer une date aléatoire dans une plage
const randomDateBetween = (start: Date, end: Date): Date => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// ----------------------------------------------------------------------
// DATA DEFINITIONS
// ----------------------------------------------------------------------

const MODULES_DATA = [
  { name: 'Dashboard', description: 'Vue d\'ensemble des indicateurs', icon: 'LayoutDashboard', category: 'general', orderIndex: 1 },
  { name: 'Caisse', description: 'Gestion des opérations de caisse', icon: 'Wallet', category: 'operations', orderIndex: 2 },
  { name: 'Crédits', description: 'Gestion des crédits et prêts', icon: 'CreditCard', category: 'finance', orderIndex: 3 },
  { name: 'Remboursements', description: 'Suivi des remboursements', icon: 'Banknote', category: 'finance', orderIndex: 4 },
  { name: 'Clients', description: 'Gestion des clients', icon: 'Users', category: 'operations', orderIndex: 5 },
  { name: 'Épargnes', description: 'Gestion des comptes épargne', icon: 'PiggyBank', category: 'finance', orderIndex: 6 },
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
  'Épargnes': [
    { name: 'Voir les épargnes', code: 'epargnes.view', description: 'Accès au module Épargnes' },
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
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Administrateur': ['*'],
  'Chef d\'Agence': [
    'dashboard.view',
    'caisse.view', 'caisse.open', 'caisse.close', 'caisse.deposit', 'caisse.withdraw', 'caisse.transfer',
    'credits.view', 'credits.create', 'credits.approve', 'credits.reject', 'credits.disburse', 'credits.collect',
    'remboursements.view', 'remboursements.create',
    'clients.view', 'clients.create', 'clients.edit',
    'epargnes.view', 'epargnes.create', 'epargnes.deposit', 'epargnes.withdraw',
    'tontines.view', 'tontines.create', 'tontines.manage',
    'comptabilite.view', 'comptabilite.reports',
    'agent.view',
    'transferts.view',
    'rapports.view', 'rapports.export',
    'rh.view', 'rh.create', 'rh.edit',
    'communications.view',
    'messages.view', 'messages.send',
  ],
  'Agent Caisse': [
    'dashboard.view',
    'caisse.view', 'caisse.open', 'caisse.close', 'caisse.deposit', 'caisse.withdraw',
    'clients.view', 'clients.create',
    'epargnes.view', 'epargnes.deposit', 'epargnes.withdraw',
    'credits.view', 'credits.collect',
    'remboursements.view', 'remboursements.create',
    'messages.view', 'messages.send',
  ],
  'Agent Terrain': [
    'dashboard.view',
    'clients.view', 'clients.create',
    'agent.view', 'agent.collect', 'agent.visit',
    'credits.view', 'credits.collect',
    'epargnes.view', 'epargnes.deposit',
    'communications.view',
    'messages.view', 'messages.send',
  ],
  'Comptable': [
    'dashboard.view',
    'comptabilite.view', 'comptabilite.write', 'comptabilite.reports',
    'credits.view',
    'epargnes.view',
    'rapports.view', 'rapports.export', 'rapports.schedule',
    'caisse.view',
    'audit.view',
  ],
  'Gestionnaire Crédit': [
    'dashboard.view',
    'credits.view', 'credits.create', 'credits.approve', 'credits.reject', 'credits.disburse', 'credits.collect',
    'clients.view', 'clients.create', 'clients.edit',
    'remboursements.view', 'remboursements.create',
    'rapports.view',
  ],
  'Superviseur': [
    'dashboard.view',
    'caisse.view',
    'credits.view',
    'clients.view',
    'epargnes.view',
    'tontines.view',
    'agent.view',
    'rapports.view', 'rapports.export',
  ],
};

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const monthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

const monthsFromNow = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
};

const dateOnly = (date: Date) => date.toISOString().split('T')[0];

// ----------------------------------------------------------------------
// SEED FUNCTION
// ----------------------------------------------------------------------

async function seedDemo() {
  console.log('🌱 Starting DEMO seed...\n');

  try {
    // 1. FULL WIPE
    console.log('🧹 Wiping database...');

    await db.delete(lignesFactures);
    await db.delete(factures);
    await db.delete(modelesFactures);
    await db.delete(comptageBillets);
    await db.delete(shiftsCaisse);
    await db.delete(caisseCodeUsages);
    await db.delete(caisseAssignations);
    await db.delete(caisseSecurityCodes);
    await db.delete(codeGenerationPermissions);
    await db.delete(posDevices);
    await db.delete(operationsCaisse);
    await db.delete(caisseTransferts);
    await db.delete(sessionsCaisse);
    await db.delete(caisses);

    await db.delete(paiementsTerrain);
    await db.delete(visitesTerrain);
    await db.delete(prospections);
    await db.delete(objectifsMensuels);
    await db.delete(agentsTerrain);
    await db.delete(agentLocationLogs);

    await db.delete(tontineAlertes);
    await db.delete(tontineDistributions);
    await db.delete(tontinePenalites);
    await db.delete(contributionsTontine);
    await db.delete(membresTontine);
    await db.delete(tontineRegles);
    await db.delete(tontines);

    await db.delete(transfertAuditLogs);
    await db.delete(transfertWebhooks);
    await db.delete(transfertLimits);
    await db.delete(transfertBlacklist);
    await db.delete(transfertReconciliation);
    await db.delete(otpValidations);
    await db.delete(transferts);
    await db.delete(kycLevels);

    await db.delete(plansEpargne);
    await db.delete(remboursements);
    await db.delete(credits);
    await db.delete(enquetesCredit);
    await db.delete(demandesCredit);
    await db.delete(objectifsEpargne);
    await db.delete(transactionsEpargne);
    await db.delete(comptesEpargne);
    await db.delete(interestRates);

    await db.delete(transactionsBourse);
    await db.delete(ordresBourse);
    await db.delete(positionsBourse);
    await db.delete(portefeuillesBourse);
    await db.delete(watchlistBourse);
    // Moved employes deletion down to avoid FK constraint violations with hr tables

    await db.delete(clientTags);
    await db.delete(clientActivities);
    await db.delete(historiquePoints);
    await db.delete(clients);
    await db.delete(tags);
    
    // Types de Marchés
    console.log('Clearing typesMarches table...');
    await db.delete(typesMarches);

    await db.delete(formationParticipants);
    await db.delete(formations);
    await db.delete(demandesConges);
    await db.delete(sanctions);
    await db.delete(bulletinsPaie);
    await db.delete(avantagesEmployes);
    await db.delete(avantages);
    await db.delete(presences);
    await db.delete(horairesTravail);
    await db.delete(candidatures);

    await db.delete(documents);
    await db.delete(logeSettings);
    await db.delete(employes);

    await db.delete(pushNotificationLogs);
    await db.delete(notificationPreferences);
    await db.delete(pushSubscriptions);
    await db.delete(smsNotifications);
    await db.delete(smsTemplates);
    await db.delete(smsProviderSettings);
    await db.delete(notifications);
    await db.delete(auditLogs);

    await db.delete(messages);
    await db.delete(loginAttempts);
    await db.delete(activeSessions);
    await db.delete(userPermissions);
    await db.delete(userAgences);

    await db.delete(declarationsTva);
    await db.delete(lignesEcritures);
    await db.delete(ecritures);
    await db.delete(journaux);
    await db.delete(comptes);
    await db.delete(exercices);

    await db.delete(systemSettings);
    await db.delete(featureFlags);
    await db.delete(securitySettings);
    await db.delete(uiCustomization);

    await db.delete(rolePermissions);
    await db.delete(permissions);
    await db.delete(modules);

    await db.delete(users);
    await db.delete(agences);
    await db.delete(zones);

    console.log('   ✅ Database verified empty');

    // 2. SEED GEOGRAPHY
    console.log('\n🏢 Seeding Geography (Zones & Agences)...');

    const zonesData = [
      { nom: 'Centre-Ville', ville: 'Brazzaville', description: 'Zone commerciale centrale', statut: 'Actif' },
      { nom: 'Poto-Poto', ville: 'Brazzaville', description: 'Zone résidentielle dense', statut: 'Actif' },
      { nom: 'Bacongo', ville: 'Brazzaville', description: 'Zone administrative et historique', statut: 'Actif' },
      { nom: 'Talangaï', ville: 'Brazzaville', description: 'Zone nord populaire', statut: 'Actif' },
      { nom: 'Mpila', ville: 'Brazzaville', description: 'Zone industrielle', statut: 'Actif' },
      { nom: 'Moungali', ville: 'Brazzaville', description: 'Quartier populaire', statut: 'Actif' },
      { nom: 'Makélékélé', ville: 'Brazzaville', description: 'Grand quartier sud', statut: 'Actif' },
      { nom: 'Ouenzé', ville: 'Brazzaville', description: 'Commerce et habitation', statut: 'Actif' },
      { nom: 'Mfilou', ville: 'Brazzaville', description: 'Zone périphérique ouest', statut: 'Actif' },
      { nom: 'Madibou', ville: 'Brazzaville', description: 'Extension sud', statut: 'Actif' },
      { nom: 'Centre-ville', ville: 'Pointe-Noire', description: 'Centre des affaires', statut: 'Actif' },
      { nom: 'Loandjili', ville: 'Pointe-Noire', description: 'Zone résidentielle', statut: 'Actif' },
      { nom: 'Tié-Tié', ville: 'Pointe-Noire', description: 'Grand quartier populaire', statut: 'Actif' },
    ];

    await db.insert(zones).values(zonesData);

    const agencesData = [
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
      },
      {
        nom: 'Agence Nord',
        code: 'NORD',
        adresse: 'Talangaï, Brazzaville',
        ville: 'Brazzaville',
        region: 'Nord',
        isSiege: false,
        latitude: '-4.2468',
        longitude: '15.2661',
        telephone: '+242060000110',
        email: 'nord@cofin.com',
        dateOuverture: '2019-06-15',
      },
      {
        nom: 'Agence Sud',
        code: 'SUD',
        adresse: 'Bacongo, Brazzaville',
        ville: 'Brazzaville',
        region: 'Sud',
        isSiege: false,
        latitude: '-4.2867',
        longitude: '15.2812',
        telephone: '+242060000120',
        email: 'sud@cofin.com',
        dateOuverture: '2020-03-20',
      },
      {
        nom: 'Agence Est',
        code: 'EST',
        adresse: 'Mpila, Brazzaville',
        ville: 'Brazzaville',
        region: 'Est',
        isSiege: false,
        latitude: '-4.2551',
        longitude: '15.3012',
        telephone: '+242060000130',
        email: 'est@cofin.com',
        dateOuverture: '2021-11-10',
      },
    ];

    const insertedAgences: Record<string, string> = {};

    for (const a of agencesData) {
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

    // 4. SEED SYSTEM SETTINGS
    console.log('\n⚙️ Seeding Settings & Feature Flags...');

    await db.insert(systemSettings).values({
      agenceName: 'COFIN - Microfinance',
      agenceCode: 'COF-DEMO',
      devise: 'XAF',
      pays: 'République du Congo',
      adresse: 'Boulevard Denis Sassou, Brazzaville',
      telephone: '+242060000000',
      email: 'contact@cofin.com',
      sessionTimeout: 45,
      maxLoginAttempts: 5,
      passwordMinLength: 8,
      backupFrequency: 'daily',
      autoBackupEnabled: true,
      notificationEmailEnabled: true,
      notificationSmsEnabled: true,
      smsPaymentValidationEnabled: true,
      mobileMoneyEnabled: true,
      maintenanceMode: false,
    });

    await db.insert(securitySettings).values({
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecial: false,
      sessionTimeoutMinutes: 30,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
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
      apiKey: 'demo-key',
      apiUrl: 'https://api.infobip.com',
      senderId: 'COFIN',
      username: 'cofin_demo',
      password: 'secret',
      balance: '50000',
      enabled: true,
      isPrimary: true,
      isActive: true,
      settings: { mode: 'sandbox' },
    });

    await db.insert(smsTemplates).values([
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
    ]);

    console.log('   ✅ Settings configured');

    // 5. SEED ACCOUNTING (PLAN & JOURNAUX)
    console.log('\n📚 Seeding Accounting Plan...');

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const [exerciceCurrent] = await db.insert(exercices).values({
      code: `${currentYear}`,
      dateDebut: `${currentYear}-01-01`,
      dateFin: `${currentYear}-12-31`,
      statut: 'Ouvert',
      description: `Exercice comptable ${currentYear}`,
    }).returning();

    const [exercicePrevious] = await db.insert(exercices).values({
      code: `${previousYear}`,
      dateDebut: `${previousYear}-01-01`,
      dateFin: `${previousYear}-12-31`,
      statut: 'Clôturé',
      description: `Exercice comptable ${previousYear}`,
    }).returning();

    const planComptable = [
      // Classe 1: Capitaux
      { num: '101', label: 'Capital social', classe: 1, type: 'Capitaux', sens: 'Crédit' },
      { num: '1011', label: 'Capital souscrit, non appelé', classe: 1, type: 'Capitaux', sens: 'Débit' },
      { num: '1012', label: 'Capital souscrit, appelé, non versé', classe: 1, type: 'Capitaux', sens: 'Débit' },
      { num: '12', label: 'Report à nouveau', classe: 1, type: 'Capitaux', sens: 'Crédit' },
      { num: '13', label: 'Résultat net de l\'exercice', classe: 1, type: 'Capitaux', sens: 'Crédit' },
      { num: '164', label: 'Emprunts bancaires', classe: 1, type: 'Capitaux', sens: 'Crédit' },
      
      // Classe 2: Immobilisations
      { num: '211', label: 'Immobilisations incorporelles', classe: 2, type: 'Actif', sens: 'Débit' },
      { num: '22', label: 'Terrains', classe: 2, type: 'Actif', sens: 'Débit' },
      { num: '23', label: 'Bâtiments', classe: 2, type: 'Actif', sens: 'Débit' },
      { num: '24', label: 'Matériel et équipements', classe: 2, type: 'Actif', sens: 'Débit' },
      
      // Classe 3: Stocks
      { num: '31', label: 'Marchandises', classe: 3, type: 'Actif', sens: 'Débit' },
      { num: '32', label: 'Matières premières', classe: 3, type: 'Actif', sens: 'Débit' },

      // Classe 4: Tiers
      { num: '401', label: 'Fournisseurs', classe: 4, type: 'Passif', sens: 'Crédit' },
      { num: '411', label: 'Clients', classe: 4, type: 'Actif', sens: 'Débit' },
      { num: '42', label: 'Personnel', classe: 4, type: 'Passif', sens: 'Crédit' },
      { num: '43', label: 'Sécurité Sociale', classe: 4, type: 'Passif', sens: 'Crédit' },
      { num: '44', label: 'État et Collectivités Publiques', classe: 4, type: 'Passif', sens: 'Crédit' },
      { num: '443', label: 'TVA Facturée', classe: 4, type: 'Passif', sens: 'Crédit' },
      { num: '445', label: 'TVA Récupérable', classe: 4, type: 'Actif', sens: 'Débit' },

      // Classe 5: Trésorerie
      { num: '512', label: 'Banque', classe: 5, type: 'Actif', sens: 'Débit' },
      { num: '521', label: 'Banque Locale', classe: 5, type: 'Actif', sens: 'Débit' },
      { num: '571', label: 'Caisse Siège', classe: 5, type: 'Actif', sens: 'Débit' },
      { num: '572', label: 'Caisse Agence Nord', classe: 5, type: 'Actif', sens: 'Débit' },
      { num: '573', label: 'Caisse Agence Sud', classe: 5, type: 'Actif', sens: 'Débit' },
      { num: '574', label: 'Caisse Agence Est', classe: 5, type: 'Actif', sens: 'Débit' },
      
      // Classe 6: Charges
      { num: '601', label: 'Achats marchandises', classe: 6, type: 'Charge', sens: 'Débit' },
      { num: '602', label: 'Achats matières premières', classe: 6, type: 'Charge', sens: 'Débit' },
      { num: '61', label: 'Transports', classe: 6, type: 'Charge', sens: 'Débit' },
      { num: '62', label: 'Services extérieurs', classe: 6, type: 'Charge', sens: 'Débit' },
      { num: '63', label: 'Impôts et taxes', classe: 6, type: 'Charge', sens: 'Débit' },
      { num: '640', label: 'Charges de personnel (Général)', classe: 6, type: 'Charge', sens: 'Débit' },
      { num: '661', label: 'Rémunération du personnel', classe: 6, type: 'Charge', sens: 'Débit' },
      
      // Classe 7: Produits
      { num: '701', label: 'Ventes marchandises', classe: 7, type: 'Produit', sens: 'Crédit' },
      { num: '702', label: 'Ventes produits finis', classe: 7, type: 'Produit', sens: 'Crédit' },
      { num: '706', label: 'Services vendus', classe: 7, type: 'Produit', sens: 'Crédit' },
      { num: '71', label: 'Subventions d\'exploitation', classe: 7, type: 'Produit', sens: 'Crédit' },
    ];

    const insertedComptes: Record<string, string> = {};
    for (const cpt of planComptable) {
      const [inserted] = await db.insert(comptes).values({
        numeroCompte: cpt.num,
        intitule: cpt.label,
        classe: cpt.classe,
        typeCompte: cpt.type,
        sensNormal: cpt.sens,
        actif: true,
      }).returning();
      insertedComptes[cpt.num] = inserted.id;
    }

    const journalsData = [
      { code: 'VE', label: 'Journal des Ventes', type: 'Vente' },
      { code: 'AC', label: 'Journal des Achats', type: 'Achat' },
      { code: 'BQ', label: 'Journal de Banque', type: 'Trésorerie' },
      { code: 'CA', label: 'Journal de Caisse', type: 'Trésorerie' },
      { code: 'OD', label: 'Opérations Diverses', type: 'Général' },
      { code: 'PA', label: 'Journal de Paie', type: 'Général' },
    ];

    const insertedJournaux: Record<string, string> = {};
    for (const j of journalsData) {
      const [inserted] = await db.insert(journaux).values({
        code: j.code,
        intitule: j.label,
        typeJournal: j.type,
        actif: true,
      }).returning();
      insertedJournaux[j.code] = inserted.id;
    }

    console.log('   ✅ Accounting plan configured');

    // 6. SEED USERS
    console.log('\n👥 Seeding Users...');

    const hashedAdmin = await hashPassword('admin123');
    const hashedDefault = await hashPassword('password123');
    const hashedPin = await hashPassword('123456');

    const coreUsers = [
      {
        username: 'admin',
        password: hashedAdmin,
        role: ROLES.ADMIN,
        nom: 'Administrateur',
        prenom: 'Système',
        email: 'admin@cofin.com',
        telephone: '+242060000001',
        agence: 'Siège',
        statut: 'Actif',
        mustChangePassword: false,
        matricule: 'ADM-001',
        poste: 'Administrateur',
        departement: 'Direction',
        dateEmbauche: '2018-01-10',
        typeContrat: 'CDI',
        salaireBase: 900000,
        caissePin: hashedPin, // Set default PIN for testing
      },
      {
        username: 'chef_siege',
        password: hashedDefault,
        role: ROLES.CHEF,
        nom: 'Mballa',
        prenom: 'Jean',
        email: 'chef.siege@cofin.com',
        telephone: '+242060000002',
        agence: 'Siège',
        statut: 'Actif',
        matricule: 'CHF-SIEGE-01',
        poste: 'Chef d\'Agence',
        departement: 'Direction',
        dateEmbauche: '2019-03-01',
        typeContrat: 'CDI',
        salaireBase: 650000,
        caissePin: hashedPin,
      },
      {
        username: 'chef_nord',
        password: hashedDefault,
        role: ROLES.CHEF,
        nom: 'Ondoa',
        prenom: 'Marc',
        email: 'chef.nord@cofin.com',
        telephone: '+242060000003',
        agence: 'Agence Nord',
        statut: 'Actif',
        matricule: 'CHF-NORD-01',
        poste: 'Chef d\'Agence',
        departement: 'Direction',
        dateEmbauche: '2020-02-01',
        typeContrat: 'CDI',
        salaireBase: 630000,
        caissePin: hashedPin,
      },
      {
        username: 'chef_sud',
        password: hashedDefault,
        role: ROLES.CHEF,
        nom: 'Bikoumou',
        prenom: 'Eric',
        email: 'chef.sud@cofin.com',
        telephone: '+242060000004',
        agence: 'Agence Sud',
        statut: 'Actif',
        matricule: 'CHF-SUD-01',
        poste: 'Chef d\'Agence',
        departement: 'Direction',
        dateEmbauche: '2020-05-12',
        typeContrat: 'CDI',
        salaireBase: 620000,
        caissePin: hashedPin,
      },
      {
        username: 'chef_est',
        password: hashedDefault,
        role: ROLES.CHEF,
        nom: 'Ossa',
        prenom: 'Luc',
        email: 'chef.est@cofin.com',
        telephone: '+242060000005',
        agence: 'Agence Est',
        statut: 'Actif',
        matricule: 'CHF-EST-01',
        poste: 'Chef d\'Agence',
        departement: 'Direction',
        dateEmbauche: '2021-01-20',
        typeContrat: 'CDI',
        salaireBase: 610000,
        caissePin: hashedPin,
      },
      {
        username: 'comptable_siege',
        password: hashedDefault,
        role: ROLES.COMPTABLE,
        nom: 'Ngoma',
        prenom: 'Patrick',
        email: 'compta@cofin.com',
        telephone: '+242060000006',
        agence: 'Siège',
        statut: 'Actif',
        matricule: 'CPT-001',
        poste: 'Comptable',
        departement: 'Comptabilité',
        dateEmbauche: '2021-08-01',
        typeContrat: 'CDI',
        salaireBase: 500000,
      },
      {
        username: 'superviseur',
        password: hashedDefault,
        role: ROLES.SUPERVISEUR,
        nom: 'Ekoka',
        prenom: 'Brice',
        email: 'superviseur@cofin.com',
        telephone: '+242060000007',
        agence: 'Siège',
        statut: 'Actif',
        matricule: 'SUP-001',
        poste: 'Superviseur',
        departement: 'Supervision',
        dateEmbauche: '2020-09-15',
        typeContrat: 'CDI',
        salaireBase: 520000,
        caissePin: hashedPin,
      },
      {
        username: 'rh_manager',
        password: hashedDefault,
        role: 'rh',
        nom: 'Mouyabi',
        prenom: 'Claudine',
        email: 'rh@cofin.com',
        telephone: '+242060000008',
        agence: 'Siège',
        statut: 'Actif',
        matricule: 'RH-001',
        poste: 'Responsable RH',
        departement: 'Ressources Humaines',
        dateEmbauche: '2020-04-10',
        typeContrat: 'CDI',
        salaireBase: 480000,
      },
      {
        username: 'direction',
        password: hashedDefault,
        role: 'direction',
        nom: 'Nguimbi',
        prenom: 'Alain',
        email: 'direction@cofin.com',
        telephone: '+242060000009',
        agence: 'Siège',
        statut: 'Actif',
        matricule: 'DIR-001',
        poste: 'Directeur Général',
        departement: 'Direction',
        dateEmbauche: '2017-06-01',
        typeContrat: 'CDI',
        salaireBase: 1200000,
      },
      {
        username: 'agent_interne',
        password: hashedDefault,
        role: 'agent',
        nom: 'Support',
        prenom: 'Interne',
        email: 'agent.interne@cofin.com',
        telephone: '+242060000010',
        agence: 'Siège',
        statut: 'Actif',
        mustChangePassword: true,
        matricule: 'AG-INT-01',
        poste: 'Agent Support',
        departement: 'Support',
        dateEmbauche: '2022-02-01',
        typeContrat: 'CDD',
        salaireBase: 280000,
      },
    ];

    const insertedUsers: Record<string, any> = {};

    const insertedCoreUsers = await db.insert(users).values(coreUsers).returning();
    for (const user of insertedCoreUsers) {
      if (user.username) {
        insertedUsers[user.username] = user;
      }
    }

    const agenciesList = ['Siège', 'Agence Nord', 'Agence Sud', 'Agence Est'];
    const staffRoles = [
      { role: ROLES.CAISSE, prefix: 'caisse', count: 2, label: 'Caissier', poste: 'Caissier' },
      { role: ROLES.CREDIT, prefix: 'credit', count: 2, label: 'Gestionnaire', poste: 'Gestionnaire Crédit' },
      { role: ROLES.TERRAIN, prefix: 'agent', count: 2, label: 'Agent', poste: 'Agent Terrain' },
    ];

    const staffGroups: Record<string, any[]> = { Caissiers: [], Agents: [], Credits: [] };
    let phoneCounter = 1000000;

    for (const agenceName of agenciesList) {
      const slug = agenceName === 'Siège' ? 'siege' : agenceName.includes('Nord') ? 'nord' : agenceName.includes('Sud') ? 'sud' : 'est';
      const manager = insertedUsers[`chef_${slug}`] || insertedUsers['chef_siege'];

      for (const roleConfig of staffRoles) {
        for (let i = 1; i <= roleConfig.count; i++) {
          const username = `${roleConfig.prefix}_${slug}_${i}`;
          const matricule = `${roleConfig.prefix.substring(0, 2).toUpperCase()}-${slug.toUpperCase()}-${i}`;

          const telephone = `+24206${String(phoneCounter).padStart(7, '0')}`;
          phoneCounter += 1;

          const [user] = await db.insert(users).values({
            username,
            password: hashedDefault,
            role: roleConfig.role,
            nom: `${roleConfig.label} ${slug.toUpperCase()}${i}`,
            prenom: 'Staff',
            email: `${username}@cofin.com`,
            telephone,
            agence: agenceName,
            statut: 'Actif',
            matricule,
            poste: roleConfig.poste,
            departement: roleConfig.role === ROLES.TERRAIN ? 'Terrain' : roleConfig.role === ROLES.CAISSE ? 'Caisse' : 'Crédit',
            dateEmbauche: dateOnly(monthsAgo(12 + i * 2)),
            managerId: manager?.id,
            salaireBase: roleConfig.role === ROLES.TERRAIN ? 250000 : 300000,
            caissePin: (roleConfig.role === ROLES.CAISSE || roleConfig.role === ROLES.TERRAIN) ? hashedPin : null,
          }).returning();

          insertedUsers[username] = user;

          if (roleConfig.role === ROLES.TERRAIN) staffGroups.Agents.push(user);
          if (roleConfig.role === ROLES.CAISSE) staffGroups.Caissiers.push(user);
          if (roleConfig.role === ROLES.CREDIT) staffGroups.Credits.push(user);
        }
      }
    }

    const totalUsers = Object.keys(insertedUsers).length;
    console.log(`   ✅ ${totalUsers} utilisateurs créés :`);
    console.log(`      - 10 utilisateurs principaux (Direction, Chefs, Comptable, RH, etc.)`);
    console.log(`      - ${staffGroups.Caissiers.length} caissiers (2 par agence)`);
    console.log(`      - ${staffGroups.Credits.length} gestionnaires crédit (2 par agence)`);
    console.log(`      - ${staffGroups.Agents.length} agents terrain (2 par agence)`);


    // 7. USER-AGENCES & AUTH ARTIFACTS
    console.log('\n🔗 Seeding User-Agency links & Auth artifacts...');

    const userAgencesData: Array<{ userId: string; agenceId: string; isPrimary: boolean; role?: string }> = [];

    for (const user of Object.values(insertedUsers)) {
      const agenceId = user.agence ? insertedAgences[user.agence] : undefined;
      if (agenceId) {
        userAgencesData.push({ userId: user.id, agenceId, isPrimary: true, role: user.role });
      }
    }

    const adminUser = insertedUsers['admin'];
    if (adminUser) {
      for (const agenceId of Object.values(insertedAgences)) {
        if (!userAgencesData.find(entry => entry.userId === adminUser.id && entry.agenceId === agenceId)) {
          userAgencesData.push({ userId: adminUser.id, agenceId, isPrimary: false, role: adminUser.role });
        }
      }
    }

    await db.insert(userAgences).values(userAgencesData);

    await db.insert(userPermissions).values([
      {
        userId: staffGroups.Caissiers[0]?.id,
        moduleName: 'Caisse',
        peutVoir: true,
        peutCreer: true,
        peutModifier: false,
        peutSupprimer: false,
        peutValider: true,
        peutExporter: false,
      },
      {
        userId: staffGroups.Agents[0]?.id,
        moduleName: 'Clients',
        peutVoir: true,
        peutCreer: true,
        peutModifier: true,
        peutSupprimer: false,
        peutValider: false,
        peutExporter: false,
      },
    ]);

    await db.insert(loginAttempts).values([
      { username: 'admin', ipAddress: '192.168.1.10', success: true, reason: null },
      { username: 'chef_siege', ipAddress: '192.168.1.12', success: false, reason: 'invalid_credentials' },
      { username: 'chef_siege', ipAddress: '192.168.1.12', success: true, reason: null },
      { username: 'caisse_siege_1', ipAddress: '192.168.1.20', success: true, reason: null },
      { username: 'agent_nord_1', ipAddress: '192.168.1.33', success: false, reason: 'invalid_password' },
      { username: 'agent_nord_1', ipAddress: '192.168.1.33', success: true, reason: null },
      { username: 'credit_sud_2', ipAddress: '192.168.2.14', success: false, reason: 'account_locked' },
      { username: 'credit_sud_2', ipAddress: '192.168.2.14', success: true, reason: null },
      { username: 'caisse_est_2', ipAddress: '192.168.3.18', success: false, reason: 'account_disabled' },
      { username: 'agent_sud_2', ipAddress: '192.168.4.22', success: true, reason: null },
    ]);

    await db.insert(activeSessions).values([
      {
        sessionId: 'sess_admin_demo',
        userId: adminUser.id,
        ipAddress: '192.168.1.10',
        userAgent: 'Mozilla/5.0',
        deviceType: 'Desktop',
        browser: 'Chrome',
        os: 'Windows',
        location: 'Brazzaville',
        loginAt: daysAgo(1),
        lastActivity: new Date(),
        expiresAt: daysFromNow(1),
        isActive: true,
      },
    ]);

    console.log('   ✅ User-agency links and auth logs created');

    // 8. SEED TYPES DE MARCHÉS & TAGS
    console.log('\n🏷️ Seeding Types de Marchés & Tags...');

    const typesMarchesData = [
      { nom: 'Marché Total', description: 'Grand marché central', actif: true },
      { nom: 'Marché Ouenze', description: 'Marché quartier Ouenze', actif: true },
      { nom: 'Marché Poto-Poto', description: 'Marché textile et divers', actif: true },
      { nom: 'Marché Bourreau', description: 'Petit marché de proximité', actif: true },
      { nom: 'Commerces de Rue', description: 'Vendeurs ambulants et boutiques', actif: true }
    ];

    const insertedTypesMarches = await db.insert(typesMarches).values(typesMarchesData).returning();
    const typesMarchesByName: Record<string, string> = {};
    for (const t of insertedTypesMarches) {
      typesMarchesByName[t.nom] = t.id;
    }

    const tagsData = [
      { name: 'VIP', color: '#f59e0b', type: 'category' },
      { name: 'Risque', color: '#ef4444', type: 'risk' },
      { name: 'Nouveau', color: '#22c55e', type: 'status' },
      { name: 'Retard', color: '#f97316', type: 'risk' },
      { name: 'KYC', color: '#0ea5e9', type: 'category' },
    ];

    const insertedTags = await db.insert(tags).values(tagsData).returning();
    const tagsByName: Record<string, string> = {};
    for (const t of insertedTags) {
      tagsByName[t.name] = t.id;
    }

    console.log('   ✅ Types marchés & tags created');

    // 9. SEED CLIENTS & LOYALTY
    console.log('\n🧍 Seeding Clients & Loyalty (80 clients avec Faker)...');

    // Configuration pour générer 80 clients
    const TOTAL_CLIENTS = 80;
    const clientAgencesList = ['Siège', 'Agence Nord', 'Agence Sud', 'Agence Est'];
    const typesMarchesKeys = Object.keys(typesMarchesByName);
    const clientStatuses = ['Actif', 'Actif', 'Actif', 'Actif', 'Actif', 'Suspendu', 'Inactif']; // 70% actif

    // Générer les clients avec Faker
    const generatedClients: any[] = [];
    const usedPhones = new Set<string>();

    for (let i = 0; i < TOTAL_CLIENTS; i++) {
      const { nom, prenom, gender } = generateCongoleseName();
      let telephone = generateCongolesePhone();
      while (usedPhones.has(telephone)) {
        telephone = generateCongolesePhone();
      }
      usedPhones.add(telephone);

      const coords = generateBrazzavilleCoords();
      const agence = clientAgencesList[i % clientAgencesList.length];
      const segment = i < 8 ? 'VIP' : i < 24 ? 'Premium' : 'Standard'; // 10% VIP, 20% Premium, 70% Standard
      const professionnel = Math.random() > 0.3; // 70% professionnels
      const monthsBack = randomBetween(1, 18);

      generatedClients.push({
        nom,
        prenom,
        telephone,
        email: `${nom.toLowerCase()}.${prenom.toLowerCase().replace(/[éèê]/g, 'e')}${i}@mail.cg`,
        agence,
        agenceId: insertedAgences[agence],
        adresse: `${randomBetween(1, 500)} ${randomFromArray(BRAZZAVILLE_QUARTIERS)}`,
        ville: 'Brazzaville',
        profession: professionnel ? randomFromArray(PROFESSIONS) : 'Salarié',
        revenuMensuel: professionnel ? generateRealisticAmount(200000, 1500000, 50000) : generateRealisticAmount(100000, 500000, 25000),
        typePiece: randomFromArray(['CNI', 'Passeport', 'Permis de conduire']),
        numeroPiece: `${randomFromArray(['CNI', 'PP', 'PD'])}-${String(randomBetween(100000, 999999))}`,
        typeMarcheId: typesMarchesByName[randomFromArray(typesMarchesKeys)],
        segment,
        status: randomFromArray(clientStatuses),
        latitude: coords.latitude,
        longitude: coords.longitude,
        score: segment === 'VIP' ? randomBetween(75, 95) : segment === 'Premium' ? randomBetween(60, 80) : randomBetween(35, 70),
        pointsFidelite: segment === 'VIP' ? randomBetween(150, 500) : segment === 'Premium' ? randomBetween(50, 200) : randomBetween(0, 100),
        creditTotal: '0', // Sera mis à jour après création des crédits
        epargneTotal: '0', // Sera mis à jour après création des comptes épargne
        tauxRemboursement: String(randomBetween(85, 100)),
        limiteRetraitJournalier: segment === 'VIP' ? '5000000' : segment === 'Premium' ? '3000000' : '2000000',
        limiteRetraitHebdomadaire: segment === 'VIP' ? '20000000' : segment === 'Premium' ? '15000000' : '10000000',
        limiteRetraitMensuel: segment === 'VIP' ? '50000000' : segment === 'Premium' ? '40000000' : '30000000',
        dateInscription: monthsAgo(monthsBack),
        createdBy: adminUser.id,
        createdAt: monthsAgo(monthsBack),
        derniereActivite: daysAgo(randomBetween(0, 30)),
      });
    }

    const insertedClients = await db.insert(clients).values(generatedClients).returning();

    // Référencer quelques clients clés pour utilisation ultérieure
    const clientKouassi = insertedClients[0];
    const clientNguesso = insertedClients[1];
    const clientTaty = insertedClients[2];
    const clientMakosso = insertedClients[3];
    const clientOkemba = insertedClients[4];
    const clientItoua = insertedClients[5];
    const clientMoukassa = insertedClients[6];
    const clientGoma = insertedClients[7];
    const clientMbemba = insertedClients[8];
    const clientNsona = insertedClients[9];
    const clientMabanza = insertedClients[10];
    const clientMassamba = insertedClients[11];

    // Assigner des tags aux clients
    const clientTagsData: Array<{ clientId: string; tagId: string }> = [];

    // VIP tags pour les 8 premiers clients VIP
    for (let i = 0; i < 8; i++) {
      clientTagsData.push({ clientId: insertedClients[i].id, tagId: tagsByName['VIP'] });
      if (i % 2 === 0) {
        clientTagsData.push({ clientId: insertedClients[i].id, tagId: tagsByName['KYC'] });
      }
    }

    // Tags Risque pour quelques clients (statut Suspendu)
    insertedClients.filter(c => c.status === 'Suspendu').slice(0, 5).forEach(c => {
      clientTagsData.push({ clientId: c.id, tagId: tagsByName['Risque'] });
    });

    // Tags Nouveau pour les clients récents
    insertedClients.filter(c => {
      const inscDate = c.dateInscription ?? c.createdAt ?? new Date();
      return (Date.now() - new Date(inscDate).getTime()) < 30 * 24 * 60 * 60 * 1000; // 30 jours
    }).slice(0, 10).forEach(c => {
      clientTagsData.push({ clientId: c.id, tagId: tagsByName['Nouveau'] });
    });

    // Tags Retard pour quelques clients inactifs
    insertedClients.filter(c => c.status === 'Inactif').slice(0, 3).forEach(c => {
      clientTagsData.push({ clientId: c.id, tagId: tagsByName['Retard'] });
    });

    await db.insert(clientTags).values(clientTagsData);

    // Générer des activités pour les clients (plus de volume)
    const clientActivitiesData: any[] = [];
    const activityTypes = ['call', 'visit', 'payment', 'update', 'alert'];
    const activityDescriptions: Record<string, string[]> = {
      call: ['Appel de suivi effectué', 'Rappel échéance crédit', 'Confirmation de rendez-vous', 'Relance commerciale'],
      visit: ['Visite terrain pour enquête crédit', 'Vérification d\'adresse', 'Collecte de documents', 'Évaluation activité'],
      payment: ['Paiement de cotisation tontine', 'Remboursement crédit', 'Versement épargne', 'Paiement frais de dossier'],
      update: ['Mise à jour dossier KYC', 'Modification coordonnées', 'Changement de segment', 'Actualisation revenus'],
      alert: ['Client en retard de remboursement', 'Limite de crédit atteinte', 'Compte inactif depuis 30 jours', 'Anomalie détectée'],
    };

    for (const client of insertedClients.slice(0, 50)) { // Activités pour les 50 premiers clients
      const numActivities = randomBetween(1, 5);
      for (let j = 0; j < numActivities; j++) {
        const type = randomFromArray(activityTypes);
        clientActivitiesData.push({
          clientId: client.id,
          type,
          description: randomFromArray(activityDescriptions[type]),
          metadata: JSON.stringify({
            date: daysAgo(randomBetween(0, 60)).toISOString(),
            agent: staffGroups.Agents[randomBetween(0, staffGroups.Agents.length - 1)]?.nom || 'Système'
          }),
          createdAt: daysAgo(randomBetween(0, 60)),
        });
      }
    }

    await db.insert(clientActivities).values(clientActivitiesData);

    // Générer l'historique des points de fidélité
    const historiquePointsData: any[] = [];
    const pointsTypes = ['EPARGNE', 'CREDIT_REMBOURSEMENT', 'TONTINE', 'BONUS', 'DEPENSE'];

    for (const client of insertedClients) {
      const numPointsEntries = randomBetween(0, 8);
      let cumulatedPoints = 0;

      for (let j = 0; j < numPointsEntries; j++) {
        const type = randomFromArray(pointsTypes);
        const isDebit = type === 'DEPENSE';
        const points = isDebit ? -randomBetween(10, 50) : randomBetween(10, 150);
        cumulatedPoints += points;

        historiquePointsData.push({
          clientId: client.id,
          points,
          type,
          description: type === 'EPARGNE' ? 'Bonus épargne'
            : type === 'CREDIT_REMBOURSEMENT' ? 'Remboursement crédit'
            : type === 'TONTINE' ? 'Cotisation tontine'
            : type === 'BONUS' ? 'Bonus fidélité'
            : 'Utilisation points cadeaux',
          montantAssocie: isDebit ? randomBetween(1000, 10000) : randomBetween(10000, 200000),
          createdAt: daysAgo(randomBetween(0, 180)),
        });
      }
    }

    await db.insert(historiquePoints).values(historiquePointsData);

    console.log(`   ✅ Created ${insertedClients.length} clients with ${clientActivitiesData.length} activities and ${historiquePointsData.length} points entries`);

    // 10. SEED FINANCE (INTEREST, EPARGNE, CREDITS) - Version enrichie avec Faker
    console.log('\n💰 Seeding Finance (80 comptes épargne, 40+ crédits, 12 mois d\'historique)...');

    // Taux d'intérêt
    await db.insert(interestRates).values([
      { nom: 'Crédit Standard', code: 'CREDIT_STD', tauxAnnuel: '12', tauxMensuel: '1', type: 'credit', actif: true },
      { nom: 'Crédit Premium', code: 'CREDIT_PREM', tauxAnnuel: '9', tauxMensuel: '0.75', type: 'credit', actif: true },
      { nom: 'Crédit Urgence', code: 'CREDIT_URG', tauxAnnuel: '18', tauxMensuel: '1.5', type: 'credit', actif: true },
      { nom: 'Épargne Classique', code: 'EPARGNE_STD', tauxAnnuel: '3', tauxMensuel: '0.25', type: 'epargne', actif: true },
      { nom: 'Épargne Projet', code: 'EPARGNE_PRO', tauxAnnuel: '4', tauxMensuel: '0.33', type: 'epargne', actif: true },
      { nom: 'Épargne Bloquée', code: 'EPARGNE_BLQ', tauxAnnuel: '5', tauxMensuel: '0.42', type: 'epargne', actif: true },
    ]);

    // Générer des comptes épargne pour tous les clients
    const comptesEpargneData = insertedClients.map((client, index) => {
      const statut = client.status === 'Suspendu' ? 'Suspendu' : client.status === 'Inactif' ? 'Inactif' : 'Actif';
      const monthsBack = randomBetween(1, 18);
      const typeCompte = randomFromArray(EPARGNE_TYPES);
      const soldeBase = client.segment === 'VIP' ? randomBetween(200000, 1500000)
        : client.segment === 'Premium' ? randomBetween(50000, 500000)
        : randomBetween(5000, 150000);

      return {
        clientId: client.id,
        numeroCompte: `EP-${String(index + 1).padStart(5, '0')}`,
        typeCompte,
        tauxInteret: typeCompte === 'Epargne Bloquée' ? '5.0' : typeCompte === 'Epargne Projet' ? '4.0' : '3.0',
        solde: generateRealisticAmount(soldeBase, soldeBase * 1.5, 1000),
        statut,
        objectifEpargne: typeCompte === 'Epargne Projet' ? generateRealisticAmount(500000, 2000000, 100000) : null,
        versementMensuel: typeCompte === 'Epargne Projet' ? generateRealisticAmount(25000, 100000, 5000) : null,
        agenceId: client.agenceId,
        dateOuverture: monthsAgo(monthsBack),
      };
    });

    const insertedComptesEpargne = await db.insert(comptesEpargne).values(comptesEpargneData).returning();
    const compteByClientId: Record<string, any> = {};
    for (const compte of insertedComptesEpargne) {
      compteByClientId[compte.clientId] = compte;
    }

    // Générer un historique de transactions sur 12 mois pour chaque compte
    const transactionsEpargneData: any[] = [];
    let transactionCounter = 1;

    for (const compte of insertedComptesEpargne) {
      let soldeActuel = 0;
      const numTransactions = randomBetween(5, 25); // 5 à 25 transactions par compte
      const accountAge = Math.min(12, Math.ceil((Date.now() - new Date(compte.dateOuverture ?? new Date()).getTime()) / (30 * 24 * 60 * 60 * 1000)));

      for (let t = 0; t < numTransactions; t++) {
        const isDeposit = t === 0 || Math.random() > 0.3; // Premier toujours dépôt, sinon 70% dépôts
        const montant = isDeposit
          ? parseInt(generateRealisticAmount(5000, 100000, 1000))
          : Math.min(soldeActuel * 0.5, parseInt(generateRealisticAmount(5000, 50000, 1000)));

        if (!isDeposit && montant <= 0) continue; // Skip if insufficient balance

        soldeActuel = isDeposit ? soldeActuel + montant : soldeActuel - montant;

        const daysBack = randomBetween(0, accountAge * 30);
        transactionsEpargneData.push({
          compteId: compte.id,
          typeTransaction: isDeposit ? 'Depot' : 'Retrait',
          montant: String(montant),
          soldeApres: String(soldeActuel),
          methodePaiement: randomFromArray(PAYMENT_METHODS),
          reference: `${isDeposit ? 'DEP' : 'RET'}-EP-${String(transactionCounter++).padStart(5, '0')}`,
          observations: isDeposit
            ? randomFromArray(['Dépôt mensuel', 'Versement régulier', 'Épargne projet', 'Bonus commercial', 'Virement reçu'])
            : randomFromArray(['Retrait urgent', 'Besoin personnel', 'Frais scolaires', 'Achat matériel', 'Retrait partiel']),
          createdAt: daysAgo(daysBack),
        });
      }
    }

    // Insérer les transactions par lots pour éviter les problèmes de performance
    const batchSize = 100;
    for (let i = 0; i < transactionsEpargneData.length; i += batchSize) {
      await db.insert(transactionsEpargne).values(transactionsEpargneData.slice(i, i + batchSize));
    }

    // Générer des objectifs d'épargne pour les comptes Epargne Projet
    const objectifsEpargneData: any[] = [];
    const objectifNames = ['Achat stock', 'Projet école', 'Mariage', 'Voyage', 'Équipement', 'Logement', 'Retraite', 'Urgences'];

    insertedComptesEpargne.filter(c => c.typeCompte === 'Epargne Projet').forEach((compte, idx) => {
      objectifsEpargneData.push({
        compteId: compte.id,
        nom: randomFromArray(objectifNames),
        montantCible: compte.objectifEpargne || generateRealisticAmount(500000, 2000000, 100000),
        montantActuel: generateRealisticAmount(50000, parseInt(compte.objectifEpargne || '500000') * 0.8, 10000),
        dateCible: monthsFromNow(randomBetween(3, 24)),
        description: faker.lorem.sentence(),
        statut: Math.random() > 0.8 ? 'Atteint' : 'En cours',
      });
    });

    await db.insert(objectifsEpargne).values(objectifsEpargneData);

    // Générer 40 demandes de crédit avec différents statuts
    const DEMANDE_STATUSES = ['En attente', 'En cours d\'analyse', 'Approuvée', 'Rejetée', 'Déboursé', 'Annulée'];
    const demandesData: any[] = [];

    for (let i = 0; i < 40; i++) {
      const client = insertedClients[i % insertedClients.length];
      const clientRevenu = parseInt(client.revenuMensuel || '300000');
      const montantDemande = parseInt(generateRealisticAmount(100000, Math.min(clientRevenu * 6, 2000000), 50000));
      const statut = randomFromArray(DEMANDE_STATUSES);
      const isApproved = ['Approuvée', 'Déboursé'].includes(statut);

      demandesData.push({
        numeroDemande: `DEM-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${String(i + 1).padStart(4, '0')}`,
        clientId: client.id,
        montantDemande: String(montantDemande),
        tauxInteret: String(randomBetween(9, 18)),
        dureeMois: randomBetween(3, 24),
        typeCredit: randomFromArray(CREDIT_TYPES),
        objetCredit: randomFromArray(CREDIT_OBJECTS),
        frequenceRemboursement: randomFromArray(['Mensuel', 'Hebdomadaire', 'Bi-mensuel']),
        revenusMensuels: String(clientRevenu),
        chargesMensuelles: generateRealisticAmount(clientRevenu * 0.2, clientRevenu * 0.5, 10000),
        scoreCredit: randomBetween(35, 95),
        montantApprouve: isApproved ? generateRealisticAmount(montantDemande * 0.7, montantDemande, 50000) : null,
        statut,
        createdBy: staffGroups.Credits[i % staffGroups.Credits.length]?.id || staffGroups.Agents[0]?.id,
        createdAt: daysAgo(randomBetween(1, 180)),
      });
    }

    const insertedDemandes = await db.insert(demandesCredit).values(demandesData).returning();

    // Générer des enquêtes pour les demandes approuvées ou déboursées
    const enquetesData: any[] = [];
    const RECOMMANDATIONS = ['Favorable', 'Sous conditions', 'Défavorable', 'À approfondir'];
    const HABITATIONS = ['Propriétaire', 'Locataire', 'Hébergé', 'Logement de fonction'];
    const EVALUATIONS = ['Très bonne', 'Bonne', 'Moyenne', 'Faible'];

    insertedDemandes.filter(d => ['Approuvée', 'Déboursé', 'En cours d\'analyse'].includes(d.statut)).forEach((demande, idx) => {
      enquetesData.push({
        clientId: demande.clientId,
        demandeId: demande.id,
        montantDemande: demande.montantDemande,
        objetCredit: demande.objetCredit,
        revenuMensuel: demande.revenusMensuels,
        chargesMensuelles: demande.chargesMensuelles,
        autrePrets: generateRealisticAmount(0, 200000, 25000),
        personnesCharge: randomBetween(0, 8),
        typeHabitation: randomFromArray(HABITATIONS),
        ancienneteActivite: randomBetween(1, 20),
        evaluationActivite: randomFromArray(EVALUATIONS),
        capaciteRemboursement: generateRealisticAmount(
          parseInt(demande.revenusMensuels || '300000') * 0.3,
          parseInt(demande.revenusMensuels || '300000') * 0.6,
          10000
        ),
        scoreGlobal: demande.scoreCredit || randomBetween(40, 90),
        recommandation: demande.statut === 'Déboursé' ? 'Favorable' : randomFromArray(RECOMMANDATIONS),
        statut: demande.statut === 'Déboursé' ? 'Validée' : demande.statut === 'Approuvée' ? 'Validée' : 'En cours',
        observations: faker.lorem.sentence(),
        createdBy: staffGroups.Agents[idx % staffGroups.Agents.length]?.id,
        createdAt: daysAgo(randomBetween(5, 60)),
      });
    });

    const insertedEnquetes = await db.insert(enquetesCredit).values(enquetesData).returning();

    // Générer 35 crédits actifs avec différents statuts
    const creditsData: any[] = [];
    const CREDIT_STATUTS_WEIGHTED = ['Actif', 'Actif', 'Actif', 'En retard', 'Soldé', 'Soldé', 'Soldé', 'En attente', 'Rejeté'];
    const GARANTIES = ['Caution', 'Matériel', 'Stock', 'Hypothèque', 'Véhicule', 'Nantissement', 'Aucune'];

    for (let i = 0; i < 35; i++) {
      const client = insertedClients[i % insertedClients.length];
      const statut = randomFromArray(CREDIT_STATUTS_WEIGHTED);
      const montant = parseInt(generateRealisticAmount(100000, 1500000, 50000));
      const duree = randomBetween(3, 24);
      const taux = randomBetween(9, 18);
      const enquete = insertedEnquetes[i % insertedEnquetes.length];

      const dateDebutDays = statut === 'Soldé' ? randomBetween(120, 365) : randomBetween(30, 180);
      const soldeRestant = statut === 'Soldé' ? 0
        : statut === 'Rejeté' ? 0
        : Math.round(montant * (0.3 + Math.random() * 0.6));

      creditsData.push({
        numeroCredit: `CRED-${currentYear}${(i + 1).toString().padStart(4, '0')}`,
        clientId: client.id,
        enqueteId: enquete?.id,
        montant: String(montant),
        taux: String(taux),
        duree,
        typeCredit: randomFromArray(CREDIT_TYPES),
        objetCredit: randomFromArray(CREDIT_OBJECTS),
        statut,
        dateDebut: ['Actif', 'En retard', 'Soldé'].includes(statut) ? daysAgo(dateDebutDays) : null,
        dateFin: ['Actif', 'En retard'].includes(statut) ? daysFromNow(duree * 30 - dateDebutDays) : statut === 'Soldé' ? daysAgo(randomBetween(1, 60)) : null,
        dateSolde: statut === 'Soldé' ? daysAgo(randomBetween(1, 30)) : null,
        soldeRestant: String(soldeRestant),
        echeance: randomFromArray(['Mensuel', 'Hebdomadaire', 'Bi-mensuel']),
        garanties: randomFromArray(GARANTIES),
        agenceId: client.agenceId,
        createdBy: staffGroups.Credits[i % staffGroups.Credits.length]?.id,
        createdAt: daysAgo(dateDebutDays + randomBetween(5, 30)),
      });
    }

    const insertedCredits = await db.insert(credits).values(creditsData).returning();

    // Générer des remboursements pour les crédits actifs et soldés
    const remboursementsData: any[] = [];
    let remboursementCounter = 1;

    insertedCredits.filter(c => ['Actif', 'En retard', 'Soldé'].includes(c.statut)).forEach(credit => {
      const montantCredit = parseInt(credit.montant || '0');
      const soldeRestant = parseInt(credit.soldeRestant || '0');
      const montantRembourse = montantCredit - soldeRestant;

      if (montantRembourse <= 0) return;

      const numRemboursements = randomBetween(1, 8);
      let totalRembourse = 0;

      for (let r = 0; r < numRemboursements && totalRembourse < montantRembourse; r++) {
        const montant = Math.min(
          parseInt(generateRealisticAmount(20000, 150000, 5000)),
          montantRembourse - totalRembourse
        );
        totalRembourse += montant;

        remboursementsData.push({
          creditId: credit.id,
          montant: String(montant),
          dateRemboursement: daysAgo(randomBetween(1, 120)),
          methodePaiement: randomFromArray(PAYMENT_METHODS),
          numeroTransaction: `REM-${String(remboursementCounter++).padStart(5, '0')}`,
          observations: randomFromArray(['Remboursement mensuel', 'Remboursement anticipé', 'Paiement partiel', 'Échéance régulière']),
          createdBy: staffGroups.Caissiers[r % staffGroups.Caissiers.length]?.id,
          createdAt: daysAgo(randomBetween(1, 90)),
        });
      }
    });

    await db.insert(remboursements).values(remboursementsData);

    // Générer des plans d'épargne liés aux crédits
    const plansEpargneData: any[] = [];
    insertedCredits.filter(c => c.statut === 'Actif').slice(0, 10).forEach((credit, idx) => {
      const compte = compteByClientId[credit.clientId];
      if (!compte) return;

      plansEpargneData.push({
        creditId: credit.id,
        clientId: credit.clientId,
        compteEpargneId: compte.id,
        montantMensuel: generateRealisticAmount(15000, 75000, 5000),
        duree: credit.duree,
        montantTotal: generateRealisticAmount(200000, 800000, 50000),
        dateDebut: daysAgo(randomBetween(30, 90)),
        dateFin: daysFromNow(randomBetween(180, 365)),
        statut: 'Actif',
        observations: 'Plan épargne lié au crédit',
        createdBy: staffGroups.Credits[idx % staffGroups.Credits.length]?.id,
      });
    });

    await db.insert(plansEpargne).values(plansEpargneData);

    console.log(`   ✅ Finance data created: ${insertedComptesEpargne.length} comptes, ${transactionsEpargneData.length} transactions, ${insertedCredits.length} crédits, ${remboursementsData.length} remboursements`);

    // 11. SEED TONTINES - Données enrichies avec Faker
    console.log('\n🤝 Seeding Tontines...');

    // Créer 8 tontines variées
    const tontinesData = [
      {
        nom: 'Tontine Marché Total (Journalière)',
        description: 'Tontine journalière pour commerçants du marché Total - collecte quotidienne',
        typeDistribution: 'Rotation',
        montantCotisation: '1000',
        tauxPlateforme: '2',
        frequence: 'Journalier',
        intervalleCotisation: 1,
        delaiPenalite: 2,
        nombreMembres: 15,
        statut: 'actif',
        dateDebut: daysAgo(120),
        agenceId: insertedAgences['Siège'],
        gestionnaireId: insertedUsers['chef_siege']?.id,
      },
      {
        nom: 'Tontine Hebdomadaire Nord - Entrepreneurs',
        description: 'Cotisation hebdomadaire pour petits entrepreneurs zone Nord',
        typeDistribution: 'Cagnotte',
        montantCotisation: '5000',
        tauxPlateforme: '1.5',
        frequence: 'Hebdomadaire',
        intervalleCotisation: 1,
        delaiPenalite: 3,
        nombreMembres: 12,
        statut: 'Active',
        dateDebut: daysAgo(90),
        agenceId: insertedAgences['Agence Nord'],
        gestionnaireId: insertedUsers['chef_nord']?.id,
      },
      {
        nom: 'Tontine Femmes Commerçantes',
        description: 'Tontine exclusive pour femmes commerçantes - solidarité féminine',
        typeDistribution: 'Rotation',
        montantCotisation: '2500',
        tauxPlateforme: '1.5',
        frequence: 'Hebdomadaire',
        intervalleCotisation: 1,
        delaiPenalite: 3,
        nombreMembres: 20,
        statut: 'Active',
        dateDebut: daysAgo(180),
        agenceId: insertedAgences['Agence Sud'],
        gestionnaireId: insertedUsers['chef_sud']?.id,
      },
      {
        nom: 'Tontine Mensuelle Premium',
        description: 'Tontine mensuelle pour contributions importantes',
        typeDistribution: 'Cagnotte',
        montantCotisation: '50000',
        tauxPlateforme: '1',
        frequence: 'Mensuel',
        intervalleCotisation: 1,
        delaiPenalite: 5,
        nombreMembres: 10,
        statut: 'Active',
        dateDebut: daysAgo(240),
        agenceId: insertedAgences['Siège'],
        gestionnaireId: insertedUsers['chef_siege']?.id,
      },
      {
        nom: 'Tontine Est Artisans',
        description: 'Pour les artisans et menuisiers de la zone Est',
        typeDistribution: 'Rotation',
        montantCotisation: '3000',
        tauxPlateforme: '2',
        frequence: 'Hebdomadaire',
        intervalleCotisation: 1,
        delaiPenalite: 2,
        nombreMembres: 8,
        statut: 'Active',
        dateDebut: daysAgo(60),
        agenceId: insertedAgences['Agence Est'],
        gestionnaireId: insertedUsers['chef_est']?.id,
      },
      {
        nom: 'Tontine Spéciale Sud - Terminée',
        description: 'Tontine clôturée avec succès',
        typeDistribution: 'Rotation',
        montantCotisation: '2000',
        tauxPlateforme: '2',
        frequence: 'Mensuel',
        intervalleCotisation: 1,
        delaiPenalite: 2,
        nombreMembres: 6,
        statut: 'Clôturée',
        dateDebut: daysAgo(200),
        dateFin: daysAgo(20),
        agenceId: insertedAgences['Agence Sud'],
        gestionnaireId: insertedUsers['chef_sud']?.id,
      },
      {
        nom: 'Tontine Rentrée Scolaire 2024',
        description: 'Tontine clôturée pour préparation rentrée scolaire',
        typeDistribution: 'Cagnotte',
        montantCotisation: '10000',
        tauxPlateforme: '1.5',
        frequence: 'Mensuel',
        intervalleCotisation: 1,
        delaiPenalite: 3,
        nombreMembres: 15,
        statut: 'Clôturée',
        dateDebut: daysAgo(300),
        dateFin: daysAgo(90),
        agenceId: insertedAgences['Agence Nord'],
        gestionnaireId: insertedUsers['chef_nord']?.id,
      },
      {
        nom: 'Tontine Projet Construction',
        description: 'Tontine suspendue temporairement - problème de collecte',
        typeDistribution: 'Rotation',
        montantCotisation: '25000',
        tauxPlateforme: '1',
        frequence: 'Mensuel',
        intervalleCotisation: 1,
        delaiPenalite: 5,
        nombreMembres: 12,
        statut: 'Suspendue',
        dateDebut: daysAgo(150),
        agenceId: insertedAgences['Siège'],
        gestionnaireId: insertedUsers['chef_siege']?.id,
      },
    ];

    const insertedTontines = await db.insert(tontines).values(
      tontinesData.map(t => ({ ...t, membresActuels: 0, createdBy: adminUser.id }))
    ).returning();

    // Mapping pour accès facile
    const tontineByName: Record<string, typeof insertedTontines[0]> = {};
    insertedTontines.forEach(t => { tontineByName[t.nom] = t; });

    // Distribuer les clients dans les tontines (40 membres au total)
    const clientsForTontines = insertedClients.slice(0, 50); // 50 premiers clients
    const tontineMembersData: Array<{
      tontineId: string;
      clientId: string;
      statut: string;
      position: number;
    }> = [];

    // Assigner aléatoirement les clients aux tontines
    const positionByTontine: Record<string, number> = {};
    const activeTontines = insertedTontines.filter(t => t.statut !== 'Clôturée' && t.statut !== 'Suspendue');

    clientsForTontines.forEach((client, idx) => {
      // Chaque client peut être membre de 1-2 tontines
      const numTontines = randomBetween(1, 2);
      const selectedTontines = faker.helpers.arrayElements(activeTontines, numTontines) as typeof activeTontines;

      selectedTontines.forEach(tontine => {
        const nextPos = (positionByTontine[tontine.id] || 0) + 1;
        if (nextPos <= tontine.nombreMembres) { // Ne pas dépasser la limite
          positionByTontine[tontine.id] = nextPos;
          tontineMembersData.push({
            tontineId: tontine.id,
            clientId: client.id,
            statut: faker.helpers.weightedArrayElement([
              { value: 'Actif', weight: 85 },
              { value: 'En retard', weight: 10 },
              { value: 'Suspendu', weight: 5 },
            ]),
            position: nextPos,
          });
        }
      });
    });

    // Ajouter aussi des membres aux tontines clôturées
    const closedTontines = insertedTontines.filter(t => t.statut === 'Clôturée');
    closedTontines.forEach((tontine, tIdx) => {
      const membersForClosed = clientsForTontines.slice(tIdx * 6, (tIdx + 1) * 6);
      membersForClosed.forEach((client, pos) => {
        tontineMembersData.push({
          tontineId: tontine.id,
          clientId: client.id,
          statut: 'Terminé',
          position: pos + 1,
        });
      });
    });

    // Insérer les membres
    const insertedMembres = await db.insert(membresTontine).values(
      tontineMembersData.map(m => ({
        ...m,
        totalCotisations: '0',
        totalRecus: '0',
      }))
    ).returning();

    // Générer un historique de contributions sur 6 mois (beaucoup plus de données)
    const contributionsData: any[] = [];
    let contributionCounter = 1;

    for (const membre of insertedMembres) {
      const tontine = insertedTontines.find(t => t.id === membre.tontineId);
      if (!tontine) continue;

      // Nombre de contributions basé sur la fréquence et l'ancienneté
      let numContributions = 0;
      if (tontine.frequence === 'Journalier') {
        numContributions = randomBetween(60, 90); // 2-3 mois de contributions journalières
      } else if (tontine.frequence === 'Hebdomadaire') {
        numContributions = randomBetween(12, 24); // 3-6 mois de contributions hebdo
      } else {
        numContributions = randomBetween(3, 8); // Quelques contributions mensuelles
      }

      for (let c = 0; c < numContributions; c++) {
        const isLate = faker.datatype.boolean({ probability: 0.1 }); // 10% de retards
        const isPaid = faker.datatype.boolean({ probability: 0.95 }); // 95% payées

        contributionsData.push({
          tontineId: tontine.id,
          membreId: membre.id,
          montant: tontine.montantCotisation,
          statut: isPaid ? 'Validé' : (isLate ? 'En retard' : 'En attente'),
          methodePaiement: randomFromArray(PAYMENT_METHODS),
          reference: `TONT-${String(contributionCounter++).padStart(6, '0')}`,
          dateEcheance: daysAgo(c * (tontine.frequence === 'Journalier' ? 1 : tontine.frequence === 'Hebdomadaire' ? 7 : 30)),
          createdAt: daysAgo(c * (tontine.frequence === 'Journalier' ? 1 : tontine.frequence === 'Hebdomadaire' ? 7 : 30) + (isLate ? randomBetween(1, 5) : 0)),
        });
      }
    }

    // Insérer par lots de 200
    for (let i = 0; i < contributionsData.length; i += 200) {
      const batch = contributionsData.slice(i, i + 200);
      await db.insert(contributionsTontine).values(batch);
    }

    // Créer des règles pour chaque tontine active
    const reglesData: any[] = [];
    activeTontines.forEach(tontine => {
      reglesData.push(
        { tontineId: tontine.id, typeRegle: 'retard', montantPenalite: String(Math.round(Number(tontine.montantCotisation) * 0.1)), description: 'Pénalité pour retard de cotisation' },
        { tontineId: tontine.id, typeRegle: 'absence', montantPenalite: String(Math.round(Number(tontine.montantCotisation) * 0.5)), description: 'Pénalité pour absence prolongée' },
        { tontineId: tontine.id, typeRegle: 'abandon', montantPenalite: String(Math.round(Number(tontine.montantCotisation) * 2)), description: 'Pénalité pour abandon de tontine' },
      );
    });
    const insertedRegles = await db.insert(tontineRegles).values(reglesData).returning();

    // Créer des pénalités pour les membres en retard
    const penalitesData: any[] = [];
    const membresEnRetard = insertedMembres.filter(m => m.statut === 'En retard');
    membresEnRetard.forEach(membre => {
      const tontineRegles = insertedRegles.filter(r => r.tontineId === membre.tontineId && r.typeRegle === 'retard');
      if (tontineRegles.length > 0) {
        penalitesData.push({
          tontineId: membre.tontineId,
          membreId: membre.id,
          regleId: tontineRegles[0].id,
          montant: tontineRegles[0].montantPenalite,
          statut: faker.helpers.arrayElement(['impaye', 'paye', 'annule']),
          motif: `Retard de cotisation - ${randomBetween(1, 5)} jours`,
        });
      }
    });
    if (penalitesData.length > 0) {
      await db.insert(tontinePenalites).values(penalitesData);
    }

    // Créer des distributions pour les tontines clôturées et en rotation
    const distributionsData: any[] = [];
    let distributionCounter = 1;

    closedTontines.forEach(tontine => {
      const tontineMembers = insertedMembres.filter(m => m.tontineId === tontine.id);
      tontineMembers.forEach((membre, idx) => {
        distributionsData.push({
          tontineId: tontine.id,
          membreId: membre.id,
          tourNumero: idx + 1,
          montantTotal: String(Number(tontine.montantCotisation) * tontine.nombreMembres),
          modePaiement: randomFromArray(['ESPECES', 'MOBILE_MONEY', 'VIREMENT']),
          referencePaiement: `DIST-${String(distributionCounter++).padStart(4, '0')}`,
          notes: faker.helpers.arrayElement(['Distribution régulière', 'Paiement effectué', 'Tour terminé', 'Bénéficiaire satisfait']),
          createdAt: daysAgo(randomBetween(30, 180)),
        });
      });
    });
    if (distributionsData.length > 0) {
      await db.insert(tontineDistributions).values(distributionsData);
    }

    // Créer des alertes pour les situations problématiques
    const alertesData: any[] = [];
    membresEnRetard.slice(0, 10).forEach(membre => {
      alertesData.push({
        tontineId: membre.tontineId,
        membreId: membre.id,
        typeAlerte: faker.helpers.arrayElement(['Retard cotisation', 'Pénalité impayée', 'Contact impossible']),
        priorite: faker.helpers.arrayElement(['Haute', 'Moyenne', 'Basse']),
        message: faker.helpers.arrayElement([
          'Membre en retard sur la cotisation depuis 3 jours',
          'Pénalité non réglée - relance nécessaire',
          'Impossible de joindre le membre - vérifier coordonnées',
          'Demande de suspension temporaire à traiter',
        ]),
        statut: faker.helpers.arrayElement(['Active', 'Traitée', 'En cours']),
        createdAt: daysAgo(randomBetween(1, 30)),
      });
    });
    if (alertesData.length > 0) {
      await db.insert(tontineAlertes).values(alertesData);
    }

    // Mettre à jour le nombre de membres actuels pour chaque tontine
    for (const tontine of insertedTontines) {
      const memberCount = insertedMembres.filter(m => m.tontineId === tontine.id).length;
      await db.update(tontines).set({ membresActuels: memberCount }).where(eq(tontines.id, tontine.id));
    }

    console.log(`   ✅ Tontines: ${insertedTontines.length} tontines, ${insertedMembres.length} membres, ${contributionsData.length} contributions`);

    // 12. SEED AGENTS TERRAIN
    console.log('\n🏃 Seeding Field Agents & Operations...');

    const insertedAgents: any[] = [];
    for (const agentUser of staffGroups.Agents.slice(0, 3)) {
      const [agentProfile] = await db.insert(agentsTerrain).values({
        nom: agentUser.nom,
        prenom: agentUser.prenom,
        telephone: agentUser.telephone || '+242069990001',
        email: agentUser.email,
        zoneAffectation: 'Centre-Ville',
        zoneLatitude: '-4.2631',
        zoneLongitude: '15.2841',
        zoneRayon: '5',
        lastLatitude: '-4.2631',
        lastLongitude: '15.2841',
        lastSeenAt: daysAgo(1),
        statut: 'Actif',
        objectifMensuel: '1000000',
        totalProspections: 6,
        totalVisites: 8,
        totalPaiements: '250000',
        tauxConversion: '40',
      }).returning();
      insertedAgents.push(agentProfile);
    }

    for (const agent of insertedAgents) {
      await db.insert(objectifsMensuels).values({
        agentId: agent.id,
        annee: currentYear,
        mois: new Date().getMonth() + 1,
        montant: '1200000',
        notes: 'Objectif dynamique',
      });
    }

    await db.insert(prospections).values([
      {
        agentId: insertedAgents[0].id,
        nomProspect: 'Kaya',
        prenomProspect: 'Lionel',
        telephoneProspect: '+242061111111',
        adresseProspect: 'Poto-Poto',
        localisation: 'Poto-Poto',
        latitude: '-4.2710',
        longitude: '15.2760',
        typeActivite: 'Commerce',
        descriptionActivite: 'Vente de vêtements',
        revenuEstime: '300000',
        chiffreAffairesMensuel: '900000',
        interetCredit: true,
        montantSouhaite: '200000',
        objetCredit: 'Extension stock',
        statut: 'nouveau',
        priorite: 'normale',
        commentairesAgent: 'Prospect intéressé',
        dateProspection: daysAgo(3),
      },
      {
        agentId: insertedAgents[1].id,
        nomProspect: 'Biya',
        prenomProspect: 'Serge',
        telephoneProspect: '+242062222222',
        adresseProspect: 'Talangaï',
        localisation: 'Talangaï',
        latitude: '-4.2421',
        longitude: '15.2652',
        typeActivite: 'Restauration',
        descriptionActivite: 'Cuisine locale',
        revenuEstime: '400000',
        chiffreAffairesMensuel: '1100000',
        interetCredit: true,
        montantSouhaite: '350000',
        objetCredit: 'Matériel cuisine',
        statut: 'en_cours',
        priorite: 'haute',
        commentairesAgent: 'Besoin urgent',
        dateProspection: daysAgo(1),
      },
    ]);

    await db.insert(visitesTerrain).values([
      {
        agentId: insertedAgents[0].id,
        clientId: clientKouassi.id,
        typeVisite: 'Collecte',
        dateVisite: daysAgo(2),
        resultat: 'Effectué',
        statut: 'Terminée',
        observations: 'Client disponible',
        latitude: '-4.2631',
        longitude: '15.2841',
      },
      {
        agentId: insertedAgents[1].id,
        clientId: clientTaty.id,
        typeVisite: 'Enquête',
        dateVisite: daysAgo(4),
        resultat: 'À suivre',
        statut: 'Planifiée',
        observations: 'Besoin de justificatifs',
        latitude: '-4.2462',
        longitude: '15.2674',
      },
    ]);

    await db.insert(paiementsTerrain).values([
      {
        agentId: insertedAgents[0].id,
        clientId: clientKouassi.id,
        typePaiement: 'Collecte',
        montant: '5000',
        methodePaiement: 'Espèces',
        reference: 'COL-001',
        statut: 'Validé',
        dateValidation: daysAgo(1),
        observations: 'Collecte terrain',
      },
      {
        agentId: insertedAgents[1].id,
        clientId: clientTaty.id,
        typePaiement: 'Collecte',
        montant: '10000',
        methodePaiement: 'Mobile Money',
        reference: 'COL-002',
        statut: 'En attente',
        observations: 'En attente OTP',
      },
    ]);

    await db.insert(agentLocationLogs).values([
      {
        agentId: staffGroups.Agents[0]?.id,
        latitude: '-4.2629',
        longitude: '15.2835',
        accuracy: '12',
        speed: '0',
        heading: '180',
        batteryLevel: 78,
        capturedAt: daysAgo(1),
      },
      {
        agentId: staffGroups.Agents[0]?.id,
        latitude: '-4.2632',
        longitude: '15.2840',
        accuracy: '8',
        speed: '0',
        heading: '90',
        batteryLevel: 74,
        capturedAt: daysAgo(0),
      },
    ]);

    console.log('   ✅ Field agents data created');

    // 13. SEED CAISSE & OPERATIONS - Enrichi avec historique sur 3 mois
    console.log('\n🏧 Seeding Caisse Operations...');

    // Créer plus de caisses (une par agence + coffres-forts)
    const caissesData = [
      { nom: 'Caisse Siège 1', agenceId: insertedAgences['Siège'], type: 'Physique', solde: '1500000', statut: 'Ouverte' },
      { nom: 'Caisse Siège 2', agenceId: insertedAgences['Siège'], type: 'Physique', solde: '750000', statut: 'Ouverte' },
      { nom: 'Caisse Nord 1', agenceId: insertedAgences['Agence Nord'], type: 'Physique', solde: '800000', statut: 'Ouverte' },
      { nom: 'Caisse Sud 1', agenceId: insertedAgences['Agence Sud'], type: 'Physique', solde: '600000', statut: 'Fermée' },
      { nom: 'Caisse Est 1', agenceId: insertedAgences['Agence Est'], type: 'Physique', solde: '500000', statut: 'Ouverte' },
      { nom: 'Coffre-Fort Siège', agenceId: insertedAgences['Siège'], type: 'Coffre-Fort', solde: '5000000', statut: 'Fermée' },
      { nom: 'Coffre-Fort Nord', agenceId: insertedAgences['Agence Nord'], type: 'Coffre-Fort', solde: '2000000', statut: 'Fermée' },
    ];

    const insertedCaisses = await db.insert(caisses).values(caissesData).returning();
    const caisseByName: Record<string, typeof insertedCaisses[0]> = {};
    
    // Assign Caissiers to Caisses
    // Siège: caisse_siege_1 -> Caisse Siège 1, caisse_siege_2 -> Caisse Siège 2
    const siegeCaisse1 = insertedCaisses.find(c => c.nom === 'Caisse Siège 1');
    const siegeCaisse2 = insertedCaisses.find(c => c.nom === 'Caisse Siège 2');
    const caissierSiege1 = staffGroups.Caissiers.find(u => u.username === 'caisse_siege_1');
    const caissierSiege2 = staffGroups.Caissiers.find(u => u.username === 'caisse_siege_2');

    if (siegeCaisse1 && caissierSiege1) {
        await db.insert(caisseAssignations).values({ caisseId: siegeCaisse1.id, userId: caissierSiege1.id, assignedBy: adminUser.id });
    }
    if (siegeCaisse2 && caissierSiege2) {
        await db.insert(caisseAssignations).values({ caisseId: siegeCaisse2.id, userId: caissierSiege2.id, assignedBy: adminUser.id });
    }

    // Nord: caisse_nord_1 -> Caisse Nord 1
    const nordCaisse1 = insertedCaisses.find(c => c.nom === 'Caisse Nord 1');
    const caissierNord1 = staffGroups.Caissiers.find(u => u.username === 'caisse_nord_1');
    if (nordCaisse1 && caissierNord1) {
        await db.insert(caisseAssignations).values({ caisseId: nordCaisse1.id, userId: caissierNord1.id, assignedBy: adminUser.id });
    }
    
    // Also assign Admin to all Siege caisses for demo purposes
     if (siegeCaisse2) await db.insert(caisseAssignations).values({ caisseId: siegeCaisse2.id, userId: adminUser.id, assignedBy: adminUser.id });

    // Assign Restricted Roles to Caisse Siège 1 for testing
    const rhManager = insertedUsers['rh_manager'];
    const agentInterne = insertedUsers['agent_interne'];
    const agentTerrain1 = staffGroups.Agents[0];

    if (siegeCaisse1) {
        if (rhManager) await db.insert(caisseAssignations).values({ caisseId: siegeCaisse1.id, userId: rhManager.id, assignedBy: adminUser.id });
        if (agentInterne) await db.insert(caisseAssignations).values({ caisseId: siegeCaisse1.id, userId: agentInterne.id, assignedBy: adminUser.id });
        if (agentTerrain1) await db.insert(caisseAssignations).values({ caisseId: siegeCaisse1.id, userId: agentTerrain1.id, assignedBy: adminUser.id });
    }

    insertedCaisses.forEach(c => { caisseByName[c.nom] = c; });

    // Assigner des caissiers à chaque caisse
    const caissierAssignments = [
      { caisse: caisseByName['Caisse Siège 1'], caissier: staffGroups.Caissiers[0] },
      { caisse: caisseByName['Caisse Siège 2'], caissier: staffGroups.Caissiers[1] },
      { caisse: caisseByName['Caisse Nord 1'], caissier: staffGroups.Caissiers[2] },
      { caisse: caisseByName['Caisse Sud 1'], caissier: staffGroups.Caissiers[3] },
      { caisse: caisseByName['Caisse Est 1'], caissier: staffGroups.Caissiers[4] },
    ];

    // Générer un historique de shifts sur 90 jours
    const shiftsData: any[] = [];
    const sessionsData: any[] = [];

    for (let dayOffset = 90; dayOffset >= 0; dayOffset--) {
      // Ne pas créer de shifts les dimanches (jour 0)
      const date = daysAgo(dayOffset);
      if (date.getDay() === 0) continue;

      for (const assignment of caissierAssignments) {
        // 80% de chance d'avoir un shift ce jour
        if (faker.datatype.boolean({ probability: 0.8 })) {
          const soldeOuvertureStr = generateRealisticAmount(200000, 800000, 50000);
          const soldeOuverture = parseInt(soldeOuvertureStr);
          const isClosed = dayOffset > 1 || faker.datatype.boolean({ probability: 0.3 });
          const ecart = faker.datatype.boolean({ probability: 0.1 }) ? randomBetween(-5000, 5000) : 0;
          const soldeTheorique = soldeOuverture + parseInt(generateRealisticAmount(-100000, 200000, 10000));

          shiftsData.push({
            caisseId: assignment.caisse.id,
            agentId: assignment.caissier?.id,
            dateOuverture: date,
            dateFermeture: isClosed ? new Date(date.getTime() + 8 * 60 * 60 * 1000) : null, // +8h
            soldeOuverture: String(soldeOuverture),
            soldeFermeture: isClosed ? String(soldeTheorique + ecart) : null,
            soldeTheorique: isClosed ? String(soldeTheorique) : null,
            ecart: isClosed ? String(ecart) : null,
            statut: isClosed ? 'ferme' : 'ouvert',
          });
        }
      }
    }

    const insertedShifts = await db.insert(shiftsCaisse).values(shiftsData).returning();

    // Créer des sessions caisse correspondantes (une session par shift)
    for (const shift of insertedShifts) {
      const assignment = caissierAssignments.find(a => a.caisse.id === shift.caisseId);
      const agenceId = assignment?.caisse.agenceId;

      sessionsData.push({
        caissierId: shift.agentId,
        caisseId: shift.caisseId,
        soldeInitial: shift.soldeOuverture,
        soldeTheorique: shift.soldeTheorique || shift.soldeOuverture,
        soldeReel: shift.soldeFermeture,
        ecart: shift.ecart,
        statut: shift.statut === 'ferme' ? 'Fermée' : 'Ouverte',
        agenceId,
        dateOuverture: shift.dateOuverture,
        dateFermeture: shift.dateFermeture,
      });
    }

    const insertedSessions = await db.insert(sessionsCaisse).values(sessionsData).returning();

    // Générer des opérations caisse réparties dans le temps (500+ opérations)
    const operationsData: any[] = [];
    let operationCounter = 1;
    const operationTypes = ['Versement', 'Retrait', 'Dépôt épargne', 'Retrait épargne', 'Remboursement crédit', 'Frais de dossier', 'Cotisation tontine'];
    const operationDescriptions: Record<string, string[]> = {
      'Versement': ['Dépôt client', 'Versement en espèces', 'Alimentation compte'],
      'Retrait': ['Retrait client', 'Retrait partiel', 'Retrait espèces'],
      'Dépôt épargne': ['Versement épargne mensuel', 'Dépôt sur compte épargne', 'Alimentation épargne'],
      'Retrait épargne': ['Retrait partiel épargne', 'Clôture partielle', 'Retrait intérêts'],
      'Remboursement crédit': ['Échéance mensuelle', 'Remboursement anticipé', 'Paiement partiel'],
      'Frais de dossier': ['Frais ouverture compte', 'Frais demande crédit', 'Frais administratifs'],
      'Cotisation tontine': ['Cotisation hebdomadaire', 'Cotisation mensuelle', 'Rattrapage cotisation'],
    };

    // Pour chaque session, générer des opérations
    for (const session of insertedSessions) {
      const numOperations = randomBetween(5, 25); // 5-25 opérations par session

      for (let o = 0; o < numOperations; o++) {
        const type = randomFromArray(operationTypes);
        const isDebit = ['Retrait', 'Retrait épargne'].includes(type);
        const montant = generateRealisticAmount(
          isDebit ? 5000 : 10000,
          isDebit ? 100000 : 250000,
          5000
        );

        operationsData.push({
          sessionId: session.id,
          typeOperation: type,
          montant: String(montant),
          modePaiement: randomFromArray(PAYMENT_METHODS),
          reference: `OP-${String(operationCounter++).padStart(6, '0')}`,
          description: randomFromArray(operationDescriptions[type]),
          clientId: insertedClients[randomBetween(0, insertedClients.length - 1)].id,
          createdAt: session.dateOuverture,
        });
      }
    }

    // Insérer par lots
    const insertedOperations: any[] = [];
    for (let i = 0; i < operationsData.length; i += 100) {
      const batch = operationsData.slice(i, i + 100);
      const ops = await db.insert(operationsCaisse).values(batch).returning();
      insertedOperations.push(...ops);
    }

    // Générer des comptages de billets pour les shifts fermés
    const comptagesData: any[] = [];
    const closedShifts = insertedShifts.filter(s => s.statut === 'ferme').slice(0, 50); // 50 derniers

    for (const shift of closedShifts) {
      const total = Number(shift.soldeFermeture) || 180000;
      const billets10000 = Math.floor(total / 10000 * 0.6);
      const billets5000 = Math.floor((total - billets10000 * 10000) / 5000 * 0.7);
      const billets2000 = Math.floor((total - billets10000 * 10000 - billets5000 * 5000) / 2000);
      const billets1000 = Math.floor((total - billets10000 * 10000 - billets5000 * 5000 - billets2000 * 2000) / 1000);

      comptagesData.push({
        shiftId: shift.id,
        typeComptage: 'fermeture',
        billets10000,
        billets5000,
        billets2000,
        billets1000,
        billets500: 0,
        pieces250: 0,
        pieces100: 0,
        pieces50: 0,
        pieces25: 0,
        totalCalcule: String(total),
        totalDeclare: String(total),
        ecart: shift.ecart || '0',
        validePar: adminUser.id,
        dateValidation: shift.dateFermeture,
        observations: Number(shift.ecart) === 0 ? 'Fermeture normale' : `Écart de ${shift.ecart} XAF constaté`,
      });
    }

    if (comptagesData.length > 0) {
      await db.insert(comptageBillets).values(comptagesData);
    }

    // Créer des codes de sécurité pour les chefs d'agence
    const securityCodesData = [
      { agentId: insertedUsers['chef_siege']?.id, codeHash: hashedPin, active: true, expiresAt: daysFromNow(30) },
      { agentId: insertedUsers['chef_nord']?.id, codeHash: hashedPin, active: true, expiresAt: daysFromNow(30) },
      { agentId: insertedUsers['chef_sud']?.id, codeHash: hashedPin, active: true, expiresAt: daysFromNow(15) },
      { agentId: insertedUsers['chef_est']?.id, codeHash: hashedPin, active: false, expiresAt: daysAgo(5) }, // Expiré
    ];
    const insertedCodes = await db.insert(caisseSecurityCodes).values(securityCodesData).returning();

    // Historique d'utilisation des codes
    const codeUsagesData: any[] = [];
    for (const code of insertedCodes.filter(c => c.active)) {
      const numUsages = randomBetween(5, 20);
      for (let u = 0; u < numUsages; u++) {
        codeUsagesData.push({
          codeId: code.id,
          usedAt: daysAgo(randomBetween(0, 30)),
          success: faker.datatype.boolean({ probability: 0.95 }),
        });
      }
    }
    await db.insert(caisseCodeUsages).values(codeUsagesData);

    // Permissions de génération de codes
    await db.insert(codeGenerationPermissions).values([
      { managerId: insertedUsers['chef_siege']?.id, canGenerate: true },
      { managerId: insertedUsers['chef_nord']?.id, canGenerate: true },
      { managerId: insertedUsers['chef_sud']?.id, canGenerate: false },
    ]);

    // Terminaux POS
    await db.insert(posDevices).values([
      {
        agentId: staffGroups.Caissiers[0]?.id,
        caisseId: caisseByName['Caisse Siège 1'].id,
        deviceId: 'POS-SIEGE-001',
        nom: 'POS Siège Principal',
        modele: 'Sunmi V2',
        numeroSerie: 'SN-2024-0001',
        versionApp: '2.1.0',
        statut: 'actif',
      },
      {
        agentId: staffGroups.Caissiers[1]?.id,
        caisseId: caisseByName['Caisse Siège 2'].id,
        deviceId: 'POS-SIEGE-002',
        nom: 'POS Siège Secondaire',
        modele: 'Sunmi V2',
        numeroSerie: 'SN-2024-0002',
        versionApp: '2.1.0',
        statut: 'actif',
      },
      {
        agentId: staffGroups.Caissiers[2]?.id,
        caisseId: caisseByName['Caisse Nord 1'].id,
        deviceId: 'POS-NORD-001',
        nom: 'POS Nord',
        modele: 'PAX A930',
        numeroSerie: 'SN-2024-0003',
        versionApp: '2.0.5',
        statut: 'actif',
      },
      {
        agentId: staffGroups.Caissiers[4]?.id,
        caisseId: caisseByName['Caisse Est 1'].id,
        deviceId: 'POS-EST-001',
        nom: 'POS Est',
        modele: 'Ingenico Move5000',
        numeroSerie: 'SN-2024-0004',
        versionApp: '1.8.2',
        statut: 'maintenance',
      },
    ]);

    // Modèles de factures
    const [modeleStandard] = await db.insert(modelesFactures).values({
      nom: 'Facture Standard',
      code: 'STD',
      prefixeNumero: 'FAC',
      createdBy: staffGroups.Caissiers[0]?.id,
      afficherTva: false,
    }).returning();

    const [modeleTva] = await db.insert(modelesFactures).values({
      nom: 'Facture TVA',
      code: 'TVA',
      prefixeNumero: 'FAC-TVA',
      createdBy: staffGroups.Caissiers[0]?.id,
      afficherTva: true,
      tauxTva: '18',
    }).returning();

    const [modeleProforma] = await db.insert(modelesFactures).values({
      nom: 'Facture Proforma',
      code: 'PRO',
      prefixeNumero: 'PRO',
      createdBy: adminUser.id,
      afficherTva: true,
      tauxTva: '18',
    }).returning();

    // Générer des factures (30 factures)
    const facturesData: any[] = [];
    let factureCounter = 1;
    const factureStatuts = ['payee', 'emise', 'en_attente', 'annulee'];
    const lignesFacturesData: any[] = [];

    for (let f = 0; f < 30; f++) {
      const modele = randomFromArray([modeleStandard, modeleTva, modeleProforma]);
      const statut = faker.helpers.weightedArrayElement([
        { value: 'payee', weight: 60 },
        { value: 'emise', weight: 25 },
        { value: 'en_attente', weight: 10 },
        { value: 'annulee', weight: 5 },
      ]);
      const sousTotal = generateRealisticAmount(10000, 200000, 5000);
      const montantTva = modele.afficherTva === true ? Math.round(Number(sousTotal) * 0.18) : 0;

      facturesData.push({
        numero: `${modele.prefixeNumero}-2024-${String(factureCounter++).padStart(4, '0')}`,
        modeleId: modele.id,
        clientId: insertedClients[randomBetween(0, insertedClients.length - 1)].id,
        agentId: staffGroups.Caissiers[randomBetween(0, staffGroups.Caissiers.length - 1)]?.id,
        shiftId: insertedShifts[randomBetween(0, Math.min(10, insertedShifts.length - 1))].id,
        sousTotal: String(sousTotal),
        montantTva: String(montantTva),
        montantTotal: String(sousTotal + montantTva),
        statut,
        modePaiement: randomFromArray(PAYMENT_METHODS),
        operationCaisseId: statut === 'payee' && insertedOperations.length > 0
          ? insertedOperations[randomBetween(0, Math.min(50, insertedOperations.length - 1))].id
          : null,
        createdAt: daysAgo(randomBetween(0, 60)),
      });
    }

    const insertedFactures = await db.insert(factures).values(facturesData).returning();

    // Lignes de facture
    for (const facture of insertedFactures) {
      const numLignes = randomBetween(1, 4);
      for (let l = 0; l < numLignes; l++) {
        const quantite = randomBetween(1, 5);
        const prixUnitaire = generateRealisticAmount(5000, 50000, 1000);
        lignesFacturesData.push({
          factureId: facture.id,
          description: randomFromArray([
            'Frais de dossier',
            'Frais de service',
            'Commission',
            'Frais d\'adhésion',
            'Frais de gestion',
            'Pénalités de retard',
            'Assurance crédit',
          ]),
          quantite,
          prixUnitaire: String(prixUnitaire),
          montant: String(quantite * Number(prixUnitaire)),
        });
      }
    }
    await db.insert(lignesFactures).values(lignesFacturesData);

    // Transferts inter-caisses (15 transferts)
    const transfertsData: any[] = [];
    let transfertCounter = 1;
    const agencesList = Object.keys(insertedAgences);

    for (let t = 0; t < 15; t++) {
      const sourceAgence = randomFromArray(agencesList);
      const destAgence = randomFromArray(agencesList.filter(a => a !== sourceAgence));
      const sourceSession = insertedSessions.find(s => s.agenceId === insertedAgences[sourceAgence]);
      const destSession = insertedSessions.find(s => s.agenceId === insertedAgences[destAgence]);

      if (sourceSession) {
        transfertsData.push({
          sessionSourceId: sourceSession.id,
          sessionDestId: destSession?.id || null,
          agenceSourceId: insertedAgences[sourceAgence],
          agenceDestId: insertedAgences[destAgence],
          montant: String(generateRealisticAmount(50000, 500000, 25000)),
          statut: faker.helpers.weightedArrayElement([
            { value: 'valide', weight: 60 },
            { value: 'en_attente', weight: 25 },
            { value: 'rejete', weight: 10 },
            { value: 'annule', weight: 5 },
          ]),
          reference: `CTRF-${String(transfertCounter++).padStart(4, '0')}`,
          motif: randomFromArray([
            'Réapprovisionnement',
            'Excédent de caisse',
            'Transfert régulier',
            'Urgence liquidités',
            'Clôture période',
          ]),
          createdBy: insertedUsers['chef_siege']?.id,
          validatedBy: faker.datatype.boolean({ probability: 0.6 }) ? adminUser.id : null,
          dateCreation: daysAgo(randomBetween(0, 60)),
          dateValidation: faker.datatype.boolean({ probability: 0.6 }) ? daysAgo(randomBetween(0, 30)) : null,
        });
      }
    }

    await db.insert(caisseTransferts).values(transfertsData);

    console.log(`   ✅ Caisse: ${insertedCaisses.length} caisses, ${insertedShifts.length} shifts, ${insertedSessions.length} sessions, ${operationsData.length} opérations, ${insertedFactures.length} factures`);

    // 14. SEED TRANSFERS & KYC
    console.log('\n💸 Seeding Transfers...');

    await db.insert(kycLevels).values([
      {
        niveau: 1,
        nom: 'Standard',
        description: 'KYC de base',
        limiteTransactionJournaliere: '100000',
        limiteTransactionMensuelle: '500000',
        limiteTransactionUnique: '50000',
        documentsRequis: ['CNI'],
        actif: true,
      },
      {
        niveau: 2,
        nom: 'Verified',
        description: 'KYC vérifié',
        limiteTransactionJournaliere: '500000',
        limiteTransactionMensuelle: '2000000',
        limiteTransactionUnique: '200000',
        documentsRequis: ['CNI', 'Justificatif domicile'],
        actif: true,
      },
      {
        niveau: 3,
        nom: 'Premium',
        description: 'KYC avancé',
        limiteTransactionJournaliere: '2000000',
        limiteTransactionMensuelle: '10000000',
        limiteTransactionUnique: '1000000',
        documentsRequis: ['CNI', 'Justificatif domicile', 'Relevé bancaire'],
        actif: true,
      },
    ]);

    const transfertRecords = await db.insert(transferts).values([
      {
        reference: 'TRF-2024-0001',
        idempotencyKey: 'idem-0001',
        type: 'national',
        statut: 'completed',
        expediteurNom: clientKouassi.nom || 'Client',
        expediteurTelephone: clientKouassi.telephone || '+242000000000',
        expediteurEmail: clientKouassi.email,
        expediteurPays: 'CG',
        expediteurKycLevel: 2,
        beneficiaireNom: clientNguesso.nom || 'Beneficiaire',
        beneficiaireTelephone: clientNguesso.telephone || '+242000000000',
        beneficiairePays: 'Congo',
        beneficiaireVille: 'Brazzaville',
        montantEnvoye: '10000',
        deviseEnvoi: 'XAF',
        montantRecu: '9800',
        deviseReception: 'XAF',
        tauxChange: '1',
        fraisTransfert: '200',
        montantTotal: '10200',
        operateurId: 'SYSTEM',
        operateurNom: 'Internal',
        modeReception: 'wallet',
        modePaiement: 'cash',
        otpVerifie: true,
        riskScore: 10,
        riskFlags: ['low'],
        fraudCheck: false,
        amlCheck: true,
        sanctionsCheck: true,
        agentId: staffGroups.Caissiers[0]?.id,
        approuveParId: adminUser.id,
        dateApprobation: daysAgo(2),
        dateCreation: daysAgo(2),
        dateCompletion: daysAgo(1),
      },
      {
        reference: 'TRF-2024-0002',
        idempotencyKey: 'idem-0002',
        type: 'international',
        statut: 'pending',
        expediteurNom: clientTaty.nom || 'Client',
        expediteurTelephone: clientTaty.telephone || '+242000000000',
        expediteurEmail: clientTaty.email,
        expediteurPays: 'CG',
        expediteurKycLevel: 1,
        beneficiaireNom: 'Doe',
        beneficiaireTelephone: '+33123456789',
        beneficiairePays: 'France',
        beneficiaireVille: 'Paris',
        montantEnvoye: '50000',
        deviseEnvoi: 'XAF',
        montantRecu: '76',
        deviseReception: 'EUR',
        tauxChange: '650',
        fraisTransfert: '1500',
        montantTotal: '51500',
        operateurId: 'INTL',
        operateurNom: 'Swift',
        modeReception: 'bank',
        modePaiement: 'cash',
        otpCode: '458732',
        otpExpiration: daysFromNow(1),
        otpVerifie: false,
        riskScore: 45,
        riskFlags: ['manual_review'],
        fraudCheck: false,
        amlCheck: false,
        sanctionsCheck: false,
        agentId: staffGroups.Caissiers[1]?.id,
        dateCreation: daysAgo(1),
      },
      {
        reference: 'TRF-2024-0003',
        idempotencyKey: 'idem-0003',
        type: 'national',
        statut: 'rejected',
        expediteurNom: clientMakosso.nom || 'Client',
        expediteurTelephone: clientMakosso.telephone || '+242000000000',
        expediteurEmail: clientMakosso.email,
        expediteurPays: 'CG',
        expediteurKycLevel: 1,
        beneficiaireNom: clientMoukassa.nom || 'Beneficiaire',
        beneficiaireTelephone: clientMoukassa.telephone || '+242000000000',
        beneficiairePays: 'Congo',
        beneficiaireVille: 'Brazzaville',
        montantEnvoye: '200000',
        deviseEnvoi: 'XAF',
        montantRecu: '196000',
        deviseReception: 'XAF',
        tauxChange: '1',
        fraisTransfert: '4000',
        montantTotal: '204000',
        operateurId: 'SYSTEM',
        operateurNom: 'Internal',
        modeReception: 'cash',
        modePaiement: 'cash',
        otpVerifie: false,
        riskScore: 80,
        riskFlags: ['blacklist'],
        fraudCheck: true,
        amlCheck: true,
        sanctionsCheck: false,
        agentId: staffGroups.Caissiers[3]?.id,
        dateCreation: daysAgo(3),
        dateExpiration: daysAgo(1),
      },
    ]).returning();

    await db.insert(transfertAuditLogs).values([
      {
        transfertId: transfertRecords[0].id,
        action: 'CREATED',
        nouveauStatut: 'completed',
        details: { source: 'seed' },
        userId: adminUser.id,
      },
      {
        transfertId: transfertRecords[1].id,
        action: 'CREATED',
        nouveauStatut: 'pending',
        details: { source: 'seed' },
        userId: staffGroups.Caissiers[1]?.id,
      },
      {
        transfertId: transfertRecords[2].id,
        action: 'REJECTED',
        ancienStatut: 'pending',
        nouveauStatut: 'rejected',
        details: { reason: 'Score de risque' },
        userId: adminUser.id,
      },
    ]);

    await db.insert(transfertLimits).values([
      {
        clientId: clientKouassi.id,
        telephone: clientKouassi.telephone || '+242000000000',
        kycLevel: 2,
        totalJournalier: '50000',
        totalMensuel: '200000',
        nombreTransfertJour: 1,
        nombreTransfertMois: 3,
        dernierTransfert: daysAgo(1),
      },
      {
        clientId: clientTaty.id,
        telephone: clientTaty.telephone || '+242000000000',
        kycLevel: 1,
        totalJournalier: '0',
        totalMensuel: '0',
        nombreTransfertJour: 0,
        nombreTransfertMois: 0,
      },
    ]);

    await db.insert(transfertWebhooks).values([
      {
        transfertId: transfertRecords[0].id,
        operateurId: 'SYSTEM',
        eventType: 'TRANSFER_COMPLETED',
        payload: { reference: transfertRecords[0].reference },
        signature: 'demo-signature',
        signatureValide: true,
        traite: true,
        ipSource: '127.0.0.1',
      },
    ]);

    await db.insert(transfertBlacklist).values([
      {
        type: 'telephone',
        valeur: '+242060000013',
        raison: 'Tentative de fraude',
        source: 'interne',
        severite: 'high',
        actif: true,
        ajouteParId: adminUser.id,
      },
    ]);

    await db.insert(transfertReconciliation).values([
      {
        operateurId: 'SYSTEM',
        dateReconciliation: daysAgo(1),
        periode: `${currentYear}-09`,
        totalTransferts: 12,
        montantTotal: '350000',
        montantOperateur: '349000',
        ecart: '1000',
        statut: 'pending',
        anomalies: [{ reference: 'TRF-2024-0009', ecart: 1000 }],
      },
    ]);

    await db.insert(otpValidations).values([
      {
        transactionType: 'caisse_withdrawal',
        transactionReference: 'RET-OTP-001',
        clientId: clientKouassi.id,
        clientPhone: clientKouassi.telephone || '+242000000000',
        montant: '10000',
        otpCode: '123456',
        status: 'pending',
        expiresAt: daysFromNow(1),
        createdBy: staffGroups.Caissiers[0]?.id,
        createdByRole: ROLES.CAISSE,
      },
      {
        transactionType: 'transfer',
        transactionReference: transfertRecords[0].reference,
        clientId: clientKouassi.id,
        clientPhone: clientKouassi.telephone || '+242000000000',
        montant: '10000',
        otpCode: '654321',
        status: 'validated',
        validatedBy: adminUser.id,
        validatedByName: adminUser.nom || 'Admin',
        validatedByRole: ROLES.ADMIN,
        validatedAt: daysAgo(1),
        expiresAt: daysFromNow(1),
        createdBy: staffGroups.Caissiers[0]?.id,
        createdByRole: ROLES.CAISSE,
      },
    ]);

    console.log('   ✅ Transfers & OTP seeded');

    // 15. SEED NOTIFICATIONS & AUDIT
    console.log('\n🔔 Seeding Notifications & Audit...');

    await db.insert(notifications).values([
      {
        userId: adminUser.id,
        type: 'system',
        titre: 'Maintenance planifiée',
        message: 'Maintenance prévue ce week-end',
        priorite: 'normale',
        lue: false,
      },
      {
        userId: insertedUsers['chef_siege']?.id,
        type: 'credit',
        titre: 'Nouveau crédit',
        message: 'Demande de crédit en attente',
        priorite: 'haute',
        lue: false,
      },
      {
        userId: staffGroups.Agents[0]?.id,
        type: 'tontine',
        titre: 'Cotisation en retard',
        message: 'Membre en retard sur la tontine',
        priorite: 'normale',
        lue: true,
      },
    ]);

    const [subscription] = await db.insert(pushSubscriptions).values({
      userId: adminUser.id,
      endpoint: 'https://push.example.com/endpoint/123',
      p256dh: 'p256dh-demo',
      auth: 'auth-demo',
      deviceInfo: 'Chrome/Windows',
      isActive: true,
    }).returning();

    await db.insert(notificationPreferences).values({
      userId: adminUser.id,
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      types: ['system', 'credit', 'tontine'],
      schedule: { start: '08:00', end: '20:00' },
    });

    await db.insert(pushNotificationLogs).values({
      subscriptionId: subscription.id,
      title: 'Rappel',
      body: 'Une nouvelle notification est disponible',
      status: 'sent',
      error: null,
    });

    await db.insert(smsNotifications).values([
      {
        clientId: adminUser.id,
        phoneNumber: '+242060000000',
        type: 'OTP',
        message: 'Votre code OTP est 123456',
        status: 'sent',
        provider: 'manual',
        providerMessageId: 'SMS-001',
        createdBy: adminUser.id,
        sentAt: daysAgo(1),
      },
      {
        clientId: adminUser.id,
        phoneNumber: '+242060000001',
        type: 'ALERTE',
        message: 'Rappel échéance crédit',
        status: 'failed',
        provider: 'manual',
        errorMessage: 'Numéro invalide',
        createdBy: adminUser.id,
      },
    ]);

    // Générer un historique d'audit logs complet sur 90 jours (200+ entrées)
    const auditLogsData: any[] = [];
    const allUserIds = Object.values(insertedUsers).filter(u => u?.id).map(u => u.id);

    const auditActions = [
      { action: 'LOGIN', resource: 'auth', status: 'success', riskLevel: 'low', weight: 30 },
      { action: 'LOGIN_FAILED', resource: 'auth', status: 'failed', riskLevel: 'medium', weight: 10 },
      { action: 'LOGOUT', resource: 'auth', status: 'success', riskLevel: 'low', weight: 15 },
      { action: 'CREATE_CLIENT', resource: 'client', status: 'success', riskLevel: 'low', weight: 8 },
      { action: 'UPDATE_CLIENT', resource: 'client', status: 'success', riskLevel: 'low', weight: 10 },
      { action: 'DELETE_CLIENT', resource: 'client', status: 'success', riskLevel: 'medium', weight: 2 },
      { action: 'CREATE_CREDIT', resource: 'credit', status: 'success', riskLevel: 'medium', weight: 5 },
      { action: 'APPROVE_CREDIT', resource: 'credit', status: 'success', riskLevel: 'high', weight: 3 },
      { action: 'REJECT_CREDIT', resource: 'credit', status: 'success', riskLevel: 'medium', weight: 2 },
      { action: 'CREATE_EPARGNE', resource: 'epargne', status: 'success', riskLevel: 'low', weight: 6 },
      { action: 'DEPOSIT', resource: 'caisse', status: 'success', riskLevel: 'low', weight: 12 },
      { action: 'WITHDRAWAL', resource: 'caisse', status: 'success', riskLevel: 'medium', weight: 8 },
      { action: 'TRANSFER', resource: 'transfert', status: 'success', riskLevel: 'high', weight: 4 },
      { action: 'PASSWORD_CHANGE', resource: 'user', status: 'success', riskLevel: 'low', weight: 3 },
      { action: 'PASSWORD_RESET', resource: 'user', status: 'success', riskLevel: 'medium', weight: 2 },
      { action: 'ACCOUNT_LOCKED', resource: 'auth', status: 'success', riskLevel: 'high', weight: 1 },
      { action: 'SESSION_EXPIRED', resource: 'auth', status: 'success', riskLevel: 'low', weight: 5 },
      { action: 'PERMISSION_DENIED', resource: 'auth', status: 'failed', riskLevel: 'high', weight: 2 },
      { action: 'EXPORT_DATA', resource: 'report', status: 'success', riskLevel: 'medium', weight: 3 },
      { action: 'GENERATE_REPORT', resource: 'report', status: 'success', riskLevel: 'low', weight: 4 },
      { action: 'UPDATE_SETTINGS', resource: 'settings', status: 'success', riskLevel: 'medium', weight: 2 },
      { action: 'CREATE_TONTINE', resource: 'tontine', status: 'success', riskLevel: 'low', weight: 2 },
      { action: 'ADD_CONTRIBUTION', resource: 'tontine', status: 'success', riskLevel: 'low', weight: 5 },
    ];

    const ipAddresses = [
      '192.168.1.10', '192.168.1.20', '192.168.1.30', '192.168.1.40',
      '192.168.2.10', '192.168.2.20', '192.168.3.10', '192.168.3.20',
      '10.0.0.5', '10.0.0.10', '10.0.0.15', '127.0.0.1',
    ];

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148',
      'COFIN-App/2.1.0 (Android 13)',
      'COFIN-App/2.1.0 (iOS 17)',
    ];

    // Générer 250 audit logs répartis sur 90 jours
    for (let i = 0; i < 250; i++) {
      const actionDef = faker.helpers.weightedArrayElement(
        auditActions.map(a => ({ value: a, weight: a.weight }))
      );
      const userId = randomFromArray(allUserIds);
      const daysOffset = randomBetween(0, 90);
      const hoursOffset = randomBetween(6, 20); // Heures de travail

      const logDate = new Date(daysAgo(daysOffset));
      logDate.setHours(hoursOffset, randomBetween(0, 59), randomBetween(0, 59));

      let resourceId: string | null = null;
      let details: Record<string, any> = {};

      // Générer des détails selon l'action
      switch (actionDef.action) {
        case 'LOGIN':
        case 'LOGOUT':
        case 'SESSION_EXPIRED':
          details = { method: randomFromArray(['password', 'sso', 'biometric']) };
          break;
        case 'LOGIN_FAILED':
          details = { reason: randomFromArray(['invalid_password', 'account_locked', 'ip_blocked']), attempts: randomBetween(1, 5) };
          break;
        case 'CREATE_CLIENT':
        case 'UPDATE_CLIENT':
          resourceId = insertedClients[randomBetween(0, insertedClients.length - 1)]?.id;
          details = { clientName: faker.person.fullName() };
          break;
        case 'CREATE_CREDIT':
        case 'APPROVE_CREDIT':
        case 'REJECT_CREDIT':
          resourceId = insertedCredits[randomBetween(0, insertedCredits.length - 1)]?.id;
          details = { amount: generateRealisticAmount(100000, 1000000, 50000), type: randomFromArray(CREDIT_TYPES) };
          break;
        case 'DEPOSIT':
        case 'WITHDRAWAL':
          details = { amount: generateRealisticAmount(10000, 500000, 5000), mode: randomFromArray(PAYMENT_METHODS) };
          break;
        case 'TRANSFER':
          details = { amount: generateRealisticAmount(50000, 1000000, 10000), destination: randomFromArray(['national', 'international']) };
          break;
        case 'EXPORT_DATA':
          details = { format: randomFromArray(['excel', 'pdf', 'csv']), records: randomBetween(10, 500) };
          break;
        case 'PERMISSION_DENIED':
          details = { attemptedAction: randomFromArray(['view_reports', 'approve_credit', 'delete_user', 'export_all']) };
          break;
        default:
          details = { source: 'application' };
      }

      auditLogsData.push({
        userId,
        action: actionDef.action,
        resource: actionDef.resource,
        resourceId,
        details,
        ipAddress: randomFromArray(ipAddresses),
        userAgent: randomFromArray(userAgents),
        status: actionDef.status,
        riskLevel: actionDef.riskLevel,
        createdAt: logDate,
      });
    }

    // Insérer par lots
    for (let i = 0; i < auditLogsData.length; i += 50) {
      const batch = auditLogsData.slice(i, i + 50);
      await db.insert(auditLogs).values(batch);
    }

    console.log(`   ✅ Notifications & audit logs: ${auditLogsData.length} logs créés`);

    // 16. SEED MESSAGES
    console.log('\n💬 Seeding Messages...');

    await db.insert(messages).values([
      {
        senderId: adminUser.id,
        receiverId: insertedUsers['chef_siege']?.id,
        content: 'Bonjour, merci de valider les nouveaux crédits.',
        read: false,
        createdAt: daysAgo(1),
      },
      {
        senderId: insertedUsers['chef_siege']?.id,
        receiverId: adminUser.id,
        content: 'Bien reçu, je m\'en occupe.',
        read: true,
        createdAt: daysAgo(1),
      },
      {
        senderId: staffGroups.Agents[0]?.id,
        receiverId: insertedUsers['superviseur']?.id,
        content: 'Visite terrain effectuée chez Kouassi.',
        read: true,
        createdAt: daysAgo(2),
      },
    ]);

    console.log('   ✅ Messages seeded');

    // 17. SEED ACCOUNTING ENTRIES & TVA
    console.log('\n🧾 Seeding Accounting Entries...');

    const [ecritureCapital] = await db.insert(ecritures).values({
      exerciceId: exerciceCurrent.id,
      journalId: insertedJournaux['OD'],
      dateEcriture: dateOnly(monthsAgo(10)),
      numeroPiece: `OD-${currentYear}-001`,
      libelle: 'Capital initial',
      statut: 'Validé',
      validatedBy: adminUser.id,
      createdBy: adminUser.id,
    }).returning();

    await db.insert(lignesEcritures).values([
      { ecritureId: ecritureCapital.id, compteId: insertedComptes['521'], numeroCompte: '521', debit: '10000000', credit: '0', libelle: 'Dépôt capital' },
      { ecritureId: ecritureCapital.id, compteId: insertedComptes['101'], numeroCompte: '101', debit: '0', credit: '10000000', libelle: 'Capital social' },
    ]);

    const [ecritureVente] = await db.insert(ecritures).values({
      exerciceId: exerciceCurrent.id,
      journalId: insertedJournaux['VE'],
      dateEcriture: dateOnly(monthsAgo(2)),
      numeroPiece: `VE-${currentYear}-015`,
      libelle: 'Encaissements clients',
      statut: 'Validé',
      validatedBy: insertedUsers['comptable_siege']?.id,
      createdBy: insertedUsers['comptable_siege']?.id,
    }).returning();

    await db.insert(lignesEcritures).values([
      { ecritureId: ecritureVente.id, compteId: insertedComptes['521'], numeroCompte: '521', debit: '500000', credit: '0', libelle: 'Encaissements' },
      { ecritureId: ecritureVente.id, compteId: insertedComptes['701'], numeroCompte: '701', debit: '0', credit: '500000', libelle: 'Ventes' },
    ]);

    const [ecritureAchat] = await db.insert(ecritures).values({
      exerciceId: exerciceCurrent.id,
      journalId: insertedJournaux['AC'],
      dateEcriture: dateOnly(monthsAgo(1)),
      numeroPiece: `AC-${currentYear}-008`,
      libelle: 'Achats marchandises',
      statut: 'Validé',
      validatedBy: insertedUsers['comptable_siege']?.id,
      createdBy: insertedUsers['comptable_siege']?.id,
    }).returning();

    await db.insert(lignesEcritures).values([
      { ecritureId: ecritureAchat.id, compteId: insertedComptes['601'], numeroCompte: '601', debit: '200000', credit: '0', libelle: 'Achats' },
      { ecritureId: ecritureAchat.id, compteId: insertedComptes['401'], numeroCompte: '401', debit: '0', credit: '200000', libelle: 'Fournisseurs' },
    ]);

    const [ecriturePaie] = await db.insert(ecritures).values({
      exerciceId: exerciceCurrent.id,
      journalId: insertedJournaux['PA'],
      dateEcriture: dateOnly(monthsAgo(1)),
      numeroPiece: `PA-${currentYear}-002`,
      libelle: 'Paie mensuelle',
      statut: 'Validé',
      validatedBy: insertedUsers['comptable_siege']?.id,
      createdBy: insertedUsers['comptable_siege']?.id,
    }).returning();

    await db.insert(lignesEcritures).values([
      { ecritureId: ecriturePaie.id, compteId: insertedComptes['661'], numeroCompte: '661', debit: '300000', credit: '0', libelle: 'Salaires' },
      { ecritureId: ecriturePaie.id, compteId: insertedComptes['512'], numeroCompte: '512', debit: '0', credit: '300000', libelle: 'Banque' },
    ]);

    await db.insert(declarationsTva).values([
      {
        mois: new Date().getMonth() + 1,
        annee: currentYear,
        tvaCollectee: '90000',
        tvaDeductible: '30000',
        tvaAPayer: '60000',
        statut: 'Validé',
        numeroQuittance: 'TVA-2024-09',
        dateDepot: daysAgo(5),
        createdBy: insertedUsers['comptable_siege']?.id,
      },
    ]);

    console.log('   ✅ Accounting entries created');

    // 18. SEED HR MODULE
    console.log('\n🧑‍💼 Seeding HR Data...');

    const agenceMeta: Record<string, { ville: string; adresse: string }> = {
      'Siège': { ville: 'Brazzaville', adresse: 'Siège Central, Boulevard Denis Sassou Nguesso' },
      'Agence Nord': { ville: 'Ouesso', adresse: 'Agence Nord, Avenue de la République' },
      'Agence Sud': { ville: 'Pointe-Noire', adresse: 'Agence Sud, Zone Portuaire' },
      'Agence Est': { ville: 'Owando', adresse: 'Agence Est, Route de Boundji' },
    };

    const femalePrenoms = new Set(['Claudine', 'Lise', 'Aya', 'Flora']);

    const employesSeed = Object.values(insertedUsers)
      .filter((user: any) => user?.agence)
      .map((user: any, index: number) => {
        const agenceInfo = agenceMeta[user.agence] || { ville: user.agence, adresse: user.agence };
        const matricule = user.matricule || `EMP-${String(index + 1).padStart(3, '0')}`;
        const dateEmbauche = user.dateEmbauche
          ? (user.dateEmbauche instanceof Date ? dateOnly(user.dateEmbauche) : String(user.dateEmbauche))
          : dateOnly(monthsAgo(12 + index));

        // Map standard role name to roleSystem code
        let roleSystem = 'agent';
        if (user.role === ROLES.ADMIN) roleSystem = 'admin';
        else if (user.role === ROLES.CHEF) roleSystem = 'chef_agence';
        else if (user.role === ROLES.CAISSE) roleSystem = 'caissier';
        else if (user.role === ROLES.TERRAIN) roleSystem = 'terrain';
        else if (user.role === ROLES.COMPTABLE) roleSystem = 'comptable';
        else if (user.role === ROLES.CREDIT) roleSystem = 'credit';

        return {
          userId: user.id,
          agenceId: insertedAgences[user.agence] || null, // Link to real agence ID
          roleSystem,
          matricule,
          poste: user.poste || 'Employé',
          departement: user.departement || null,
          dateEmbauche,
          typeContrat: user.typeContrat || 'CDI',
          salaireBase: user.salaireBase ? parseInt(user.salaireBase) : 300000,
        };
      });

    await db.insert(employes).values(employesSeed);

    // Create mapping userId → employeId for HR data seeding
    const userToEmployeMap = new Map<string, string>();
    const insertedEmployes = await db.select().from(employes);
    insertedEmployes.forEach(emp => {
      userToEmployeMap.set(emp.userId, emp.id);
    });

    // Créer plus d'avantages variés
    await db.insert(avantages).values([
      { nom: 'Prime transport', type: 'Prime', montantParDefaut: 25000, description: 'Prime transport mensuelle', eligibleContrats: ['CDI', 'CDD'], actif: true },
      { nom: 'Assurance santé', type: 'Assurance', montantParDefaut: 40000, description: 'Couverture santé familiale', eligibleContrats: ['CDI'], actif: true },
      { nom: 'Prime ancienneté', type: 'Prime', montantParDefaut: 15000, description: 'Prime basée sur l\'ancienneté', eligibleContrats: ['CDI'], actif: true },
      { nom: 'Prime rendement', type: 'Prime', montantParDefaut: 30000, description: 'Prime de performance trimestrielle', eligibleContrats: ['CDI', 'CDD'], actif: true },
      { nom: 'Allocation logement', type: 'Allocation', montantParDefaut: 50000, description: 'Aide au logement', eligibleContrats: ['CDI'], actif: true },
      { nom: 'Frais téléphone', type: 'Remboursement', montantParDefaut: 10000, description: 'Remboursement forfait mobile', eligibleContrats: ['CDI', 'CDD'], actif: true },
      { nom: 'Assurance vie', type: 'Assurance', montantParDefaut: 20000, description: 'Assurance vie collective', eligibleContrats: ['CDI'], actif: false },
    ]);

    const allAvantages = await db.select().from(avantages);
    const activeAvantages = allAvantages.filter(a => a.actif);

    // Attribuer des avantages à plus d'employés
    const avantagesEmployesData: any[] = [];
    const employeIds = Array.from(userToEmployeMap.values());

    employeIds.forEach((empId, idx) => {
      // Chaque employé a 1-3 avantages
      const numAvantages = randomBetween(1, 3);
      const selectedAvantages = faker.helpers.arrayElements(activeAvantages, numAvantages);

      selectedAvantages.forEach(avantage => {
        avantagesEmployesData.push({
          employeId: empId,
          avantageId: avantage.id,
          montant: (avantage.montantParDefaut ?? 0) + randomBetween(-5000, 10000),
          dateAttribution: dateOnly(daysAgo(randomBetween(30, 365))),
          statut: faker.helpers.weightedArrayElement([
            { value: 'Actif', weight: 85 },
            { value: 'Suspendu', weight: 10 },
            { value: 'Terminé', weight: 5 },
          ]),
        });
      });
    });
    await db.insert(avantagesEmployes).values(avantagesEmployesData);

    // Générer plus de demandes de congés (historique sur 6 mois)
    const congesTypes = ['Congé Annuel', 'Congé Maladie', 'Congé Sans Solde', 'Congé Maternité', 'Congé Paternité', 'Récupération'];
    const congesMotifs = {
      'Congé Annuel': ['Vacances familiales', 'Repos annuel', 'Voyage personnel', 'Fêtes de fin d\'année'],
      'Congé Maladie': ['Repos médical', 'Hospitalisation', 'Convalescence', 'Maladie'],
      'Congé Sans Solde': ['Affaires personnelles', 'Déplacement familial', 'Formation externe'],
      'Congé Maternité': ['Maternité'],
      'Congé Paternité': ['Naissance enfant'],
      'Récupération': ['Heures supplémentaires', 'Travail week-end'],
    };
    const congesStatuts = ['En attente', 'Approuvé', 'Refusé', 'Annulé'];

    const demandesCongesData: any[] = [];
    for (let i = 0; i < 25; i++) {
      const userId = randomFromArray(allUserIds);
      const empId = userToEmployeMap.get(userId);
      if (!empId) continue;

      const user = Object.values(insertedUsers).find(u => u?.id === userId);
      const typeConge = randomFromArray(congesTypes);
      const statut = faker.helpers.weightedArrayElement([
        { value: 'Approuvé', weight: 60 },
        { value: 'En attente', weight: 20 },
        { value: 'Refusé', weight: 15 },
        { value: 'Annulé', weight: 5 },
      ]);

      const dateDebut = randomBetween(0, 1) ? daysFromNow(randomBetween(5, 60)) : daysAgo(randomBetween(5, 90));
      const dureeJours = randomBetween(1, 15);

      demandesCongesData.push({
        employeId: empId,
        employeNom: user ? `${user.nom} ${user.prenom}` : 'Employé',
        type: typeConge,
        dateDebut: dateOnly(dateDebut),
        dateFin: dateOnly(new Date(dateDebut.getTime() + dureeJours * 24 * 60 * 60 * 1000)),
        motif: randomFromArray(congesMotifs[typeConge as keyof typeof congesMotifs] || ['Motif personnel']),
        statut,
        approuvePar: statut !== 'En attente' ? insertedUsers['chef_siege']?.id : null,
        dateDecision: statut !== 'En attente' ? daysAgo(randomBetween(1, 30)) : null,
        commentaire: statut === 'Refusé' ? randomFromArray(['Période de forte activité', 'Effectif insuffisant', 'Report demandé']) : null,
      });
    }
    await db.insert(demandesConges).values(demandesCongesData);

    // Créer plus de formations
    const formationsData = [
      { titre: 'Gestion du risque crédit', formateur: 'Cabinet RiskPro', duree: '3 jours', lieu: 'Siège', capaciteMax: 20, statut: 'Planifiée', dateOffset: 5 },
      { titre: 'Service client avancé', formateur: 'Consulting CX', duree: '2 jours', lieu: 'Agence Nord', capaciteMax: 15, statut: 'Terminée', dateOffset: -30 },
      { titre: 'Techniques de vente terrain', formateur: 'FormaPro', duree: '2 jours', lieu: 'Siège', capaciteMax: 25, statut: 'En cours', dateOffset: -2 },
      { titre: 'Conformité et réglementation', formateur: 'Audit & Co', duree: '1 jour', lieu: 'Visioconférence', capaciteMax: 50, statut: 'Planifiée', dateOffset: 15 },
      { titre: 'Gestion de trésorerie', formateur: 'Finance Academy', duree: '3 jours', lieu: 'Agence Sud', capaciteMax: 12, statut: 'Terminée', dateOffset: -60 },
      { titre: 'Leadership et management', formateur: 'LeaderSkills', duree: '2 jours', lieu: 'Siège', capaciteMax: 10, statut: 'Annulée', dateOffset: -15 },
      { titre: 'Sécurité informatique', formateur: 'CyberSec Congo', duree: '1 jour', lieu: 'Visioconférence', capaciteMax: 100, statut: 'Terminée', dateOffset: -45 },
      { titre: 'Excel avancé', formateur: 'IT Training', duree: '2 jours', lieu: 'Siège', capaciteMax: 20, statut: 'Planifiée', dateOffset: 30 },
    ];

    const insertedFormations = await db.insert(formations).values(
      formationsData.map(f => ({
        titre: f.titre,
        formateur: f.formateur,
        dateDebut: dateOnly(f.dateOffset >= 0 ? daysFromNow(f.dateOffset) : daysAgo(-f.dateOffset)),
        dateFin: dateOnly(f.dateOffset >= 0 ? daysFromNow(f.dateOffset + parseInt(f.duree)) : daysAgo(-f.dateOffset - parseInt(f.duree))),
        duree: f.duree,
        lieu: f.lieu,
        description: `Formation sur ${f.titre.toLowerCase()}`,
        programme: `Programme complet de ${f.titre.toLowerCase()}`,
        statut: f.statut,
        capaciteMax: f.capaciteMax,
      }))
    ).returning();

    // Ajouter des participants aux formations
    const participantsData: any[] = [];
    insertedFormations.forEach(formation => {
      const numParticipants = randomBetween(3, Math.min(10, formation.capaciteMax || 10));
      const selectedEmployees = faker.helpers.arrayElements(employeIds, numParticipants);

      selectedEmployees.forEach(empId => {
        const userId = Array.from(userToEmployeMap.entries()).find(([k, v]) => v === empId)?.[0];
        const user = Object.values(insertedUsers).find(u => u?.id === userId);

        participantsData.push({
          formationId: formation.id,
          employeId: empId,
          employeNom: user ? `${user.nom} ${user.prenom}` : 'Employé',
          presence: formation.statut === 'Terminée'
            ? faker.helpers.weightedArrayElement([
                { value: 'Présent', weight: 85 },
                { value: 'Absent', weight: 10 },
                { value: 'Excusé', weight: 5 },
              ])
            : 'Non noté',
          evaluation: formation.statut === 'Terminée' && faker.datatype.boolean({ probability: 0.7 })
            ? randomFromArray(['Excellente participation', 'Très bonne participation', 'Participation satisfaisante', 'Peut mieux faire'])
            : null,
        });
      });
    });
    await db.insert(formationParticipants).values(participantsData);

    // Ajouter plus de sanctions
    const sanctionsData: any[] = [];
    const sanctionTypes = ['Avertissement', 'Blâme', 'Mise à pied', 'Retenue sur salaire'];
    const sanctionMotifs = ['Retard répété', 'Absence injustifiée', 'Non-respect des procédures', 'Faute professionnelle', 'Comportement inapproprié'];

    for (let i = 0; i < 8; i++) {
      const empId = randomFromArray(employeIds);
      const userId = Array.from(userToEmployeMap.entries()).find(([k, v]) => v === empId)?.[0];
      const user = Object.values(insertedUsers).find(u => u?.id === userId);

      sanctionsData.push({
        employeId: empId,
        employeNom: user ? `${user.nom} ${user.prenom}` : 'Employé',
        type: faker.helpers.weightedArrayElement([
          { value: 'Avertissement', weight: 60 },
          { value: 'Blâme', weight: 25 },
          { value: 'Mise à pied', weight: 10 },
          { value: 'Retenue sur salaire', weight: 5 },
        ]),
        motif: randomFromArray(sanctionMotifs),
        date: dateOnly(daysAgo(randomBetween(5, 180))),
        gravite: faker.helpers.weightedArrayElement([
          { value: 'Faible', weight: 50 },
          { value: 'Moyenne', weight: 35 },
          { value: 'Grave', weight: 15 },
        ]),
        emetteurId: insertedUsers['chef_siege']?.id,
      });
    }
    await db.insert(sanctions).values(sanctionsData);

    // Ajouter plus de candidatures
    const candidaturesData: any[] = [];
    const postesVises = ['Agent Caisse', 'Agent Terrain', 'Analyste Crédit', 'Comptable', 'Chef d\'agence', 'Responsable RH'];
    const candidatureStatuts = ['En attente', 'Entretien', 'Retenu', 'Refusé', 'En cours'];

    for (let i = 0; i < 15; i++) {
      const { nom, prenom, gender } = generateCongoleseName(randomFromArray(['male', 'female']));

      candidaturesData.push({
        nom,
        prenom,
        email: faker.internet.email({ firstName: prenom, lastName: nom }).toLowerCase(),
        telephone: generateCongolesePhone(),
        posteVise: randomFromArray(postesVises),
        experience: randomFromArray([
          '1 an en microfinance',
          '2 ans en banque',
          '3 ans en caisse',
          'Débutant',
          '5 ans en gestion',
          '2 ans terrain commercial',
        ]),
        formation: randomFromArray([
          'BTS Comptabilité',
          'Licence Gestion',
          'Master Finance',
          'DUT GEA',
          'Bac+2 Commercial',
          'Licence Économie',
        ]),
        statut: faker.helpers.weightedArrayElement([
          { value: 'En attente', weight: 30 },
          { value: 'Entretien', weight: 25 },
          { value: 'Retenu', weight: 15 },
          { value: 'Refusé', weight: 25 },
          { value: 'En cours', weight: 5 },
        ]),
        datePostulation: dateOnly(daysAgo(randomBetween(1, 60))),
        dateEntretien: faker.datatype.boolean({ probability: 0.6 }) ? dateOnly(daysFromNow(randomBetween(1, 15))) : null,
        responsableRhId: insertedUsers['rh_manager']?.id,
      });
    }
    await db.insert(candidatures).values(candidaturesData);

    // Générer des bulletins de paie sur 6 mois pour tous les employés
    const bulletinsData: any[] = [];
    const moisList: string[] = [];
    for (let m = 0; m < 6; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      moisList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    employeIds.slice(0, 15).forEach((empId, idx) => {
      const userId = Array.from(userToEmployeMap.entries()).find(([k, v]) => v === empId)?.[0];
      const user = Object.values(insertedUsers).find(u => u?.id === userId);
      const salaireBase = user?.salaireBase ? parseInt(user.salaireBase) : Number(generateRealisticAmount(250000, 600000, 25000));

      moisList.forEach(mois => {
        const primeTransport = 25000;
        const primeAnciennete = randomBetween(0, 30000);
        const primeRendement = faker.datatype.boolean({ probability: 0.3 }) ? randomBetween(10000, 50000) : 0;
        const salaireBrut = salaireBase + primeTransport + primeAnciennete + primeRendement;
        const cnssEmploye = Math.round(salaireBrut * 0.035);
        const ipr = Math.round(salaireBrut * 0.07);
        const totalRetenues = cnssEmploye + ipr;
        const salaireNet = salaireBrut - totalRetenues;

        bulletinsData.push({
          employeId: empId,
          employeNom: user ? `${user.nom} ${user.prenom}` : 'Employé',
          mois,
          salaireBase: String(salaireBase),
          primeAnciennete: String(primeAnciennete),
          primeTransport: String(primeTransport),
          primeRendement: String(primeRendement),
          autresPrimes: '0',
          salaireBrut: String(salaireBrut),
          cnssEmploye: String(cnssEmploye),
          ipr: String(ipr),
          autresRetenues: '0',
          totalRetenues: String(totalRetenues),
          salaireNet: String(salaireNet),
          cnssPatronale: String(Math.round(salaireBrut * 0.05)),
          pdfUrl: `loge://bulletins/${user?.username || 'emp'}_${mois.replace('-', '_')}.pdf`,
          pdfHash: faker.string.alphanumeric(32),
          genereParId: insertedUsers['comptable_siege']?.id,
          statut: mois === moisList[0] ? 'Brouillon' : 'Validé',
        });
      });
    });

    // Insérer par lots
    for (let i = 0; i < bulletinsData.length; i += 20) {
      const batch = bulletinsData.slice(i, i + 20);
      await db.insert(bulletinsPaie).values(batch);
    }

    // Générer un historique de présences sur 30 jours
    const presencesData: any[] = [];
    const presenceStatuts = ['Présent', 'Retard', 'Absent', 'Congé', 'Mission'];

    for (let day = 0; day < 30; day++) {
      const date = daysAgo(day);
      if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekends

      employeIds.slice(0, 20).forEach(empId => {
        const statut = faker.helpers.weightedArrayElement([
          { value: 'Présent', weight: 75 },
          { value: 'Retard', weight: 10 },
          { value: 'Absent', weight: 5 },
          { value: 'Congé', weight: 7 },
          { value: 'Mission', weight: 3 },
        ]);

        const heureArrivee = new Date(date);
        if (statut === 'Présent') {
          heureArrivee.setHours(7 + randomBetween(0, 1), randomBetween(45, 59));
        } else if (statut === 'Retard') {
          heureArrivee.setHours(8 + randomBetween(0, 2), randomBetween(0, 59));
        }

        presencesData.push({
          employeId: empId,
          date: dateOnly(date),
          statut,
          heureArrivee: ['Présent', 'Retard'].includes(statut) ? heureArrivee : null,
          commentaire: statut === 'Retard' ? randomFromArray(['Trafic', 'Problème transport', 'Imprévu familial']) :
                      statut === 'Absent' ? randomFromArray(['Maladie', 'Absence justifiée', 'Non justifiée']) :
                      statut === 'Mission' ? randomFromArray(['Visite client', 'Formation externe', 'Réunion agence']) : null,
        });
      });
    }

    // Insérer par lots
    for (let i = 0; i < presencesData.length; i += 50) {
      const batch = presencesData.slice(i, i + 50);
      await db.insert(presences).values(batch);
    }

    // Générer les horaires de travail pour tous les employés
    const horairesData: any[] = [];
    employeIds.forEach(empId => {
      for (let jour = 1; jour <= 5; jour++) { // Lundi à Vendredi
        horairesData.push({
          employeId: empId,
          jourSemaine: jour,
          heureDebut: '08:00',
          heureFin: jour === 5 ? '16:00' : '17:00',
          pauseMinutes: jour === 5 ? 45 : 60,
          actif: true,
        });
      }
    });

    // Insérer par lots
    for (let i = 0; i < horairesData.length; i += 50) {
      const batch = horairesData.slice(i, i + 50);
      await db.insert(horairesTravail).values(batch);
    }

    console.log(`   ✅ HR: ${avantagesEmployesData.length} avantages, ${demandesCongesData.length} congés, ${insertedFormations.length} formations, ${bulletinsData.length} bulletins, ${presencesData.length} présences`);

    // 19. SEED BOURSE & LOGE
    console.log('\n📦 Seeding Loge & Bourse...');

    await db.insert(logeSettings).values({
      quotaTotal: 1099511627776,
      quotaUtilise: 104857600,
      retentionJours: 365,
      sauvegardeAuto: true,
      frequenceSauvegarde: 'daily',
      compressionEnabled: true,
      encryptionEnabled: true,
      logePasswordRequired: true,
      archivageAutoExports: true,
    });

    const [docRoot] = await db.insert(documents).values({
      nom: 'Documents Clients',
      description: 'Dossier racine clients',
      type: 'dossier',
      chemin: '/clients',
      categorie: 'clients',
      visibilite: 'interne',
      uploadedBy: adminUser.id,
    }).returning();

    const [docKyc] = await db.insert(documents).values({
      nom: 'KYC',
      description: 'Documents KYC',
      type: 'dossier',
      chemin: '/clients/kyc',
      parentId: docRoot.id,
      categorie: 'kyc',
      visibilite: 'interne',
      uploadedBy: adminUser.id,
    }).returning();

    await db.insert(documents).values({
      nom: 'CNI_Kouassi.pdf',
      description: 'Carte nationale',
      type: 'fichier',
      mimeType: 'application/pdf',
      taille: 102400,
      chemin: '/clients/kyc/CNI_Kouassi.pdf',
      objectPath: 'loge/clients/kyc/CNI_Kouassi.pdf',
      parentId: docKyc.id,
      categorie: 'kyc',
      referenceId: clientKouassi.id,
      referenceType: 'client',
      visibilite: 'prive',
      tags: ['kyc', 'cni'],
      uploadedBy: staffGroups.Agents[0]?.id,
    });

    const portfolios = await db.insert(portefeuillesBourse).values([
      {
        clientId: clientKouassi.id,
        nom: 'Portefeuille Aya',
        devise: 'XAF',
        soldeDisponible: '500000',
        valeurTotale: '650000',
        gainPerte: '150000',
        gainPertePercent: '30',
        profilRisque: 'modere',
        objectifInvestissement: 'Croissance',
        statut: 'actif',
      },
      {
        clientId: clientTaty.id,
        nom: 'Portefeuille Flora',
        devise: 'XAF',
        soldeDisponible: '300000',
        valeurTotale: '280000',
        gainPerte: '-20000',
        gainPertePercent: '-6.7',
        profilRisque: 'prudent',
        objectifInvestissement: 'Préservation',
        statut: 'actif',
      },
    ]).returning();

    await db.insert(positionsBourse).values([
      {
        portefeuilleId: portfolios[0].id,
        symbole: 'AAPL',
        nom: 'Apple Inc.',
        quantite: '5',
        prixAchatMoyen: '180',
        prixActuel: '190',
        valeurActuelle: '950',
        gainPerte: '50',
        gainPertePercent: '5.5',
        devise: 'USD',
        marche: 'NASDAQ',
        secteur: 'Tech',
      },
      {
        portefeuilleId: portfolios[1].id,
        symbole: 'MSFT',
        nom: 'Microsoft Corp',
        quantite: '3',
        prixAchatMoyen: '320',
        prixActuel: '300',
        valeurActuelle: '900',
        gainPerte: '-60',
        gainPertePercent: '-6.2',
        devise: 'USD',
        marche: 'NASDAQ',
        secteur: 'Tech',
      },
    ]);

    const ordreRecords = await db.insert(ordresBourse).values([
      {
        portefeuilleId: portfolios[0].id,
        type: 'achat',
        typeOrdre: 'market',
        symbole: 'TSLA',
        nom: 'Tesla',
        quantite: '2',
        prixExecution: '250',
        montantTotal: '500',
        frais: '5',
        devise: 'USD',
        statut: 'executed',
        executionPartielle: false,
        quantiteExecutee: '2',
        executedAt: daysAgo(2),
      },
      {
        portefeuilleId: portfolios[1].id,
        type: 'vente',
        typeOrdre: 'limit',
        symbole: 'ORCL',
        nom: 'Oracle',
        quantite: '4',
        prixLimite: '95',
        montantTotal: '380',
        frais: '4',
        devise: 'USD',
        statut: 'en_attente',
        executionPartielle: false,
        quantiteExecutee: '0',
        dateExpiration: daysFromNow(5),
      },
    ]).returning();

    await db.insert(transactionsBourse).values([
      {
        portefeuilleId: portfolios[0].id,
        ordreId: ordreRecords[0].id,
        type: 'achat',
        symbole: 'TSLA',
        quantite: '2',
        prix: '250',
        montant: '500',
        frais: '5',
        devise: 'USD',
        tauxChange: '650',
        description: 'Achat Tesla',
        reference: 'TRX-TSLA-001',
      },
    ]);

    await db.insert(watchlistBourse).values([
      {
        clientId: clientKouassi.id,
        symbole: 'GOOGL',
        nom: 'Alphabet',
        marche: 'NASDAQ',
        alertePrixHaut: '150',
        alertePrixBas: '120',
        notes: 'Surveillance 2024',
      },
    ]);

    console.log('   ✅ Loge & Bourse data created');

    console.log('\n🎉 DEMO SEED COMPLETED SUCCESSFULLY!');
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    CREDENTIALS DE CONNEXION');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('👑 DIRECTION & ADMINISTRATION');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('   Admin Système    : admin / admin123 (PIN: 123456)');
    console.log('   Directeur Général: direction / password123 (PIN: 123456)');
    console.log('   RH Manager       : rh_manager / password123 (PIN: 123456)');
    console.log('   Comptable        : comptable_siege / password123 (PIN: 123456)');
    console.log('   Superviseur      : superviseur / password123 (PIN: 123456)');
    console.log('   Agent Interne    : agent_interne / password123 (PIN: 123456)\n');

    console.log('🏢 SIÈGE');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('   Chef d\'Agence    : chef_siege / password123 (PIN: 123456)');
    console.log('   Caissiers        : caisse_siege_1 / password123 (PIN: 123456) [Assigné: Caisse Siège 1]');
    console.log('                    : caisse_siege_2 / password123 (PIN: 123456) [Assigné: Caisse Siège 2]');
    console.log('   Gestionnaires    : credit_siege_1 / password123 (PIN: 123456)');
    console.log('                    : credit_siege_2 / password123 (PIN: 123456)');
    console.log('   Agents Terrain   : agent_siege_1 / password123 (PIN: 123456)');
    console.log('                    : agent_siege_2 / password123 (PIN: 123456)\n');

    console.log('🏢 AGENCE NORD');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('   Chef d\'Agence    : chef_nord / password123 (PIN: 123456)');
    console.log('   Caissiers        : caisse_nord_1 / password123 (PIN: 123456) [Assigné: Caisse Nord 1]');
    console.log('                    : caisse_nord_2 / password123 (PIN: 123456)');
    console.log('   Gestionnaires    : credit_nord_1 / password123 (PIN: 123456)');
    console.log('                    : credit_nord_2 / password123 (PIN: 123456)');
    console.log('   Agents Terrain   : agent_nord_1 / password123 (PIN: 123456)');
    console.log('                    : agent_nord_2 / password123 (PIN: 123456)\n');

    console.log('🏢 AGENCE SUD');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('   Chef d\'Agence    : chef_sud / password123 (PIN: 123456)');
    console.log('   Caissiers        : caisse_sud_1 / password123 (PIN: 123456)');
    console.log('                    : caisse_sud_2 / password123 (PIN: 123456)');
    console.log('   Gestionnaires    : credit_sud_1 / password123 (PIN: 123456)');
    console.log('                    : credit_sud_2 / password123 (PIN: 123456)');
    console.log('   Agents Terrain   : agent_sud_1 / password123 (PIN: 123456)');
    console.log('                    : agent_sud_2 / password123 (PIN: 123456)\n');

    console.log('🏢 AGENCE EST');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('   Chef d\'Agence    : chef_est / password123 (PIN: 123456)');
    console.log('   Caissiers        : caisse_est_1 / password123 (PIN: 123456)');
    console.log('                    : caisse_est_2 / password123 (PIN: 123456)');
    console.log('   Gestionnaires    : credit_est_1 / password123 (PIN: 123456)');
    console.log('                    : credit_est_2 / password123 (PIN: 123456)');
    console.log('   Agents Terrain   : agent_est_1 / password123 (PIN: 123456)');
    console.log('                    : agent_est_2 / password123 (PIN: 123456)\n');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Total Utilisateurs : ${Object.keys(insertedUsers).length}`);
    console.log(`   - Direction/Admin  : 6 personnes`);
    console.log(`   - Chefs d'Agence   : 4 personnes (1 par agence)`);
    console.log(`   - Caissiers        : 8 personnes (2 par agence)`);
    console.log(`   - Gestionnaires    : 8 personnes (2 par agence)`);
    console.log(`   - Agents Terrain   : 8 personnes (2 par agence)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error seeding demo:', error);
    throw error;
  }
}

// Run directly
seedDemo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });