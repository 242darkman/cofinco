/**
 * COFINCO - Production Seed v2.0
 *
 * Seed production-ready avec:
 * - Idempotence (upsert patterns)
 * - Transactions par blocs
 * - Preflight check (détection contexte)
 * - Validation post-seed
 * - Support dry-run
 *
 * Usage:
 *   pnpm seed:prod              # Normal: bootstrap ou config sync
 *   pnpm seed:prod --dry-run    # Affiche actions sans écrire
 *   pnpm seed:prod --force      # Force reset config (dangereux)
 */

import { db, pool } from './db';
import { eq, count, and, isNull } from 'drizzle-orm';
import { seedRBAC } from './seed-rbac-logic';
import { generateMatricule } from './storage/employes';
import { ensureCustomFunctions } from './db';
import { createLogger } from './lib/logger';

const logger = createLogger('SeedProd');
import {
  users,
  userRoles,
  modules,
  permissions,
  rolePermissions,
  agences,
  zones,
  departements,
  villes,
  arrondissements,
  marches,
  typesMarches,
  tags,
  systemSettings,
  featureFlags,
  securitySettings,
  uiCustomization,
  smsTemplates,
  smsProviderSettings,
  emailProviderSettings,
  emailTemplates,
  notificationSettings,
  dureesSuggerees,
  planComptable,
  journaux,
  exercices,
  creditPlans,
  configReevaluation,
  configCoffreFort,
  coffresForts,
  comptesLiaison,
  configTransfertInterCoffres,
  userAgences,
  maintenanceModules,
  produitsCompte,
  interestRates,
  caisses,
  mouvementsFinanciers,
  comptes,
  clients,
  permissionConditionTemplates,
  systemFeatureFlags,
  criticalPermissionPatterns,
  rbacVersions,
} from '@shared/schema';
import { departments, jobPositions, employes, payrollConfig, conventionsCollectives, qualificationCoefficients, chargeDefinitions, rubriqueDefinitions, payrollGlMapping, irppBaremes } from '@shared/schema';
import { accountingRules } from '@shared/schema/accounting';
import { caissesAgent } from '@shared/schema/caisse-agent';
import { agentsTerrain } from '@shared/schema/operations';
import { tontineRulesets } from '@shared/schema/tontines';
import { configEcartCaisse } from '@shared/schema/caisse-closing';
import { currencyPresets } from '@shared/schema/settings';
import { mmFeeSchedules } from '@shared/schema/mm-fee-schedules';
import { hashPassword } from './auth';
import { SystemRole } from '@shared/types/roles';
import { StatutUser, StatutCoffre, TypeAgence, StatutCaisse } from '@shared/enum/status-constants';
import { MODULES_DATA } from '@shared/config/rbac';

// ============================================================================
// TYPES
// ============================================================================

type SeedContext = 'EMPTY' | 'SEEDED' | 'PRODUCTION';
type SeedAction = 'created' | 'updated' | 'skipped' | 'deleted' | 'replaced';

interface SeedStepResult {
  table: string;
  action: SeedAction;
  count: number;
  details?: string;
}

interface SeedReport {
  context: SeedContext;
  steps: SeedStepResult[];
  errors: string[];
  warnings: string[];
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
}

// ============================================================================
// CLI ARGUMENTS
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE_RESET = args.includes('--force');

// ============================================================================
// DATA DEFINITIONS
// ============================================================================

const ZONES_DATA = [
  // Brazzaville
  { nom: 'Centre-Ville', ville: 'Brazzaville', description: 'Zone commerciale et administrative centrale', statut: StatutUser.ACTIVE },
  { nom: 'Bacongo', ville: 'Brazzaville', description: 'Quartier administratif et historique', statut: StatutUser.ACTIVE },
  { nom: 'Poto-Poto', ville: 'Brazzaville', description: 'Quartier commerçant et résidentiel dense', statut: StatutUser.ACTIVE },
  { nom: 'Ouenzé', ville: 'Brazzaville', description: 'Zone commerciale et populaire', statut: StatutUser.ACTIVE },
  { nom: 'Talangaï', ville: 'Brazzaville', description: 'Grand quartier populaire au nord', statut: StatutUser.ACTIVE },
  { nom: 'Moungali', ville: 'Brazzaville', description: 'Quartier populaire et résidentiel', statut: StatutUser.ACTIVE },
  { nom: 'Makélékélé', ville: 'Brazzaville', description: 'Quartier sud, mixte commerce et habitation', statut: StatutUser.ACTIVE },
  { nom: 'Mpila', ville: 'Brazzaville', description: 'Zone industrielle et portuaire', statut: StatutUser.ACTIVE },
  { nom: 'Mfilou', ville: 'Brazzaville', description: 'Zone périphérique ouest', statut: StatutUser.ACTIVE },
  { nom: 'Madibou', ville: 'Brazzaville', description: 'Extension sud, zones résidentielles', statut: StatutUser.ACTIVE },
  { nom: 'Djiri', ville: 'Brazzaville', description: 'Zone nord en forte expansion', statut: StatutUser.ACTIVE },
  { nom: 'Kintélé', ville: 'Brazzaville', description: 'Nouvelle zone urbaine et administrative', statut: StatutUser.ACTIVE },
  { nom: 'Massengo', ville: 'Brazzaville', description: 'Zone périphérique et résidentielle', statut: StatutUser.ACTIVE },
  { nom: 'Ngamakosso', ville: 'Brazzaville', description: 'Zone populaire et résidentielle', statut: StatutUser.ACTIVE },
  { nom: 'Mikalou', ville: 'Brazzaville', description: 'Quartier résidentiel', statut: StatutUser.ACTIVE },
  { nom: 'Texaco La Tsiémé', ville: 'Brazzaville', description: 'Zone commerciale et transport', statut: StatutUser.ACTIVE },
  // Pointe-Noire
  { nom: 'Centre-Ville', ville: 'Pointe-Noire', description: 'Centre des affaires et administrations', statut: StatutUser.ACTIVE },
  { nom: 'Lumumba', ville: 'Pointe-Noire', description: 'Quartier résidentiel et commercial', statut: StatutUser.ACTIVE },
  { nom: 'Tié-Tié', ville: 'Pointe-Noire', description: 'Grand quartier populaire', statut: StatutUser.ACTIVE },
  { nom: 'Loandjili', ville: 'Pointe-Noire', description: 'Zone résidentielle et aéroportuaire', statut: StatutUser.ACTIVE },
  { nom: 'Ngoyo', ville: 'Pointe-Noire', description: 'Zone périphérique et résidentielle', statut: StatutUser.ACTIVE },
  { nom: 'Mongo-Kamba', ville: 'Pointe-Noire', description: 'Zone populaire et artisanale', statut: StatutUser.ACTIVE },
  { nom: 'Mpaka', ville: 'Pointe-Noire', description: 'Quartier résidentiel', statut: StatutUser.ACTIVE },
  { nom: 'Vindoulou', ville: 'Pointe-Noire', description: 'Zone résidentielle en expansion', statut: StatutUser.ACTIVE },
  { nom: 'Tchibota', ville: 'Pointe-Noire', description: 'Zone périphérique sud', statut: StatutUser.ACTIVE },
  { nom: 'Siafoumou', ville: 'Pointe-Noire', description: 'Quartier populaire', statut: StatutUser.ACTIVE },
  { nom: 'Songolo', ville: 'Pointe-Noire', description: 'Zone industrielle et portuaire', statut: StatutUser.ACTIVE },
  { nom: 'Port Autonome', ville: 'Pointe-Noire', description: 'Zone portuaire et logistique', statut: StatutUser.ACTIVE }
];

// ===== Données géographiques Congo-Brazzaville =====

const DEPARTEMENTS_GEO_DATA = [
  { nom: 'Bouenza', chefLieu: 'Madingou' },
  { nom: 'Cuvette', chefLieu: 'Owando' },
  { nom: 'Cuvette-Ouest', chefLieu: 'Ewo' },
  { nom: 'Kouilou', chefLieu: 'Hinda' },
  { nom: 'Lékoumou', chefLieu: 'Sibiti' },
  { nom: 'Likouala', chefLieu: 'Impfondo' },
  { nom: 'Niari', chefLieu: 'Dolisie' },
  { nom: 'Plateaux', chefLieu: 'Djambala' },
  { nom: 'Pool', chefLieu: 'Kinkala' },
  { nom: 'Sangha', chefLieu: 'Ouesso' },
  { nom: 'Brazzaville', chefLieu: 'Brazzaville' },
  { nom: 'Pointe-Noire', chefLieu: 'Pointe-Noire' },
];

const VILLES_GEO_DATA: { nom: string; departement: string; lat: string; lng: string; isChefLieu: boolean }[] = [
  { nom: 'Brazzaville', departement: 'Brazzaville', lat: '-4.2634', lng: '15.2429', isChefLieu: true },
  { nom: 'Pointe-Noire', departement: 'Pointe-Noire', lat: '-4.7692', lng: '11.8664', isChefLieu: true },
  { nom: 'Dolisie', departement: 'Niari', lat: '-4.1986', lng: '12.6716', isChefLieu: true },
  { nom: 'Nkayi', departement: 'Bouenza', lat: '-4.1744', lng: '13.2847', isChefLieu: false },
  { nom: 'Sibiti', departement: 'Lékoumou', lat: '-3.6833', lng: '13.35', isChefLieu: true },
  { nom: 'Impfondo', departement: 'Likouala', lat: '1.6217', lng: '18.0647', isChefLieu: true },
  { nom: 'Ouesso', departement: 'Sangha', lat: '1.6136', lng: '16.0517', isChefLieu: true },
  { nom: 'Owando', departement: 'Cuvette', lat: '-0.4833', lng: '15.9', isChefLieu: true },
  { nom: 'Madingou', departement: 'Bouenza', lat: '-4.1533', lng: '13.55', isChefLieu: true },
  { nom: 'Kinkala', departement: 'Pool', lat: '-4.3564', lng: '14.7647', isChefLieu: true },
  { nom: 'Djambala', departement: 'Plateaux', lat: '-2.5447', lng: '14.7553', isChefLieu: true },
  { nom: 'Ewo', departement: 'Cuvette-Ouest', lat: '-0.8667', lng: '14.82', isChefLieu: true },
  { nom: 'Mossendjo', departement: 'Niari', lat: '-2.95', lng: '12.7', isChefLieu: false },
  { nom: 'Gamboma', departement: 'Plateaux', lat: '-1.8833', lng: '15.8667', isChefLieu: false },
  { nom: 'Loutété', departement: 'Bouenza', lat: '-4.2833', lng: '13.5667', isChefLieu: false },
  { nom: 'Mouyondzi', departement: 'Bouenza', lat: '-4.0', lng: '13.9667', isChefLieu: false },
  { nom: 'Kindamba', departement: 'Pool', lat: '-3.7833', lng: '14.5167', isChefLieu: false },
  { nom: 'Hinda', departement: 'Kouilou', lat: '-4.485', lng: '11.866', isChefLieu: true },
];

// Arrondissements by ville
const ARRONDISSEMENTS_SEED: Record<string, string[]> = {
  'Brazzaville': [
    'Makélékélé', 'Bacongo', 'Poto-Poto', 'Moungali', 'Ouenzé',
    'Talangaï', 'Mfilou', 'Madibou', 'Djiri',
  ],
  'Pointe-Noire': [
    'Lumumba', 'Mvoumvou', 'Tié-Tié', 'Loandjili', 'Mongo-MPoukou', 'Ngoyo',
  ],
  'Sibiti': [
    'Loumongo', 'Matindi', 'Mapindi', 'Mvouba', 'Moussanda', 'Indo', 'Mikamba', 'Molimba',
  ],
};

// Marchés by arrondissement (Pointe-Noire)
const MARCHES_SEED: Record<string, string[]> = {
  'Lumumba': ['Marché OUI', 'Mpita', 'Tchimbamba', 'Marché Km4', 'Grand Marché'],
  'Mvoumvou': ['Marché Sympathique', 'Marché Foire', 'Marché Mayaka'],
  'Tié-Tié': ['Tié-Tié Massola', 'Marché Liberté', 'Marché Loussala', 'Bassongueur', 'Km8', 'Voungou'],
  'Loandjili': ['Mbota', 'Carlos', 'Nkouikou', 'Quartier Culotte', 'Tystère 1', 'Movice'],
  'Mongo-MPoukou': ['Tystère 2', 'Siafoumou', 'Tchiali', 'Makayabou', 'La patience', 'Faubourg', 'Terre jaune'],
  'Ngoyo': ['Ngoyo Péage', 'Dubaï (fond tié-tié)', 'Patra', 'Tchimbambouka', 'Mpaka'],
};

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
  { nom: 'Hôtellerie & Hébergement', description: 'Hôtels, auberges, maisons d\'hôtes', actif: true },
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

const DEPARTMENTS_DATA = [
  { code: 'DIR', name: 'Direction Générale', description: 'Direction et administration générale' },
  { code: 'FIN', name: 'Finance & Comptabilité', description: 'Gestion financière et comptable' },
  { code: 'RH', name: 'Ressources Humaines', description: 'Gestion du personnel' },
  { code: 'OPS', name: 'Opérations', description: 'Opérations terrain et caisse' },
  { code: 'COM', name: 'Commercial', description: 'Vente et relation client' },
  { code: 'IT', name: 'Informatique', description: 'Systèmes d\'information' },
  { code: 'RISK', name: 'Risques & Conformité', description: 'Gestion des risques et conformité' },
];

