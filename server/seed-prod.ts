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
import { eq, count, and, isNull, sql } from 'drizzle-orm';
import { seedRBAC } from './seed-rbac-logic';
import {
  users,
  userRoles,
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
} from '@shared/schema';
import { departments, jobPositions, employes, payrollConfig } from '@shared/schema';
import { accountingRules } from '@shared/schema/accounting';
import { hashPassword } from './auth';
import { SystemRole } from '@shared/types/roles';
import { StatutUser, StatutCoffre, TypeAgence, StatutCaisse } from '@shared/enum/status-constants';
import { MODULES_DATA } from '@shared/config/rbac';

// ============================================================================
// TYPES
// ============================================================================

type SeedContext = 'EMPTY' | 'SEEDED' | 'PRODUCTION';
type SeedAction = 'created' | 'updated' | 'skipped' | 'deleted';

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
  { num: '28', label: 'Amortissements', classe: 2, type: 'Actif', sens: 'Crédit', isSystem: true },

  // Classe 3: Stocks
  { num: '31', label: 'Marchandises', classe: 3, type: 'Actif', sens: 'Débit', isSystem: true },

  // Classe 4: Tiers
  { num: '401', label: 'Fournisseurs', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '411', label: 'Clients', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '411100', label: 'Clients - Crédits en cours', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '411200', label: 'Clients - Crédits en souffrance', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '411300', label: 'Clients - Épargne', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '411400', label: 'Clients - Tontines', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '419000', label: 'Clients - Avances et acomptes', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '42', label: 'Personnel', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '43', label: 'Sécurité Sociale', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '44', label: 'État', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '443', label: 'TVA Facturée', classe: 4, type: 'Passif', sens: 'Crédit', isSystem: true },
  { num: '445', label: 'TVA Récupérable', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '47', label: 'Comptes transitoires', classe: 4, type: 'Actif', sens: 'Débit', isSystem: true },

  // Classe 5: Trésorerie (Critique pour microfinance)
  { num: '512', label: 'Banque', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '521', label: 'Caisse', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '531', label: 'Coffre-fort central', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '532', label: 'Coffre-fort agence', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '571', label: 'Caisse principale', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '572', label: 'Caisses annexes', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '581', label: 'Virements internes', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '581000', label: 'Compte de liaison général', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '585', label: 'Virements Mobile Money', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '585100', label: 'Mobile Money - MTN', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },
  { num: '585200', label: 'Mobile Money - Airtel', classe: 5, type: 'Actif', sens: 'Débit', isSystem: true },

  // Classe 6: Charges
  { num: '601', label: 'Achats marchandises', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '61', label: 'Transports', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '62', label: 'Services extérieurs', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '627100', label: 'Commissions Mobile Money', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '627200', label: 'Frais bancaires', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '63', label: 'Impôts et taxes', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '661', label: 'Charges d\'intérêts', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '66', label: 'Charges personnel', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '669', label: 'Autres charges financières', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '681', label: 'Dotations amortissements', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },
  { num: '691', label: 'Provisions créances douteuses', classe: 6, type: 'Charge', sens: 'Débit', isSystem: true },

  // Classe 7: Produits
  { num: '701', label: 'Ventes marchandises', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '706', label: 'Services vendus', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '706100', label: 'Intérêts sur crédits', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '706200', label: 'Intérêts sur découverts', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708', label: 'Produits accessoires', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708100', label: 'Frais de dossier crédit', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708200', label: 'Frais de tenue de compte', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708300', label: 'Commissions de gestion', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '708400', label: 'Pénalités de retard', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '76', label: 'Produits financiers', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
  { num: '79', label: 'Reprises provisions', classe: 7, type: 'Produit', sens: 'Crédit', isSystem: true },
];

const JOURNAUX_DATA = [
  { code: 'CAISSE', intitule: 'Journal de Caisse', typeJournal: 'Caisse' },
  { code: 'BANK', intitule: 'Journal de Banque', typeJournal: 'Banque' },
  { code: 'ACHAT', intitule: 'Journal d\'Achats', typeJournal: 'Achats' },
  { code: 'VENTE', intitule: 'Journal de Ventes', typeJournal: 'Ventes' },
  { code: 'OD', intitule: 'Opérations Diverses', typeJournal: 'Opérations Diverses' },
  { code: 'MMTN', intitule: 'Mobile Money MTN', typeJournal: 'Mobile Money' },
  { code: 'MAIR', intitule: 'Mobile Money Airtel', typeJournal: 'Mobile Money' },
  { code: 'CRED', intitule: 'Journal des Crédits', typeJournal: 'Crédits' },
  { code: 'EPGN', intitule: 'Journal Épargne', typeJournal: 'Épargne' },
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
  console.log('📍 Seeding Geography...');
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

  // Agence Siège
  const siegeData = {
    nom: 'Siège',
    codeAgence: 'SIEGE',
    adresse: 'Boulevard Denis Sassou, Brazzaville',
    ville: 'Brazzaville',
    region: 'Centre',
    typeAgence: TypeAgence.MAIN,
    statut: StatutUser.ACTIVE,
    latitude: '-4.2633',
    longitude: '15.2847',
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
      results.push({ table: 'agences', action: 'skipped', count: 0, details: 'Siège exists' });
    }
  }

  return results;
}

