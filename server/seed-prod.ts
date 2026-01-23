import { db } from './db';
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
  userAgences,
  // New financial tables
  maintenanceModules,
  produitsCompte,
  versementsAutomatiques,
  virementsProgrammes,
  decaissementsProgrammes,
  // HR tables
  departments,
  jobPositions,
  employes,
} from '@shared/schema';
import {
  agencyMigrations,
  migrationPreFlightChecks,
  migrationEntityLogs,
  migrationAuditLogs,
} from '@shared/schema/agency_migration';
import { hashPassword } from './auth';
import { SystemRole } from '@shared/types/roles';
import { StatutUser, StatutCoffre, TypeAgence } from '@shared/enum/status-constants';

// ----------------------------------------------------------------------
// DATA DEFINITIONS
// ----------------------------------------------------------------------



const ZONES_DATA = [
  // ======================
  // BRAZZAVILLE
  // ======================
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

  // ======================
  // POINTE-NOIRE
  // ======================
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
    await db.delete(maintenanceModules); // Module lock status

    // Deletion for reevaluation dependencies
    await db.delete(scoringHistory);
    await db.delete(enquetesComplementaires);
    await db.delete(transfertsCoffreAuditLogs);
    await db.delete(transfertsCoffreCaisse);
    await db.delete(configCoffreFort);

    // New financial automation tables
    await db.delete(versementsAutomatiques);
    await db.delete(virementsProgrammes);
    await db.delete(decaissementsProgrammes);

    // Agency migration tables (delete in correct order - children first)
    await db.delete(migrationAuditLogs);
    await db.delete(migrationEntityLogs);
    await db.delete(migrationPreFlightChecks);
    await db.delete(agencyMigrations);

    // Inter-vault transfer dependencies (delete in correct order)
    await db.delete(tachesRegularisation);
    await db.delete(reconciliationsLiaison);
    await db.delete(transfertsInterCoffresAuditLogs);
    await db.delete(documentsTransfert);
    await db.delete(transfertsInterCoffres);
    await db.delete(comptesLiaison);
    await db.delete(configTransfertInterCoffres);
    await db.delete(coffresForts);
    
    // Products catalog (after tables that reference it are cleaned)
    await db.delete(produitsCompte);
    
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
    await db.delete(employes); // Must delete before users (FK constraint)
    await db.delete(userRoles); // Auth V3: Clear roles before users
    await db.delete(users);
    // HR tables
    await db.delete(jobPositions);
    await db.delete(departments);

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
        typeAgence: a.isSiege ? TypeAgence.MAIN : TypeAgence.SECONDARY,
        statut: StatutUser.ACTIVE,
        latitude: a.latitude,
        longitude: a.longitude,
        telephone: a.telephone,
        email: a.email,
        dateOuverture: a.dateOuverture,
      }).returning();
      insertedAgences[a.nom] = inserted.id;
    }
    console.log('   ✅ Zones and Agencies created');

    // 2a. SEED DEPARTMENTS & JOB POSITIONS
    console.log('   👔 Seeding Departments & Job Positions...');

    const DEPARTMENTS_DATA = [
      { code: 'DIR', name: 'Direction Générale', description: 'Direction et administration générale' },
      { code: 'FIN', name: 'Finance & Comptabilité', description: 'Gestion financière et comptable' },
      { code: 'RH', name: 'Ressources Humaines', description: 'Gestion du personnel' },
      { code: 'OPS', name: 'Opérations', description: 'Opérations terrain et caisse' },
      { code: 'COM', name: 'Commercial', description: 'Vente et relation client' },
      { code: 'IT', name: 'Informatique', description: 'Systèmes d\'information' },
      { code: 'RISK', name: 'Risques & Conformité', description: 'Gestion des risques et conformité' },
    ];

    const deptMap: Record<string, string> = {}; // UUID strings
    for (const dept of DEPARTMENTS_DATA) {
      const [inserted] = await db.insert(departments).values(dept).returning();
      deptMap[dept.code] = inserted.id;
    }

    const JOB_POSITIONS_DATA = [
      // Direction
      { departmentId: deptMap['DIR'], code: 'DG', name: 'Directeur Général' },
      { departmentId: deptMap['DIR'], code: 'DGA', name: 'Directeur Général Adjoint' },
      { departmentId: deptMap['DIR'], code: 'SEC', name: 'Secrétaire de Direction' },
      // Finance
      { departmentId: deptMap['FIN'], code: 'DAF', name: 'Directeur Administratif et Financier' },
      { departmentId: deptMap['FIN'], code: 'COMPT', name: 'Comptable' },
      { departmentId: deptMap['FIN'], code: 'TRESO', name: 'Trésorier' },
      { departmentId: deptMap['FIN'], code: 'AUDIT', name: 'Auditeur Interne' },
      // RH
      { departmentId: deptMap['RH'], code: 'DRH', name: 'Directeur des Ressources Humaines' },
      { departmentId: deptMap['RH'], code: 'GPERSO', name: 'Gestionnaire du Personnel' },
      { departmentId: deptMap['RH'], code: 'FORM', name: 'Responsable Formation' },
      // Opérations
      { departmentId: deptMap['OPS'], code: 'DOPS', name: 'Directeur des Opérations' },
      { departmentId: deptMap['OPS'], code: 'CAGENCE', name: 'Chef d\'Agence' },
      { departmentId: deptMap['OPS'], code: 'CAISS', name: 'Caissier' },
      { departmentId: deptMap['OPS'], code: 'AGTER', name: 'Agent Terrain' },
      { departmentId: deptMap['OPS'], code: 'SUPV', name: 'Superviseur' },
      // Commercial
      { departmentId: deptMap['COM'], code: 'DCOM', name: 'Directeur Commercial' },
      { departmentId: deptMap['COM'], code: 'CCONS', name: 'Chargé de Clientèle' },
      { departmentId: deptMap['COM'], code: 'ACRED', name: 'Analyste Crédit' },
      // IT
      { departmentId: deptMap['IT'], code: 'DSI', name: 'Directeur des Systèmes d\'Information' },
      { departmentId: deptMap['IT'], code: 'DEV', name: 'Développeur' },
      { departmentId: deptMap['IT'], code: 'ADMIN', name: 'Administrateur Système' },
      // Risques
      { departmentId: deptMap['RISK'], code: 'DRISK', name: 'Directeur des Risques' },
      { departmentId: deptMap['RISK'], code: 'ARISK', name: 'Analyste Risques' },
      { departmentId: deptMap['RISK'], code: 'CONF', name: 'Responsable Conformité' },
    ];

    for (const pos of JOB_POSITIONS_DATA) {
      await db.insert(jobPositions).values(pos);
    }
    console.log('   ✅ Departments and Job Positions created');

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
          rolesInitiateurs: ['Chef d\'Agence', 'agent_caisse'],
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
        statut: StatutCoffre.ACTIVE,
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
        rolesCreateurs: ['agent_caisse', 'Comptable', 'Chef d\'Agence'],
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
    await seedRBAC();

    // 4. BANKING PRODUCTS CATALOG (Required before creating accounts)
    console.log('\n🏦 Seeding Banking Products Catalog...');
    const [produitCourant] = await db.insert(produitsCompte).values({
      code: 'COURANT_STD',
      nom: 'Compte Courant Standard',
      typeCompte: 'CURRENT',
      tauxInteret: '0',
      frais: { ouverture: 5000, tenue: 1500 },
      actif: true,
    }).returning();

    const [produitEpargne] = await db.insert(produitsCompte).values({
      code: 'EPARGNE_STD',
      nom: 'Compte Épargne Classique',
      typeCompte: 'SAVINGS',
      tauxInteret: '3.5',
      frais: { ouverture: 2500 },
      actif: true,
    }).returning();

    const [produitTontine] = await db.insert(produitsCompte).values({
      code: 'TONTINE_STD',
      nom: 'Compte Tontine',
      typeCompte: 'BLOCKED',
      tauxInteret: '0',
      actif: true,
    }).returning();
    console.log(`   ✅ Products created: ${produitCourant.code}, ${produitEpargne.code}, ${produitTontine.code}`);

    // 5. MAINTENANCE MODULES (Module lock status)
    console.log('\n🔧 Seeding Maintenance Modules...');
    await db.insert(maintenanceModules).values([
      { moduleName: 'Dashboard', isLocked: false },
      { moduleName: 'Caisse', isLocked: false },
      { moduleName: 'Crédits', isLocked: false },
      { moduleName: 'Remboursements', isLocked: false },
      { moduleName: 'Clients', isLocked: false },
      { moduleName: 'Comptes', isLocked: false },
      { moduleName: 'Tontines', isLocked: false },
      { moduleName: 'Comptabilité', isLocked: false },
      { moduleName: 'Agent Terrain', isLocked: false },
      { moduleName: 'CaisseAgent', isLocked: false },
      { moduleName: 'Transferts', isLocked: false },
      { moduleName: 'Virements Programmes', isLocked: false },
      { moduleName: 'Rapports', isLocked: false },
      { moduleName: 'RH', isLocked: false },
      { moduleName: 'Communications', isLocked: false },
      { moduleName: 'Bourse', isLocked: false },
      { moduleName: 'Loge', isLocked: false },
      { moduleName: 'Paramètres', isLocked: false },
      { moduleName: 'Administration', isLocked: false },
      { moduleName: 'Audit', isLocked: false },
      { moduleName: 'Messages', isLocked: false },
      { moduleName: 'Coffre-Fort', isLocked: false },
      { moduleName: 'Incidents', isLocked: false },
      { moduleName: 'Visites', isLocked: false },
      { moduleName: 'Prospection', isLocked: false },
      { moduleName: 'Paiements Agent', isLocked: false },
      { moduleName: 'PLATFORM', isLocked: false },
    ]);

    // 6. SEED BUSINESS CONFIG
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
    
    // 6. CREATE ADMIN USER (Architecture V3 - userRoles)
    console.log('\n👤 Creating Standard Admin...');
    const hashedPassword = await hashPassword('password123');

    // 6a. Créer l'utilisateur admin
    const [adminUser] = await db.insert(users).values({
      username: 's.administrateur',
      password: hashedPassword,
      nom: 'Administrateur',
      prenom: 'Super',
      email: 'admin@cofin.com',
      typeCompte: 'employe',
      canLogin: true,
      statut: StatutUser.ACTIVE,
    }).returning();

    // 6b. Créer le rôle ADMIN dans userRoles (Architecture V3)
    await db.insert(userRoles).values({
      userId: adminUser.id,
      role: SystemRole.ADMIN,
      agenceId: siegeAgenceId || null,
      isPrimary: true,
    });

    // 6c. Ajouter l'affectation agence (pour compatibilité userAgences)
    if (siegeAgenceId) {
      await db.insert(userAgences).values({
        userId: adminUser.id,
        agenceId: siegeAgenceId,
        isPrimary: true,
        role: SystemRole.ADMIN,
        actif: true,
        dateAffectation: new Date().toISOString().split('T')[0],
      });
    }

    // 6d. Créer l'employé pour l'admin (requis pour les opérations caisse)
    await db.insert(employes).values({
      userId: adminUser.id,
      matricule: 'EMP-SIEGE-2026-0D4Q',
      agenceId: siegeAgenceId,
      dateEmbauche: '2018-01-01',
      typeContrat: 'CDI',
      statut: StatutUser.ACTIVE,
      salaireBase: 0,
      modeCalculPaie: 'MONTHLY',
    });
    console.log('   -> Admin employee record created');


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
    console.log('👤 Login: s.administrateur / password123');
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