// Plan comptable OHADA étendu pour microfinance
const PLAN_COMPTABLE_DATA = [
  // Classe 1: Capitaux
  { num: '101', label: 'Capital social', classe: 1, type: 'Capitaux', sens: 'Crédit', isSystem: true },
  { num: '12', label: 'Report à nouveau', classe: 1, type: 'Capitaux', sens: 'Crédit', isSystem: true },
  { num: '13', label: 'Résultat net', classe: 1, type: 'Capitaux', sens: 'Crédit', isSystem: true },
  { num: '16', label: 'Emprunts et dettes', classe: 1, type: 'Passif', sens: 'Crédit', isSystem: true },

  // Classe 2: Immobilisations
  { num: '21', label: 'Immobilisations incorporelles', classe: 2, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '22', label: 'Terrains', classe: 2, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '23', label: 'Bâtiments', classe: 2, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '24', label: 'Matériel', classe: 2, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '2711', label: 'Prêts - Principal', classe: 2, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '2718', label: 'Intérêts courus sur prêts', classe: 2, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '2917', label: 'Provisions pour dépréciation des prêts', classe: 2, type: 'Actif', sens: 'Crédit', isSystem: true },
  { num: '28', label: 'Amortissements', classe: 2, type: 'Actif', sens: 'Crédit', isSystem: true },

  // Classe 3: Stocks
  { num: '31', label: 'Marchandises', classe: 3, type: 'Actif', sens: 'Débit', isSystem: true },

  // Classe 4: Tiers
  { num: '401', label: 'Fournisseurs', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '411', label: 'Clients', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '4111', label: 'Dépôts clients - Comptes courants', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4112', label: 'Dépôts clients - Comptes épargne', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4113', label: 'Dépôts clients - Comptes bloqués', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '411100', label: 'Clients - Crédits en cours', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '411200', label: 'Clients - Crédits en souffrance', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '411300', label: 'Clients - Épargne', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '411400', label: 'Clients - Tontines', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '419000', label: 'Clients - Avances et acomptes', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4191', label: 'Fonds tontine — cotisations', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4192', label: 'Fonds tontine — pénalités', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '42', label: 'Personnel', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '421', label: 'Personnel — rémunérations dues', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4211', label: 'Avances et acomptes au personnel', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '4212', label: 'Personnel — avances déduites sur salaire', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '43', label: 'Sécurité Sociale', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '431', label: 'Sécurité Sociale — cotisations dues', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4311', label: 'CNSS — cotisations à reverser', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '44', label: 'État', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '441', label: 'État — impôts sur salaires (IPR)', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4421', label: 'État — IRPP retenu sur salaires', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '447', label: 'Formation professionnelle', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '4471', label: 'Formation — CFC et TAP à reverser', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '443', label: 'TVA Facturée', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '445', label: 'TVA Récupérable', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '47', label: 'Comptes transitoires', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '471', label: 'Compte d\'attente — entrées coffre', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },

  // Classe 5: Trésorerie (Critique pour microfinance)
  { num: '512', label: 'Banque', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '521', label: 'Caisse centrale', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5211', label: 'Caisse centrale siège', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5212', label: 'Caisse centrale agences', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '531', label: 'Coffre-fort central', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5311', label: 'Coffre-fort siège', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5312', label: 'Coffre-fort agences', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '532', label: 'Coffre-fort annexe', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  // NOTE: Compte 571 obsolète - utiliser 521 (Caisse centrale) à la place
  // { num: '571', label: '[LEGACY] Caisse principale', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  // { num: '572', label: '[LEGACY] Caisses annexes', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '573', label: 'Caisse agents terrain', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5731', label: 'Caisse agents terrain - Collecte', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '581', label: 'Virements internes', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '581000', label: 'Compte de liaison général', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5781', label: 'Caisse Mobile Money MTN', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '5782', label: 'Caisse Mobile Money Airtel', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '585', label: 'Virements Mobile Money', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '585100', label: 'Mobile Money - MTN (transit)', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '585200', label: 'Mobile Money - Airtel (transit)', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },

  // Classe 6: Charges
  { num: '601', label: 'Achats marchandises', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '61', label: 'Transports', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '62', label: 'Services extérieurs', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '627100', label: 'Commissions Mobile Money', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '6272', label: 'Commissions Mobile Money', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '627200', label: 'Frais bancaires', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '63', label: 'Impôts et taxes', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '66', label: 'Charges de personnel', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '661', label: 'Rémunérations du personnel', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '664', label: 'Charges sociales', classe: 6, type: 'Charge', sens: 'Débit', isSystem: false },
  { num: '658', label: 'Charges diverses', classe: 6, type: 'Charge', sens: 'Débit', isSystem: false },
  { num: '6588', label: 'Écarts de caisse agent - déficit', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '6611', label: 'Intérêts versés sur dépôts', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '6615', label: 'Charges de personnel — primes', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '669', label: 'Autres charges financières', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '672', label: 'Pertes sur créances irrécouvrables', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '681', label: 'Dotations amortissements', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '691', label: 'Provisions créances douteuses', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },

  // Classe 7: Produits
  { num: '701', label: 'Ventes marchandises', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '706', label: 'Services vendus', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '706100', label: 'Intérêts sur crédits', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '706200', label: 'Intérêts sur découverts', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '7071', label: 'Intérêts sur prêts', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '7072', label: 'Commissions sur prêts', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '7073', label: 'Pénalités de retard', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '7078', label: 'Produits pénalités tontines', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708', label: 'Produits accessoires', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708100', label: 'Frais de dossier crédit', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708200', label: 'Frais de tenue de compte', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708300', label: 'Commissions de gestion', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708400', label: 'Pénalités de retard', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708500', label: "Frais d'ouverture de compte", classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708600', label: 'Frais de clôture de compte', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708700', label: 'Frais services Mobile Money', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '758', label: 'Produits divers de gestion courante', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: false },
  { num: '7588', label: 'Écarts de caisse agent - surplus', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '772', label: 'Produits sur transit', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '76', label: 'Produits financiers', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '79', label: 'Reprises provisions', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
];

const JOURNAUX_DATA = [
  { code: 'CAISSE', intitule: 'Journal de Caisse', typeJournal: 'Caisse' },
  { code: 'CAI', intitule: 'Journal Caisse (espèces)', typeJournal: 'Caisse' },
  { code: 'BANK', intitule: 'Journal de Banque', typeJournal: 'Banque' },
  { code: 'BNK', intitule: 'Banque', typeJournal: 'Trésorerie' },
  { code: 'ACHAT', intitule: 'Journal d\'Achats', typeJournal: 'Achats' },
  { code: 'VENTE', intitule: 'Journal de Ventes', typeJournal: 'Ventes' },
  { code: 'OD', intitule: 'Opérations Diverses', typeJournal: 'Opérations Diverses' },
  { code: 'VRT', intitule: 'Virements Internes', typeJournal: 'Transferts' },
  { code: 'MMTN', intitule: 'Mobile Money MTN', typeJournal: 'Mobile Money' },
  { code: 'MAIR', intitule: 'Mobile Money Airtel', typeJournal: 'Mobile Money' },
  { code: 'CRD', intitule: 'Journal des Crédits', typeJournal: 'Crédits' },
  { code: 'EPGN', intitule: 'Journal Épargne', typeJournal: 'Épargne' },
  { code: 'TON', intitule: 'Tontines', typeJournal: 'Tontines' },
  { code: 'AN', intitule: 'À Nouveau', typeJournal: 'Reprise' },
];

// Accounting Rules — maps (sourceType, eventType) → journal + debit/credit accounts
// sourceType is always "MOUVEMENT"; eventType matches mouvement.typePaiement
const ACCOUNTING_RULES_DATA = [
  // --- Coffre ↔ Caisse transfers ---
  {
    code: 'COFFRE_TO_CAISSE',
    name: 'Transfert Coffre → Caisse',
    description: 'Approvisionnement caisse depuis coffre-fort',
    sourceType: 'MOUVEMENT',
    eventType: 'COFFRE_TO_CAISSE',
    journalCode: 'OD',
    debitAccount: '521',   // Caisse (reçoit)
    creditAccount: '531',  // Coffre-fort (envoie)
    descriptionTemplate: 'Approvisionnement caisse depuis coffre-fort',
    priority: 100,
  },
  // NOTE AUDIT : CAISSE_TO_COFFRE, RESTITUTION et LIQUIDATION_CAISSE partagent
  // les mêmes comptes GL (D 531 / C 521) mais des eventTypes distincts.
  // Ce n'est PAS une duplication — chaque règle correspond à un événement métier
  // différent (versement quotidien, annulation session, fermeture définitive)
  // nécessaire pour la traçabilité COBAC et la piste d'audit.
  {
    code: 'CAISSE_TO_COFFRE',
    name: 'Transfert Caisse → Coffre',
    description: 'Versement caisse vers coffre-fort',
    sourceType: 'MOUVEMENT',
    eventType: 'CAISSE_TO_COFFRE',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre-fort (reçoit)
    creditAccount: '521',  // Caisse (envoie)
    descriptionTemplate: 'Versement caisse vers coffre-fort',
    priority: 100,
  },
  // --- Approvisionnement externe du coffre (Capital/Apports) ---
  {
    code: 'SAFE_SUPPLY',
    name: 'Approvisionnement Externe Coffre',
    description: 'Approvisionnement coffre depuis apport en capital',
    sourceType: 'MOUVEMENT',
    eventType: 'SAFE_SUPPLY',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre-fort (reçoit les fonds)
    creditAccount: '101',  // Capital social (apport en capital)
    descriptionTemplate: 'Approvisionnement externe coffre-fort',
    priority: 100,
  },
  // --- Inter-coffre transfers (transit via 581) ---
  {
    code: 'COFFRE_TRANSIT_OUT',
    name: 'Dispatch inter-coffres (sortie)',
    description: 'Sortie coffre source → transit',
    sourceType: 'MOUVEMENT',
    eventType: 'COFFRE_TRANSIT_OUT',
    journalCode: 'OD',
    debitAccount: '581',   // Virements internes (transit)
    creditAccount: '531',  // Coffre-fort source
    descriptionTemplate: 'Dispatch inter-coffres — sortie vers transit',
    priority: 100,
  },
  {
    code: 'COFFRE_TRANSIT_IN',
    name: 'Réception inter-coffres (entrée)',
    description: 'Entrée transit → coffre destination',
    sourceType: 'MOUVEMENT',
    eventType: 'COFFRE_TRANSIT_IN',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre-fort destination
    creditAccount: '581',  // Virements internes (transit)
    descriptionTemplate: 'Réception inter-coffres — entrée depuis transit',
    priority: 100,
  },
  // --- Session closing écarts ---
  {
    code: 'SESSION_DEFICIT',
    name: 'Écart de caisse négatif (déficit)',
    description: 'Manquant constaté à la clôture de session',
    sourceType: 'MOUVEMENT',
    eventType: 'SESSION_DEFICIT',
    journalCode: 'OD',
    debitAccount: '658',   // Charges diverses
    creditAccount: '521',  // Caisse
    descriptionTemplate: 'Écart de caisse négatif — déficit constaté',
    priority: 100,
  },
  {
    code: 'SESSION_SURPLUS',
    name: 'Écart de caisse positif (excédent)',
    description: 'Excédent constaté à la clôture de session',
    sourceType: 'MOUVEMENT',
    eventType: 'SESSION_SURPLUS',
    journalCode: 'OD',
    debitAccount: '521',   // Caisse
    creditAccount: '758',  // Produits divers de gestion courante
    descriptionTemplate: 'Écart de caisse positif — excédent constaté',
    priority: 100,
  },
  // --- RH / Paie ---
  {
    code: 'PAYROLL_ENGAGEMENT',
    name: 'Engagement paie (validation bulletin)',
    description: 'Constatation charge salariale brute',
    sourceType: 'MOUVEMENT',
    eventType: 'PAYROLL_ENGAGEMENT',
    journalCode: 'OD',
    debitAccount: '661',   // Rémunérations du personnel
    creditAccount: '421',  // Personnel — rémunérations dues
    descriptionTemplate: 'Engagement paie — salaire brut',
    priority: 100,
  },
  {
    code: 'PAYROLL_PAYMENT',
    name: 'Paiement paie (décaissement)',
    description: 'Décaissement salaire net depuis caisse',
    sourceType: 'MOUVEMENT',
    eventType: 'PAYROLL_PAYMENT',
    journalCode: 'CAISSE',
    debitAccount: '421',   // Personnel — rémunérations dues
    creditAccount: '521',  // Caisse
    descriptionTemplate: 'Paiement salaire net — décaissement',
    priority: 100,
  },
  {
    code: 'PAYROLL_PAYMENT_TRANSFER',
    name: 'Paiement paie (virement bancaire)',
    description: 'Décaissement salaire net par virement bancaire',
    sourceType: 'MOUVEMENT',
    eventType: 'PAYROLL_PAYMENT',
    paymentMethod: 'TRANSFER',
    journalCode: 'BNK',
    debitAccount: '421',   // Personnel — rémunérations dues
    creditAccount: '512',  // Banque
    descriptionTemplate: 'Paiement salaire net — virement bancaire',
    priority: 90,
  },
  {
    code: 'PAYROLL_PAYMENT_MTN',
    name: 'Paiement paie (MTN MoMo)',
    description: 'Décaissement salaire net via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'PAYROLL_PAYMENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '421',   // Personnel — rémunérations dues
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Paiement salaire net — MTN MoMo',
    priority: 90,
  },
  {
    code: 'PAYROLL_PAYMENT_AIRTEL',
    name: 'Paiement paie (Airtel Money)',
    description: 'Décaissement salaire net via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'PAYROLL_PAYMENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '421',   // Personnel — rémunérations dues
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Paiement salaire net — Airtel Money',
    priority: 90,
  },

  // --- Primes Prospection ---
  {
    code: 'PROSPECTION_PRIME',
    name: 'Prime de prospection (paiement)',
    description: 'Paiement prime agent pour conversion prospect en client',
    sourceType: 'MOUVEMENT',
    eventType: 'PROSPECTION_PRIME',
    journalCode: 'OD',
    debitAccount: '6615',  // Charges personnel - primes
    creditAccount: '421',  // Personnel — rémunérations dues
    descriptionTemplate: 'Prime prospection — {employeNom}',
    priority: 100,
  },

  // --- Commissions Agent Terrain ---
  {
    code: 'AGENT_COMMISSION_CASH',
    name: 'Commission agent terrain — espèces',
    description: 'Paiement commission agent de terrain en espèces via caisse',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_COMMISSION',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '6615',   // Charges personnel - commissions/primes
    creditAccount: '521',   // Caisse (argent sort)
    descriptionTemplate: 'Commission agent — {employeNom} — {periode}',
    priority: 100,
  },
  {
    code: 'AGENT_COMMISSION_PAYROLL',
    name: 'Commission agent terrain — fiche de paie',
    description: 'Commission agent provisionnée pour paiement sur bulletin de paie',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_COMMISSION',
    paymentMethod: 'PAYROLL',
    journalCode: 'OD',
    debitAccount: '6615',   // Charges personnel - commissions/primes
    creditAccount: '421',   // Personnel — rémunérations dues
    descriptionTemplate: 'Commission agent (paie) — {employeNom} — {periode}',
    priority: 100,
  },
  {
    code: 'AGENT_COMMISSION_MM',
    name: 'Commission agent terrain — Mobile Money',
    description: 'Paiement commission agent via Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_COMMISSION',
    paymentMethod: 'MOBILE_MONEY',
    journalCode: 'MM',
    debitAccount: '6615',   // Charges personnel - commissions/primes
    creditAccount: '5781',  // Mobile Money (résolu dynamiquement par opérateur)
    descriptionTemplate: 'Commission agent MM — {employeNom} — {periode}',
    priority: 100,
  },

  // ============================================================================
  // DÉPÔTS ET RETRAITS PAR TYPE DE COMPTE
  // ============================================================================

  // --- Dépôts Compte Épargne (SAVINGS) ---
  {
    code: 'DEP_CASH_EPARGNE',
    name: 'Dépôt espèces compte épargne',
    description: 'Dépôt en espèces sur compte épargne client',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_SAVINGS',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt espèces épargne - {clientName}',
    priority: 10,
  },
  {
    code: 'DEP_MTN_EPARGNE',
    name: 'Dépôt MTN compte épargne',
    description: 'Dépôt Mobile Money MTN sur compte épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_SAVINGS',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt MTN MoMo épargne - {clientName}',
    priority: 10,
  },
  {
    code: 'DEP_AIRTEL_EPARGNE',
    name: 'Dépôt Airtel compte épargne',
    description: 'Dépôt Mobile Money Airtel sur compte épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_SAVINGS',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt Airtel Money épargne - {clientName}',
    priority: 10,
  },

  // --- Dépôts Compte Courant (CURRENT) ---
  {
    code: 'DEP_CASH_CURRENT',
    name: 'Dépôt espèces compte courant',
    description: 'Dépôt en espèces sur compte courant client',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_CURRENT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '4111', // Dépôts clients - Comptes courants
    descriptionTemplate: 'Dépôt espèces courant - {clientName}',
    priority: 10,
  },
  {
    code: 'DEP_MTN_CURRENT',
    name: 'Dépôt MTN compte courant',
    description: 'Dépôt Mobile Money MTN sur compte courant',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_CURRENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '4111', // Dépôts clients - Comptes courants
    descriptionTemplate: 'Dépôt MTN MoMo courant - {clientName}',
    priority: 10,
  },
  {
    code: 'DEP_AIRTEL_CURRENT',
    name: 'Dépôt Airtel compte courant',
    description: 'Dépôt Mobile Money Airtel sur compte courant',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_CURRENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '4111', // Dépôts clients - Comptes courants
    descriptionTemplate: 'Dépôt Airtel Money courant - {clientName}',
    priority: 10,
  },

  // --- Dépôts Compte Bloqué (BLOCKED) ---
  {
    code: 'DEP_CASH_BLOCKED',
    name: 'Dépôt espèces compte bloqué',
    description: 'Dépôt en espèces sur compte bloqué client',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_BLOCKED',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '4113', // Dépôts clients - Comptes bloqués
    descriptionTemplate: 'Dépôt espèces bloqué - {clientName}',
    priority: 10,
  },
  {
    code: 'DEP_MTN_BLOCKED',
    name: 'Dépôt MTN compte bloqué',
    description: 'Dépôt Mobile Money MTN sur compte bloqué',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_BLOCKED',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '4113', // Dépôts clients - Comptes bloqués
    descriptionTemplate: 'Dépôt MTN MoMo bloqué - {clientName}',
    priority: 10,
  },
  {
    code: 'DEP_AIRTEL_BLOCKED',
    name: 'Dépôt Airtel compte bloqué',
    description: 'Dépôt Mobile Money Airtel sur compte bloqué',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_BLOCKED',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '4113', // Dépôts clients - Comptes bloqués
    descriptionTemplate: 'Dépôt Airtel Money bloqué - {clientName}',
    priority: 10,
  },

  // --- Retraits Compte Épargne (SAVINGS) ---
  {
    code: 'RET_CASH_EPARGNE',
    name: 'Retrait espèces compte épargne',
    description: 'Retrait en espèces depuis compte épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_SAVINGS',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4112',  // Dépôts clients - Comptes épargne
    creditAccount: '521',  // Caisse centrale
    descriptionTemplate: 'Retrait espèces épargne - {clientName}',
    priority: 10,
  },
  {
    code: 'RET_MTN_EPARGNE',
    name: 'Payout MTN compte épargne',
    description: 'Payout vers Mobile Money MTN depuis compte épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_SAVINGS',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '4112',  // Dépôts clients - Comptes épargne
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Payout MTN épargne - {clientName}',
    priority: 10,
  },
  {
    code: 'RET_AIRTEL_EPARGNE',
    name: 'Payout Airtel compte épargne',
    description: 'Payout vers Mobile Money Airtel depuis compte épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_SAVINGS',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '4112',  // Dépôts clients - Comptes épargne
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Payout Airtel épargne - {clientName}',
    priority: 10,
  },

  // --- Retraits Compte Courant (CURRENT) ---
  {
    code: 'RET_CASH_CURRENT',
    name: 'Retrait espèces compte courant',
    description: 'Retrait en espèces depuis compte courant',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_CURRENT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4111',  // Dépôts clients - Comptes courants
    creditAccount: '521',  // Caisse centrale
    descriptionTemplate: 'Retrait espèces courant - {clientName}',
    priority: 10,
  },
  {
    code: 'RET_MTN_CURRENT',
    name: 'Payout MTN compte courant',
    description: 'Payout vers Mobile Money MTN depuis compte courant',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_CURRENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '4111',  // Dépôts clients - Comptes courants
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Payout MTN courant - {clientName}',
    priority: 10,
  },
  {
    code: 'RET_AIRTEL_CURRENT',
    name: 'Payout Airtel compte courant',
    description: 'Payout vers Mobile Money Airtel depuis compte courant',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_CURRENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '4111',  // Dépôts clients - Comptes courants
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Payout Airtel courant - {clientName}',
    priority: 10,
  },

  // --- Retraits Compte Bloqué (BLOCKED) - après déblocage ---
  {
    code: 'RET_CASH_BLOCKED',
    name: 'Retrait espèces compte bloqué',
    description: 'Retrait en espèces depuis compte bloqué après déblocage',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_BLOCKED',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4113',  // Dépôts clients - Comptes bloqués
    creditAccount: '521',  // Caisse centrale
    descriptionTemplate: 'Retrait espèces bloqué - {clientName}',
    priority: 10,
  },
  {
    code: 'RET_MTN_BLOCKED',
    name: 'Payout MTN compte bloqué',
    description: 'Payout vers MTN depuis compte bloqué après déblocage',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_BLOCKED',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '4113',  // Dépôts clients - Comptes bloqués
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Payout MTN bloqué - {clientName}',
    priority: 10,
  },
  {
    code: 'RET_AIRTEL_BLOCKED',
    name: 'Payout Airtel compte bloqué',
    description: 'Payout vers Airtel depuis compte bloqué après déblocage',
    sourceType: 'MOUVEMENT',
    eventType: 'WITHDRAWAL_BLOCKED',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '4113',  // Dépôts clients - Comptes bloqués
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Payout Airtel bloqué - {clientName}',
    priority: 10,
  },

  // ============================================================================
  // CRÉDITS
  // ============================================================================

  // --- Décaissement crédit ---
  {
    code: 'CREDIT_DECAISS_CASH',
    name: 'Décaissement crédit espèces',
    description: 'Décaissement d\'un crédit en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_DISBURSEMENT',
    paymentMethod: 'CASH',
    journalCode: 'CRD',
    debitAccount: '2711',  // Prêts - Principal
    creditAccount: '521',  // Caisse centrale (cash sort physiquement de la caisse)
    descriptionTemplate: 'Décaissement crédit #{creditNumber} - {clientName}',
    priority: 10,
  },
  {
    code: 'CREDIT_DECAISS_MTN',
    name: 'Décaissement crédit MTN',
    description: 'Décaissement d\'un crédit vers MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_DISBURSEMENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'CRD',
    debitAccount: '2711',  // Prêts - Principal
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Décaissement crédit #{creditNumber} MTN - {clientName}',
    priority: 10,
  },
  {
    code: 'CREDIT_DECAISS_AIRTEL',
    name: 'Décaissement crédit Airtel',
    description: 'Décaissement d\'un crédit vers Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_DISBURSEMENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'CRD',
    debitAccount: '2711',  // Prêts - Principal
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Décaissement crédit #{creditNumber} Airtel - {clientName}',
    priority: 10,
  },
  {
    code: 'CREDIT_DECAISS_COMPTE',
    name: 'Décaissement crédit vers compte',
    description: 'Mise à disposition crédit sur compte client (SYSCOHADA : pas de mouvement de cash)',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_DISBURSEMENT',
    paymentMethod: 'TRANSFER',
    journalCode: 'CRD',
    debitAccount: '2711',  // Prêts - Principal (actif : créance sur le client)
    creditAccount: '4111', // Comptes courants clients (passif : mise à disposition)
    descriptionTemplate: 'Décaissement crédit #{creditNumber} vers compte - {clientName}',
    priority: 10,
  },

  // --- Remboursement crédit ---
  {
    code: 'REMBOURS_CASH_PRINCIPAL',
    name: 'Remboursement crédit principal espèces',
    description: 'Remboursement du principal en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '2711', // Prêts - Principal
    descriptionTemplate: 'Remboursement principal crédit #{creditNumber} - {clientName}',
    priority: 20,
  },
  {
    code: 'REMBOURS_MTN_PRINCIPAL',
    name: 'Remboursement crédit principal MTN',
    description: 'Remboursement du principal via MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '2711', // Prêts - Principal
    descriptionTemplate: 'Remboursement principal crédit #{creditNumber} MTN - {clientName}',
    priority: 20,
  },
  {
    code: 'REMBOURS_AIRTEL_PRINCIPAL',
    name: 'Remboursement crédit principal Airtel',
    description: 'Remboursement du principal via Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '2711', // Prêts - Principal
    descriptionTemplate: 'Remboursement principal crédit #{creditNumber} Airtel - {clientName}',
    priority: 20,
  },

  // --- Intérêts crédit ---
  {
    code: 'REMBOURS_CASH_INTERET',
    name: 'Remboursement intérêts espèces',
    description: 'Remboursement des intérêts en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT_INTEREST',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '7071', // Intérêts sur prêts
    descriptionTemplate: 'Remboursement intérêts crédit #{creditNumber} - {clientName}',
    priority: 20,
  },
  {
    code: 'REMBOURS_MTN_INTERET',
    name: 'Remboursement intérêts MTN',
    description: 'Remboursement des intérêts via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT_INTEREST',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '7071', // Intérêts sur prêts
    descriptionTemplate: 'Remboursement intérêts crédit #{creditNumber} MTN - {clientName}',
    priority: 20,
  },
  {
    code: 'REMBOURS_AIRTEL_INTERET',
    name: 'Remboursement intérêts Airtel',
    description: 'Remboursement des intérêts via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT_INTEREST',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '7071', // Intérêts sur prêts
    descriptionTemplate: 'Remboursement intérêts crédit #{creditNumber} Airtel - {clientName}',
    priority: 20,
  },

  // --- Pénalités crédit ---
  {
    code: 'REMBOURS_CASH_PENALITE',
    name: 'Remboursement pénalités espèces',
    description: 'Remboursement des pénalités en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT_PENALTY',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '7073', // Pénalités de retard
    descriptionTemplate: 'Remboursement pénalités crédit #{creditNumber} - {clientName}',
    priority: 20,
  },
  {
    code: 'REMBOURS_MTN_PENALITE',
    name: 'Remboursement pénalités MTN',
    description: 'Remboursement des pénalités via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT_PENALTY',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '7073', // Pénalités de retard
    descriptionTemplate: 'Remboursement pénalités crédit #{creditNumber} MTN - {clientName}',
    priority: 20,
  },
  {
    code: 'REMBOURS_AIRTEL_PENALITE',
    name: 'Remboursement pénalités Airtel',
    description: 'Remboursement des pénalités via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_REPAYMENT_PENALTY',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '7073', // Pénalités de retard
    descriptionTemplate: 'Remboursement pénalités crédit #{creditNumber} Airtel - {clientName}',
    priority: 20,
  },

  // --- Frais de dossier ---
  {
    code: 'FRAIS_DOSSIER',
    name: 'Frais de dossier crédit',
    description: 'Frais de dossier crédit',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_FEE',
    journalCode: 'CRD',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '7072', // Frais de dossier
    descriptionTemplate: 'Frais de dossier crédit #{creditNumber}',
    priority: 10,
  },

  // ============================================================================
  // TONTINES
  // ============================================================================

  {
    code: 'TONTINE_COTIS_CASH',
    name: 'Cotisation tontine espèces',
    description: 'Cotisation tontine en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_CONTRIBUTION',
    paymentMethod: 'CASH',
    journalCode: 'TON',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '4191', // Fonds tontine - Cotisations
    descriptionTemplate: 'Cotisation tontine {tontineName} - {clientName}',
    priority: 10,
  },
  {
    code: 'TONTINE_COTIS_MTN',
    name: 'Cotisation tontine MTN',
    description: 'Cotisation tontine via MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_CONTRIBUTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'TON',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '4191', // Fonds tontine - Cotisations
    descriptionTemplate: 'Cotisation tontine {tontineName} MTN - {clientName}',
    priority: 10,
  },
  {
    code: 'TONTINE_COTIS_AIRTEL',
    name: 'Cotisation tontine Airtel',
    description: 'Cotisation tontine via Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_CONTRIBUTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'TON',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '4191', // Fonds tontine - Cotisations
    descriptionTemplate: 'Cotisation tontine {tontineName} Airtel - {clientName}',
    priority: 10,
  },
  {
    code: 'TONTINE_DISTRIB_CASH',
    name: 'Distribution tontine espèces',
    description: 'Distribution gain tontine en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_DISTRIBUTION',
    paymentMethod: 'CASH',
    journalCode: 'TON',
    debitAccount: '4191',  // Fonds tontine - Cotisations
    creditAccount: '521',  // Caisse centrale
    descriptionTemplate: 'Distribution tontine {tontineName} - {clientName}',
    priority: 10,
  },
  {
    code: 'TONTINE_DISTRIB_MTN',
    name: 'Distribution tontine MTN',
    description: 'Distribution gain tontine via MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_DISTRIBUTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'TON',
    debitAccount: '4191',  // Fonds tontine - Cotisations
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Distribution tontine {tontineName} MTN - {clientName}',
    priority: 10,
  },
  {
    code: 'TONTINE_DISTRIB_AIRTEL',
    name: 'Distribution tontine Airtel',
    description: 'Distribution gain tontine via Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_DISTRIBUTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'TON',
    debitAccount: '4191',  // Fonds tontine - Cotisations
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Distribution tontine {tontineName} Airtel - {clientName}',
    priority: 10,
  },
  {
    code: 'TONTINE_PENALITE',
    name: 'Pénalité tontine',
    description: 'Pénalité de retard tontine',
    sourceType: 'MOUVEMENT',
    eventType: 'TONTINE_PENALTY',
    journalCode: 'TON',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '4192', // Fonds tontine - Pénalités
    descriptionTemplate: 'Pénalité tontine {tontineName} - {clientName}',
    priority: 10,
  },

  // ============================================================================
  // COMMISSIONS ET FRAIS OPÉRATEURS
  // ============================================================================

  {
    code: 'COMM_MTN',
    name: 'Commission MTN',
    description: 'Commission opérateur MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'OPERATOR_FEE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '6272',  // Commissions Mobile Money
    creditAccount: '5781', // Mobile Money MTN
    descriptionTemplate: 'Commission MTN MoMo',
    priority: 10,
  },
  {
    code: 'COMM_AIRTEL',
    name: 'Commission Airtel',
    description: 'Commission opérateur Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'OPERATOR_FEE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '6272',  // Commissions Mobile Money
    creditAccount: '5782', // Mobile Money Airtel
    descriptionTemplate: 'Commission Airtel Money',
    priority: 10,
  },

  // ============================================================================
  // FRAIS MM FACTURÉS AU CLIENT (Revenus Cofinco)
  // ============================================================================

  {
    code: 'MM_FEE_REVENUE_MTN',
    name: 'Frais MM facturés client (MTN)',
    description: 'Revenus des frais Mobile Money facturés au client - MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'MM_FEE_REVENUE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',   // Mobile Money MTN (les frais restent dans le wallet MM)
    creditAccount: '708700', // Frais services Mobile Money (revenu)
    descriptionTemplate: 'Frais Mobile Money MTN facturés au client',
    priority: 10,
  },
  {
    code: 'MM_FEE_REVENUE_AIRTEL',
    name: 'Frais MM facturés client (Airtel)',
    description: 'Revenus des frais Mobile Money facturés au client - Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'MM_FEE_REVENUE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',   // Mobile Money Airtel
    creditAccount: '708700', // Frais services Mobile Money (revenu)
    descriptionTemplate: 'Frais Mobile Money Airtel facturés au client',
    priority: 10,
  },

  // ============================================================================
  // OPÉRATIONS AGENT TERRAIN
  // ============================================================================

  // Collecte par agent terrain (encaissement client)
  {
    code: 'AGENT_COLLECT_CASH',
    name: 'Collecte espèces agent terrain',
    description: 'Encaissement par agent terrain sur le terrain',
    sourceType: 'MOUVEMENT',
    eventType: 'COLLECT_CASH',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '573',   // Caisse agent terrain
    creditAccount: '4191', // Fonds tontine ou clients
    descriptionTemplate: 'Collecte agent terrain',
    priority: 10,
  },

  // Remise agent (versement de la collecte à la caisse agence)
  {
    code: 'AGENT_SETTLEMENT_CASH',
    name: 'Remise espèces agent terrain',
    description: 'Remise de collecte par agent terrain vers caisse agence',
    sourceType: 'MOUVEMENT',
    eventType: 'SETTLEMENT_CASH',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '573',  // Caisse agent terrain
    descriptionTemplate: 'Remise agent terrain vers caisse',
    priority: 10,
  },

  // Restitution coffre (annulation ouverture session)
  {
    code: 'RESTITUTION',
    name: 'Restitution fonds au coffre',
    description: 'Restitution des fonds au coffre après annulation',
    sourceType: 'MOUVEMENT',
    eventType: 'RESTITUTION',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre-fort
    creditAccount: '521',  // Caisse centrale
    descriptionTemplate: 'Restitution fonds au coffre',
    priority: 10,
  },

  // ============================================================================
  // SESSIONS AGENT TERRAIN
  // ============================================================================

  // Provisionnement agent terrain (Caisse agence → Agent)
  {
    code: 'AGENT_PROVISIONING',
    name: 'Provisionnement agent terrain',
    description: 'Transfert de fonds de la caisse agence vers agent terrain (ouverture session)',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_PROVISIONING',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '573',   // Caisse agent terrain (résolu dynamiquement en sous-compte)
    creditAccount: '521',  // Caisse agence
    descriptionTemplate: 'Provisionnement agent terrain - ouverture session',
    priority: 10,
  },

  // Clôture session agent terrain (Agent → Caisse agence)
  {
    code: 'AGENT_SESSION_CLOSE',
    name: 'Clôture session agent terrain',
    description: 'Retour de fonds de l\'agent terrain vers caisse agence (clôture session)',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_SESSION_CLOSE',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse agence
    creditAccount: '573',  // Caisse agent terrain (résolu dynamiquement en sous-compte)
    descriptionTemplate: 'Clôture session agent terrain - retour fonds',
    priority: 10,
  },

  // Écart de caisse agent - surplus (agent a plus que prévu)
  {
    code: 'AGENT_ECART_SURPLUS',
    name: 'Écart de caisse agent - surplus',
    description: 'Excédent constaté lors du rapprochement de session agent',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_ECART_SURPLUS',
    journalCode: 'OD',
    debitAccount: '573',   // Caisse agent terrain (résolu en sous-compte)
    creditAccount: '7588', // Produits divers - surplus de caisse
    descriptionTemplate: 'Écart de caisse agent - surplus constaté',
    priority: 10,
  },

  // Écart de caisse agent - déficit (agent a moins que prévu)
  {
    code: 'AGENT_ECART_DEFICIT',
    name: 'Écart de caisse agent - déficit',
    description: 'Déficit constaté lors du rapprochement de session agent',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_ECART_DEFICIT',
    journalCode: 'OD',
    debitAccount: '6588',  // Charges diverses - déficit de caisse
    creditAccount: '573',  // Caisse agent terrain (résolu en sous-compte)
    descriptionTemplate: 'Écart de caisse agent - déficit constaté',
    priority: 10,
  },

  // Retrait agent terrain - Compte épargne (Agent remet espèces au client)
  {
    code: 'AGENT_WITHDRAWAL_SAVINGS',
    name: 'Retrait agent terrain - Compte épargne',
    description: 'Retrait espèces effectué par agent terrain sur compte épargne client',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_WITHDRAWAL_SAVINGS',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4112',  // Dépôts clients - Comptes épargne (compte client débité)
    creditAccount: '573',  // Caisse agent terrain (agent remet les espèces)
    descriptionTemplate: 'Retrait épargne via agent terrain',
    priority: 10,
  },

  // Retrait agent terrain - Compte courant (Agent remet espèces au client)
  {
    code: 'AGENT_WITHDRAWAL_CURRENT',
    name: 'Retrait agent terrain - Compte courant',
    description: 'Retrait espèces effectué par agent terrain sur compte courant client',
    sourceType: 'MOUVEMENT',
    eventType: 'AGENT_WITHDRAWAL_CURRENT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4111',  // Dépôts clients - Comptes courants (compte client débité)
    creditAccount: '573',  // Caisse agent terrain (agent remet les espèces)
    descriptionTemplate: 'Retrait compte courant via agent terrain',
    priority: 10,
  },

  // ============================================================================
  // RÈGLES ADDITIONNELLES POUR TRAÇABILITÉ GL COMPLÈTE
  // ============================================================================

  // Frais d'engagement crédit (engagement fees)
  {
    code: 'ENGAGEMENT_FEE_CASH',
    name: 'Frais d\'engagement crédit',
    description: 'Frais d\'engagement pour ouverture de crédit',
    sourceType: 'MOUVEMENT',
    eventType: 'ENGAGEMENT_FEE',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '708100', // Produits des services - Frais d'engagement
    descriptionTemplate: 'Frais d\'engagement crédit - {clientName}',
    priority: 10,
  },
  {
    code: 'ENGAGEMENT_FEE_MTN',
    name: 'Frais d\'engagement crédit MTN',
    description: 'Frais d\'engagement pour ouverture de crédit via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'ENGAGEMENT_FEE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',   // Mobile Money MTN
    creditAccount: '708100', // Produits des services - Frais d'engagement
    descriptionTemplate: 'Frais d\'engagement crédit MTN - {clientName}',
    priority: 10,
  },
  {
    code: 'ENGAGEMENT_FEE_AIRTEL',
    name: 'Frais d\'engagement crédit Airtel',
    description: 'Frais d\'engagement pour ouverture de crédit via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'ENGAGEMENT_FEE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',   // Mobile Money Airtel
    creditAccount: '708100', // Produits des services - Frais d'engagement
    descriptionTemplate: 'Frais d\'engagement crédit Airtel - {clientName}',
    priority: 10,
  },

  // Dépôt initial ouverture compte
  {
    code: 'INITIAL_DEPOSIT_CASH',
    name: 'Dépôt initial ouverture compte',
    description: 'Dépôt initial pour ouverture de compte épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'INITIAL_DEPOSIT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt initial ouverture compte - {clientName}',
    priority: 10,
  },
  {
    code: 'INITIAL_DEPOSIT_MTN',
    name: 'Dépôt initial ouverture compte MTN',
    description: 'Dépôt initial pour ouverture de compte via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'INITIAL_DEPOSIT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt initial ouverture compte MTN - {clientName}',
    priority: 10,
  },
  {
    code: 'INITIAL_DEPOSIT_AIRTEL',
    name: 'Dépôt initial ouverture compte Airtel',
    description: 'Dépôt initial pour ouverture de compte via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'INITIAL_DEPOSIT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt initial ouverture compte Airtel - {clientName}',
    priority: 10,
  },
  {
    code: 'INITIAL_DEPOSIT_TRANSFER',
    name: 'Dépôt initial ouverture compte virement',
    description: 'Dépôt initial pour ouverture de compte par virement',
    sourceType: 'MOUVEMENT',
    eventType: 'INITIAL_DEPOSIT',
    paymentMethod: 'TRANSFER',
    journalCode: 'OD',
    debitAccount: '581',   // Virements internes
    creditAccount: '4112', // Dépôts clients - Comptes épargne
    descriptionTemplate: 'Dépôt initial ouverture compte virement - {clientName}',
    priority: 10,
  },

  // ============================================================================
  // FRAIS D'OUVERTURE DE COMPTE
  // ============================================================================

  // Frais d'ouverture - Espèces
  {
    code: 'OPENING_FEE_CASH',
    name: "Frais d'ouverture compte (espèces)",
    description: "Frais d'ouverture perçu en espèces",
    sourceType: 'MOUVEMENT',
    eventType: 'OPENING_FEE',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',     // Caisse centrale
    creditAccount: '708500', // Frais d'ouverture de compte (Produit)
    descriptionTemplate: "Frais ouverture compte - {clientName}",
    priority: 10,
  },
  // Frais d'ouverture - MTN
  {
    code: 'OPENING_FEE_MTN',
    name: "Frais d'ouverture compte (MTN)",
    description: "Frais d'ouverture perçu via MTN Mobile Money",
    sourceType: 'MOUVEMENT',
    eventType: 'OPENING_FEE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',    // Mobile Money MTN
    creditAccount: '708500', // Frais d'ouverture de compte
    descriptionTemplate: "Frais ouverture compte MTN - {clientName}",
    priority: 10,
  },
  // Frais d'ouverture - Airtel
  {
    code: 'OPENING_FEE_AIRTEL',
    name: "Frais d'ouverture compte (Airtel)",
    description: "Frais d'ouverture perçu via Airtel Money",
    sourceType: 'MOUVEMENT',
    eventType: 'OPENING_FEE',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',    // Mobile Money Airtel
    creditAccount: '708500', // Frais d'ouverture de compte
    descriptionTemplate: "Frais ouverture compte Airtel - {clientName}",
    priority: 10,
  },

  // Frais d'ouverture - Virement interne (prélevé sur compte courant source)
  {
    code: 'OPENING_FEE_TRANSFER',
    name: "Frais d'ouverture compte (virement)",
    description: "Frais d'ouverture prélevé par virement interne depuis un compte existant",
    sourceType: 'MOUVEMENT',
    eventType: 'OPENING_FEE',
    paymentMethod: 'TRANSFER',
    journalCode: 'OPD',
    debitAccount: '4111',    // Dépôts courant (compte source)
    creditAccount: '708500', // Frais d'ouverture de compte
    descriptionTemplate: "Frais ouverture compte (virement) - {clientName}",
    priority: 10,
  },

  // ============================================================================
  // FRAIS DE CLÔTURE DE COMPTE (prélevés sur dépôts client)
  // ============================================================================

  // Frais de clôture - Compte épargne
  {
    code: 'CLOSING_FEE_SAVINGS',
    name: 'Frais clôture compte épargne',
    description: 'Frais de clôture prélevé sur dépôt client épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSING_FEE_SAVINGS',
    journalCode: 'OD',
    debitAccount: '4112',    // Dépôts clients - Comptes épargne
    creditAccount: '708600', // Frais de clôture de compte (Produit)
    descriptionTemplate: 'Frais clôture compte épargne - {clientName}',
    priority: 10,
  },
  // Frais de clôture - Compte courant
  {
    code: 'CLOSING_FEE_CURRENT',
    name: 'Frais clôture compte courant',
    description: 'Frais de clôture prélevé sur dépôt client courant',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSING_FEE_CURRENT',
    journalCode: 'OD',
    debitAccount: '4111',    // Dépôts clients - Comptes courants
    creditAccount: '708600', // Frais de clôture de compte
    descriptionTemplate: 'Frais clôture compte courant - {clientName}',
    priority: 10,
  },
  // Frais de clôture - Compte bloqué
  {
    code: 'CLOSING_FEE_BLOCKED',
    name: 'Frais clôture compte bloqué',
    description: 'Frais de clôture prélevé sur dépôt client bloqué',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSING_FEE_BLOCKED',
    journalCode: 'OD',
    debitAccount: '4113',    // Dépôts clients - Comptes bloqués
    creditAccount: '708600', // Frais de clôture de compte
    descriptionTemplate: 'Frais clôture compte bloqué - {clientName}',
    priority: 10,
  },

  // ============================================================================
  // FRAIS DE TENUE DE COMPTE (prélèvement mensuel automatique)
  // ============================================================================

  // Frais de tenue - Compte épargne
  {
    code: 'MAINTENANCE_FEE_SAVINGS',
    name: 'Frais tenue compte épargne',
    description: 'Frais de tenue mensuel prélevé sur dépôt client épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'MAINTENANCE_FEE_SAVINGS',
    journalCode: 'OD',
    debitAccount: '4112',    // Dépôts clients - Comptes épargne
    creditAccount: '708200', // Frais de tenue de compte (Produit)
    descriptionTemplate: 'Frais tenue compte épargne - {clientName}',
    priority: 10,
  },
  // Frais de tenue - Compte courant
  {
    code: 'MAINTENANCE_FEE_CURRENT',
    name: 'Frais tenue compte courant',
    description: 'Frais de tenue mensuel prélevé sur dépôt client courant',
    sourceType: 'MOUVEMENT',
    eventType: 'MAINTENANCE_FEE_CURRENT',
    journalCode: 'OD',
    debitAccount: '4111',    // Dépôts clients - Comptes courants
    creditAccount: '708200', // Frais de tenue de compte
    descriptionTemplate: 'Frais tenue compte courant - {clientName}',
    priority: 10,
  },
  // Frais de tenue - Compte bloqué
  {
    code: 'MAINTENANCE_FEE_BLOCKED',
    name: 'Frais tenue compte bloqué',
    description: 'Frais de tenue mensuel prélevé sur dépôt client bloqué',
    sourceType: 'MOUVEMENT',
    eventType: 'MAINTENANCE_FEE_BLOCKED',
    journalCode: 'OD',
    debitAccount: '4113',    // Dépôts clients - Comptes bloqués
    creditAccount: '708200', // Frais de tenue de compte
    descriptionTemplate: 'Frais tenue compte bloqué - {clientName}',
    priority: 10,
  },

  // ============================================================================
  // RESTITUTION CLÔTURE (payout client)
  // ============================================================================

  // Restitution clôture espèces - Épargne
  {
    code: 'CLOSURE_PAYOUT_CASH_SAVINGS',
    name: 'Restitution clôture épargne (espèces)',
    description: 'Restitution solde clôture compte épargne en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_SAVINGS',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4112',    // Dépôts clients - Comptes épargne
    creditAccount: '521',    // Caisse centrale
    descriptionTemplate: 'Restitution clôture épargne - {clientName}',
    priority: 10,
  },
  // Restitution clôture espèces - Courant
  {
    code: 'CLOSURE_PAYOUT_CASH_CURRENT',
    name: 'Restitution clôture courant (espèces)',
    description: 'Restitution solde clôture compte courant en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_CURRENT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4111',    // Dépôts clients - Comptes courants
    creditAccount: '521',    // Caisse centrale
    descriptionTemplate: 'Restitution clôture courant - {clientName}',
    priority: 10,
  },
  // Restitution clôture espèces - Bloqué
  {
    code: 'CLOSURE_PAYOUT_CASH_BLOCKED',
    name: 'Restitution clôture bloqué (espèces)',
    description: 'Restitution solde clôture compte bloqué en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_BLOCKED',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4113',    // Dépôts clients - Comptes bloqués
    creditAccount: '521',    // Caisse centrale
    descriptionTemplate: 'Restitution clôture bloqué - {clientName}',
    priority: 10,
  },

  // ============================================================================
  // RESTITUTION CLÔTURE Mobile Money (MTN + Airtel × 3 types de compte)
  // ============================================================================

  // Restitution clôture MoMo MTN - Épargne
  {
    code: 'CLOSURE_PAYOUT_MTN_SAVINGS',
    name: 'Restitution clôture épargne (MTN)',
    description: 'Restitution solde clôture compte épargne via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_SAVINGS',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMO',
    debitAccount: '4112',    // Dépôts clients - Comptes épargne
    creditAccount: '5781',   // Mobile Money MTN
    descriptionTemplate: 'Restitution clôture épargne MTN - {clientName}',
    priority: 10,
  },
  // Restitution clôture MoMo Airtel - Épargne
  {
    code: 'CLOSURE_PAYOUT_AIRTEL_SAVINGS',
    name: 'Restitution clôture épargne (Airtel)',
    description: 'Restitution solde clôture compte épargne via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_SAVINGS',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MMO',
    debitAccount: '4112',    // Dépôts clients - Comptes épargne
    creditAccount: '5782',   // Mobile Money Airtel
    descriptionTemplate: 'Restitution clôture épargne Airtel - {clientName}',
    priority: 10,
  },
  // Restitution clôture MoMo MTN - Courant
  {
    code: 'CLOSURE_PAYOUT_MTN_CURRENT',
    name: 'Restitution clôture courant (MTN)',
    description: 'Restitution solde clôture compte courant via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_CURRENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMO',
    debitAccount: '4111',    // Dépôts clients - Comptes courants
    creditAccount: '5781',   // Mobile Money MTN
    descriptionTemplate: 'Restitution clôture courant MTN - {clientName}',
    priority: 10,
  },
  // Restitution clôture MoMo Airtel - Courant
  {
    code: 'CLOSURE_PAYOUT_AIRTEL_CURRENT',
    name: 'Restitution clôture courant (Airtel)',
    description: 'Restitution solde clôture compte courant via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_CURRENT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MMO',
    debitAccount: '4111',    // Dépôts clients - Comptes courants
    creditAccount: '5782',   // Mobile Money Airtel
    descriptionTemplate: 'Restitution clôture courant Airtel - {clientName}',
    priority: 10,
  },
  // Restitution clôture MoMo MTN - Bloqué
  {
    code: 'CLOSURE_PAYOUT_MTN_BLOCKED',
    name: 'Restitution clôture bloqué (MTN)',
    description: 'Restitution solde clôture compte bloqué via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_BLOCKED',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMO',
    debitAccount: '4113',    // Dépôts clients - Comptes bloqués
    creditAccount: '5781',   // Mobile Money MTN
    descriptionTemplate: 'Restitution clôture bloqué MTN - {clientName}',
    priority: 10,
  },
  // Restitution clôture MoMo Airtel - Bloqué
  {
    code: 'CLOSURE_PAYOUT_AIRTEL_BLOCKED',
    name: 'Restitution clôture bloqué (Airtel)',
    description: 'Restitution solde clôture compte bloqué via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CLOSURE_PAYOUT_BLOCKED',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MMO',
    debitAccount: '4113',    // Dépôts clients - Comptes bloqués
    creditAccount: '5782',   // Mobile Money Airtel
    descriptionTemplate: 'Restitution clôture bloqué Airtel - {clientName}',
    priority: 10,
  },

  // Virement interne entre comptes client
  {
    code: 'INTERNAL_TRANSFER',
    name: 'Virement interne',
    description: 'Virement entre comptes du même client',
    sourceType: 'MOUVEMENT',
    eventType: 'INTERNAL_TRANSFER',
    journalCode: 'OD',
    debitAccount: '4111',  // Dépôts clients - Comptes courants (source)
    creditAccount: '4112', // Dépôts clients - Comptes épargne (destination)
    descriptionTemplate: 'Virement interne - {clientName}',
    priority: 10,
  },

  // Transfert sortant du coffre
  {
    code: 'TRANSFER_OUT',
    name: 'Transfert sortant coffre',
    description: 'Transfert de fonds sortant du coffre',
    sourceType: 'MOUVEMENT',
    eventType: 'TRANSFER_OUT',
    journalCode: 'VRT',
    debitAccount: '581',   // Virements internes (transit)
    creditAccount: '531',  // Coffre-fort
    descriptionTemplate: 'Transfert sortant coffre',
    priority: 10,
  },

  // Dépôt système (automatique) - utilise compte transit, pas caisse physique
  {
    code: 'DEP_SYSTEM_CURRENT',
    name: 'Dépôt système compte courant',
    description: 'Dépôt système (écriture comptable, pas de mouvement physique de caisse)',
    sourceType: 'MOUVEMENT',
    eventType: 'DEPOSIT_CURRENT',
    journalCode: 'OD',
    debitAccount: '581',   // Virements internes (transit) - pas de caisse physique
    creditAccount: '4111', // Dépôts clients - Comptes courants
    descriptionTemplate: 'Dépôt système - {clientName}',
    priority: 5,  // Priorité basse car c'est un fallback
  },

  // ============================================================================
  // TRANSFERTS INTER-SESSIONS CAISSE
  // ============================================================================

  // Transfert entrant (caisse reçoit des fonds)
  {
    code: 'TRANSFER_IN',
    name: 'Transfert entrant caisse',
    description: 'Réception de fonds depuis une autre caisse',
    sourceType: 'MOUVEMENT',
    eventType: 'TRANSFER_IN',
    paymentMethod: 'TRANSFER',
    journalCode: 'VRT',
    debitAccount: '521',   // Caisse reçoit
    creditAccount: '581',  // Transit
    descriptionTemplate: 'Transfert reçu de caisse',
    priority: 10,
  },

  // Transfert sortant session (vers autre caisse)
  {
    code: 'TRANSFER_OUT_SESSION',
    name: 'Transfert sortant session caisse',
    description: 'Transfert de fonds vers une autre caisse',
    sourceType: 'MOUVEMENT',
    eventType: 'TRANSFER_OUT',
    paymentMethod: 'TRANSFER',
    journalCode: 'VRT',
    debitAccount: '581',   // Transit
    creditAccount: '521',  // Caisse émet
    descriptionTemplate: 'Transfert émis vers caisse',
    priority: 10,
  },

  // ============================================================================
  // OPÉRATIONS AGENT TERRAIN - WORKFLOW PENDING_SETTLEMENT
  // ============================================================================

  // Collecte agent terrain en attente de REMISE (ne touche pas comptes clients)
  {
    code: 'AGENT_COLLECT_PENDING',
    name: 'Collecte agent terrain (en attente remise)',
    description: 'Encaissement par agent terrain - en attente de remise',
    sourceType: 'MOUVEMENT',
    eventType: 'MISC_COLLECTION',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '573',   // Caisse agent terrain (reçoit cash)
    creditAccount: '581',  // Virements internes (transit/suspens)
    descriptionTemplate: 'Collecte agent terrain en attente remise',
    priority: 10,
  },

  // Transfert agent → caisse agence (combiné en une seule écriture GL)
  // Note: Le mouvement de sortie agent (MISC_DISBURSEMENT) n'a pas de règle GL
  // car il est compensé par le mouvement d'entrée caisse ci-dessous
  {
    code: 'AGENT_REMISE_TRANSFER',
    name: 'Transfert remise agent vers caisse',
    description: 'Transfert physique de cash de l\'agent vers caisse agence',
    sourceType: 'MOUVEMENT',
    eventType: 'CASH_TRANSFER',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse centrale (reçoit cash)
    creditAccount: '573',  // Caisse agent terrain (donne cash)
    descriptionTemplate: 'Remise agent terrain vers caisse',
    priority: 10,
  },

  // --- Opérations directes sur coffre (abondement/prélèvement) ---
  {
    code: 'ENTREE_COFFRE',
    name: 'Entrée de fonds au coffre',
    description: 'Abondement coffre depuis source externe',
    sourceType: 'MOUVEMENT',
    eventType: 'ENTREE_COFFRE',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre-fort (reçoit)
    creditAccount: '471',  // Compte d\'attente — entrées coffre (à régulariser)
    descriptionTemplate: 'Abondement coffre-fort',
    priority: 100,
  },
  {
    code: 'SORTIE_COFFRE',
    name: 'Sortie de fonds du coffre',
    description: 'Prélèvement coffre vers destination externe',
    sourceType: 'MOUVEMENT',
    eventType: 'SORTIE_COFFRE',
    journalCode: 'OD',
    debitAccount: '471',   // Compte d\'attente — sorties coffre (à régulariser)
    creditAccount: '531',  // Coffre-fort (envoie)
    descriptionTemplate: 'Prélèvement coffre-fort',
    priority: 100,
  },

  // --- Evacuation coffre (vide de coffre) ---
  {
    code: 'EVACUATION_COFFRE_OUT',
    name: 'Évacuation coffre — sortie transit',
    description: 'Sortie de fonds du coffre vers compte de transit (dispatch)',
    sourceType: 'MOUVEMENT',
    eventType: 'EVACUATION_COFFRE_OUT',
    journalCode: 'OD',
    debitAccount: '581',   // Virements internes (transit)
    creditAccount: '531',  // Coffre-fort source
    descriptionTemplate: 'Évacuation coffre — fonds en transit',
    priority: 100,
  },
  // NOTE AUDIT : EVACUATION_COFFRE_BANQUE et EVACUATION_COFFRE_TRANSPORTEUR
  // partagent les mêmes comptes GL (D 512 / C 581) mais des eventTypes distincts.
  // La distinction est nécessaire pour le suivi opérationnel (dépôt direct vs
  // remise transporteur) et les délais de régularisation du compte 581 (transit).
  {
    code: 'EVACUATION_COFFRE_BANQUE',
    name: 'Évacuation coffre — dépôt banque',
    description: 'Dépôt des fonds évacués sur compte bancaire',
    sourceType: 'MOUVEMENT',
    eventType: 'EVACUATION_COFFRE_BANQUE',
    journalCode: 'BNK',
    debitAccount: '512',   // Banque (compte bancaire)
    creditAccount: '581',  // Virements internes (transit)
    descriptionTemplate: 'Évacuation coffre — dépôt bancaire',
    priority: 100,
  },
  {
    code: 'EVACUATION_COFFRE_CENTRAL',
    name: 'Évacuation coffre — coffre central',
    description: 'Transfert des fonds évacués vers coffre central/siège',
    sourceType: 'MOUVEMENT',
    eventType: 'EVACUATION_COFFRE_CENTRAL',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre-fort destination (central)
    creditAccount: '581',  // Virements internes (transit)
    descriptionTemplate: 'Évacuation coffre — entrée coffre central',
    priority: 100,
  },
  {
    code: 'EVACUATION_COFFRE_TRANSPORTEUR',
    name: 'Évacuation coffre — transporteur',
    description: 'Remise des fonds évacués à un transporteur de fonds',
    sourceType: 'MOUVEMENT',
    eventType: 'EVACUATION_COFFRE_TRANSPORTEUR',
    journalCode: 'OD',
    debitAccount: '512',   // Banque (destination finale via transporteur)
    creditAccount: '581',  // Virements internes (transit)
    descriptionTemplate: 'Évacuation coffre — remise transporteur',
    priority: 100,
  },
  {
    code: 'EVACUATION_COFFRE_ECART_DEFICIT',
    name: 'Écart évacuation — déficit',
    description: 'Manquant constaté lors de la réconciliation d\'évacuation',
    sourceType: 'MOUVEMENT',
    eventType: 'EVACUATION_COFFRE_ECART_DEFICIT',
    journalCode: 'OD',
    debitAccount: '672',   // Pertes sur créances (charges transit)
    creditAccount: '581',  // Virements internes (transit)
    descriptionTemplate: 'Écart évacuation coffre — déficit constaté',
    priority: 100,
  },
  {
    code: 'EVACUATION_COFFRE_ECART_SURPLUS',
    name: 'Écart évacuation — excédent',
    description: 'Excédent constaté lors de la réconciliation d\'évacuation',
    sourceType: 'MOUVEMENT',
    eventType: 'EVACUATION_COFFRE_ECART_SURPLUS',
    journalCode: 'OD',
    debitAccount: '581',   // Virements internes (transit)
    creditAccount: '772',  // Produits sur transit (produits exceptionnels)
    descriptionTemplate: 'Écart évacuation coffre — excédent constaté',
    priority: 100,
  },

  // --- Commission tontine ---
  {
    code: 'COMMISSION_TONTINE',
    name: 'Commission tontine — frais de gestion',
    description: 'Prélèvement de frais/commissions sur fonds tontine vers institution',
    sourceType: 'MOUVEMENT',
    eventType: 'COMMISSION',
    journalCode: 'TON',
    debitAccount: '4191',   // Fonds tontine (money leaves tontine)
    creditAccount: '708300', // Commissions de gestion (revenue)
    descriptionTemplate: 'Commission tontine — frais de gestion',
    priority: 100,
  },

  // --- Capitalisation intérêts épargne ---
  {
    code: 'INTEREST_PAYMENT_SAVINGS',
    name: 'Capitalisation intérêts épargne',
    description: 'Intérêts mensuels capitalisés sur comptes épargne',
    sourceType: 'MOUVEMENT',
    eventType: 'INTEREST_PAYMENT',
    journalCode: 'EPGN',
    debitAccount: '6611',   // Intérêts versés sur dépôts (charge)
    creditAccount: '4112',  // Dépôts épargne (credited to client)
    descriptionTemplate: 'Capitalisation intérêts épargne — {clientName}',
    priority: 100,
  },

  // --- Liquidation caisse ---
  {
    code: 'LIQUIDATION_CAISSE',
    name: 'Liquidation caisse',
    description: 'Fermeture définitive d\'une caisse avec transfert du solde vers coffre',
    sourceType: 'MOUVEMENT',
    eventType: 'LIQUIDATION',
    journalCode: 'OD',
    debitAccount: '531',   // Coffre (reçoit)
    creditAccount: '521',  // Caisse (envoie)
    descriptionTemplate: 'Liquidation caisse — transfert solde vers coffre',
    priority: 100,
  },

  // --- Avance sur salaire ---
  {
    code: 'SALARY_ADVANCE_CASH',
    name: 'Avance sur salaire — espèces',
    description: 'Versement d\'avance sur salaire en espèces',
    sourceType: 'MOUVEMENT',
    eventType: 'SALARY_ADVANCE',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4211',   // Avances au personnel (actif)
    creditAccount: '521',   // Caisse (cash sort)
    descriptionTemplate: 'Avance sur salaire — {employeeName}',
    priority: 100,
  },
  {
    code: 'SALARY_ADVANCE_TRANSFER',
    name: 'Avance sur salaire — virement',
    description: 'Versement d\'avance sur salaire par virement',
    sourceType: 'MOUVEMENT',
    eventType: 'SALARY_ADVANCE',
    paymentMethod: 'TRANSFER',
    journalCode: 'OD',
    debitAccount: '4211',   // Avances au personnel (actif)
    creditAccount: '512',   // Banque (virement sort)
    descriptionTemplate: 'Avance sur salaire virement — {employeeName}',
    priority: 100,
  },

  // --- Paiement salaire en caisse ---
  {
    code: 'SALARY_PAYMENT_CASH',
    name: 'Paiement salaire — espèces',
    description: 'Paiement de salaire employé en espèces via caisse',
    sourceType: 'MOUVEMENT',
    eventType: 'SALARY_PAYMENT',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '4211',   // Personnel — rémunérations dues
    creditAccount: '521',   // Caisse (argent sort)
    descriptionTemplate: 'Paiement salaire espèces — {employeeName}',
    priority: 100,
  },

  // --- Restitution frais de dossier en caisse ---
  {
    code: 'FEE_REFUND_CASH',
    name: 'Restitution frais de dossier — espèces',
    description: 'Remboursement de frais de dossier crédit en espèces via caisse',
    sourceType: 'MOUVEMENT',
    eventType: 'FEE_REFUND',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '7072',   // Produits — frais de dossier (contre-passation)
    creditAccount: '521',   // Caisse (argent sort)
    descriptionTemplate: 'Restitution frais dossier espèces — {clientName}',
    priority: 100,
  },

  // --- Reversals Mobile Money ---
  {
    code: 'REVERSAL_COLLECTION_MTN',
    name: 'Annulation collecte Mobile Money MTN',
    description: 'Annulation/reversal d\'un dépôt Mobile Money MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'REVERSAL_COLLECTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '4112',   // Dépôts épargne (money leaves client)
    creditAccount: '5781',  // Mobile Money MTN (money returns)
    descriptionTemplate: 'Annulation collecte MTN — {clientName}',
    priority: 100,
  },
  {
    code: 'REVERSAL_COLLECTION_AIRTEL',
    name: 'Annulation collecte Mobile Money Airtel',
    description: 'Annulation/reversal d\'un dépôt Mobile Money Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'REVERSAL_COLLECTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '4112',   // Dépôts épargne (money leaves client)
    creditAccount: '5782',  // Mobile Money Airtel (money returns)
    descriptionTemplate: 'Annulation collecte Airtel — {clientName}',
    priority: 100,
  },
  {
    code: 'REVERSAL_PAYOUT_MTN',
    name: 'Annulation payout Mobile Money MTN',
    description: 'Annulation/reversal d\'un retrait Mobile Money MTN',
    sourceType: 'MOUVEMENT',
    eventType: 'REVERSAL_PAYOUT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',   // Mobile Money MTN (money returns)
    creditAccount: '4112',  // Dépôts épargne (restored to client)
    descriptionTemplate: 'Annulation payout MTN — {clientName}',
    priority: 100,
  },
  {
    code: 'REVERSAL_PAYOUT_AIRTEL',
    name: 'Annulation payout Mobile Money Airtel',
    description: 'Annulation/reversal d\'un retrait Mobile Money Airtel',
    sourceType: 'MOUVEMENT',
    eventType: 'REVERSAL_PAYOUT',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',   // Mobile Money Airtel (money returns)
    creditAccount: '4112',  // Dépôts épargne (restored to client)
    descriptionTemplate: 'Annulation payout Airtel — {clientName}',
    priority: 100,
  },

  // =====================================================================
  // CREDIT LIFECYCLE — Pénalités de retard, Provisions, Radiation (C18-C20)
  // =====================================================================

  // C18: Pénalité de retard (constatation de la pénalité sur crédit en retard)
  {
    code: 'CREDIT_LATE_PENALTY',
    name: 'Pénalité de retard crédit',
    description: 'Constatation comptable d\'une pénalité de retard sur crédit en souffrance',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_LATE_PENALTY',
    journalCode: 'CRD',
    debitAccount: '2711',  // Prêts - Principal (augmentation créance)
    creditAccount: '7073', // Pénalités de retard (produit)
    descriptionTemplate: 'Pénalité retard crédit #{creditNumber} - {clientName}',
    priority: 10,
  },

  // C18b: Comptabilisation des intérêts courus (SYSCOHADA art. 46 — engagement)
  {
    code: 'CREDIT_INTEREST_ACCRUAL',
    name: 'Comptabilisation intérêts courus sur prêts',
    description: 'Constatation mensuelle des intérêts courus non échus (accrual basis SYSCOHADA)',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_INTEREST_ACCRUAL',
    journalCode: 'CRD',
    debitAccount: '2718',  // Intérêts courus sur prêts (actif)
    creditAccount: '7071', // Intérêts sur prêts (produit)
    descriptionTemplate: 'Intérêts courus crédit #{creditNumber} - {clientName}',
    priority: 10,
  },

  // C18c: Encaissement intérêts (solde le compte 2718 au lieu de créditer 7071 directement)
  {
    code: 'CREDIT_INTEREST_COLLECTION_CASH',
    name: 'Encaissement intérêts sur prêts espèces',
    description: 'Encaissement intérêts qui solde le compte d\'intérêts courus (2718)',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_INTEREST_COLLECTION',
    paymentMethod: 'CASH',
    journalCode: 'CAI',
    debitAccount: '521',   // Caisse (encaissement)
    creditAccount: '2718', // Intérêts courus (solde le compte d\'accrual)
    descriptionTemplate: 'Encaissement intérêts crédit #{creditNumber} - {clientName}',
    priority: 10,
  },
  {
    code: 'CREDIT_INTEREST_COLLECTION_MTN',
    name: 'Encaissement intérêts sur prêts MTN',
    description: 'Encaissement intérêts via MTN Mobile Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_INTEREST_COLLECTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'MTN',
    journalCode: 'MMTN',
    debitAccount: '5781',  // Mobile Money MTN
    creditAccount: '2718', // Intérêts courus
    descriptionTemplate: 'Encaissement intérêts crédit #{creditNumber} MTN - {clientName}',
    priority: 10,
  },
  {
    code: 'CREDIT_INTEREST_COLLECTION_AIRTEL',
    name: 'Encaissement intérêts sur prêts Airtel',
    description: 'Encaissement intérêts via Airtel Money',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_INTEREST_COLLECTION',
    paymentMethod: 'MOBILE_MONEY',
    provider: 'AIRTEL',
    journalCode: 'MAIR',
    debitAccount: '5782',  // Mobile Money Airtel
    creditAccount: '2718', // Intérêts courus
    descriptionTemplate: 'Encaissement intérêts crédit #{creditNumber} Airtel - {clientName}',
    priority: 10,
  },

  // C19: Provisionnement créances douteuses (dotation provision)
  {
    code: 'CREDIT_PROVISION',
    name: 'Dotation provision créance douteuse',
    description: 'Provisionnement pour dépréciation d\'un crédit en souffrance',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_PROVISION',
    journalCode: 'OD',
    debitAccount: '691',   // Provisions créances douteuses (charge)
    creditAccount: '2917', // Provisions pour dépréciation des prêts (contra-actif)
    descriptionTemplate: 'Provision créance douteuse crédit #{creditNumber} - {clientName}',
    priority: 10,
  },

  // C19b: Reprise provision (quand le crédit est régularisé ou radié)
  {
    code: 'CREDIT_PROVISION_REVERSAL',
    name: 'Reprise provision créance douteuse',
    description: 'Reprise de provision suite à régularisation ou radiation d\'un crédit',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_PROVISION_REVERSAL',
    journalCode: 'OD',
    debitAccount: '2917',  // Provisions pour dépréciation des prêts (contra-actif)
    creditAccount: '79',   // Reprises provisions (produit)
    descriptionTemplate: 'Reprise provision crédit #{creditNumber} - {clientName}',
    priority: 10,
  },

  // C20: Radiation crédit irrécouvrable (write-off)
  {
    code: 'CREDIT_WRITEOFF',
    name: 'Radiation crédit irrécouvrable',
    description: 'Constatation perte sur crédit irrécouvrable (write-off)',
    sourceType: 'MOUVEMENT',
    eventType: 'CREDIT_WRITEOFF',
    journalCode: 'OD',
    debitAccount: '672',   // Pertes sur créances irrécouvrables (charge)
    creditAccount: '2711', // Prêts - Principal (sortie de l\'actif)
    descriptionTemplate: 'Radiation crédit #{creditNumber} - {clientName} — irrécouvrable',
    priority: 10,
  },
];

// ============================================================================
// PREFLIGHT CHECK
// ============================================================================

async function detectContext(): Promise<SeedContext> {
  const [clientResult] = await db.select({ count: count() }).from(clients);
  const [compteResult] = await db.select({ count: count() }).from(comptes);
  const [mouvementResult] = await db.select({ count: count() }).from(mouvementsFinanciers);

  if (clientResult.count > 0 || compteResult.count > 0 || mouvementResult.count > 0) {
    return 'PRODUCTION';
  }

  const [userResult] = await db.select({ count: count() }).from(users);
  if (userResult.count > 0) {
    return 'SEEDED';
  }

  return 'EMPTY';
}

// ============================================================================
// UPSERT HELPERS
// ============================================================================

async function upsertByCode<T extends { code: string }>(
  table: any,
  codeField: any,
  data: T[],
  dryRun: boolean
): Promise<SeedStepResult> {
  if (dryRun) {
    return { table: table._.name, action: 'skipped', count: data.length, details: 'dry-run' };
  }

  let created = 0, updated = 0;

  for (const item of data) {
    const [existing] = await db.select().from(table).where(eq(codeField, item.code));
    if (existing) {
      await db.update(table).set(item).where(eq(codeField, item.code));
      updated++;
    } else {
      await db.insert(table).values(item);
      created++;
    }
  }

  return {
    table: table._.name,
    action: created > 0 ? 'created' : 'updated',
    count: created + updated,
    details: `created: ${created}, updated: ${updated}`
  };
}

async function upsertByName<T extends { nom: string }>(
  table: any,
  nameField: any,
  data: T[],
  dryRun: boolean
): Promise<SeedStepResult> {
  if (dryRun) {
    return { table: table._.name, action: 'skipped', count: data.length, details: 'dry-run' };
  }

  let created = 0, updated = 0;

  for (const item of data) {
    const [existing] = await db.select().from(table).where(eq(nameField, item.nom));
    if (existing) {
      await db.update(table).set(item).where(eq(nameField, item.nom));
      updated++;
    } else {
      await db.insert(table).values(item);
      created++;
    }
  }

  return {
    table: table._.name,
    action: created > 0 ? 'created' : 'updated',
    count: created + updated,
    details: `created: ${created}, updated: ${updated}`
  };
}

// ============================================================================
// SEED MODULES
// ============================================================================

async function seedGeography(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Geography...');
  const results: SeedStepResult[] = [];

  // Zones - upsert by nom+ville
  if (context === 'EMPTY' || context === 'SEEDED') {
    if (!dryRun) {
      for (const zone of ZONES_DATA) {
        const [existing] = await db.select().from(zones).where(
          and(eq(zones.nom, zone.nom), eq(zones.ville, zone.ville))
        );
        if (!existing) {
          await db.insert(zones).values(zone);
        }
      }
    }
    results.push({ table: 'zones', action: 'created', count: ZONES_DATA.length, details: 'upsert by nom+ville' });
  } else {
    results.push({ table: 'zones', action: 'skipped', count: 0, details: 'production mode' });
  }

  // ===== Départements =====
  let deptCount = 0;
  if (!dryRun) {
    for (const dept of DEPARTEMENTS_GEO_DATA) {
      const [existing] = await db.select().from(departements).where(eq(departements.nom, dept.nom));
      if (!existing) {
        await db.insert(departements).values(dept);
        deptCount++;
      }
    }
  }
  results.push({ table: 'departements', action: 'created', count: deptCount, details: `${DEPARTEMENTS_GEO_DATA.length} départements (upsert by nom)` });

  // ===== Villes =====
  let villeCount = 0;
  const villeIdMap: Record<string, string> = {};
  if (!dryRun) {
    for (const v of VILLES_GEO_DATA) {
      // Find departement
      const [dept] = await db.select().from(departements).where(eq(departements.nom, v.departement));
      if (!dept) {
        logger.warn(`Département '${v.departement}' not found for ville '${v.nom}', skipping`);
        continue;
      }
      const [existing] = await db.select().from(villes).where(
        and(eq(villes.nom, v.nom), eq(villes.departementId, dept.id))
      );
      if (!existing) {
        const [inserted] = await db.insert(villes).values({
          nom: v.nom,
          departementId: dept.id,
          latitude: v.lat,
          longitude: v.lng,
          isChefLieu: v.isChefLieu,
        }).returning();
        villeIdMap[v.nom] = inserted.id;
        villeCount++;
      } else {
        villeIdMap[v.nom] = existing.id;
      }
    }
  }
  results.push({ table: 'villes', action: 'created', count: villeCount, details: `${VILLES_GEO_DATA.length} villes (upsert by nom+dept)` });

  // ===== Backfill zones with villeId =====
  if (!dryRun) {
    for (const [villeNom, villeId] of Object.entries(villeIdMap)) {
      await db.update(zones)
        .set({ villeId })
        .where(and(eq(zones.ville, villeNom), isNull(zones.villeId)));
    }
  }

  // ===== Arrondissements =====
  let arrCount = 0;
  const arrIdMap: Record<string, string> = {};
  if (!dryRun) {
    for (const [villeNom, arrNames] of Object.entries(ARRONDISSEMENTS_SEED)) {
      const villeId = villeIdMap[villeNom];
      if (!villeId) {
        logger.warn(`Ville '${villeNom}' not found in villeIdMap, skipping arrondissements`);
        continue;
      }
      for (const arrNom of arrNames) {
        const [existing] = await db.select().from(arrondissements).where(
          and(eq(arrondissements.nom, arrNom), eq(arrondissements.villeId, villeId))
        );
        if (!existing) {
          const [inserted] = await db.insert(arrondissements).values({
            nom: arrNom,
            villeId,
          }).returning();
          arrIdMap[arrNom] = inserted.id;
          arrCount++;
        } else {
          arrIdMap[arrNom] = existing.id;
        }
      }
    }
  }
  results.push({ table: 'arrondissements', action: 'created', count: arrCount, details: 'upsert by nom+villeId' });

  // ===== Marchés =====
  let marcheCount = 0;
  if (!dryRun) {
    for (const [arrNom, marcheNames] of Object.entries(MARCHES_SEED)) {
      const arrId = arrIdMap[arrNom];
      if (!arrId) {
        logger.warn(`Arrondissement '${arrNom}' not found in arrIdMap, skipping marchés`);
        continue;
      }
      for (const marcheNom of marcheNames) {
        const [existing] = await db.select().from(marches).where(
          and(eq(marches.nom, marcheNom), eq(marches.arrondissementId, arrId))
        );
        if (!existing) {
          await db.insert(marches).values({ nom: marcheNom, arrondissementId: arrId });
          marcheCount++;
        }
      }
    }
  }
  results.push({ table: 'marches', action: 'created', count: marcheCount, details: 'upsert by nom+arrondissementId' });

  // ===== Agence Siège =====
  const siegeData = {
    nom: 'Siège',
    codeAgence: 'SIEGE',
    adresse: 'Boulevard Denis Sassou, Brazzaville',
    villeId: villeIdMap['Brazzaville'] || undefined,
    region: 'Brazzaville',
    typeAgence: TypeAgence.MAIN,
    statut: StatutUser.ACTIVE,
    telephone: '+242060000100',
    email: 'siege@cofin.com',
    dateOuverture: '2018-01-01',
  };

  if (!dryRun) {
    const [existingSiege] = await db.select().from(agences).where(eq(agences.codeAgence, 'SIEGE'));
    if (!existingSiege) {
      await db.insert(agences).values(siegeData);
      results.push({ table: 'agences', action: 'created', count: 1 });
    } else {
      // Backfill villeId if missing
      if (!existingSiege.villeId && villeIdMap['Brazzaville']) {
        await db.update(agences).set({ villeId: villeIdMap['Brazzaville'] }).where(eq(agences.id, existingSiege.id));
      }
      results.push({ table: 'agences', action: 'skipped', count: 0, details: 'Siège exists' });
    }

    // NOTE: ville text column removed — villeId migration is complete
  }

  return results;
}

async function seedCoreSettings(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Core Settings...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    results.push({ table: 'systemSettings', action: 'skipped', count: 1, details: 'dry-run' });
    return results;
  }

  // System Settings - singleton
  const [existingSystem] = await db.select().from(systemSettings);
  if (!existingSystem || context === 'EMPTY') {
    if (existingSystem) {
      await db.delete(systemSettings);
    }
    await db.insert(systemSettings).values({
      appName: 'COFIN&CO-M',
      agenceCode: 'COF-PROD',
      devise: 'XAF',
      pays: 'République du Congo',
      adresse: 'Boulevard Denis Sassou, Brazzaville',
      telephone: '+242060000000',
      email: 'contact@cofin.com',
      sessionTimeout: 15,
      maxLoginAttempts: 3,
      passwordMinLength: 12,
      backupFrequency: 'daily',
      autoBackupEnabled: true,
      notificationEmailEnabled: true,
      notificationSmsEnabled: true,
      smsPaymentValidationEnabled: true,
      mobileMoneyEnabled: true,
      maintenanceMode: false,
    });
    results.push({ table: 'systemSettings', action: 'created', count: 1 });
  } else {
    results.push({ table: 'systemSettings', action: 'skipped', count: 0, details: 'exists' });
  }

  // Currency Presets
  const existingPresets = await db.select().from(currencyPresets);
  if (existingPresets.length === 0 || context === 'EMPTY') {
    if (existingPresets.length > 0) {
      await db.delete(currencyPresets);
    }
    await db.insert(currencyPresets).values([
      { code: 'XAF', symbol: 'FCFA', symbolPosition: 'after', locale: 'fr-FR', decimals: 0, actif: true, ordre: 0 },
      { code: 'XOF', symbol: 'FCFA', symbolPosition: 'after', locale: 'fr-FR', decimals: 0, actif: true, ordre: 1 },
      { code: 'EUR', symbol: '€',    symbolPosition: 'after', locale: 'fr-FR', decimals: 2, actif: true, ordre: 2 },
      { code: 'USD', symbol: '$',    symbolPosition: 'before',locale: 'en-US', decimals: 2, actif: true, ordre: 3 },
      { code: 'CDF', symbol: 'FC',   symbolPosition: 'after', locale: 'fr-CD', decimals: 2, actif: true, ordre: 4 },
      { code: 'GNF', symbol: 'FG',   symbolPosition: 'after', locale: 'fr-GN', decimals: 0, actif: true, ordre: 5 },
      { code: 'MGA', symbol: 'Ar',   symbolPosition: 'after', locale: 'fr-MG', decimals: 0, actif: true, ordre: 6 },
    ]);
    results.push({ table: 'currencyPresets', action: 'created', count: 7 });
  } else {
    results.push({ table: 'currencyPresets', action: 'skipped', count: existingPresets.length, details: 'exists' });
  }

  // Security Settings - singleton
  const [existingSecurity] = await db.select().from(securitySettings);
  if (!existingSecurity || context === 'EMPTY') {
    if (existingSecurity) {
      await db.delete(securitySettings);
    }
    await db.insert(securitySettings).values({
      passwordMinLength: 12,
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
    results.push({ table: 'securitySettings', action: 'created', count: 1 });
  } else {
    results.push({ table: 'securitySettings', action: 'skipped', count: 0, details: 'exists' });
  }

  // UI Customization - singleton
  const [existingUI] = await db.select().from(uiCustomization);
  if (!existingUI || context === 'EMPTY') {
    if (existingUI) {
      await db.delete(uiCustomization);
    }
    await db.insert(uiCustomization).values({
      theme: 'light',
      primaryColor: '#0f766e',
      accentColor: '#c2410c',
      langue: 'fr',
      sidebarCollapsedDefault: false,
      showAnimations: true,
      compactMode: false,
      fontFamily: 'Inter',
      borderRadius: 'lg',
    });
    results.push({ table: 'uiCustomization', action: 'created', count: 1 });
  } else {
    results.push({ table: 'uiCustomization', action: 'skipped', count: 0, details: 'exists' });
  }

  // Feature Flags - upsert
  const flagsData = [
    { code: 'offline_mode', nom: 'Mode hors ligne', description: 'Activer le mode hors ligne', enabled: true, rolloutPercentage: 100 },
    { code: 'agent_tracking', nom: 'Tracking agents', description: 'Suivi GPS des agents terrain', enabled: true, rolloutPercentage: 100 },
    { code: 'bourse_module', nom: 'Module Bourse', description: 'Activer le module Bourse', enabled: true, rolloutPercentage: 100 },
    { code: 'logistics_module', nom: 'Module Loge', description: 'Activer le stockage Loge', enabled: true, rolloutPercentage: 100 },
  ];

  for (const flag of flagsData) {
    const [existing] = await db.select().from(featureFlags).where(eq(featureFlags.code, flag.code));
    if (!existing) {
      await db.insert(featureFlags).values(flag);
    }
  }
  results.push({ table: 'featureFlags', action: 'created', count: flagsData.length });

  // System Feature Flags - RBAC related
  const systemFlagsData = [
    { flagKey: 'RBAC_SCOPED_OVERRIDES', flagValue: false, description: 'Activer le scope agence pour les overrides utilisateur (off = tout est GLOBAL)', isSystem: true },
    { flagKey: 'RBAC_REQUIRE_REASON_CRITICAL', flagValue: true, description: 'Exiger une raison pour les permissions critiques', isSystem: true },
    { flagKey: 'RBAC_AUDIT_LOG_ENABLED', flagValue: true, description: 'Activer l\'audit log RBAC', isSystem: true },
    { flagKey: 'RBAC_SOFT_REVALIDATE', flagValue: false, description: 'Activer la revalidation soft côté client (focus, reconnect)', isSystem: true },
  ];

  let systemFlagsCreated = 0;
  for (const flag of systemFlagsData) {
    const [existing] = await db.select().from(systemFeatureFlags).where(eq(systemFeatureFlags.flagKey, flag.flagKey));
    if (!existing) {
      await db.insert(systemFeatureFlags).values(flag);
      systemFlagsCreated++;
    }
  }
  results.push({ table: 'systemFeatureFlags', action: 'created', count: systemFlagsCreated, details: `${systemFlagsCreated} new flags (${systemFlagsData.length} total)` });
  logger.info(`System feature flags: ${systemFlagsCreated} created`);

  // Permission Condition Templates
  const conditionTemplatesData = [
    {
      name: 'amount_limit',
      description: 'Limite le montant maximal autorisé pour une opération',
      conditionSchema: { amount: { $lte: '$maxAmount' } },
      variables: ['maxAmount'],
      examples: [
        { description: 'Limite à 1M FCFA', values: { maxAmount: 1000000 } },
        { description: 'Limite à 5M FCFA', values: { maxAmount: 5000000 } },
      ],
      isSystem: true,
    },
    {
      name: 'status_filter',
      description: 'Limite les actions aux entités ayant certains statuts',
      conditionSchema: { status: { $in: '$allowedStatuses' } },
      variables: ['allowedStatuses'],
      examples: [
        { description: 'Statuts en attente', values: { allowedStatuses: ['PENDING', 'REVIEW'] } },
        { description: 'Statuts actifs', values: { allowedStatuses: ['ACTIVE', 'APPROVED'] } },
      ],
      isSystem: true,
    },
    {
      name: 'owner_only',
      description: 'Limite les actions aux entités créées par l\'utilisateur',
      conditionSchema: { createdBy: '${userId}' },
      variables: ['userId'],
      examples: [{ description: 'Propres créations uniquement', values: {} }],
      isSystem: true,
    },
    {
      name: 'same_agency',
      description: 'Limite les actions aux entités de la même agence',
      conditionSchema: { agenceId: '${agenceId}' },
      variables: ['agenceId'],
      examples: [{ description: 'Même agence', values: {} }],
      isSystem: true,
    },
    {
      name: 'time_window',
      description: 'Limite les actions aux entités créées dans une fenêtre temporelle',
      conditionSchema: { createdAt: { $gte: '${startDate}', $lte: '${endDate}' } },
      variables: ['startDate', 'endDate'],
      examples: [
        { description: 'Créé aujourd\'hui', values: { startDate: '${startOfDay}', endDate: '${endOfDay}' } },
        { description: '7 derniers jours', values: { startDate: '${startOfWeek}', endDate: '${now}' } },
      ],
      isSystem: true,
    },
    {
      name: 'combined_and',
      description: 'Combine plusieurs conditions avec AND',
      conditionSchema: { $and: ['$conditions'] },
      variables: ['conditions'],
      examples: [
        { description: 'Montant < 1M ET statut PENDING', values: { conditions: [{ amount: { $lte: 1000000 } }, { status: 'PENDING' }] } },
      ],
      isSystem: true,
    },
  ];

  let templatesCreated = 0;
  for (const template of conditionTemplatesData) {
    const [existing] = await db.select().from(permissionConditionTemplates).where(eq(permissionConditionTemplates.name, template.name));
    if (!existing) {
      await db.insert(permissionConditionTemplates).values(template);
      templatesCreated++;
    }
  }
  results.push({ table: 'permissionConditionTemplates', action: 'created', count: templatesCreated, details: `${templatesCreated} new templates (${conditionTemplatesData.length} total)` });
  logger.info(`Permission condition templates: ${templatesCreated} created`);

  // Critical Permission Patterns
  const criticalPatternsData = [
    { pattern: 'paiements.%', description: 'Toutes les permissions de paiement', requireReason: true, requireSupervisorApproval: false },
    { pattern: 'coffre.%', description: 'Toutes les permissions coffre-fort', requireReason: true, requireSupervisorApproval: true },
    { pattern: 'admin.%', description: 'Toutes les permissions administration', requireReason: true, requireSupervisorApproval: false },
    { pattern: 'validation.%', description: 'Toutes les permissions de validation', requireReason: true, requireSupervisorApproval: false },
    { pattern: 'caisse.%', description: 'Toutes les permissions caisse', requireReason: true, requireSupervisorApproval: false },
    { pattern: 'users.%', description: 'Toutes les permissions utilisateurs', requireReason: true, requireSupervisorApproval: false },
    { pattern: 'credits.%', description: 'Toutes les permissions crédits', requireReason: true, requireSupervisorApproval: false },
    { pattern: 'rapports.%', description: 'Toutes les permissions rapports', requireReason: true, requireSupervisorApproval: false },
  ];

  let patternsCreated = 0;
  for (const pattern of criticalPatternsData) {
    const [existing] = await db.select().from(criticalPermissionPatterns).where(eq(criticalPermissionPatterns.pattern, pattern.pattern));
    if (!existing) {
      await db.insert(criticalPermissionPatterns).values(pattern);
      patternsCreated++;
    }
  }
  results.push({ table: 'criticalPermissionPatterns', action: 'created', count: patternsCreated, details: `${patternsCreated} new patterns (${criticalPatternsData.length} total)` });
  logger.info(`Critical permission patterns: ${patternsCreated} created`);

  // RBAC Versions — initial row for cache invalidation
  const [existingRbacVersion] = await db.select().from(rbacVersions).where(eq(rbacVersions.id, 'global'));
  if (!existingRbacVersion && !dryRun) {
    await db.insert(rbacVersions).values({ id: 'global', version: 1 });
    results.push({ table: 'rbacVersions', action: 'created', count: 1 });
  } else {
    results.push({ table: 'rbacVersions', action: 'skipped', count: 0, details: 'exists' });
  }

  return results;
}

async function seedProductsCatalog(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Products Catalog...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'produitsCompte', action: 'skipped', count: 3, details: 'dry-run' }];
  }

  // Produits Compte - upsert by code
  const produits = [
    {
      code: 'COURANT_STD', nom: 'Compte Courant Standard', typeCompte: 'CURRENT' as const, tauxInteret: '0',
      frais: { ouverture: 5000, tenue: 1500, cloture: 2500 },
      regles: { soldeMinimum: 0, depotInitialObligatoire: true, depotInitialMinimum: 5000, validationOuvertureRequise: false, autoriserSoldeNegatifCloture: false },
      actif: true,
    },
    {
      code: 'EPARGNE_STD', nom: 'Compte Épargne Classique', typeCompte: 'SAVINGS' as const, tauxInteret: '3.5',
      frais: { ouverture: 2500, cloture: 1500 },
      regles: { depotInitialObligatoire: true, depotInitialMinimum: 2500, validationOuvertureRequise: true, autoriserSoldeNegatifCloture: false },
      actif: true,
    },
    {
      code: 'TONTINE_STD', nom: 'Compte Bloqué', typeCompte: 'BLOCKED' as const, tauxInteret: '0',
      frais: { cloture: 1000 },
      regles: { validationOuvertureRequise: true, autoriserSoldeNegatifCloture: true },
      actif: true,
    },
  ];

  for (const p of produits) {
    const [existing] = await db.select().from(produitsCompte).where(eq(produitsCompte.code, p.code));
    if (!existing) {
      await db.insert(produitsCompte).values(p);
    } else {
      // Always sync frais & regles from seed (admin can override via UI later)
      await db.update(produitsCompte)
        .set({ frais: p.frais, regles: p.regles })
        .where(eq(produitsCompte.code, p.code));
    }
  }
  results.push({ table: 'produitsCompte', action: 'created', count: produits.length });

  // Credit Plans - delete all existing then insert canonical plans
  const creditPlansData = [
    { nom: 'Pamba', description: 'Crédit Pamba', typeCredit: 'Personnel', montantMin: '50000', montantMax: '100000', tauxInteret: '10', dureeValeur: 10, dureeUnite: 'DAY', frequenceRemboursement: 'DAILY', conditions: [] as string[], actif: true },
    { nom: 'Solidaire-Fidel 1', description: 'Crédit Solidaire-Fidel 1', typeCredit: 'Personnel', montantMin: '200000', montantMax: '300000', tauxInteret: '12', dureeValeur: 84, dureeUnite: 'DAY', frequenceRemboursement: 'WEEKLY', conditions: [] as string[], actif: true },
    { nom: 'Scolaire', description: 'Crédit Scolaire', typeCredit: 'Personnel', montantMin: '50000', montantMax: '100000', tauxInteret: '21', dureeValeur: 42, dureeUnite: 'DAY', frequenceRemboursement: 'WEEKLY', conditions: [] as string[], actif: true },
  ];

  await db.delete(creditPlans);
  for (const plan of creditPlansData) {
    await db.insert(creditPlans).values(plan);
  }
  results.push({ table: 'creditPlans', action: 'replaced', count: creditPlansData.length });

  // Tontine Rulesets - insert default ruleset
  const [existingRuleset] = await db.select().from(tontineRulesets).where(eq(tontineRulesets.isDefault, true));
  if (!existingRuleset) {
    await db.insert(tontineRulesets).values({
      name: 'Règles Standard Congo',
      description: 'Règles par défaut pour les tontines au Congo Brazzaville',
      isDefault: true,
      isActive: true,
      version: 1,
      rules: {
        grace_days: 2,
        late_fee_amount: 500,
        late_fee_percent: null,
        max_late_count_before_suspend: 3,
        max_late_count_before_exclude: 5,
        allow_partial_distribution: true,
        distribution_min_threshold_percent: 50,
        withdrawal_fee_amount: 0,
        withdrawal_fee_percent: 0,
        allow_reorder_turns_until: 'BEFORE_TURN_DUE',
        penalty_deducted_from_payout: true,
        penalty_as_revenue: false,
        auto_pay_penalty_priority: true,
        min_members_to_start: 3,
        max_advance_tours: 3,
      },
    });
    results.push({ table: 'tontineRulesets', action: 'created', count: 1 });
    logger.info('Tontine default ruleset created');
  } else {
    results.push({ table: 'tontineRulesets', action: 'skipped', count: 0, details: 'exists' });
  }

  // Types Marchés - upsert by nom
  for (const tm of TYPES_MARCHES_DATA) {
    const [existing] = await db.select().from(typesMarches).where(eq(typesMarches.nom, tm.nom));
    if (!existing) {
      await db.insert(typesMarches).values(tm);
    }
  }
  results.push({ table: 'typesMarches', action: 'created', count: TYPES_MARCHES_DATA.length });

  // Tags - upsert by name
  for (const t of TAGS_DATA) {
    const [existing] = await db.select().from(tags).where(eq(tags.name, t.name));
    if (!existing) {
      await db.insert(tags).values(t);
    }
  }
  results.push({ table: 'tags', action: 'created', count: TAGS_DATA.length });

  // Durées Suggérées - delete+insert (config only)
  // Enum values: DAILY, WEEKLY, MONTHLY, BI_MONTHLY, QUARTERLY / DAY, WEEK, MONTH
  await db.delete(dureesSuggerees);
  await db.insert(dureesSuggerees).values([
    { frequence: 'DAILY', dureeValeur: 15, dureeUnite: 'DAY', estRecommandee: false, ordre: 0, actif: true, label: '15 jours' },
    { frequence: 'DAILY', dureeValeur: 30, dureeUnite: 'DAY', estRecommandee: true, ordre: 1, actif: true, label: '30 jours' },
    { frequence: 'DAILY', dureeValeur: 60, dureeUnite: 'DAY', estRecommandee: false, ordre: 2, actif: true, label: '60 jours' },
    { frequence: 'DAILY', dureeValeur: 90, dureeUnite: 'DAY', estRecommandee: false, ordre: 3, actif: true, label: '90 jours' },
    { frequence: 'WEEKLY', dureeValeur: 1, dureeUnite: 'MONTH', estRecommandee: false, ordre: 0, actif: true, label: '1 mois' },
    { frequence: 'WEEKLY', dureeValeur: 3, dureeUnite: 'MONTH', estRecommandee: true, ordre: 1, actif: true, label: '3 mois' },
    { frequence: 'WEEKLY', dureeValeur: 6, dureeUnite: 'MONTH', estRecommandee: false, ordre: 2, actif: true, label: '6 mois' },
    { frequence: 'MONTHLY', dureeValeur: 3, dureeUnite: 'MONTH', estRecommandee: false, ordre: 0, actif: true, label: '3 mois' },
    { frequence: 'MONTHLY', dureeValeur: 6, dureeUnite: 'MONTH', estRecommandee: true, ordre: 1, actif: true, label: '6 mois' },
    { frequence: 'MONTHLY', dureeValeur: 12, dureeUnite: 'MONTH', estRecommandee: false, ordre: 2, actif: true, label: '12 mois' },
    { frequence: 'BI_MONTHLY', dureeValeur: 6, dureeUnite: 'MONTH', estRecommandee: false, ordre: 0, actif: true, label: '6 mois' },
    { frequence: 'BI_MONTHLY', dureeValeur: 12, dureeUnite: 'MONTH', estRecommandee: true, ordre: 1, actif: true, label: '12 mois' },
    { frequence: 'QUARTERLY', dureeValeur: 12, dureeUnite: 'MONTH', estRecommandee: false, ordre: 0, actif: true, label: '12 mois' },
    { frequence: 'QUARTERLY', dureeValeur: 24, dureeUnite: 'MONTH', estRecommandee: true, ordre: 1, actif: true, label: '24 mois' },
  ] as any);
  results.push({ table: 'dureesSuggerees', action: 'created', count: 14 });

  // Config Reevaluation - singleton
  const [existingReeval] = await db.select().from(configReevaluation).where(isNull(configReevaluation.agenceId));
  if (!existingReeval) {
    await db.insert(configReevaluation).values({
      delaiMinimumJours: 0,
      maxReevaluationsParDemande: 2,
      motifsNonReevaluables: ['Fraude avérée', 'Client blacklisté', 'Faux documents', 'Identité non vérifiable', 'Contentieux juridique'],
      elementsNouveauxObligatoires: true,
      enqueteComplementaireObligatoire: false,
      documentsMinimum: 0,
      seuilScoreMinimum: 40,
      deltaScoreMinimum: 5,
      reductionMontantMaxPourcentage: 50,
      actif: true,
      agenceId: null,
    });
    results.push({ table: 'configReevaluation', action: 'created', count: 1 });
  }

  return results;
}