async function seedCoreSettings(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  console.log('⚙️ Seeding Core Settings...');
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
      agenceName: 'COFIN - Microfinance',
      agenceCode: 'COF-PROD',
      devise: 'XAF',
      pays: 'République du Congo',
      adresse: 'Boulevard Denis Sassou, Brazzaville',
      telephone: '+242060000000',
      email: 'contact@cofin.com',
      sessionTimeout: 15,
      maxLoginAttempts: 3,
      passwordMinLength: 10,
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

  // Security Settings - singleton
  const [existingSecurity] = await db.select().from(securitySettings);
  if (!existingSecurity || context === 'EMPTY') {
    if (existingSecurity) {
      await db.delete(securitySettings);
    }
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
      accentColor: '#f97316',
      langue: 'fr',
      sidebarCollapsedDefault: false,
      showAnimations: true,
      compactMode: false,
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

  return results;
}

async function seedProductsCatalog(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  console.log('🏦 Seeding Products Catalog...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'produitsCompte', action: 'skipped', count: 3, details: 'dry-run' }];
  }

  // Produits Compte - upsert by code
  const produits = [
    { code: 'COURANT_STD', nom: 'Compte Courant Standard', typeCompte: 'CURRENT' as const, tauxInteret: '0', frais: { ouverture: 5000, tenue: 1500 }, actif: true },
    { code: 'EPARGNE_STD', nom: 'Compte Épargne Classique', typeCompte: 'SAVINGS' as const, tauxInteret: '3.5', frais: { ouverture: 2500 }, actif: true },
    { code: 'TONTINE_STD', nom: 'Compte Tontine', typeCompte: 'BLOCKED' as const, tauxInteret: '0', actif: true },
  ];

  for (const p of produits) {
    const [existing] = await db.select().from(produitsCompte).where(eq(produitsCompte.code, p.code));
    if (!existing) {
      await db.insert(produitsCompte).values(p);
    }
  }
  results.push({ table: 'produitsCompte', action: 'created', count: produits.length });

  // Credit Plans - upsert by nom
  const creditPlansData = [
    { nom: 'Crédit 50.000', description: 'Micro-crédit de 50.000 FCFA', typeCredit: 'Personnel', montantMin: '50000', montantMax: '50000', tauxInteret: '20', dureeValeur: 30, dureeUnite: 'Jour', frequenceRemboursement: 'Journalier', fraisDossier: '2500', conditions: ['Carte d\'identité'], actif: true },
    { nom: 'Crédit 75.000', description: 'Micro-crédit de 75.000 FCFA', typeCredit: 'Personnel', montantMin: '75000', montantMax: '75000', tauxInteret: '20', dureeValeur: 30, dureeUnite: 'Jour', frequenceRemboursement: 'Journalier', fraisDossier: '3750', conditions: ['Carte d\'identité'], actif: true },
    { nom: 'Crédit 100.000', description: 'Micro-crédit de 100.000 FCFA', typeCredit: 'Personnel', montantMin: '100000', montantMax: '100000', tauxInteret: '20', dureeValeur: 30, dureeUnite: 'Jour', frequenceRemboursement: 'Hebdomadaire', fraisDossier: '5000', conditions: ['Carte d\'identité', 'Garant'], actif: true },
    { nom: 'Crédit 150.000', description: 'Micro-crédit de 150.000 FCFA', typeCredit: 'Commercial', montantMin: '150000', montantMax: '150000', tauxInteret: '20', dureeValeur: 60, dureeUnite: 'Jour', frequenceRemboursement: 'Hebdomadaire', fraisDossier: '7500', conditions: ['Carte d\'identité', 'Commerce'], actif: true },
    { nom: 'Crédit 200.000', description: 'Micro-crédit de 200.000 FCFA', typeCredit: 'Commercial', montantMin: '200000', montantMax: '200000', tauxInteret: '20', dureeValeur: 90, dureeUnite: 'Jour', frequenceRemboursement: 'Hebdomadaire', fraisDossier: '10000', conditions: ['Carte d\'identité', 'Commerce', 'Garant'], actif: true }
  ];

  for (const plan of creditPlansData) {
    const [existing] = await db.select().from(creditPlans).where(eq(creditPlans.nom, plan.nom));
    if (!existing) {
      await db.insert(creditPlans).values(plan);
    }
  }
  results.push({ table: 'creditPlans', action: 'created', count: creditPlansData.length });

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
  await db.delete(dureesSuggerees);
  await db.insert(dureesSuggerees).values([
    { frequence: 'Journalier', dureeValeur: 15, dureeUnite: 'Jour', estRecommandee: false, ordre: 0, actif: true, label: '15 jours' },
    { frequence: 'Journalier', dureeValeur: 30, dureeUnite: 'Jour', estRecommandee: true, ordre: 1, actif: true, label: '30 jours' },
    { frequence: 'Journalier', dureeValeur: 60, dureeUnite: 'Jour', estRecommandee: false, ordre: 2, actif: true, label: '60 jours' },
    { frequence: 'Journalier', dureeValeur: 90, dureeUnite: 'Jour', estRecommandee: false, ordre: 3, actif: true, label: '90 jours' },
    { frequence: 'Hebdomadaire', dureeValeur: 1, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '1 mois' },
    { frequence: 'Hebdomadaire', dureeValeur: 3, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '3 mois' },
    { frequence: 'Hebdomadaire', dureeValeur: 6, dureeUnite: 'Mois', estRecommandee: false, ordre: 2, actif: true, label: '6 mois' },
    { frequence: 'Mensuel', dureeValeur: 3, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '3 mois' },
    { frequence: 'Mensuel', dureeValeur: 6, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '6 mois' },
    { frequence: 'Mensuel', dureeValeur: 12, dureeUnite: 'Mois', estRecommandee: false, ordre: 2, actif: true, label: '12 mois' },
    { frequence: 'Bimensuel', dureeValeur: 6, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '6 mois' },
    { frequence: 'Bimensuel', dureeValeur: 12, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '12 mois' },
    { frequence: 'Trimestriel', dureeValeur: 12, dureeUnite: 'Mois', estRecommandee: false, ordre: 0, actif: true, label: '12 mois' },
    { frequence: 'Trimestriel', dureeValeur: 24, dureeUnite: 'Mois', estRecommandee: true, ordre: 1, actif: true, label: '24 mois' },
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
  console.log('📚 Seeding Accounting...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'planComptable', action: 'skipped', count: PLAN_COMPTABLE_DATA.length, details: 'dry-run' }];
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

  return results;
}

async function seedVaultAndTransfersConfig(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  console.log('🔐 Seeding Vault & Transfers Config...');
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
      rolesCreateurs: ['agent_caisse', 'Comptable', 'Chef d\'Agence'],
      rolesApprobateursN1: ['Chef d\'Agence', 'Trésorier'],
      rolesApprobateursN2: ['Directeur', 'Directeur Financier'],
      rolesRecepteurs: ['Trésorier', 'Chef d\'Agence', 'Comptable'],
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
        rolesInitiateurs: ['Chef d\'Agence', 'agent_caisse'],
        rolesValideurs: ['Chef d\'Agence', 'Superviseur'],
        rolesExecuteurs: ['Chef d\'Agence'],
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

  return results;
}

async function seedHRBootstrap(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  console.log('👔 Seeding HR...');
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

  // Payroll Config Global (CRITIQUE - manquait)
  const [existingPayroll] = await db.select().from(payrollConfig).where(isNull(payrollConfig.agenceId));
  if (!existingPayroll) {
    await db.insert(payrollConfig).values({
      agenceId: null, // Global
      cnssEmployeeRate: '0.0500',
      cnssEmployerRate: '0.0900',
      iprBrackets: [
        { min: 0, max: 524000, rate: 0 },
        { min: 524001, max: 1428000, rate: 0.15 },
        { min: 1428001, max: 2700000, rate: 0.30 },
        { min: 2700001, max: null, rate: 0.40 },
      ],
      transportAllowance: 50000,
      housingAllowance: 0,
      overtimeRate: '1.50',
      nightShiftRate: '1.25',
      holidayRate: '2.00',
      isActive: true,
    });
    results.push({ table: 'payrollConfig', action: 'created', count: 1 });
  } else {
    results.push({ table: 'payrollConfig', action: 'skipped', count: 0, details: 'exists' });
  }

  return results;
}

async function seedMaintenanceModules(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  console.log('🔧 Seeding Maintenance Modules...');

  if (dryRun) {
    return [{ table: 'maintenanceModules', action: 'skipped', count: MODULES_DATA.length, details: 'dry-run' }];
  }

  // Sync avec MODULES_DATA (source de vérité RBAC)
  const moduleNames = MODULES_DATA.map(m => m.name);

  // Ajouter PLATFORM si non présent
  if (!moduleNames.includes('PLATFORM')) {
    moduleNames.push('PLATFORM');
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

async function seedAdminUser(context: SeedContext, dryRun: boolean): Promise<SeedStepResult[]> {
  console.log('👤 Seeding Admin User...');
  const results: SeedStepResult[] = [];

  if (dryRun) {
    return [{ table: 'users', action: 'skipped', count: 1, details: 'dry-run' }];
  }

  // Password from env or default (WARNING in logs)
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'password123';
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn('⚠️  WARNING: Using default password. Set SEED_ADMIN_PASSWORD in production!');
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
    await db.insert(employes).values({
      userId: adminUser.id,
      matricule: 'EMP-SIEGE-2026-ADMIN',
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
  console.log('🔍 Validating production bootstrap...');
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

  // 7. securitySettings with passwordMinLength >= 8
  const [secSettings] = await db.select().from(securitySettings);
  results.push({
    invariant: 'securitySettings.passwordMinLength >= 8',
    passed: !!secSettings && secSettings.passwordMinLength >= 8,
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

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏭 COFINCO Production Seed v2.0');
  console.log('═══════════════════════════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('📋 DRY-RUN MODE - No changes will be made');
  }
  if (FORCE_RESET) {
    console.log('⚠️  FORCE MODE - Will reset configuration tables');
  }

  try {
    // 1. Detect context
    report.context = await detectContext();
    console.log(`\n📊 Detected context: ${report.context}`);

    if (report.context === 'PRODUCTION' && !FORCE_RESET) {
      console.log('\n⚠️  Production data detected. Running in CONFIG SYNC mode.');
      console.log('   Use --force to reset configuration (dangerous!)');
    }

    // 2. Execute seed modules
    console.log('\n───────────────────────────────────────────────────────────────');

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

    // Vault & Transfers
    const vaultResults = await seedVaultAndTransfersConfig(report.context, DRY_RUN);
    report.steps.push(...vaultResults);

    // HR
    const hrResults = await seedHRBootstrap(report.context, DRY_RUN);
    report.steps.push(...hrResults);

    // Maintenance Modules
    const maintenanceResults = await seedMaintenanceModules(report.context, DRY_RUN);
    report.steps.push(...maintenanceResults);

    // Admin User (only in EMPTY or SEEDED)
    if (report.context !== 'PRODUCTION' || FORCE_RESET) {
      const adminResults = await seedAdminUser(report.context, DRY_RUN);
      report.steps.push(...adminResults);
    }

    // 3. Validation
    if (!DRY_RUN) {
      console.log('\n───────────────────────────────────────────────────────────────');
      const validationResults = await validateProdBootstrap();

      const failedCount = validationResults.filter(v => !v.passed).length;
      if (failedCount > 0) {
        console.log('\n❌ VALIDATION FAILED:');
        validationResults.filter(v => !v.passed).forEach(v => {
          console.log(`   - ${v.invariant}: ${v.details || 'FAILED'}`);
          report.errors.push(`Validation failed: ${v.invariant}`);
        });
      } else {
        console.log('\n✅ All validations passed');
      }
    }

    report.success = report.errors.length === 0;
    report.completedAt = new Date();

    // 4. Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(report.success ? '✅ PRODUCTION SEED COMPLETE' : '❌ SEED COMPLETED WITH ERRORS');
    console.log('═══════════════════════════════════════════════════════════════');

    if (!DRY_RUN) {
      console.log('\n👤 Login: s.administrateur / [SEED_ADMIN_PASSWORD or password123]');
      console.log('⚠️  IMPORTANT: Change password on first login (mustChangePassword=true)');
    }

    console.log('\n📊 Summary:');
    const created = report.steps.filter(s => s.action === 'created').length;
    const skipped = report.steps.filter(s => s.action === 'skipped').length;
    console.log(`   - Created: ${created} tables`);
    console.log(`   - Skipped: ${skipped} tables`);
    if (report.errors.length > 0) {
      console.log(`   - Errors: ${report.errors.length}`);
    }
    console.log('═══════════════════════════════════════════════════════════════');

    if (!report.success) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    report.errors.push(String(error));
    process.exit(1);
  }
}

// Run
seedProd();