async function seedAccountingBootstrap(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Accounting...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [
      { table: 'planComptable', action: 'skipped', count: PLAN_COMPTABLE_DATA.length, details: 'dry-run' },
      { table: 'accountingRules', action: 'skipped', count: ACCOUNTING_RULES_DATA.length, details: 'dry-run' },
    ];
  }

  // Exercice courant
  const currentYear = new Date().getFullYear();
  const [existingExercice] = await db.select().from(exercices).where(eq(exercices.code, `${currentYear}`));
  if (!existingExercice) {
    await db.insert(exercices).values({
      code: `${currentYear}`,
      dateDebut: `${currentYear}-01-01`,
      dateFin: `${currentYear}-12-31`,
      statut: 'OPEN',
      description: `Exercice comptable ${currentYear}`,
    });
    results.push({ table: 'exercices', action: 'created', count: 1 });
  } else {
    results.push({ table: 'exercices', action: 'skipped', count: 0, details: 'exists' });
  }

  // Plan Comptable - upsert by numeroCompte
  let created = 0;
  for (const cpt of PLAN_COMPTABLE_DATA) {
    const [existing] = await db.select().from(planComptable).where(eq(planComptable.numeroCompte, cpt.num));
    if (!existing) {
      await db.insert(planComptable).values({
        numeroCompte: cpt.num,
        intitule: cpt.label,
        classe: cpt.classe,
        typeCompte: cpt.type,
        sensNormal: cpt.sens,
        actif: true,
        isSystem: cpt.isSystem,
      });
      created++;
    }
  }
  results.push({ table: 'planComptable', action: 'created', count: created, details: `${created} new accounts` });

  // Journaux - upsert by code
  for (const j of JOURNAUX_DATA) {
    const [existing] = await db.select().from(journaux).where(eq(journaux.code, j.code));
    if (!existing) {
      await db.insert(journaux).values(j);
    }
  }
  results.push({ table: 'journaux', action: 'created', count: JOURNAUX_DATA.length });

  // Accounting Rules - true upsert by code (updates existing rules if seed data changed)
  let rulesCreated = 0;
  let rulesUpdated = 0;
  for (const rule of ACCOUNTING_RULES_DATA) {
    const [existing] = await db.select().from(accountingRules).where(eq(accountingRules.code, rule.code));
    if (!existing) {
      await db.insert(accountingRules).values(rule);
      rulesCreated++;
    } else {
      // Update if any field differs
      const needsUpdate =
        existing.eventType !== rule.eventType ||
        existing.debitAccount !== rule.debitAccount ||
        existing.creditAccount !== rule.creditAccount ||
        existing.journalCode !== rule.journalCode ||
        existing.sourceType !== rule.sourceType ||
        existing.paymentMethod !== (rule.paymentMethod ?? null) ||
        existing.provider !== (rule.provider ?? null) ||
        existing.priority !== rule.priority;
      if (needsUpdate) {
        await db.update(accountingRules).set(rule).where(eq(accountingRules.code, rule.code));
        rulesUpdated++;
      }
    }
  }
  results.push({ table: 'accountingRules', action: 'created', count: rulesCreated, details: `${rulesCreated} new, ${rulesUpdated} updated (${ACCOUNTING_RULES_DATA.length} total)` });

  return results;
}

async function seedVaultAndTransfersConfig(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Vault & Transfers Config...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'coffresForts', action: 'skipped', count: 1, details: 'dry-run' }];
  }

  // Get Siège ID
  const [siege] = await db.select().from(agences).where(eq(agences.codeAgence, 'SIEGE'));
  const siegeId = siege?.id;

  // Coffre-Fort Siège
  const [existingCoffre] = await db.select().from(coffresForts).where(eq(coffresForts.code, 'CF-SIEGE'));
  if (!existingCoffre) {
    await db.insert(coffresForts).values({
      code: 'CF-SIEGE',
      nom: 'Coffre-Fort Siège',
      ownerType: 'SIEGE',
      ownerId: siegeId,
      devise: 'XAF',
      solde: '0',
      plafondEncaisse: '500000000',
      soldeMinimum: '10000000',
      statut: StatutCoffre.ACTIVE,
      description: 'Coffre-fort central du siège',
    });
    results.push({ table: 'coffresForts', action: 'created', count: 1 });
  } else {
    results.push({ table: 'coffresForts', action: 'skipped', count: 0, details: 'exists' });
  }

  // Compte de Liaison Siège
  const [existingLiaison] = await db.select().from(comptesLiaison).where(eq(comptesLiaison.code, 'LIAISON-SIEGE'));
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
    results.push({ table: 'comptesLiaison', action: 'created', count: 1 });
  } else {
    results.push({ table: 'comptesLiaison', action: 'skipped', count: 0, details: 'exists' });
  }

  // Config Transfert Inter-Coffres (global)
  const [existingConfigTIC] = await db.select().from(configTransfertInterCoffres).where(isNull(configTransfertInterCoffres.agenceId));
  if (!existingConfigTIC) {
    await db.insert(configTransfertInterCoffres).values({
      agenceId: null,
      montantMinTransfert: '100000',
      montantMaxTransfert: '500000000',
      seuilAlertePlafond: '80',
      approbationDoubleNiveau: true,
      nombreAgentsTransportMin: '2',
      scelleObligatoireSiMontantSuperieur: '50000000',
      separationCreateurApprobateurN1: true,
      separationApprobateurN1N2: true,
      separationApprobateurRecepteur: true,
      rolesCreateurs: ['CAISSIER', 'COMPTABLE', 'CHEF_AGENCE'],
      rolesApprobateursN1: ['CHEF_AGENCE', 'SUPERVISEUR'],
      rolesApprobateursN2: ['ADMIN'],
      rolesRecepteurs: ['CHEF_AGENCE', 'COMPTABLE', 'SUPERVISEUR'],
      delaiMaxReconciliation: '3',
      alerteReconciliationActive: true,
      actif: true,
    });
    results.push({ table: 'configTransfertInterCoffres', action: 'created', count: 1 });
  } else {
    results.push({ table: 'configTransfertInterCoffres', action: 'skipped', count: 0, details: 'exists' });
  }

  // Config Coffre Fort par agence
  if (siegeId) {
    const [existingConfigCF] = await db.select().from(configCoffreFort).where(eq(configCoffreFort.agenceId, siegeId));
    if (!existingConfigCF) {
      await db.insert(configCoffreFort).values({
        agenceId: siegeId,
        seuilDoubleValidation: '10000000',
        separationInitiateurValideur: true,
        actif: true,
        rolesInitiateurs: ['CHEF_AGENCE', 'CAISSIER'],
        rolesValideurs: ['CHEF_AGENCE', 'SUPERVISEUR'],
        rolesExecuteurs: ['CHEF_AGENCE'],
      });
      results.push({ table: 'configCoffreFort', action: 'created', count: 1 });
    } else {
      results.push({ table: 'configCoffreFort', action: 'skipped', count: 0, details: 'exists' });
    }
  }

  // Caisse du Siège (CRITIQUE - manquait dans l'ancien seed)
  if (siegeId) {
    const [existingCaisse] = await db.select().from(caisses).where(eq(caisses.agenceId, siegeId));
    if (!existingCaisse) {
      await db.insert(caisses).values({
        nom: 'Caisse Principale - Siège',
        agenceId: siegeId,
        type: 'PHYSICAL',
        solde: '0',
        statut: StatutCaisse.CLOSED, // Fermée par défaut, ouverture via session
      });
      results.push({ table: 'caisses', action: 'created', count: 1, details: 'Caisse Siège' });
    } else {
      results.push({ table: 'caisses', action: 'skipped', count: 0, details: 'exists' });
    }
  }

  // Config Ecart Caisse - global default
  const [existingConfigEcart] = await db.select().from(configEcartCaisse).where(isNull(configEcartCaisse.agenceId));
  if (!existingConfigEcart) {
    await db.insert(configEcartCaisse).values({
      agenceId: null, // Global config
      seuilAutoApprove: '100',
      seuilN1Approval: '5000',
      seuilN2Approval: '50000',
      rolesApprobateursN1: ['SUPERVISEUR', 'CAISSIER'],
      rolesApprobateursN2: ['CHEF_AGENCE', 'ADMIN'],
      blockCloseUntilApproved: true,
      allowSelfApprovalIfRole: false,
      requireDoubleApprovalN2: false,
      actif: true,
    });
    results.push({ table: 'configEcartCaisse', action: 'created', count: 1 });
    logger.info('Config Ecart Caisse (global) created');
  } else {
    results.push({ table: 'configEcartCaisse', action: 'skipped', count: 0, details: 'exists' });
  }

  return results;
}

async function seedHRBootstrap(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding HR...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'departments', action: 'skipped', count: DEPARTMENTS_DATA.length, details: 'dry-run' }];
  }

  // Departments - upsert by code
  const deptMap: Record<string, string> = {};
  for (const dept of DEPARTMENTS_DATA) {
    const [existing] = await db.select().from(departments).where(eq(departments.code, dept.code));
    if (existing) {
      deptMap[dept.code] = existing.id;
    } else {
      const [inserted] = await db.insert(departments).values(dept).returning();
      deptMap[dept.code] = inserted.id;
    }
  }
  results.push({ table: 'departments', action: 'created', count: DEPARTMENTS_DATA.length });

  // Job Positions
  const positions = [
    { departmentId: deptMap['DIR'], code: 'DG', name: 'Directeur Général' },
    { departmentId: deptMap['DIR'], code: 'DGA', name: 'Directeur Général Adjoint' },
    { departmentId: deptMap['DIR'], code: 'SEC', name: 'Secrétaire de Direction' },
    { departmentId: deptMap['FIN'], code: 'DAF', name: 'Directeur Administratif et Financier' },
    { departmentId: deptMap['FIN'], code: 'COMPT', name: 'Comptable' },
    { departmentId: deptMap['FIN'], code: 'TRESO', name: 'Trésorier' },
    { departmentId: deptMap['FIN'], code: 'AUDIT', name: 'Auditeur Interne' },
    { departmentId: deptMap['RH'], code: 'DRH', name: 'Directeur des Ressources Humaines' },
    { departmentId: deptMap['RH'], code: 'GPERSO', name: 'Gestionnaire du Personnel' },
    { departmentId: deptMap['OPS'], code: 'DOPS', name: 'Directeur des Opérations' },
    { departmentId: deptMap['OPS'], code: 'CAGENCE', name: 'Chef d\'Agence' },
    { departmentId: deptMap['OPS'], code: 'CAISS', name: 'Caissier' },
    { departmentId: deptMap['OPS'], code: 'AGTER', name: 'Agent Terrain' },
    { departmentId: deptMap['OPS'], code: 'SUPV', name: 'Superviseur' },
    { departmentId: deptMap['COM'], code: 'DCOM', name: 'Directeur Commercial' },
    { departmentId: deptMap['COM'], code: 'CCONS', name: 'Chargé de Clientèle' },
    { departmentId: deptMap['COM'], code: 'ACRED', name: 'Analyste Crédit' },
    { departmentId: deptMap['IT'], code: 'DSI', name: 'Directeur des Systèmes d\'Information' },
    { departmentId: deptMap['IT'], code: 'DEV', name: 'Développeur' },
    { departmentId: deptMap['RISK'], code: 'DRISK', name: 'Directeur des Risques' },
    { departmentId: deptMap['RISK'], code: 'CONF', name: 'Responsable Conformité' },
  ];

  for (const pos of positions) {
    const [existing] = await db.select().from(jobPositions).where(eq(jobPositions.code, pos.code));
    if (!existing) {
      await db.insert(jobPositions).values(pos);
    }
  }
  results.push({ table: 'jobPositions', action: 'created', count: positions.length });

  // Payroll Config Global — Congo-Brazzaville
  const [existingPayroll] = await db.select().from(payrollConfig).where(isNull(payrollConfig.agenceId));
  if (!existingPayroll) {
    await db.insert(payrollConfig).values({
      agenceId: null, // Global
      // CNSS Congo-Brazzaville: salarié = 4% (pension), patronal = 22.28%
      cnssEmployeeRate: '0.0400',
      cnssEmployerRate: '0.2228',
      // Breakdown CNSS employé
      cnssAllocFamilialesRate: '0.0000',        // Employé: 0% (PF = patronal uniquement)
      cnssPvidRate: '0.0400',                    // Employé: 4% (Pension vieillesse)
      cnssAtmpRate: '0.0000',                    // Employé: 0% (AT/MP = patronal uniquement)
      // Breakdown CNSS patronal
      cnssAllocFamilialesEmployerRate: '0.1003', // Patronal: 10.03% (Prestations familiales)
      cnssPvidEmployerRate: '0.0800',            // Patronal: 8% (Pension vieillesse)
      cnssAtmpEmployerRate: '0.0225',            // Patronal: 2.25% (AT/MP)
      // IRPP barème progressif Congo-Brazza (legacy — voir irppBaremes pour la version propre)
      iprBrackets: [
        { min: 0, max: 464000, rate: 0.01 },
        { min: 464001, max: 1000000, rate: 0.10 },
        { min: 1000001, max: 3000000, rate: 0.25 },
        { min: 3000001, max: 8000000, rate: 0.40 },
        { min: 8000001, max: null, rate: 0.45 },
      ],
      transportAllowance: 50000,
      housingAllowance: 0,
      overtimeRate: '1.25',  // Congo-Brazza: +25% les 8 premières heures
      nightShiftRate: '1.50', // Congo-Brazza: +50% heures de nuit
      holidayRate: '2.00',    // Congo-Brazza: +100% jours fériés
      isActive: true,
    });
    results.push({ table: 'payrollConfig', action: 'created', count: 1 });
  } else {
    results.push({ table: 'payrollConfig', action: 'skipped', count: 0, details: 'exists' });
  }

  // ================================================================
  // CONVENTION COLLECTIVE MICROFINANCE CONGO-BRAZZAVILLE
  // ================================================================
  const [existingCC] = await db.select().from(conventionsCollectives).where(eq(conventionsCollectives.code, 'CC_MF_CG'));
  let ccId: string;
  if (!existingCC) {
    const [cc] = await db.insert(conventionsCollectives).values({
      code: 'CC_MF_CG',
      libelle: 'Convention Collective Microfinance Congo-Brazzaville',
      pays: 'CG',
      secteur: 'MICROFINANCE',
      dureeEssaiCDI: 90,   // 3 mois
      dureeEssaiCDD: 30,   // 1 mois
      congesAnnuels: 26,   // 26 jours ouvrables
      heuresHebdo: '40.0',
      defaults: {
        primeAncienneteParAn: 0.02,  // 2% par an
        plafondAnciennete: 0.30,     // max 30%
        heuresParMois: 173,
      },
    }).returning();
    ccId = cc.id;
    results.push({ table: 'conventionsCollectives', action: 'created', count: 1 });
  } else {
    ccId = existingCC.id;
    results.push({ table: 'conventionsCollectives', action: 'skipped', count: 0, details: 'exists' });
  }

  // ================================================================
  // QUALIFICATION-COEFFICIENTS (Grille microfinance)
  // ================================================================
  const qualifData = [
    { categorie: 'OUVRIER',         echelon: 1, coefficient: 100, salaireMinimum: 90000 },
    { categorie: 'OUVRIER',         echelon: 2, coefficient: 115, salaireMinimum: 103500 },
    { categorie: 'OUVRIER',         echelon: 3, coefficient: 130, salaireMinimum: 117000 },
    { categorie: 'EMPLOYE',         echelon: 1, coefficient: 150, salaireMinimum: 135000 },
    { categorie: 'EMPLOYE',         echelon: 2, coefficient: 175, salaireMinimum: 157500 },
    { categorie: 'EMPLOYE',         echelon: 3, coefficient: 200, salaireMinimum: 180000 },
    { categorie: 'AGENT_MAITRISE',  echelon: 1, coefficient: 250, salaireMinimum: 225000 },
    { categorie: 'AGENT_MAITRISE',  echelon: 2, coefficient: 300, salaireMinimum: 270000 },
    { categorie: 'AGENT_MAITRISE',  echelon: 3, coefficient: 350, salaireMinimum: 315000 },
    { categorie: 'CADRE',           echelon: 1, coefficient: 400, salaireMinimum: 360000 },
    { categorie: 'CADRE',           echelon: 2, coefficient: 500, salaireMinimum: 450000 },
    { categorie: 'CADRE',           echelon: 3, coefficient: 600, salaireMinimum: 540000 },
    { categorie: 'CADRE_SUP',       echelon: 1, coefficient: 700, salaireMinimum: 630000 },
    { categorie: 'CADRE_SUP',       echelon: 2, coefficient: 800, salaireMinimum: 720000 },
  ];

  const [existingQualif] = await db.select().from(qualificationCoefficients).limit(1);
  if (!existingQualif) {
    for (const q of qualifData) {
      await db.insert(qualificationCoefficients).values({
        conventionCollectiveId: ccId,
        ...q,
      });
    }
    results.push({ table: 'qualificationCoefficients', action: 'created', count: qualifData.length });
  } else {
    results.push({ table: 'qualificationCoefficients', action: 'skipped', count: 0, details: 'exists' });
  }

  // ================================================================
  // CHARGES SOCIALES CONGO-BRAZZAVILLE (paramétrables)
  // ================================================================
  const chargesData = [
    { code: 'CNSS_PF',        libelle: 'CNSS - Prestations familiales',          organisme: 'CNSS', side: 'EMPLOYER',  assietteRule: 'BASE_CNSS', rate: '0.1003', plafond: 500000 },
    { code: 'CNSS_PENSION_E', libelle: 'CNSS - Pension vieillesse (salariale)',   organisme: 'CNSS', side: 'EMPLOYEE',  assietteRule: 'BASE_CNSS', rate: '0.0400', plafond: null },
    { code: 'CNSS_PENSION_P', libelle: 'CNSS - Pension vieillesse (patronale)',   organisme: 'CNSS', side: 'EMPLOYER',  assietteRule: 'BASE_CNSS', rate: '0.0800', plafond: null },
    { code: 'CNSS_ATMP',      libelle: 'CNSS - Accidents du travail',            organisme: 'CNSS', side: 'EMPLOYER',  assietteRule: 'BASE_CNSS', rate: '0.0225', plafond: null },
    { code: 'CFC',            libelle: 'Contribution Formation Continue',         organisme: 'CFC',  side: 'EMPLOYER',  assietteRule: 'BASE_CNSS', rate: '0.0100', plafond: null },
    { code: 'TAP',            libelle: "Taxe d'Apprentissage et Perfectionnement",organisme: 'CFC',  side: 'EMPLOYER',  assietteRule: 'BASE_CNSS', rate: '0.0100', plafond: null },
  ];

  const [existingCharge] = await db.select().from(chargeDefinitions).limit(1);
  if (!existingCharge) {
    for (const c of chargesData) {
      await db.insert(chargeDefinitions).values(c as any);
    }
    results.push({ table: 'chargeDefinitions', action: 'created', count: chargesData.length });
  } else {
    results.push({ table: 'chargeDefinitions', action: 'skipped', count: 0, details: 'exists' });
  }

  // ================================================================
  // BARÈME IRPP CONGO-BRAZZAVILLE 2024
  // ================================================================
  const [existingBareme] = await db.select().from(irppBaremes).where(eq(irppBaremes.code, 'CG_2024'));
  if (!existingBareme) {
    await db.insert(irppBaremes).values({
      code: 'CG_2024',
      pays: 'CG',
      libelle: 'Barème IRPP Congo-Brazzaville 2024',
      abattementForfaitaire: '0.2000', // 20%
      brackets: [
        { min: 0,       max: 464000,   rate: 0.01 },
        { min: 464001,  max: 1000000,  rate: 0.10 },
        { min: 1000001, max: 3000000,  rate: 0.25 },
        { min: 3000001, max: 8000000,  rate: 0.40 },
        { min: 8000001, max: null,     rate: 0.45 },
      ],
      effectiveFrom: '2024-01-01',
    });
    results.push({ table: 'irppBaremes', action: 'created', count: 1 });
  } else {
    results.push({ table: 'irppBaremes', action: 'skipped', count: 0, details: 'exists' });
  }

  // ================================================================
  // RUBRIQUES DE PAIE (catalogue paramétrable)
  // ================================================================
  const rubriquesData = [
    // GAINS
    { code: '100',  libelle: 'Salaire de base',              type: 'GAIN',     calcMode: 'FIXED',     baseSource: null,           priority: 10,  isTaxable: true,  isCnssApplicable: true },
    { code: '110',  libelle: "Prime d'ancienneté",           type: 'GAIN',     calcMode: 'BASE_RATE', baseSource: 'SALAIRE_BASE', priority: 20,  isTaxable: true,  isCnssApplicable: true },
    { code: '120',  libelle: 'Indemnité congés payés',       type: 'GAIN',     calcMode: 'FORMULA',   baseSource: null,           priority: 25,  isTaxable: true,  isCnssApplicable: true },
    { code: '200',  libelle: 'Heures sup 25%',               type: 'GAIN',     calcMode: 'BASE_RATE', baseSource: 'TAUX_HORAIRE', priority: 30,  isTaxable: true,  isCnssApplicable: true, defaultRate: '1.2500' },
    { code: '201',  libelle: 'Heures sup 50%',               type: 'GAIN',     calcMode: 'BASE_RATE', baseSource: 'TAUX_HORAIRE', priority: 31,  isTaxable: true,  isCnssApplicable: true, defaultRate: '1.5000' },
    { code: '210',  libelle: 'Heures de nuit',               type: 'GAIN',     calcMode: 'BASE_RATE', baseSource: 'TAUX_HORAIRE', priority: 32,  isTaxable: true,  isCnssApplicable: true, defaultRate: '1.5000' },
    { code: '220',  libelle: 'Heures jours fériés',          type: 'GAIN',     calcMode: 'BASE_RATE', baseSource: 'TAUX_HORAIRE', priority: 33,  isTaxable: true,  isCnssApplicable: true, defaultRate: '2.0000' },
    { code: '300',  libelle: 'Prime de transport',            type: 'GAIN',     calcMode: 'FIXED',     baseSource: null,           priority: 40,  isTaxable: false, isCnssApplicable: false },
    { code: '400',  libelle: 'Commission prospection',        type: 'GAIN',     calcMode: 'FORMULA',   baseSource: null,           priority: 50,  isTaxable: true,  isCnssApplicable: true },
    // SUBTOTAL BRUT
    { code: '1000', libelle: 'Salaire brut',                  type: 'SUBTOTAL', calcMode: 'FIXED',     baseSource: null,           priority: 100, isTaxable: false, isCnssApplicable: false },
    // RETENUES SALARIALES
    { code: '2001', libelle: 'CNSS Pension (salariale)',       type: 'RETENUE',  calcMode: 'RATE',      baseSource: 'BASE_CNSS',    priority: 110, isTaxable: false, isCnssApplicable: false, defaultRate: '0.0400' },
    { code: '3000', libelle: 'Total charges salariales',       type: 'SUBTOTAL', calcMode: 'FIXED',     baseSource: null,           priority: 120, isTaxable: false, isCnssApplicable: false },
    // IRPP
    { code: '4000', libelle: 'IRPP',                           type: 'RETENUE',  calcMode: 'FORMULA',   baseSource: 'BRUT_IMPOSABLE', priority: 130, isTaxable: false, isCnssApplicable: false },
    // AVANCE
    { code: '4500', libelle: 'Avance sur salaire',             type: 'RETENUE',  calcMode: 'FIXED',     baseSource: null,           priority: 140, isTaxable: false, isCnssApplicable: false },
    // TOTAL RETENUES
    { code: '5000', libelle: 'Total retenues',                 type: 'SUBTOTAL', calcMode: 'FIXED',     baseSource: null,           priority: 150, isTaxable: false, isCnssApplicable: false },
    // CHARGES PATRONALES
    { code: '6000', libelle: 'CNSS PF (patronale)',            type: 'PATRONAL', calcMode: 'RATE',      baseSource: 'BASE_CNSS',    priority: 200, isTaxable: false, isCnssApplicable: false, defaultRate: '0.1003' },
    { code: '6001', libelle: 'CNSS Pension (patronale)',       type: 'PATRONAL', calcMode: 'RATE',      baseSource: 'BASE_CNSS',    priority: 201, isTaxable: false, isCnssApplicable: false, defaultRate: '0.0800' },
    { code: '6002', libelle: 'CNSS AT/MP (patronale)',         type: 'PATRONAL', calcMode: 'RATE',      baseSource: 'BASE_CNSS',    priority: 202, isTaxable: false, isCnssApplicable: false, defaultRate: '0.0225' },
    { code: '6003', libelle: 'CFC (patronale)',                type: 'PATRONAL', calcMode: 'RATE',      baseSource: 'BASE_CNSS',    priority: 203, isTaxable: false, isCnssApplicable: false, defaultRate: '0.0100' },
    { code: '6004', libelle: 'TAP (patronale)',                type: 'PATRONAL', calcMode: 'RATE',      baseSource: 'BASE_CNSS',    priority: 204, isTaxable: false, isCnssApplicable: false, defaultRate: '0.0100' },
    // TOTAL PATRONAL
    { code: '7000', libelle: 'Total charges patronales',       type: 'SUBTOTAL', calcMode: 'FIXED',     baseSource: null,           priority: 250, isTaxable: false, isCnssApplicable: false },
    // NET
    { code: '9999', libelle: 'Net à payer',                    type: 'NET',      calcMode: 'FIXED',     baseSource: null,           priority: 999, isTaxable: false, isCnssApplicable: false },
  ];

  const [existingRubrique] = await db.select().from(rubriqueDefinitions).limit(1);
  if (!existingRubrique) {
    for (const r of rubriquesData) {
      await db.insert(rubriqueDefinitions).values(r as any);
    }
    results.push({ table: 'rubriqueDefinitions', action: 'created', count: rubriquesData.length });
  } else {
    results.push({ table: 'rubriqueDefinitions', action: 'skipped', count: 0, details: 'exists' });
  }

  // ================================================================
  // MAPPING GL OHADA (rubriques/charges → comptes)
  // ================================================================
  const glMappingData = [
    // ENGAGEMENT (validation) — charges de personnel
    { sourceType: 'AGGREGATE', sourceCode: 'BRUT',            side: 'DEBIT',  accountNumber: '6611', journalCode: 'OD', description: 'Rémunérations du personnel' },
    { sourceType: 'AGGREGATE', sourceCode: 'NET_A_PAYER',     side: 'CREDIT', accountNumber: '4211', journalCode: 'OD', description: 'Personnel - rémunérations dues' },
    { sourceType: 'AGGREGATE', sourceCode: 'CNSS_SALARIALE',  side: 'CREDIT', accountNumber: '4311', journalCode: 'OD', description: 'CNSS - cotisations salariales' },
    { sourceType: 'AGGREGATE', sourceCode: 'IRPP',            side: 'CREDIT', accountNumber: '4421', journalCode: 'OD', description: 'État - IRPP retenu' },
    { sourceType: 'AGGREGATE', sourceCode: 'AVANCE_DEDUITE',  side: 'CREDIT', accountNumber: '4212', journalCode: 'OD', description: 'Personnel - avances déduites' },
    // Charges patronales
    { sourceType: 'AGGREGATE', sourceCode: 'CNSS_PATRONALE',  side: 'DEBIT',  accountNumber: '6641', journalCode: 'OD', description: 'Charges sociales patronales' },
    { sourceType: 'AGGREGATE', sourceCode: 'CNSS_PATRONALE',  side: 'CREDIT', accountNumber: '4311', journalCode: 'OD', description: 'CNSS - cotisations patronales' },
    { sourceType: 'AGGREGATE', sourceCode: 'CFC_TAP',         side: 'DEBIT',  accountNumber: '6651', journalCode: 'OD', description: 'Formation professionnelle' },
    { sourceType: 'AGGREGATE', sourceCode: 'CFC_TAP',         side: 'CREDIT', accountNumber: '4471', journalCode: 'OD', description: 'Formation - cotisations dues' },
    // PAIEMENT — décaissement
    { sourceType: 'AGGREGATE', sourceCode: 'PAIEMENT_NET',    side: 'DEBIT',  accountNumber: '4211', journalCode: 'CAI', description: 'Personnel - dette soldée' },
    { sourceType: 'AGGREGATE', sourceCode: 'PAIEMENT_NET',    side: 'CREDIT', accountNumber: '521',  journalCode: 'CAI', description: 'Caisse - décaissement salaires' },
  ];

  const [existingGlMapping] = await db.select().from(payrollGlMapping).limit(1);
  if (!existingGlMapping) {
    for (const m of glMappingData) {
      await db.insert(payrollGlMapping).values(m as any);
    }
    results.push({ table: 'payrollGlMapping', action: 'created', count: glMappingData.length });
  } else {
    results.push({ table: 'payrollGlMapping', action: 'skipped', count: 0, details: 'exists' });
  }

  return results;
}

async function seedMaintenanceModules(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Maintenance Modules...');

  if (dryRun) {
    return [{ table: 'maintenanceModules', action: 'skipped', count: MODULES_DATA.length, details: 'dry-run' }];
  }

  // Sync avec MODULES_DATA (source de vérité RBAC)
  const moduleNames = MODULES_DATA.map(m => m.name);

  // Ajouter PLATFORM si non présent
  if (!(moduleNames as string[]).includes('PLATFORM')) {
    (moduleNames as string[]).push('PLATFORM');
  }

  for (const moduleName of moduleNames) {
    const [existing] = await db.select().from(maintenanceModules).where(eq(maintenanceModules.moduleName, moduleName));
    if (!existing) {
      await db.insert(maintenanceModules).values({
        moduleName,
        isLocked: false,
      });
    }
  }

  return [{ table: 'maintenanceModules', action: 'created', count: moduleNames.length }];
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

async function seedNotificationSystem(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Notification System...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [
      { table: 'emailProviderSettings', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'emailTemplates', action: 'skipped', count: 10, details: 'dry-run' },
      { table: 'notificationSettings', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'smsProviderSettings (MTN)', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'smsTemplates (new)', action: 'skipped', count: 5, details: 'dry-run' },
      { table: 'featureFlags (notif)', action: 'skipped', count: 1, details: 'dry-run' },
    ];
  }

  // 1. Email Provider Settings — auto-enabled if SMTP env vars are set
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUsername = process.env.SMTP_USERNAME || '';
  const smtpPassword = process.env.SMTP_PASSWORD || '';
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@cofin.co';
  const smtpFromName = process.env.SMTP_FROM_NAME || 'COFIN&CO-M';
  const smtpSecure = process.env.SMTP_SECURE === 'true';
  const smtpHasCredentials = !!(smtpHost && smtpUsername && smtpPassword);

  const [existingEmail] = await db.select().from(emailProviderSettings).limit(1);
  if (!existingEmail) {
    await db.insert(emailProviderSettings).values({
      provider: 'SMTP',
      providerName: smtpHasCredentials ? 'TurboSMTP' : 'SMTP par defaut',
      host: smtpHost || 'smtp.example.com',
      port: smtpPort,
      username: smtpUsername || undefined,
      password: smtpPassword || undefined,
      fromEmail: smtpFromEmail,
      fromName: smtpFromName,
      isActive: smtpHasCredentials,
      isPrimary: true,
      secure: smtpSecure,
    });
    results.push({ table: 'emailProviderSettings', action: 'created', count: 1, details: smtpHasCredentials ? 'enabled (credentials from env)' : 'disabled (no credentials)' });
  } else if (smtpHasCredentials && !existingEmail.isActive) {
    // Update existing entry with env credentials if not yet active
    await db.update(emailProviderSettings)
      .set({
        providerName: 'TurboSMTP',
        host: smtpHost,
        port: smtpPort,
        username: smtpUsername,
        password: smtpPassword,
        fromEmail: smtpFromEmail,
        fromName: smtpFromName,
        isActive: true,
        isPrimary: true,
        secure: smtpSecure,
      })
      .where(eq(emailProviderSettings.id, existingEmail.id));
    results.push({ table: 'emailProviderSettings', action: 'updated', count: 1, details: 'activated with env credentials' });
  } else {
    results.push({ table: 'emailProviderSettings', action: 'skipped', count: 0, details: 'exists' });
  }

  // 2. MTN SMS Provider — auto-enabled if env vars are set
  const mtnClientId = process.env.MTN_SMS_CLIENT_ID || '';
  const mtnClientSecret = process.env.MTN_SMS_CLIENT_SECRET || '';
  const mtnSenderId = process.env.MTN_SMS_SENDER_ID || 'COFIN';
  const mtnTokenUrl = process.env.MTN_SMS_TOKEN_URL || 'https://api.mtn.com/v1/oauth/access_token/accesstoken?grant_type=client_credentials';
  const mtnBaseUrl = process.env.MTN_SMS_BASE_URL || 'https://api.mtn.com/v2/messages/sms/outbound';
  const mtnHasCredentials = !!(mtnClientId && mtnClientSecret);

  const [existingMtn] = await db.select().from(smsProviderSettings)
    .where(eq(smsProviderSettings.providerName, 'mtn'));
  if (!existingMtn) {
    await db.insert(smsProviderSettings).values({
      provider: 'manual',
      providerName: 'mtn',
      apiKey: '',
      apiUrl: 'https://api.mtn.com',
      senderId: mtnSenderId,
      enabled: mtnHasCredentials,
      isPrimary: mtnHasCredentials,
      isActive: mtnHasCredentials,
      settings: {
        clientId: mtnClientId,
        clientSecret: mtnClientSecret,
        tokenUrl: mtnTokenUrl,
        smsBaseUrl: mtnBaseUrl,
      },
    });
    results.push({ table: 'smsProviderSettings (MTN)', action: 'created', count: 1, details: mtnHasCredentials ? 'enabled (credentials from env)' : 'disabled (no credentials)' });
  } else if (mtnHasCredentials && !existingMtn.isActive) {
    // Update existing entry with env credentials if not yet active
    await db.update(smsProviderSettings)
      .set({
        senderId: mtnSenderId,
        enabled: true,
        isPrimary: true,
        isActive: true,
        settings: {
          clientId: mtnClientId,
          clientSecret: mtnClientSecret,
          tokenUrl: mtnTokenUrl,
          smsBaseUrl: mtnBaseUrl,
        },
      })
      .where(eq(smsProviderSettings.providerName, 'mtn'));
    results.push({ table: 'smsProviderSettings (MTN)', action: 'updated', count: 1, details: 'activated with env credentials' });
  } else {
    results.push({ table: 'smsProviderSettings (MTN)', action: 'skipped', count: 0, details: 'exists' });
  }

  // 3. Email Templates — Professional HTML with COFIN&CO-M branding
  // Reusable email layout wrapper
  const emailWrap = (body: string) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>COFIN&CO-M</title></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><tr><td style="background:linear-gradient(135deg,#1b2d4b 0%,#0f766e 100%);padding:24px 32px;text-align:center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:10px"><img src="cid:company-logo" alt="COFIN&amp;CO-M" width="64" height="64" style="border-radius:10px;display:block;margin:0 auto"></td></tr><tr><td align="center"><span style="font-size:28px;font-weight:bold;color:#fff;letter-spacing:1px">COFIN</span><span style="font-size:28px;font-weight:bold;color:#f5a623">&amp;</span><span style="font-size:28px;font-weight:bold;color:#4ebb6b">CO</span><span style="font-size:28px;font-weight:bold;color:#f0c844">-M</span></td></tr><tr><td align="center" style="padding-top:4px"><span style="font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px">La Finance Autrement</span></td></tr></table></td></tr><tr><td style="padding:32px">${body}</td></tr><tr><td style="background:#f8f9fa;padding:20px 32px;border-top:1px solid #e9ecef"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;color:#868e96;line-height:1.5">COFIN&amp;CO-M - Microfinance<br>Boulevard Denis Sassou, Brazzaville<br>+242 06 000 00 00</td><td align="right" style="font-size:11px;color:#adb5bd">Cet email a ete envoye automatiquement.<br>Merci de ne pas y repondre.</td></tr></table></td></tr></table></td></tr></table></body></html>`;

  const EMAIL_TEMPLATES_DATA = [
    {
      code: 'OTP_CODE_EMAIL',
      nom: 'Code OTP par email',
      subject: 'Votre code de verification - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour,</h2><p style="color:#495057;line-height:1.6">Votre code de verification est :</p><div style="text-align:center;margin:24px 0"><span style="display:inline-block;background:#0f766e;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:8px">{{otpCode}}</span></div><p style="color:#495057;line-height:1.6">Ce code expire dans <strong>{{expiryMinutes}} minutes</strong>.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Si vous n\'avez pas demande ce code, ignorez ce message.</p>'),
      contenuText: 'Bonjour, votre code de verification est : {{otpCode}}. Ce code expire dans {{expiryMinutes}} minutes. COFIN&CO-M',
      placeholders: 'otpCode,expiryMinutes',
      description: 'Code OTP envoye par email',
    },
    {
      code: 'CREDIT_APPROVED',
      nom: 'Credit approuve',
      subject: 'Votre credit a ete approuve - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Felicitations {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Nous avons le plaisir de vous informer que votre demande de credit a ete <strong style="color:#0f766e">approuvee</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Montant approuve</span><br><strong style="color:#1b2d4b;font-size:22px">{{amount}} FCFA</strong></td></tr></table><p style="color:#495057;line-height:1.6">Rendez-vous a notre agence pour finaliser votre dossier et proceder au decaissement.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Pour toute question, contactez votre conseiller clientele.</p>'),
      contenuText: 'Felicitations {{clientName}} ! Votre demande de credit de {{amount}} FCFA a ete approuvee. Passez a notre agence pour finaliser. COFIN&CO-M',
      placeholders: 'clientName,amount',
      description: 'Notification d\'approbation de credit',
    },
    {
      code: 'CREDIT_REJECTED',
      nom: 'Credit rejete',
      subject: 'Mise a jour de votre demande de credit - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Nous regrettons de vous informer que votre demande de credit <strong>n\'a pas ete retenue</strong> a ce stade.</p><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Cette decision ne remet pas en cause votre relation avec COFIN&amp;CO-M. Vous pouvez soumettre une nouvelle demande en ameliorant votre dossier.</p></div><p style="color:#495057;line-height:1.6">Contactez votre agence pour en savoir plus sur les conditions a remplir.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre demande de credit n\'a pas ete retenue. Contactez votre agence pour plus d\'informations. COFIN&CO-M',
      placeholders: 'clientName',
      description: 'Notification de rejet de credit',
    },
    {
      code: 'CREDIT_DISBURSEMENT',
      nom: 'Decaissement credit',
      subject: 'Decaissement de votre credit - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Le decaissement de votre credit a ete effectue avec succes.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Montant decaisse</span><br><strong style="color:#1b2d4b;font-size:22px">{{amount}} FCFA</strong></td></tr></table><p style="color:#495057;line-height:1.6">Les fonds sont maintenant disponibles. Respectez vos echeances de remboursement pour maintenir un bon historique de credit.</p>'),
      contenuText: 'Bonjour {{clientName}}, le decaissement de votre credit de {{amount}} FCFA a ete effectue. COFIN&CO-M',
      placeholders: 'clientName,amount',
      description: 'Notification de decaissement de credit',
    },
    {
      code: 'PASSWORD_RESET',
      nom: 'Reinitialisation mot de passe',
      subject: 'Code de reinitialisation - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><p style="color:#495057;line-height:1.6">Vous avez demande la reinitialisation de votre mot de passe. Voici votre code :</p><div style="text-align:center;margin:24px 0"><span style="display:inline-block;background:#f97316;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:8px">{{otpCode}}</span></div><p style="color:#495057;line-height:1.6">Ce code expire dans <strong>{{expiryMinutes}} minutes</strong>.</p><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;font-size:13px">Si vous n\'avez pas fait cette demande, contactez immediatement votre administrateur.</p></div>'),
      contenuText: 'Bonjour {{userName}}, votre code de reinitialisation est : {{otpCode}}. Ce code expire dans {{expiryMinutes}} minutes. COFIN&CO-M',
      placeholders: 'userName,otpCode,expiryMinutes',
      description: 'Email de reinitialisation de mot de passe',
    },
    {
      code: 'TRANSFER_EXECUTED',
      nom: 'Transfert execute',
      subject: 'Transfert effectue - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Un transfert a ete effectue avec succes.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr></table></td></tr></table>'),
      contenuText: 'Bonjour {{clientName}}, un transfert de {{amount}} FCFA a ete effectue. Reference : {{reference}}. COFIN&CO-M',
      placeholders: 'clientName,amount,reference',
      description: 'Notification de transfert execute',
    },
    {
      code: 'HR_LEAVE_STATUS',
      nom: 'Statut conge',
      subject: 'Mise a jour de votre demande de conge - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{employeeName}},</h2><p style="color:#495057;line-height:1.6">Votre demande de conge a ete mise a jour.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type</span></td><td align="right"><strong style="color:#1b2d4b">{{leaveType}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Periode</span></td><td align="right"><strong style="color:#1b2d4b">{{startDate}} - {{endDate}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Statut</span></td><td align="right"><strong style="color:#0f766e">{{status}}</strong></td></tr></table></td></tr></table>'),
      contenuText: 'Bonjour {{employeeName}}, votre demande de conge ({{leaveType}}) du {{startDate}} au {{endDate}} a ete {{status}}. COFIN&CO-M',
      placeholders: 'employeeName,leaveType,startDate,endDate,status',
      description: 'Notification de statut de conge',
    },
    {
      code: 'WELCOME',
      nom: 'Bienvenue client',
      subject: 'Bienvenue chez COFIN&CO-M !',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bienvenue {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Votre compte a ete cree avec succes chez <strong>COFIN&amp;CO-M</strong>.</p><div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:20px 0;text-align:center"><p style="color:#0f766e;font-size:18px;font-weight:bold;margin:0">La Finance Autrement</p><p style="color:#495057;margin:8px 0 0">Nous sommes ravis de vous compter parmi nos clients.</p></div><p style="color:#495057;line-height:1.6">N\'hesitez pas a contacter votre agence pour decouvrir nos produits d\'epargne, de credit et de tontine.</p>'),
      contenuText: 'Bienvenue {{clientName}} ! Votre compte a ete cree avec succes chez COFIN&CO-M. Merci de votre confiance.',
      placeholders: 'clientName',
      description: 'Email de bienvenue client',
    },
    // ---- Phase 1: Credit templates ----
    {
      code: 'CREDIT_APPLICATION_RECEIVED',
      nom: 'Demande de credit recue',
      subject: 'Votre demande de credit a ete recue - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Nous avons bien recu votre demande de credit. Elle est en cours de traitement.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">N° de demande</span></td><td align="right"><strong style="color:#1b2d4b">{{creditNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant demande</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6"><strong>Prochaines etapes :</strong></p><ol style="color:#495057;line-height:1.8;padding-left:20px"><li>Paiement des frais d\'engagement</li><li>Enquete terrain par un agent</li><li>Decision du comite de credit</li></ol><p style="color:#868e96;font-size:13px;margin-top:24px">Vous serez notifie a chaque etape de l\'avancement de votre dossier.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre demande de credit N°{{creditNumber}} de {{amount}} FCFA a ete recue. Vous serez notifie de l\'avancement. COFIN&CO-M',
      placeholders: 'clientName,amount,creditNumber',
      description: 'Confirmation de reception de demande de credit',
    },
    {
      code: 'CREDIT_INVESTIGATION_ASSIGNED',
      nom: 'Enquete credit en cours',
      subject: 'Votre dossier de credit est en cours d\'enquete - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Votre dossier de credit <strong>{{creditNumber}}</strong> progresse. Un agent a ete assigne pour realiser l\'enquete terrain.</p><div style="background:#fffbeb;border-left:4px solid #f5a623;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6"><strong>Agent assigne :</strong> {{agentName}}<br>L\'agent pourra vous contacter ou se rendre a votre lieu d\'activite pour verifier les informations de votre dossier.</p></div><p style="color:#495057;line-height:1.6">Assurez-vous que vos documents sont a jour et que votre activite est accessible pour faciliter l\'enquete.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre dossier {{creditNumber}} est en cours d\'enquete par {{agentName}}. Assurez-vous que vos documents sont a jour. COFIN&CO-M',
      placeholders: 'clientName,creditNumber,agentName',
      description: 'Notification d\'assignation d\'enquete credit',
    },
    {
      code: 'CREDIT_OVERDUE',
      nom: 'Echeance credit depassee',
      subject: 'Echeance de remboursement depassee - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#ef4444;margin:0 0 16px">Attention {{clientName}},</h2><p style="color:#495057;line-height:1.6">Votre echeance de remboursement de credit est depassee.</p><table role="presentation" style="background:#fef2f2;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Credit N°</span></td><td align="right"><strong style="color:#1b2d4b">{{creditNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant restant</span></td><td align="right"><strong style="color:#ef4444">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Echeance du</span></td><td align="right"><strong style="color:#1b2d4b">{{dueDate}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Retard</span></td><td align="right"><strong style="color:#ef4444">{{daysOverdue}} jour(s)</strong></td></tr></table></td></tr></table><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Des penalites de retard peuvent s\'appliquer. Veuillez regulariser votre situation au plus vite en vous rendant a votre agence ou en contactant votre conseiller.</p></div>'),
      contenuText: 'Attention {{clientName}}, votre echeance de remboursement du credit {{creditNumber}} est depassee de {{daysOverdue}} jour(s). Montant restant : {{amount}} FCFA. Regularisez votre situation. COFIN&CO-M',
      placeholders: 'clientName,amount,dueDate,daysOverdue,creditNumber',
      description: 'Notification d\'echeance de credit depassee',
    },
    {
      code: 'CREDIT_PAYMENT_REMINDER',
      nom: 'Rappel echeance credit',
      subject: 'Rappel : echeance de remboursement proche - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Nous vous rappelons qu\'une echeance de remboursement approche.</p><table role="presentation" style="background:#fffbeb;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Credit N°</span></td><td align="right"><strong style="color:#1b2d4b">{{creditNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Date d\'echeance</span></td><td align="right"><strong style="color:#f5a623">{{dueDate}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Pensez a effectuer votre remboursement avant la date d\'echeance pour eviter les penalites de retard.</p>'),
      contenuText: 'Bonjour {{clientName}}, rappel : echeance de remboursement du credit {{creditNumber}} de {{amount}} FCFA le {{dueDate}}. COFIN&CO-M',
      placeholders: 'clientName,amount,dueDate,creditNumber',
      description: 'Rappel d\'echeance de remboursement de credit',
    },
    {
      code: 'CREDIT_PAID_OFF',
      nom: 'Credit entierement rembourse',
      subject: 'Felicitations ! Votre credit est solde - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Felicitations {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Votre credit a ete <strong style="color:#0f766e">entierement rembourse</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Credit N°</span></td><td align="right"><strong style="color:#1b2d4b">{{creditNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Total rembourse</span></td><td align="right"><strong style="color:#0f766e">{{totalPaid}} FCFA</strong></td></tr></table></td></tr></table><div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:20px 0;text-align:center"><p style="color:#0f766e;font-size:16px;font-weight:bold;margin:0">Votre historique de credit est excellent !</p><p style="color:#495057;margin:8px 0 0;font-size:13px">Ce bon historique ameliore votre eligibilite pour de futurs credits avec des conditions avantageuses.</p></div>'),
      contenuText: 'Felicitations {{clientName}} ! Votre credit {{creditNumber}} a ete entierement rembourse ({{totalPaid}} FCFA). COFIN&CO-M',
      placeholders: 'clientName,creditNumber,totalPaid',
      description: 'Notification de credit entierement rembourse',
    },
    {
      code: 'CREDIT_REFUND_APPROVED',
      nom: 'Remboursement approuve',
      subject: 'Votre demande de remboursement a ete approuvee - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Votre demande de remboursement a ete <strong style="color:#0f766e">approuvee</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Le paiement sera effectue dans les plus brefs delais. Vous recevrez une notification des que les fonds auront ete verses.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre remboursement de {{amount}} FCFA (ref: {{reference}}) a ete approuve. COFIN&CO-M',
      placeholders: 'clientName,amount,reference',
      description: 'Notification d\'approbation de remboursement',
    },
    {
      code: 'CREDIT_REFUND_PAID',
      nom: 'Remboursement effectue',
      subject: 'Remboursement effectue - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Le remboursement a ete effectue avec succes.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant verse</span></td><td align="right"><strong style="color:#0f766e">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Les fonds ont ete credites sur votre compte.</p>'),
      contenuText: 'Bonjour {{clientName}}, le remboursement de {{amount}} FCFA (ref: {{reference}}) a ete effectue. COFIN&CO-M',
      placeholders: 'clientName,amount,reference',
      description: 'Notification de remboursement effectue',
    },
    // ── Tontine email templates ──
    {
      code: 'TONTINE_MEMBER_JOINED',
      nom: 'Adhesion tontine',
      subject: 'Bienvenue dans la tontine {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bienvenue {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Vous avez ete inscrit(e) a la tontine <strong>{{tontineName}}</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Cotisation</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Frequence</span></td><td align="right"><strong style="color:#1b2d4b">{{frequence}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Pensez a respecter les echeances de cotisation pour profiter pleinement des avantages de votre tontine.</p>'),
      contenuText: 'Bienvenue {{clientName}} ! Vous etes inscrit(e) a la tontine {{tontineName}}. Cotisation: {{amount}} FCFA ({{frequence}}). COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount,frequence',
      description: 'Email de bienvenue dans une tontine',
    },
    {
      code: 'TONTINE_CONTRIBUTION_RECEIVED',
      nom: 'Cotisation tontine recue',
      subject: 'Cotisation enregistree - {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Votre cotisation pour la tontine <strong>{{tontineName}}</strong> a ete enregistree.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#0f766e">{{amount}} FCFA</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Merci pour votre regularite.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre cotisation de {{amount}} FCFA pour la tontine {{tontineName}} a ete enregistree. COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount',
      description: 'Email de confirmation de cotisation tontine',
    },
    {
      code: 'TONTINE_CONTRIBUTION_OVERDUE',
      nom: 'Retard cotisation tontine',
      subject: 'Retard de cotisation - {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Votre cotisation pour la tontine <strong>{{tontineName}}</strong> est en retard de <strong>{{daysOverdue}} jours</strong>.</p></div><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant du</span></td><td align="right"><strong style="color:#ef4444">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Date d\'echeance</span></td><td align="right"><strong style="color:#1b2d4b">{{dueDate}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Regularisez votre situation au plus vite pour eviter des penalites.</p>'),
      contenuText: 'COFIN&CO-M: Bonjour {{clientName}}, votre cotisation de {{amount}} FCFA pour {{tontineName}} est en retard de {{daysOverdue}} jours (echeance: {{dueDate}}). Regularisez rapidement.',
      placeholders: 'clientName,tontineName,amount,dueDate,daysOverdue',
      description: 'Email de retard de cotisation tontine',
    },
    {
      code: 'TONTINE_PENALTY_APPLIED',
      nom: 'Penalite tontine',
      subject: 'Penalite appliquee - {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><div style="background:#fef3f2;border-left:4px solid #f97316;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Une penalite a ete appliquee sur votre tontine <strong>{{tontineName}}</strong>.</p></div><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant penalite</span></td><td align="right"><strong style="color:#f97316">{{montantPenalite}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Motif</span></td><td align="right"><strong style="color:#1b2d4b">{{motif}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Cette penalite sera deduite de votre distribution. Contactez votre agence pour plus d\'informations.</p>'),
      contenuText: 'COFIN&CO-M: Bonjour {{clientName}}, une penalite de {{montantPenalite}} FCFA a ete appliquee sur {{tontineName}} ({{motif}}). Contactez votre agence.',
      placeholders: 'clientName,tontineName,montantPenalite,motif',
      description: 'Email de penalite de tontine',
    },
    {
      code: 'TONTINE_DISTRIBUTION_APPROVED',
      nom: 'Distribution tontine approuvee',
      subject: 'Distribution approuvee - {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bonne nouvelle {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Votre distribution pour la tontine <strong>{{tontineName}}</strong> a ete <strong style="color:#0f766e">approuvee</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#0f766e;font-size:22px">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Mode de paiement</span></td><td align="right"><strong style="color:#1b2d4b">{{payoutMethod}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Le paiement sera effectue selon le mode choisi.</p>'),
      contenuText: 'Felicitations {{clientName}} ! Distribution tontine {{tontineName}} approuvee: {{amount}} FCFA ({{payoutMethod}}). COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount,payoutMethod',
      description: 'Email de distribution tontine approuvee',
    },
    {
      code: 'TONTINE_DISTRIBUTION_PAID',
      nom: 'Distribution tontine payee',
      subject: 'Distribution effectuee - {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Felicitations {{clientName}} !</h2><p style="color:#495057;line-height:1.6">La distribution de votre tontine <strong>{{tontineName}}</strong> a ete effectuee.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant verse</span></td><td align="right"><strong style="color:#0f766e;font-size:22px">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Mode</span></td><td align="right"><strong style="color:#1b2d4b">{{payoutMethod}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Les fonds sont maintenant disponibles.</p>'),
      contenuText: 'Felicitations {{clientName}} ! Distribution tontine {{tontineName}}: {{amount}} FCFA versee (Ref: {{reference}}). COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount,reference,payoutMethod',
      description: 'Email de distribution tontine effectuee',
    },
    {
      code: 'TONTINE_CYCLE_STARTED',
      nom: 'Nouveau cycle tontine',
      subject: 'Nouveau cycle demarre - {{tontineName}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Un nouveau cycle a demarre pour votre tontine <strong>{{tontineName}}</strong>.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Cycle n°</span></td><td align="right"><strong style="color:#1b2d4b">{{cycleNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Date de debut</span></td><td align="right"><strong style="color:#1b2d4b">{{startDate}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Les cotisations sont ouvertes. Pensez a respecter les echeances pour eviter les penalites.</p>'),
      contenuText: 'Bonjour {{clientName}}, cycle {{cycleNumber}} de la tontine {{tontineName}} a demarre le {{startDate}}. Les cotisations sont ouvertes. COFIN&CO-M',
      placeholders: 'clientName,tontineName,cycleNumber,startDate',
      description: 'Email de nouveau cycle de tontine',
    },
    // ---- Phase 3: Comptes & Épargne templates ----
    {
      code: 'ACCOUNT_CREATED',
      nom: 'Compte ouvert',
      subject: 'Votre compte a ete ouvert - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bienvenue {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Votre nouveau compte a ete cree avec succes chez <strong>COFIN&amp;CO-M</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">N° de compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type</span></td><td align="right"><strong style="color:#0f766e">{{accountType}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Conservez votre numero de compte et rendez-vous a votre agence pour effectuer votre premier depot.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre compte {{accountType}} N°{{accountNumber}} a ete ouvert. Rendez-vous a votre agence. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,accountType',
      description: 'Notification d\'ouverture de compte',
    },
    {
      code: 'ACCOUNT_ACTIVATED',
      nom: 'Compte active',
      subject: 'Votre compte est maintenant actif - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Compte active {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Votre depot initial a ete encaisse et votre compte est maintenant <strong style="color:#0f766e">actif</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">N° de compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type</span></td><td align="right"><strong style="color:#1b2d4b">{{accountType}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Depot initial</span></td><td align="right"><strong style="color:#0f766e;font-size:18px">{{amount}} FCFA</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Vous pouvez des a present effectuer des depots et retraits sur votre compte.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre compte {{accountType}} N°{{accountNumber}} est actif ! Depot initial: {{amount}} FCFA. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,accountType,amount',
      description: 'Notification d\'activation de compte',
    },
    {
      code: 'ACCOUNT_DEPOSIT',
      nom: 'Depot confirme',
      subject: 'Depot effectue sur votre compte - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Un depot a ete effectue sur votre compte.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant depose</span></td><td align="right"><strong style="color:#0f766e;font-size:18px">+{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Nouveau solde</span></td><td align="right" style="border-top:1px solid #e9ecef"><strong style="color:#1b2d4b;font-size:18px">{{balance}} FCFA</strong></td></tr></table></td></tr></table>'),
      contenuText: 'Bonjour {{clientName}}, depot de {{amount}} FCFA sur compte {{accountNumber}}. Solde: {{balance}} FCFA. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,amount,balance',
      description: 'Confirmation de depot sur compte',
    },
    {
      code: 'ACCOUNT_WITHDRAWAL',
      nom: 'Retrait confirme',
      subject: 'Retrait effectue sur votre compte - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Un retrait a ete effectue sur votre compte.</p><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant retire</span></td><td align="right"><strong style="color:#ef4444;font-size:18px">-{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Nouveau solde</span></td><td align="right" style="border-top:1px solid #e9ecef"><strong style="color:#1b2d4b;font-size:18px">{{balance}} FCFA</strong></td></tr></table></td></tr></table><p style="color:#868e96;font-size:13px;margin-top:24px">Si vous n\'avez pas autorise cette operation, contactez immediatement votre agence.</p>'),
      contenuText: 'Bonjour {{clientName}}, retrait de {{amount}} FCFA sur compte {{accountNumber}}. Solde: {{balance}} FCFA. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,amount,balance',
      description: 'Confirmation de retrait sur compte',
    },
    {
      code: 'ACCOUNT_BLOCKED',
      nom: 'Compte bloque',
      subject: 'Votre compte a ete bloque - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><div style="background:#fef3f2;border-left:4px solid #f97316;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Votre compte <strong>{{accountNumber}}</strong> a ete bloque.</p></div><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Motif</span></td><td align="right"><strong style="color:#1b2d4b">{{motif}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Les retraits sont temporairement suspendus. Les depots restent autorises. Contactez votre agence pour plus d\'informations.</p>'),
      contenuText: 'COFIN&CO-M: {{clientName}}, votre compte {{accountNumber}} a ete bloque ({{motif}}). Les depots restent autorises. Contactez votre agence.',
      placeholders: 'clientName,accountNumber,motif',
      description: 'Notification de blocage de compte',
    },
    {
      code: 'ACCOUNT_UNBLOCKED',
      nom: 'Compte debloque',
      subject: 'Votre compte a ete debloque - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bonne nouvelle {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Votre compte <strong>{{accountNumber}}</strong> a ete <strong style="color:#0f766e">debloque</strong>.</p><div style="background:#f0fdf4;border-left:4px solid #4ebb6b;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Vous pouvez a nouveau effectuer des retraits et toutes les operations sur votre compte.</p></div>'),
      contenuText: 'Bonne nouvelle {{clientName}} ! Votre compte {{accountNumber}} a ete debloque. Operations entierement disponibles. COFIN&CO-M',
      placeholders: 'clientName,accountNumber',
      description: 'Notification de deblocage de compte',
    },
    {
      code: 'ACCOUNT_CLOSED',
      nom: 'Compte cloture',
      subject: 'Cloture de votre compte - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Votre compte a ete cloture definitivement.</p><table role="presentation" style="background:#f8f9fa;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">N° de compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type</span></td><td align="right"><strong style="color:#1b2d4b">{{accountType}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Merci de votre confiance. N\'hesitez pas a nous contacter pour ouvrir un nouveau compte.</p>'),
      contenuText: 'Bonjour {{clientName}}, votre compte {{accountType}} N°{{accountNumber}} a ete cloture. Merci de votre confiance. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,accountType',
      description: 'Notification de cloture de compte',
    },
    {
      code: 'INTEREST_CAPITALIZED',
      nom: 'Interets capitalises',
      subject: 'Capitalisation de vos interets - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Les interets de votre compte ont ete capitalises pour ce mois.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Interets credites</span></td><td align="right"><strong style="color:#0f766e;font-size:18px">+{{interestAmount}} FCFA</strong></td></tr><tr><td style="padding:4px 0;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Nouveau solde</span></td><td align="right" style="border-top:1px solid #e9ecef"><strong style="color:#1b2d4b;font-size:18px">{{newBalance}} FCFA</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Continuez a epargner pour faire fructifier votre capital !</p>'),
      contenuText: 'Bonjour {{clientName}}, interets de {{interestAmount}} FCFA credites sur compte {{accountNumber}}. Solde: {{newBalance}} FCFA. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,interestAmount,newBalance',
      description: 'Notification de capitalisation mensuelle des interets',
    },
    // ---- Phase 4: Operations & Securite templates ----
    {
      code: 'TRANSFER_REQUESTED',
      nom: 'Demande de transfert',
      subject: 'Demande de transfert en attente - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><p style="color:#495057;line-height:1.6">Une demande de transfert a ete enregistree et est en attente de validation.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type</span></td><td align="right"><strong style="color:#1b2d4b">{{typeTransfert}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#1b2d4b;font-size:18px">{{amount}} FCFA</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Cette demande sera traitee par un responsable habilite.</p>'),
      contenuText: 'COFIN&CO-M: Demande de transfert {{reference}} ({{typeTransfert}}) de {{amount}} FCFA en attente de validation.',
      placeholders: 'userName,amount,reference,typeTransfert',
      description: 'Notification de demande de transfert interne',
    },
    {
      code: 'TRANSFER_REJECTED',
      nom: 'Transfert rejete',
      subject: 'Transfert rejete - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Le transfert <strong>{{reference}}</strong> a ete <strong style="color:#ef4444">rejete</strong>.</p></div><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Motif de rejet</span></td><td align="right"><strong style="color:#ef4444">{{reason}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Contactez votre responsable pour plus d\'informations.</p>'),
      contenuText: 'COFIN&CO-M: Transfert {{reference}} de {{amount}} FCFA rejete. Motif: {{reason}}.',
      placeholders: 'userName,amount,reference,reason',
      description: 'Notification de rejet de transfert interne',
    },
    {
      code: 'SCHEDULED_TRANSFER_EXECUTED',
      nom: 'Virement programme execute',
      subject: 'Virement programme execute - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><p style="color:#495057;line-height:1.6">Votre virement programme a ete execute avec succes.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#0f766e;font-size:18px">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">De</span></td><td align="right"><strong style="color:#1b2d4b">{{fromAccount}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Vers</span></td><td align="right"><strong style="color:#1b2d4b">{{toAccount}}</strong></td></tr></table></td></tr></table>'),
      contenuText: 'Bonjour {{clientName}}, virement programme de {{amount}} FCFA execute ({{fromAccount}} vers {{toAccount}}). COFIN&CO-M',
      placeholders: 'clientName,amount,fromAccount,toAccount',
      description: 'Notification d\'execution de virement programme',
    },
    {
      code: 'SCHEDULED_TRANSFER_FAILED',
      nom: 'Virement programme echoue',
      subject: 'Echec de votre virement programme - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{clientName}},</h2><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Votre virement programme depuis le compte <strong>{{fromAccount}}</strong> n\'a pas pu etre execute.</p></div><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant</span></td><td align="right"><strong style="color:#1b2d4b">{{amount}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Raison</span></td><td align="right"><strong style="color:#ef4444">{{errorMessage}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Statut</span></td><td align="right"><strong style="color:#f97316">{{retryInfo}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Verifiez votre solde et les parametres du virement. Contactez votre agence si le probleme persiste.</p>'),
      contenuText: 'COFIN&CO-M: {{clientName}}, virement programme de {{amount}} FCFA ({{fromAccount}}) echoue: {{errorMessage}}. {{retryInfo}}.',
      placeholders: 'clientName,amount,fromAccount,errorMessage,retryInfo',
      description: 'Notification d\'echec de virement programme',
    },
    {
      code: 'HR_LEAVE_REQUESTED',
      nom: 'Demande de conge enregistree',
      subject: 'Votre demande de conge a ete enregistree - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{employeeName}},</h2><p style="color:#495057;line-height:1.6">Votre demande de conge a ete enregistree avec succes.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type de conge</span></td><td align="right"><strong style="color:#1b2d4b">{{leaveType}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Periode</span></td><td align="right"><strong style="color:#1b2d4b">{{startDate}} - {{endDate}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Jours demandes</span></td><td align="right"><strong style="color:#1b2d4b">{{daysRequested}} jours</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Votre demande sera examinee par la direction. Vous serez notifie de la decision.</p>'),
      contenuText: 'Bonjour {{employeeName}}, votre demande de conge ({{leaveType}}) du {{startDate}} au {{endDate}} ({{daysRequested}} jours) a ete enregistree. COFIN&CO-M',
      placeholders: 'employeeName,leaveType,startDate,endDate,daysRequested',
      description: 'Confirmation d\'enregistrement de demande de conge',
    },
    {
      code: 'SESSION_FORCE_CLOSED',
      nom: 'Session caisse fermee',
      subject: 'Session de caisse fermee automatiquement - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><div style="background:#fef3f2;border-left:4px solid #f97316;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Votre session de caisse a ete <strong>fermee automatiquement</strong> pour raison de securite apres <strong>{{hoursInactive}} heures</strong> d\'inactivite.</p></div><p style="color:#495057;line-height:1.6">Les sessions de caisse inactives sont fermees automatiquement pour proteger les fonds et les operations. Veuillez ouvrir une nouvelle session pour continuer vos operations.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Si cette fermeture est inattendue, contactez votre responsable.</p>'),
      contenuText: 'COFIN&CO-M: {{userName}}, votre session de caisse a ete fermee automatiquement apres {{hoursInactive}}h d\'inactivite. Ouvrez une nouvelle session.',
      placeholders: 'userName,hoursInactive',
      description: 'Notification de fermeture automatique de session de caisse',
    },
    // ── Phase 5: Client Lifecycle, Utilisateurs & Opérations Terrain ──
    {
      code: 'CLIENT_CREATED',
      nom: 'Bienvenue nouveau client',
      subject: 'Bienvenue chez COFIN&CO-M !',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bienvenue {{clientName}} !</h2><p style="color:#495057;line-height:1.6">Nous sommes ravis de vous accueillir au sein de la famille <strong>COFIN&amp;CO-M</strong>. Votre inscription a ete enregistree avec succes.</p>{{#if accountNumber}}<table role="presentation" style="background:#f0fdf4;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Numero de compte</span><br><strong style="color:#1b2d4b;font-size:20px">{{accountNumber}}</strong></td></tr></table>{{/if}}{{#if agenceName}}<p style="color:#495057;line-height:1.6">Votre agence de rattachement : <strong>{{appName}}</strong></p>{{/if}}<p style="color:#495057;line-height:1.6">Rendez-vous a votre agence pour decouvrir nos produits d\'epargne, de credit et de tontine.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Merci de votre confiance. A bientot !</p>'),
      contenuText: 'Bienvenue {{clientName}} chez COFIN&CO-M ! Votre inscription est confirmee.{{#if accountNumber}} Compte: {{accountNumber}}.{{/if}} Rendez-vous a votre agence pour decouvrir nos services.',
      placeholders: 'clientName,appName,accountNumber',
      description: 'Email de bienvenue pour un nouveau client',
    },
    {
      code: 'USER_REGISTERED',
      nom: 'Bienvenue nouvel utilisateur',
      subject: 'Votre compte COFIN&CO-M a ete cree',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bienvenue {{userName}} !</h2><p style="color:#495057;line-height:1.6">Votre compte utilisateur a ete cree avec succes sur la plateforme <strong>COFIN&amp;CO-M</strong>.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Identifiant de connexion</span><br><strong style="color:#1b2d4b;font-size:18px">{{username}}</strong></td></tr></table><p style="color:#495057;line-height:1.6">Connectez-vous avec votre identifiant et le mot de passe qui vous a ete communique. Nous vous recommandons de changer votre mot de passe lors de votre premiere connexion.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Si vous n\'avez pas demande la creation de ce compte, contactez votre administrateur.</p>'),
      contenuText: 'Bienvenue {{userName}} ! Votre compte COFIN&CO-M a ete cree. Identifiant: {{username}}. Changez votre mot de passe a la premiere connexion.',
      placeholders: 'userName,username',
      description: 'Email de bienvenue pour un nouvel utilisateur',
    },
    {
      code: 'USER_PASSWORD_CHANGED',
      nom: 'Mot de passe modifie',
      subject: 'Votre mot de passe a ete modifie - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><div style="background:#f0fdf4;border-left:4px solid #0f766e;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Votre mot de passe a ete <strong style="color:#0f766e">modifie avec succes</strong>.</p></div><p style="color:#495057;line-height:1.6">Si vous etes a l\'origine de cette modification, aucune action supplementaire n\'est requise.</p><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6"><strong>Vous n\'avez pas effectue cette modification ?</strong><br>Contactez immediatement votre administrateur pour securiser votre compte.</p></div>'),
      contenuText: 'COFIN&CO-M: {{userName}}, votre mot de passe a ete modifie. Si ce n\'etait pas vous, contactez immediatement votre administrateur.',
      placeholders: 'userName',
      description: 'Confirmation securite de changement de mot de passe',
    },
    {
      code: 'EMPLOYEE_CREATED',
      nom: 'Bienvenue nouvel employe',
      subject: 'Bienvenue dans l\'equipe COFIN&CO-M !',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bienvenue {{employeeName}} !</h2><p style="color:#495057;line-height:1.6">Nous sommes heureux de vous accueillir dans l\'equipe <strong>COFIN&amp;CO-M</strong>.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Matricule</span><br><strong style="color:#1b2d4b;font-size:18px">{{matricule}}</strong></td></tr>{{#if username}}<tr><td style="padding:8px 20px;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Identifiant</span><br><strong style="color:#1b2d4b;font-size:18px">{{username}}</strong></td></tr>{{/if}}{{#if agenceName}}<tr><td style="padding:8px 20px;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Agence</span><br><strong style="color:#1b2d4b;font-size:18px">{{appName}}</strong></td></tr>{{/if}}</table><p style="color:#495057;line-height:1.6">Connectez-vous a la plateforme avec votre identifiant et le mot de passe qui vous a ete communique. Changez votre mot de passe a la premiere connexion.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Bonne integration au sein de l\'equipe !</p>'),
      contenuText: 'Bienvenue {{employeeName}} chez COFIN&CO-M ! Matricule: {{matricule}}.{{#if username}} Identifiant: {{username}}.{{/if}} Changez votre mot de passe a la premiere connexion.',
      placeholders: 'employeeName,matricule,username,appName',
      description: 'Email de bienvenue pour un nouvel employe',
    },
    {
      code: 'PROSPECTION_CREATED',
      nom: 'Prospection enregistree',
      subject: 'Nouvelle prospection enregistree - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Prospection enregistree</h2><p style="color:#495057;line-height:1.6">Une nouvelle prospection a ete enregistree avec succes.</p><table role="presentation" style="background:#eff6ff;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Agent</span><br><strong style="color:#1b2d4b">{{agentName}}</strong></td></tr><tr><td style="padding:8px 20px;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Prospect</span><br><strong style="color:#1b2d4b">{{prospectName}}</strong></td></tr>{{#if location}}<tr><td style="padding:8px 20px;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Localisation</span><br><strong style="color:#1b2d4b">{{location}}</strong></td></tr>{{/if}}</table><p style="color:#868e96;font-size:13px;margin-top:24px">Consultez le tableau de bord pour plus de details.</p>'),
      contenuText: 'COFIN&CO-M: Prospection enregistree par {{agentName}}. Prospect: {{prospectName}}, Localisation: {{location}}.',
      placeholders: 'agentName,prospectName,location',
      description: 'Confirmation d\'enregistrement de prospection',
    },
    {
      code: 'PAIEMENT_TERRAIN_VALIDATED',
      nom: 'Paiement terrain valide',
      subject: 'Votre paiement a ete confirme - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Paiement confirme</h2><p style="color:#495057;line-height:1.6">Bonjour {{clientName}}, votre paiement a ete <strong style="color:#0f766e">valide et enregistre</strong> avec succes.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;padding:20px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 20px"><span style="color:#868e96;font-size:13px">Montant</span><br><strong style="color:#1b2d4b;font-size:22px">{{amount}} FCFA</strong></td></tr><tr><td style="padding:8px 20px;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Type</span><br><strong style="color:#1b2d4b">{{paymentType}}</strong></td></tr>{{#if reference}}<tr><td style="padding:8px 20px;border-top:1px solid #e9ecef"><span style="color:#868e96;font-size:13px">Reference</span><br><strong style="color:#1b2d4b">{{reference}}</strong></td></tr>{{/if}}</table><p style="color:#868e96;font-size:13px;margin-top:24px">Merci pour votre paiement. Conservez cet email comme justificatif.</p>'),
      contenuText: 'COFIN&CO-M: {{clientName}}, paiement de {{amount}} FCFA ({{paymentType}}) confirme.{{#if reference}} Ref: {{reference}}.{{/if}} Merci !',
      placeholders: 'clientName,amount,paymentType,reference',
      description: 'Confirmation de validation de paiement terrain',
    },
    // ── Phase 6: Codes d'accès caisse & Permissions temporaires ──
    {
      code: 'ACCESS_CODE_GENERATED',
      nom: 'Code d\'acces caisse genere',
      subject: 'Votre code d\'acces caisse - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><p style="color:#495057;line-height:1.6">Un <strong>code d\'acces caisse</strong> a ete genere pour vous.</p><div style="text-align:center;margin:24px 0"><span style="display:inline-block;background:#1b2d4b;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:8px">{{code}}</span></div><table role="presentation" style="background:#eff6ff;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Type de code</span></td><td align="right"><strong style="color:#1b2d4b">{{codeType}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Validite</span></td><td align="right"><strong style="color:#1b2d4b">{{validityHours}} heures</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Duree d\'autorisation</span></td><td align="right"><strong style="color:#0f766e">{{authorizationHours}} heures</strong></td></tr>{{#if description}}<tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Motif</span></td><td align="right"><strong style="color:#1b2d4b">{{description}}</strong></td></tr>{{/if}}</table></td></tr></table><div style="background:#fffbeb;border-left:4px solid #f5a623;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6"><strong>Important :</strong> Ce code est strictement personnel. Ne le partagez jamais avec une autre personne.</p></div>'),
      contenuText: 'COFIN&CO-M: {{userName}}, votre code d\'acces caisse: {{code}}. Type: {{codeType}}. Valide {{validityHours}}h, donne {{authorizationHours}}h d\'acces.{{#if description}} Motif: {{description}}.{{/if}} Ne partagez jamais ce code.',
      placeholders: 'userName,code,codeType,validityHours,authorizationHours,description',
      description: 'Notification de generation de code d\'acces caisse',
    },
    {
      code: 'ACCESS_CODE_EXPIRING',
      nom: 'Code d\'acces expire bientot',
      subject: 'Votre code d\'acces caisse expire bientot - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#f97316;margin:0 0 16px">Attention {{userName}},</h2><p style="color:#495057;line-height:1.6">Votre code d\'acces caisse va bientot <strong style="color:#f97316">expirer</strong>.</p><table role="presentation" style="background:#fffbeb;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Code</span></td><td align="right"><strong style="color:#1b2d4b;font-size:18px">{{code}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Temps restant</span></td><td align="right"><strong style="color:#f97316;font-size:18px">{{timeRemaining}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Expire le</span></td><td align="right"><strong style="color:#1b2d4b">{{expiresAt}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Utilisez ce code avant son expiration ou demandez un nouveau code a votre responsable si necessaire.</p>'),
      contenuText: 'COFIN&CO-M: {{userName}}, votre code d\'acces caisse ({{code}}) expire dans {{timeRemaining}}. Utilisez-le rapidement ou demandez un nouveau code.',
      placeholders: 'userName,code,expiresAt,timeRemaining',
      description: 'Avertissement d\'expiration imminente de code d\'acces',
    },
    {
      code: 'TEMP_PERMISSION_GRANTED',
      nom: 'Permission temporaire accordee',
      subject: 'Permission temporaire accordee - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#0f766e;margin:0 0 16px">Bonjour {{userName}},</h2><p style="color:#495057;line-height:1.6">Une <strong style="color:#0f766e">permission temporaire</strong> vous a ete accordee.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Permission</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionName}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Code</span></td><td align="right"><strong style="color:#0f766e">{{permissionCode}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Expire le</span></td><td align="right"><strong style="color:#1b2d4b">{{expiresAt}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Accordee par</span></td><td align="right"><strong style="color:#1b2d4b">{{grantedBy}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Motif</span></td><td align="right"><strong style="color:#1b2d4b">{{reason}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Cette permission est temporaire et sera automatiquement revoquee a la date indiquee.</p>'),
      contenuText: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" ({{permissionCode}}) accordee jusqu\'au {{expiresAt}} par {{grantedBy}}. Motif: {{reason}}.',
      placeholders: 'userName,permissionName,permissionCode,expiresAt,grantedBy,reason',
      description: 'Notification d\'octroi de permission temporaire',
    },
    {
      code: 'TEMP_PERMISSION_EXPIRING',
      nom: 'Permission temporaire expire bientot',
      subject: 'Permission temporaire expire bientot - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#f97316;margin:0 0 16px">Attention {{userName}},</h2><p style="color:#495057;line-height:1.6">Votre permission temporaire va bientot <strong style="color:#f97316">expirer</strong>.</p><table role="presentation" style="background:#fffbeb;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Permission</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionName}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Code</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionCode}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Temps restant</span></td><td align="right"><strong style="color:#f97316;font-size:18px">{{timeRemaining}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Expire le</span></td><td align="right"><strong style="color:#1b2d4b">{{expiresAt}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Contactez votre responsable si vous avez besoin de prolonger cette permission.</p>'),
      contenuText: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" expire dans {{timeRemaining}} ({{expiresAt}}). Contactez votre responsable si besoin.',
      placeholders: 'userName,permissionName,permissionCode,expiresAt,timeRemaining',
      description: 'Avertissement d\'expiration imminente de permission temporaire',
    },
    {
      code: 'TEMP_PERMISSION_EXPIRED',
      nom: 'Permission temporaire expiree',
      subject: 'Permission temporaire expiree - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><p style="color:#495057;line-height:1.6">Votre permission temporaire a <strong>expire</strong>.</p><table role="presentation" style="background:#f8f9fa;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Permission</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionName}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Code</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionCode}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Expiree le</span></td><td align="right"><strong style="color:#868e96">{{expiredAt}}</strong></td></tr></table></td></tr></table><p style="color:#495057;line-height:1.6">Cette permission n\'est plus active. Contactez votre responsable si vous avez besoin d\'une nouvelle autorisation.</p>'),
      contenuText: 'COFIN&CO-M: {{userName}}, votre permission "{{permissionName}}" ({{permissionCode}}) a expire le {{expiredAt}}. Demandez une nouvelle autorisation si necessaire.',
      placeholders: 'userName,permissionName,permissionCode,expiredAt',
      description: 'Notification d\'expiration de permission temporaire',
    },
    {
      code: 'TEMP_PERMISSION_REVOKED',
      nom: 'Permission temporaire revoquee',
      subject: 'Permission temporaire revoquee - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{userName}},</h2><div style="background:#fef3f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;line-height:1.6">Votre permission temporaire a ete <strong style="color:#ef4444">revoquee</strong>.</p></div><table role="presentation" style="background:#fff5f5;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Permission</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionName}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Code</span></td><td align="right"><strong style="color:#1b2d4b">{{permissionCode}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Revoquee par</span></td><td align="right"><strong style="color:#1b2d4b">{{revokedBy}}</strong></td></tr>{{#if reason}}<tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Motif</span></td><td align="right"><strong style="color:#ef4444">{{reason}}</strong></td></tr>{{/if}}</table></td></tr></table><p style="color:#495057;line-height:1.6">Contactez votre responsable pour plus d\'informations.</p>'),
      contenuText: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" ({{permissionCode}}) revoquee par {{revokedBy}}.{{#if reason}} Motif: {{reason}}.{{/if}}',
      placeholders: 'userName,permissionName,permissionCode,revokedBy,reason',
      description: 'Notification de revocation de permission temporaire',
    },
    // ── Bulletin de paie / Payslip email (PDF en pièce jointe) ──
    {
      code: 'BULLETIN_PAIE',
      nom: 'Bulletin de paie',
      subject: 'Votre bulletin de paie {{period}} - COFIN&CO-M',
      contenuHtml: emailWrap('<h2 style="color:#1b2d4b;margin:0 0 16px">Bonjour {{employeeName}},</h2><p style="color:#495057;line-height:1.6">Veuillez trouver ci-joint votre bulletin de paie pour la periode <strong>{{period}}</strong>.</p><div style="text-align:center;margin:24px 0;padding:20px;background:#f0fdf4;border-radius:8px"><p style="color:#868e96;margin:0 0 4px;font-size:12px">NET A PAYER</p><p style="color:#0f766e;margin:0;font-size:28px;font-weight:bold">{{salaireNet}} FCFA</p></div><p style="color:#495057;line-height:1.6;font-size:14px">Le detail complet de votre bulletin est disponible dans le fichier PDF joint a cet email.</p><p style="color:#495057;line-height:1.6">Vous pouvez egalement consulter votre bulletin depuis votre espace personnel sur la plateforme COFIN&amp;CO-M.</p><p style="color:#868e96;font-size:13px;margin-top:24px">Ce document est strictement confidentiel.</p>'),
      contenuText: 'Bonjour {{employeeName}}, veuillez trouver ci-joint votre bulletin de paie pour {{period}}. Net a payer : {{salaireNet}} FCFA. COFIN&CO-M',
      placeholders: 'employeeName,period,salaireNet',
      description: 'Email de bulletin de paie avec PDF en piece jointe, envoye lors de la validation du run',
    },
  ];

  let emailCreated = 0;
  let emailUpdated = 0;
  for (const tpl of EMAIL_TEMPLATES_DATA) {
    const [existing] = await db.select().from(emailTemplates).where(eq(emailTemplates.code, tpl.code));
    if (!existing) {
      await db.insert(emailTemplates).values(tpl);
      emailCreated++;
    } else {
      // Update HTML content to pick up emailWrap changes (logo, layout)
      await db.update(emailTemplates)
        .set({ contenuHtml: tpl.contenuHtml, contenuText: tpl.contenuText, subject: tpl.subject, placeholders: tpl.placeholders, description: tpl.description })
        .where(eq(emailTemplates.code, tpl.code));
      emailUpdated++;
    }
  }
  results.push({ table: 'emailTemplates', action: emailCreated > 0 ? 'created' : emailUpdated > 0 ? 'updated' : 'skipped', count: emailCreated + emailUpdated, details: `${emailCreated} created, ${emailUpdated} updated / ${EMAIL_TEMPLATES_DATA.length}` });

  // 4. New SMS Templates (Handlebars syntax)
  const NEW_SMS_TEMPLATES_DATA = [
    {
      code: 'OTP_CODE',
      nom: 'Code OTP SMS',
      contenu: 'COFIN&CO-M: Votre code de verification est {{otpCode}}. Expire dans {{expiryMinutes}} min. Ne partagez jamais ce code.',
      placeholders: 'otpCode,expiryMinutes',
      description: 'Code OTP envoye par SMS',
    },
    {
      code: 'CREDIT_REJECTED',
      nom: 'Credit rejete SMS',
      contenu: 'Bonjour {{clientName}}, votre demande de credit n\'a pas ete retenue. Contactez votre agence. COFIN&CO-M',
      placeholders: 'clientName',
      description: 'SMS de rejet de credit',
    },
    {
      code: 'CREDIT_DISBURSEMENT',
      nom: 'Decaissement credit SMS',
      contenu: 'Bonjour {{clientName}}, votre credit de {{amount}} FCFA a ete decaisse. COFIN&CO-M',
      placeholders: 'clientName,amount',
      description: 'SMS de decaissement de credit',
    },
    {
      code: 'TRANSFER_SCHEDULED',
      nom: 'Virement programme SMS',
      contenu: 'Bonjour {{clientName}}, un virement de {{amount}} FCFA est programme pour le {{scheduledDate}}. COFIN&CO-M',
      placeholders: 'clientName,amount,scheduledDate',
      description: 'SMS de virement programme',
    },
    {
      code: 'TRANSFER_EXECUTED',
      nom: 'Transfert execute SMS',
      contenu: 'Bonjour {{clientName}}, transfert de {{amount}} FCFA effectue. Ref: {{reference}}. COFIN&CO-M',
      placeholders: 'clientName,amount,reference',
      description: 'SMS de transfert execute',
    },
    {
      code: 'HR_LEAVE_APPROVED',
      nom: 'Conge approuve SMS',
      contenu: 'Bonjour {{employeeName}}, votre conge du {{startDate}} au {{endDate}} a ete approuve. COFIN&CO-M',
      placeholders: 'employeeName,startDate,endDate',
      description: 'SMS d\'approbation de conge',
    },
    // ── Credit lifecycle SMS templates ──
    {
      code: 'CREDIT_APPLICATION_RECEIVED',
      nom: 'Demande credit recue SMS',
      contenu: 'Bonjour {{clientName}}, votre demande de credit ({{creditNumber}}) de {{amount}} FCFA a ete enregistree. Nous la traitons dans les plus brefs delais. COFIN&CO-M',
      placeholders: 'clientName,creditNumber,amount',
      description: 'SMS de confirmation de reception de demande de credit',
    },
    {
      code: 'CREDIT_APPROVED',
      nom: 'Credit approuve SMS',
      contenu: 'Felicitations {{clientName}} ! Votre credit n°{{creditNumber}} de {{amount}} FCFA a ete APPROUVE. Passez en agence pour le decaissement. COFIN&CO-M',
      placeholders: 'clientName,creditNumber,amount',
      description: 'SMS d\'approbation de credit',
    },
    {
      code: 'CREDIT_INVESTIGATION_ASSIGNED',
      nom: 'Enquete terrain assignee SMS',
      contenu: 'Bonjour {{clientName}}, une enquete terrain a ete assignee pour votre dossier {{creditNumber}}. Un agent vous contactera prochainement. COFIN&CO-M',
      placeholders: 'clientName,creditNumber',
      description: 'SMS d\'assignation d\'enquete de credit',
    },
    {
      code: 'CREDIT_OVERDUE',
      nom: 'Credit en retard SMS',
      contenu: 'COFIN&CO-M: Bonjour {{clientName}}, votre echeance credit {{creditNumber}} est en retard de {{daysOverdue}} jours. Regularisez votre situation rapidement.',
      placeholders: 'clientName,creditNumber,daysOverdue',
      description: 'SMS de rappel credit en retard',
    },
    {
      code: 'CREDIT_PAYMENT_REMINDER',
      nom: 'Rappel echeance SMS',
      contenu: 'COFIN&CO-M: Rappel - Votre echeance de {{amount}} FCFA pour le credit {{creditNumber}} arrive le {{dueDate}}. Pensez a provisionner.',
      placeholders: 'clientName,amount,creditNumber,dueDate',
      description: 'SMS de rappel d\'echeance a venir',
    },
    {
      code: 'CREDIT_PAID_OFF',
      nom: 'Credit solde SMS',
      contenu: 'Felicitations {{clientName}} ! Votre credit {{creditNumber}} est entierement rembourse ({{totalPaid}} FCFA). Merci de votre confiance. COFIN&CO-M',
      placeholders: 'clientName,creditNumber,totalPaid',
      description: 'SMS de credit entierement rembourse',
    },
    {
      code: 'CREDIT_REFUND_APPROVED',
      nom: 'Remboursement frais approuve SMS',
      contenu: 'Bonjour {{clientName}}, votre remboursement de frais ({{amount}} FCFA, Ref: {{reference}}) a ete approuve. Le paiement sera effectue sous peu. COFIN&CO-M',
      placeholders: 'clientName,amount,reference',
      description: 'SMS de remboursement de frais approuve',
    },
    {
      code: 'CREDIT_REFUND_PAID',
      nom: 'Remboursement frais paye SMS',
      contenu: 'Bonjour {{clientName}}, {{amount}} FCFA vous ont ete rembourses (Ref: {{reference}}). Merci de votre confiance. COFIN&CO-M',
      placeholders: 'clientName,amount,reference',
      description: 'SMS de remboursement de frais effectue',
    },
    // ── Tontine SMS templates ──
    {
      code: 'TONTINE_MEMBER_JOINED',
      nom: 'Adhesion tontine SMS',
      contenu: 'Bienvenue {{clientName}} ! Vous etes inscrit(e) a la tontine {{tontineName}}. Cotisation: {{amount}} FCFA ({{frequence}}). COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount,frequence',
      description: 'SMS de bienvenue tontine',
    },
    {
      code: 'TONTINE_CONTRIBUTION_RECEIVED',
      nom: 'Cotisation tontine SMS',
      contenu: 'Bonjour {{clientName}}, cotisation de {{amount}} FCFA pour {{tontineName}} enregistree. Merci. COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount',
      description: 'SMS de confirmation cotisation tontine',
    },
    {
      code: 'TONTINE_CONTRIBUTION_OVERDUE',
      nom: 'Retard cotisation tontine SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, cotisation {{tontineName}} en retard de {{daysOverdue}} jours ({{amount}} FCFA, echeance {{dueDate}}). Regularisez rapidement.',
      placeholders: 'clientName,tontineName,amount,dueDate,daysOverdue',
      description: 'SMS de retard cotisation tontine',
    },
    {
      code: 'TONTINE_PENALTY_APPLIED',
      nom: 'Penalite tontine SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, penalite de {{montantPenalite}} FCFA appliquee sur {{tontineName}} ({{motif}}). Contactez votre agence.',
      placeholders: 'clientName,tontineName,montantPenalite,motif',
      description: 'SMS de penalite tontine',
    },
    {
      code: 'TONTINE_DISTRIBUTION_APPROVED',
      nom: 'Distribution tontine approuvee SMS',
      contenu: 'Felicitations {{clientName}} ! Distribution {{tontineName}} approuvee: {{amount}} FCFA ({{payoutMethod}}). COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount,payoutMethod',
      description: 'SMS de distribution tontine approuvee',
    },
    {
      code: 'TONTINE_DISTRIBUTION_PAID',
      nom: 'Distribution tontine payee SMS',
      contenu: 'Felicitations {{clientName}} ! {{amount}} FCFA verses pour {{tontineName}} (Ref: {{reference}}). COFIN&CO-M',
      placeholders: 'clientName,tontineName,amount,reference',
      description: 'SMS de distribution tontine payee',
    },
    {
      code: 'TONTINE_CYCLE_STARTED',
      nom: 'Nouveau cycle tontine SMS',
      contenu: 'Bonjour {{clientName}}, cycle {{cycleNumber}} de {{tontineName}} demarre le {{startDate}}. Cotisations ouvertes. COFIN&CO-M',
      placeholders: 'clientName,tontineName,cycleNumber,startDate',
      description: 'SMS de nouveau cycle tontine',
    },
    // ---- Phase 3: Comptes & Épargne SMS templates ----
    {
      code: 'ACCOUNT_CREATED',
      nom: 'Compte ouvert SMS',
      contenu: 'Bonjour {{clientName}}, votre compte {{accountType}} N°{{accountNumber}} a ete ouvert. Rendez-vous a votre agence. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,accountType',
      description: 'SMS d\'ouverture de compte',
    },
    {
      code: 'ACCOUNT_ACTIVATED',
      nom: 'Compte active SMS',
      contenu: 'Bonjour {{clientName}}, compte {{accountNumber}} active ! Depot initial: {{amount}} FCFA. Operations disponibles. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,accountType,amount',
      description: 'SMS d\'activation de compte',
    },
    {
      code: 'ACCOUNT_DEPOSIT',
      nom: 'Depot confirme SMS',
      contenu: 'COFIN&CO-M: Depot de {{amount}} FCFA sur {{accountNumber}}. Solde: {{balance}} FCFA.',
      placeholders: 'clientName,accountNumber,amount,balance',
      description: 'SMS de confirmation de depot',
    },
    {
      code: 'ACCOUNT_WITHDRAWAL',
      nom: 'Retrait confirme SMS',
      contenu: 'COFIN&CO-M: Retrait de {{amount}} FCFA sur {{accountNumber}}. Solde: {{balance}} FCFA.',
      placeholders: 'clientName,accountNumber,amount,balance',
      description: 'SMS de confirmation de retrait',
    },
    {
      code: 'ACCOUNT_BLOCKED',
      nom: 'Compte bloque SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, compte {{accountNumber}} bloque ({{motif}}). Depots autorises. Contactez votre agence.',
      placeholders: 'clientName,accountNumber,motif',
      description: 'SMS de blocage de compte',
    },
    {
      code: 'ACCOUNT_UNBLOCKED',
      nom: 'Compte debloque SMS',
      contenu: 'Bonne nouvelle {{clientName}} ! Compte {{accountNumber}} debloque. Operations disponibles. COFIN&CO-M',
      placeholders: 'clientName,accountNumber',
      description: 'SMS de deblocage de compte',
    },
    {
      code: 'ACCOUNT_CLOSED',
      nom: 'Compte cloture SMS',
      contenu: 'Bonjour {{clientName}}, compte {{accountType}} N°{{accountNumber}} cloture. Merci de votre confiance. COFIN&CO-M',
      placeholders: 'clientName,accountNumber,accountType',
      description: 'SMS de cloture de compte',
    },
    {
      code: 'INTEREST_CAPITALIZED',
      nom: 'Interets capitalises SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, interets de {{interestAmount}} FCFA credites sur {{accountNumber}}. Solde: {{newBalance}} FCFA.',
      placeholders: 'clientName,accountNumber,interestAmount,newBalance',
      description: 'SMS de capitalisation des interets',
    },
    // ── Phase 4: Opérations & Sécurité ──
    {
      code: 'SCHEDULED_TRANSFER_EXECUTED',
      nom: 'Virement programme execute SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, virement de {{amount}} FCFA de {{fromAccount}} vers {{toAccount}} execute avec succes.',
      placeholders: 'clientName,amount,fromAccount,toAccount',
      description: 'SMS de virement programme execute',
    },
    {
      code: 'SCHEDULED_TRANSFER_FAILED',
      nom: 'Virement programme echoue SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, echec du virement de {{amount}} FCFA depuis {{fromAccount}}. {{retryInfo}}. Contactez votre agence.',
      placeholders: 'clientName,amount,fromAccount,retryInfo',
      description: 'SMS de virement programme echoue',
    },
    {
      code: 'HR_LEAVE_REQUESTED',
      nom: 'Demande de conge SMS',
      contenu: 'COFIN&CO-M: {{employeeName}}, demande de conge ({{leaveType}}) du {{startDate}} au {{endDate}} enregistree. Vous serez notifie.',
      placeholders: 'employeeName,leaveType,startDate,endDate',
      description: 'SMS de confirmation de demande de conge',
    },
    {
      code: 'SESSION_FORCE_CLOSED',
      nom: 'Session fermee de force SMS',
      contenu: 'COFIN&CO-M: Votre session caisse a ete fermee automatiquement. {{details}}',
      placeholders: 'details',
      description: 'SMS de fermeture forcee de session caisse',
    },
    // ── Phase 5: Client Lifecycle, Utilisateurs & Opérations Terrain ──
    {
      code: 'CLIENT_CREATED',
      nom: 'Bienvenue client SMS',
      contenu: 'Bienvenue {{clientName}} chez COFIN&CO-M ! Votre inscription est confirmee.{{#if accountNumber}} Compte: {{accountNumber}}.{{/if}} Merci de votre confiance.',
      placeholders: 'clientName,accountNumber',
      description: 'SMS de bienvenue pour un nouveau client',
    },
    {
      code: 'EMPLOYEE_CREATED',
      nom: 'Bienvenue employe SMS',
      contenu: 'Bienvenue {{employeeName}} chez COFIN&CO-M ! Matricule: {{matricule}}. Bonne integration dans l\'equipe.',
      placeholders: 'employeeName,matricule',
      description: 'SMS de bienvenue pour un nouvel employe',
    },
    {
      code: 'PAIEMENT_TERRAIN_VALIDATED',
      nom: 'Paiement terrain valide SMS',
      contenu: 'COFIN&CO-M: {{clientName}}, paiement de {{amount}} FCFA ({{paymentType}}) confirme. Merci !',
      placeholders: 'clientName,amount,paymentType',
      description: 'SMS de confirmation de paiement terrain valide',
    },
    // ── Phase 6: Codes d'accès caisse & Permissions temporaires ──
    {
      code: 'ACCESS_CODE_GENERATED',
      nom: 'Code d\'acces caisse SMS',
      contenu: 'COFIN&CO-M: {{userName}}, votre code d\'acces caisse: {{code}}. Type: {{codeType}}. Valide {{validityHours}}h, autorisation {{authorizationHours}}h.{{#if description}} Motif: {{description}}.{{/if}} Ne partagez jamais ce code.',
      placeholders: 'userName,code,codeType,validityHours,authorizationHours,description',
      description: 'SMS de generation de code d\'acces caisse',
    },
    {
      code: 'ACCESS_CODE_EXPIRING',
      nom: 'Code d\'acces expire bientot SMS',
      contenu: 'COFIN&CO-M: {{userName}}, votre code caisse ({{code}}) expire dans {{timeRemaining}}. Utilisez-le ou demandez un nouveau code.',
      placeholders: 'userName,code,expiresAt,timeRemaining',
      description: 'SMS d\'avertissement d\'expiration de code d\'acces',
    },
    {
      code: 'TEMP_PERMISSION_GRANTED',
      nom: 'Permission temporaire accordee SMS',
      contenu: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" accordee jusqu\'au {{expiresAt}} par {{grantedBy}}.',
      placeholders: 'userName,permissionName,permissionCode,expiresAt,grantedBy,reason',
      description: 'SMS d\'octroi de permission temporaire',
    },
    {
      code: 'TEMP_PERMISSION_EXPIRING',
      nom: 'Permission temporaire expire SMS',
      contenu: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" expire dans {{timeRemaining}}. Contactez votre responsable si besoin.',
      placeholders: 'userName,permissionName,permissionCode,expiresAt,timeRemaining',
      description: 'SMS d\'avertissement d\'expiration de permission temporaire',
    },
    {
      code: 'TEMP_PERMISSION_EXPIRED',
      nom: 'Permission temporaire expiree SMS',
      contenu: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" a expire le {{expiredAt}}. Demandez une nouvelle autorisation si necessaire.',
      placeholders: 'userName,permissionName,permissionCode,expiredAt',
      description: 'SMS d\'expiration de permission temporaire',
    },
    {
      code: 'TEMP_PERMISSION_REVOKED',
      nom: 'Permission temporaire revoquee SMS',
      contenu: 'COFIN&CO-M: {{userName}}, permission "{{permissionName}}" revoquee par {{revokedBy}}.{{#if reason}} Motif: {{reason}}.{{/if}}',
      placeholders: 'userName,permissionName,permissionCode,revokedBy,reason',
      description: 'SMS de revocation de permission temporaire',
    },
  ];

  let smsCreated = 0;
  for (const tpl of NEW_SMS_TEMPLATES_DATA) {
    const [existing] = await db.select().from(smsTemplates).where(eq(smsTemplates.code, tpl.code));
    if (!existing) {
      await db.insert(smsTemplates).values(tpl);
      smsCreated++;
    }
  }
  results.push({ table: 'smsTemplates (new)', action: smsCreated > 0 ? 'created' : 'skipped', count: smsCreated, details: `${smsCreated}/${NEW_SMS_TEMPLATES_DATA.length}` });

  // 5. Global Notification Settings — auto-enable email if SMTP is configured
  const [existingSettings] = await db.select().from(notificationSettings)
    .where(isNull(notificationSettings.agenceId)).limit(1);
  if (!existingSettings) {
    await db.insert(notificationSettings).values({
      agenceId: null,
      smsEnabled: true,
      emailEnabled: smtpHasCredentials,
      pushEnabled: true,
      fallbackPolicy: smtpHasCredentials ? 'EMAIL_THEN_SMS' : 'SMS_ONLY',
      otpChannel: 'SMS',
      otpMaxPerMinute: 3,
      otpMaxPerDay: 20,
      smsQuotaDaily: 1000,
      emailQuotaDaily: 500,
    });
    results.push({ table: 'notificationSettings', action: 'created', count: 1, details: smtpHasCredentials ? 'email enabled' : 'email disabled' });
  } else if (smtpHasCredentials && !existingSettings.emailEnabled) {
    // Activate email if SMTP credentials are now available
    await db.update(notificationSettings)
      .set({
        emailEnabled: true,
        fallbackPolicy: 'EMAIL_THEN_SMS',
      })
      .where(eq(notificationSettings.id, existingSettings.id));
    results.push({ table: 'notificationSettings', action: 'updated', count: 1, details: 'email activated' });
  } else {
    results.push({ table: 'notificationSettings', action: 'skipped', count: 0, details: 'exists' });
  }

  // 6. Feature Flag
  const [existingFlag] = await db.select().from(featureFlags).where(eq(featureFlags.code, 'NOTIFICATIONS_ENABLED'));
  if (!existingFlag) {
    await db.insert(featureFlags).values({
      code: 'NOTIFICATIONS_ENABLED',
      nom: 'Systeme de notifications unifie',
      description: 'Active le nouveau systeme de notifications unifie (SMS, email, push, in-app)',
      enabled: true,
      rolloutPercentage: 100,
    });
    results.push({ table: 'featureFlags (notif)', action: 'created', count: 1 });
  } else {
    results.push({ table: 'featureFlags (notif)', action: 'skipped', count: 0, details: 'exists' });
  }

  return results;
}

// ============================================================================
// MIGRATION BACKFILLS
// Seeds extracted from migrations 0009, 0010, 0030, 0034
// ============================================================================

/**
 * Seeds extracted from migration files:
 * - 0009_coffre_fort_workflow.sql: coffres-forts et config par agence
 * - 0010_caisse_agent_workflow.sql: caisses agent pour agents terrain
 * - 0030_accounting_gl_enhancement.sql: journaux et plan comptable OHADA
 * - 0034_rbac_versions.sql: version RBAC (table non implémentée)
 */
async function seedMmFeeSchedules(dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding MM Fee Schedules...');
  const results: SeedStepResult[] = [];

  const MM_FEE_DEFAULTS = [
    { provider: 'MTN' as const, direction: 'COLLECTION' as const, feePct: '4.0', feeFixed: '0', minFee: '0', maxFee: '999999999' },
    { provider: 'MTN' as const, direction: 'PAYOUT' as const,     feePct: '4.0', feeFixed: '0', minFee: '0', maxFee: '999999999' },
    { provider: 'AIRTEL' as const, direction: 'COLLECTION' as const, feePct: '4.0', feeFixed: '0', minFee: '0', maxFee: '999999999' },
    { provider: 'AIRTEL' as const, direction: 'PAYOUT' as const,     feePct: '4.0', feeFixed: '0', minFee: '0', maxFee: '999999999' },
  ];

  if (!dryRun) {
    let created = 0;
    for (const schedule of MM_FEE_DEFAULTS) {
      const [existing] = await db.select({ id: mmFeeSchedules.id })
        .from(mmFeeSchedules)
        .where(and(
          eq(mmFeeSchedules.provider, schedule.provider),
          eq(mmFeeSchedules.direction, schedule.direction),
          eq(mmFeeSchedules.active, true),
        ))
        .limit(1);

      if (!existing) {
        await db.insert(mmFeeSchedules).values({
          provider: schedule.provider,
          direction: schedule.direction,
          feePct: schedule.feePct,
          feeFixed: schedule.feeFixed,
          minFee: schedule.minFee,
          maxFee: schedule.maxFee,
          active: true,
        });
        created++;
      }
    }
    results.push({ table: 'mm_fee_schedules', action: created > 0 ? 'created' : 'skipped', count: created, details: `${MM_FEE_DEFAULTS.length} schedules (4% default)` });
  } else {
    results.push({ table: 'mm_fee_schedules', action: 'skipped', count: 0, details: 'DRY_RUN' });
  }

  return results;
}

async function seedMigrationBackfills(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Migration Backfills...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [
      { table: 'caisses (coffres)', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'configCoffreFort', action: 'skipped', count: 1, details: 'dry-run' },
      { table: 'caissesAgent', action: 'skipped', count: 1, details: 'dry-run' },
    ];
  }

  // ========================================================================
  // Migration 0009: Coffres-forts pour chaque agence
  // ========================================================================
  const allAgences = await db.select().from(agences);
  let coffresCreated = 0;

  for (const agence of allAgences) {
    // Vérifier si un coffre-fort existe déjà pour cette agence
    const [existingCoffre] = await db.select()
      .from(caisses)
      .where(and(
        eq(caisses.agenceId, agence.id),
        eq(caisses.type, 'Coffre-Fort')
      ));

    if (!existingCoffre) {
      await db.insert(caisses).values({
        nom: `Coffre-Fort ${agence.nom}`,
        agenceId: agence.id,
        type: 'Coffre-Fort',
        solde: '0',
        statut: StatutCaisse.OPEN,
      });
      coffresCreated++;
    }
  }

  if (coffresCreated > 0) {
    results.push({
      table: 'caisses (coffres)',
      action: 'created',
      count: coffresCreated,
      details: `${coffresCreated} coffres-forts créés pour les agences`
    });
  } else {
    results.push({ table: 'caisses (coffres)', action: 'skipped', count: 0, details: 'already exist' });
  }

  // ========================================================================
  // Migration 0009: Config coffre-fort par défaut pour chaque agence
  // ========================================================================
  let configsCreated = 0;

  for (const agence of allAgences) {
    const [existingConfig] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, agence.id));

    if (!existingConfig) {
      await db.insert(configCoffreFort).values({
        agenceId: agence.id,
        seuilDoubleValidation: '1000000',
        separationInitiateurValideur: true,
        separationValideurExecuteur: false,
        rolesInitiateurs: ['caissier', 'chef_caisse'],
        rolesValideurs: ['chef_agence', 'superviseur'],
        rolesExecuteurs: ['caissier', 'chef_caisse', 'chef_agence'],
        actif: true,
      });
      configsCreated++;
    }
  }

  if (configsCreated > 0) {
    results.push({
      table: 'configCoffreFort',
      action: 'created',
      count: configsCreated,
      details: `${configsCreated} configurations créées`
    });
  } else {
    results.push({ table: 'configCoffreFort', action: 'skipped', count: 0, details: 'already exist' });
  }

  // ========================================================================
  // Migration 0010: Caisse agent pour chaque agent terrain existant
  // ========================================================================
  const allAgents = await db.select()
    .from(agentsTerrain)
    .where(isNull(agentsTerrain.deletedAt));

  let caissesAgentCreated = 0;

  for (const agent of allAgents) {
    const [existingCaisseAgent] = await db.select()
      .from(caissesAgent)
      .where(and(
        eq(caissesAgent.agentId, agent.id),
        isNull(caissesAgent.deletedAt)
      ));

    if (!existingCaisseAgent) {
      await db.insert(caissesAgent).values({
        agentId: agent.id,
        soldeValide: '0',
        devise: 'XOF',
        statut: 'ACTIVE',
      });
      caissesAgentCreated++;
    }
  }

  if (caissesAgentCreated > 0) {
    results.push({
      table: 'caissesAgent',
      action: 'created',
      count: caissesAgentCreated,
      details: `${caissesAgentCreated} caisses agent créées`
    });
  } else {
    results.push({ table: 'caissesAgent', action: 'skipped', count: 0, details: 'already exist' });
  }

  // ========================================================================
  // Migration 0030: Journaux et Plan Comptable OHADA
  // Note: Ces données sont déjà dans JOURNAUX_DATA et PLAN_COMPTABLE_DATA
  // qui sont seedés par seedAccountingBootstrap()
  // ========================================================================

  // ========================================================================
  // Migration 0034: RBAC Versions
  // Note: Table rbac_versions n'existe pas encore dans le schema TypeScript
  // TODO: Créer le schema et ajouter le seed quand la table sera créée
  // ========================================================================

  return results;
}

async function seedAdminUser(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  logger.info('Seeding Admin User...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'users', action: 'skipped', count: 1, details: 'dry-run' }];
  }

  // Password from env or default (WARNING in logs)
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'password123';
  if (!process.env.SEED_ADMIN_PASSWORD) {
    logger.warn('WARNING: Using default password. Set SEED_ADMIN_PASSWORD in production!');
  }

  const [siege] = await db.select().from(agences).where(eq(agences.codeAgence, 'SIEGE'));
  const siegeId = siege?.id;

  // Check if admin exists
  const [existingAdmin] = await db.select().from(users).where(eq(users.username, 's.administrateur'));

  if (!existingAdmin) {
    const hashedPassword = await hashPassword(adminPassword);

    // Create user
    const [adminUser] = await db.insert(users).values({
      username: 's.administrateur',
      password: hashedPassword,
      nom: 'Administrateur',
      prenom: 'Super',
      email: 'admin@cofin.com',
      typeCompte: 'employe',
      canLogin: true,
      statut: StatutUser.ACTIVE,
      mustChangePassword: true, // Force password change on first login
    }).returning();
    results.push({ table: 'users', action: 'created', count: 1 });

    // Create userRole (V3 architecture)
    await db.insert(userRoles).values({
      userId: adminUser.id,
      role: SystemRole.ADMIN,
      agenceId: siegeId || null,
      isPrimary: true,
    });
    results.push({ table: 'userRoles', action: 'created', count: 1 });

    // userAgences
    if (siegeId) {
      await db.insert(userAgences).values({
        userId: adminUser.id,
        agenceId: siegeId,
        isPrimary: true,
        role: SystemRole.ADMIN,
        actif: true,
        dateAffectation: new Date().toISOString().split('T')[0],
      });
      results.push({ table: 'userAgences', action: 'created', count: 1 });
    }

    // Create employe record
    const adminMatricule = await generateMatricule(siegeId);
    await db.insert(employes).values({
      userId: adminUser.id,
      matricule: adminMatricule,
      agenceId: siegeId,
      dateEmbauche: '2018-01-01',
      typeContrat: 'CDI',
      statut: StatutUser.ACTIVE,
      salaireBase: 0,
      modeCalculPaie: 'MONTHLY',
    });
    results.push({ table: 'employes', action: 'created', count: 1 });

  } else {
    results.push({ table: 'users', action: 'skipped', count: 0, details: 'admin exists' });
  }

  return results;
}

// ============================================================================
// VALIDATION
// ============================================================================

interface ValidationResult {
  invariant: string;
  passed: boolean;
  details?: string;
}

async function validateProdBootstrap(): Promise<ValidationResult[]> {
  logger.info('Validating production bootstrap...');
  const results: ValidationResult[] = [];

  // 1. Agence Siège exists
  const [siege] = await db.select().from(agences).where(eq(agences.codeAgence, 'SIEGE'));
  results.push({
    invariant: 'Agence Siège exists',
    passed: !!siege,
    details: siege ? siege.id : 'NOT FOUND'
  });

  // 2. Admin user exists with canLogin
  const [admin] = await db.select().from(users).where(eq(users.username, 's.administrateur'));
  results.push({
    invariant: 'Admin user exists with canLogin=true',
    passed: !!admin && admin.canLogin === true,
    details: admin ? `canLogin=${admin.canLogin}` : 'NOT FOUND'
  });

  // 3. userRoles contains ADMIN
  if (admin) {
    const [adminRole] = await db.select().from(userRoles).where(
      and(eq(userRoles.userId, admin.id), eq(userRoles.role, SystemRole.ADMIN))
    );
    results.push({
      invariant: 'userRoles contains ADMIN with isPrimary=true',
      passed: !!adminRole && adminRole.isPrimary === true,
      details: adminRole ? `isPrimary=${adminRole.isPrimary}` : 'NOT FOUND'
    });
  }

  // 4. Modules count >= 30
  const [moduleCount] = await db.select({ count: count() }).from(modules);
  results.push({
    invariant: 'modules.count >= 30',
    passed: moduleCount.count >= 30,
    details: `count=${moduleCount.count}`
  });

  // 5. Permissions count >= 100
  const [permCount] = await db.select({ count: count() }).from(permissions);
  results.push({
    invariant: 'permissions.count >= 100',
    passed: permCount.count >= 100,
    details: `count=${permCount.count}`
  });

  // 6. systemSettings exists
  const [sysSettings] = await db.select().from(systemSettings);
  results.push({
    invariant: 'systemSettings exists',
    passed: !!sysSettings,
  });

  // 7. securitySettings with passwordMinLength >= 12
  const [secSettings] = await db.select().from(securitySettings);
  results.push({
    invariant: 'securitySettings.passwordMinLength >= 12',
    passed: !!secSettings && (secSettings.passwordMinLength ?? 0) >= 12,
    details: secSettings ? `minLength=${secSettings.passwordMinLength}` : 'NOT FOUND'
  });

  // 8. Exercice OPEN exists
  const currentYear = new Date().getFullYear();
  const [exercice] = await db.select().from(exercices).where(
    and(eq(exercices.code, `${currentYear}`), eq(exercices.statut, 'OPEN'))
  );
  results.push({
    invariant: 'Exercice comptable OPEN exists',
    passed: !!exercice,
    details: exercice ? exercice.code : 'NOT FOUND'
  });

  // 9. planComptable count >= 30
  const [planCount] = await db.select({ count: count() }).from(planComptable);
  results.push({
    invariant: 'planComptable.count >= 30',
    passed: planCount.count >= 30,
    details: `count=${planCount.count}`
  });

  // 10. Journaux count >= 5
  const [journauxCount] = await db.select({ count: count() }).from(journaux);
  results.push({
    invariant: 'journaux.count >= 5',
    passed: journauxCount.count >= 5,
    details: `count=${journauxCount.count}`
  });

  // 11. Coffre CF-SIEGE exists
  const [coffre] = await db.select().from(coffresForts).where(eq(coffresForts.code, 'CF-SIEGE'));
  results.push({
    invariant: 'Coffre-Fort CF-SIEGE exists',
    passed: !!coffre,
  });

  // 12. Compte liaison LIAISON-SIEGE exists
  const [liaison] = await db.select().from(comptesLiaison).where(eq(comptesLiaison.code, 'LIAISON-SIEGE'));
  results.push({
    invariant: 'Compte liaison LIAISON-SIEGE exists',
    passed: !!liaison,
  });

  // 13. Caisse Siège exists
  if (siege) {
    const [caisse] = await db.select().from(caisses).where(eq(caisses.agenceId, siege.id));
    results.push({
      invariant: 'Caisse Siège exists',
      passed: !!caisse,
      details: caisse ? caisse.nom : 'NOT FOUND'
    });
  }

  // 14. departments count >= 5
  const [deptCount] = await db.select({ count: count() }).from(departments);
  results.push({
    invariant: 'departments.count >= 5',
    passed: deptCount.count >= 5,
    details: `count=${deptCount.count}`
  });

  // 15. payrollConfig global exists
  const [payroll] = await db.select().from(payrollConfig).where(isNull(payrollConfig.agenceId));
  results.push({
    invariant: 'payrollConfig global exists',
    passed: !!payroll,
  });

  // 16. maintenanceModules covers all RBAC modules
  const [maintenanceCount] = await db.select({ count: count() }).from(maintenanceModules);
  results.push({
    invariant: 'maintenanceModules covers RBAC modules',
    passed: maintenanceCount.count >= MODULES_DATA.length,
    details: `count=${maintenanceCount.count} vs ${MODULES_DATA.length} required`
  });

  return results;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

async function seedProd() {
  const report: SeedReport = {
    context: 'EMPTY',
    steps: [],
    errors: [],
    warnings: [],
    startedAt: new Date(),
    success: false,
  };

  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('COFINCO Production Seed v2.0');
  logger.info('═══════════════════════════════════════════════════════════════');

  if (DRY_RUN) {
    logger.info('DRY-RUN MODE - No changes will be made');
  }
  if (FORCE_RESET) {
    logger.warn('FORCE MODE - Will reset configuration tables');
  }

  try {
    // 1. Detect context
    report.context = await detectContext();
    logger.info({ context: report.context }, 'Detected context');

    if (report.context === 'PRODUCTION' && !FORCE_RESET) {
      logger.warn('Production data detected. Running in CONFIG SYNC mode.');
      logger.info('Use --force to reset configuration (dangerous!)');
    }

    // 2. Ensure custom SQL functions (triggers, views, etc.)
    if (!DRY_RUN) {
      logger.info('Ensuring custom SQL functions...');
      await ensureCustomFunctions();
      logger.info('Custom SQL functions ensured');
    }

    // 3. Execute seed modules
    logger.info('───────────────────────────────────────────────────────────────');

    // Geography
    const geoResults = await seedGeography(report.context, DRY_RUN);
    report.steps.push(...geoResults);

    // Core Settings
    const settingsResults = await seedCoreSettings(report.context, DRY_RUN);
    report.steps.push(...settingsResults);

    // RBAC (uses existing seedRBAC logic)
    if (!DRY_RUN) {
      await seedRBAC();
      report.steps.push({ table: 'RBAC', action: 'created', count: 1, details: 'modules + permissions + rolePermissions' });
    }

    // Products Catalog
    const productsResults = await seedProductsCatalog(report.context, DRY_RUN);
    report.steps.push(...productsResults);

    // Accounting
    const accountingResults = await seedAccountingBootstrap(report.context, DRY_RUN);
    report.steps.push(...accountingResults);

    // MM Fee Schedules
    const mmFeeResults = await seedMmFeeSchedules(DRY_RUN);
    report.steps.push(...mmFeeResults);

    // Vault & Transfers
    const vaultResults = await seedVaultAndTransfersConfig(report.context, DRY_RUN);
    report.steps.push(...vaultResults);

    // HR
    const hrResults = await seedHRBootstrap(report.context, DRY_RUN);
    report.steps.push(...hrResults);

    // Maintenance Modules
    const maintenanceResults = await seedMaintenanceModules(report.context, DRY_RUN);
    report.steps.push(...maintenanceResults);

    // Notification System
    const notificationResults = await seedNotificationSystem(report.context, DRY_RUN);
    report.steps.push(...notificationResults);

    // Migration Backfills (coffres, caisses agent, etc.)
    const backfillResults = await seedMigrationBackfills(report.context, DRY_RUN);
    report.steps.push(...backfillResults);

    // Admin User (only in EMPTY or SEEDED)
    if (report.context !== 'PRODUCTION' || FORCE_RESET) {
      const adminResults = await seedAdminUser(report.context, DRY_RUN);
      report.steps.push(...adminResults);
    }

    // 3. Validation
    if (!DRY_RUN) {
      logger.info('───────────────────────────────────────────────────────────────');
      const validationResults = await validateProdBootstrap();

      const failedCount = validationResults.filter(v => !v.passed).length;
      if (failedCount > 0) {
        logger.error('VALIDATION FAILED:');
        validationResults.filter(v => !v.passed).forEach(v => {
          logger.error({ invariant: v.invariant, details: v.details || 'FAILED' }, 'Validation failed');
          report.errors.push(`Validation failed: ${v.invariant}`);
        });
      } else {
        logger.info('All validations passed');
      }
    }

    report.success = report.errors.length === 0;
    report.completedAt = new Date();

    // 4. Summary
    logger.info('═══════════════════════════════════════════════════════════════');
    if (report.success) {
      logger.info('PRODUCTION SEED COMPLETE');
    } else {
      logger.error('SEED COMPLETED WITH ERRORS');
    }
    logger.info('═══════════════════════════════════════════════════════════════');

    if (!DRY_RUN) {
      logger.info('Login: s.administrateur / [SEED_ADMIN_PASSWORD or password123]');
      logger.warn('IMPORTANT: Change password on first login (mustChangePassword=true)');
    }

    const created = report.steps.filter(s => s.action === 'created').length;
    const skipped = report.steps.filter(s => s.action === 'skipped').length;
    logger.info({ created, skipped, errors: report.errors.length }, 'Summary');
    logger.info('═══════════════════════════════════════════════════════════════');

    if (!report.success) {
      await pool.end();
      process.exit(1);
    }

    await pool.end();
    process.exit(0);

  } catch (error) {
    logger.error({ err: error }, 'FATAL ERROR');
    report.errors.push(String(error));
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

// Run
seedProd();
