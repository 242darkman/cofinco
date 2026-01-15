
import { db } from './db';
import { seedRBAC } from './seed-rbac-logic';
import {
  users,
  modules,
  permissions,
  rolePermissions,
  agences,
  zones,
  clients,
  employes,
  typesMarches,
  tags,
  clientTags,
  clientActivities,
  historiquePoints,
  systemSettings,
  featureFlags,
  securitySettings,
  uiCustomization,
  smsTemplates,
  smsProviderSettings,
  // maintenanceModules, // Assuming this is new and not in older schema
  dureesSuggerees,
  planComptable,
  journaux,
  exercices,
  comptes,
  ecritures,
  lignesEcritures,
  declarationsTva,
  creditPlans,
  demandesCredit,
  credits,
  remboursements,
  enquetesCredit,
  reevaluationsCredit,
  enquetesComplementaires,
  scoringHistory,
  reevaluationAuditLogs,
  creditRefundRequests,
  plansEpargne,
  objectifsEpargne,
  transactionsCompte,
  tontines,
  membresTontine,
  contributionsTontine,
  tontineRegles,
  tontinePenalites,
  tontineDistributions,
  tontineAlertes,
  tontinePlans,
  agentsTerrain,
  caissesAgent,
  operationsTerrain,
  operationsTerrainAuditLogs,
  objectifsMensuels,
  prospections,
  visitesTerrain,
  paiementsTerrain,
  remisesTerrain,
  agentLocationLogs,
  configReevaluation,
  configCoffreFort,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  caisses,
  shiftsCaisse,
  sessionsCaisse,
  caisseAssignations,
  operationsCaisse,
  caisseSecurityCodes,
  caisseCodeUsages,
  codeGenerationPermissions,
  posDevices,
  comptageBillets,
  modelesFactures,
  factures,
  lignesFactures,
  mouvementsFinanciers,
  coffresForts,
  comptesLiaison,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  documentsTransfert,
  reconciliationsLiaison,
  tachesRegularisation,
  auditLogs,
  notifications,
  messages,
  caisseTransferts,
  transferts,
  transfertAuditLogs,
  transfertLimits,
  transfertWebhooks,
  transfertBlacklist,
  transfertReconciliation,
  kycLevels,
  otpValidations,
  smsNotifications,
  pushSubscriptions,
  pushNotificationLogs,
  notificationPreferences,
  portefeuillesBourse,
  positionsBourse,
  ordresBourse,
  transactionsBourse,
  watchlistBourse,
  agencyMigrations,
  documents,
  logeSettings,
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
} from '@shared/schema';
import { hashPassword } from './auth';
import { eq } from 'drizzle-orm';

// ----------------------------------------------------------------------
// DATA DEFINITIONS
// ----------------------------------------------------------------------

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
  },
  {
    nom: 'Agence Nord',
    code: 'NORD',
    adresse: 'Avenue de la République, Ouesso',
    ville: 'Ouesso',
    region: 'Nord',
    isSiege: false,
    latitude: '1.6136',
    longitude: '16.0517',
    telephone: '+242060000200',
    email: 'nord@cofin.com',
    dateOuverture: '2020-05-15',
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

async function seedDemoSimple() {
  console.log('🏭 Starting SIMPLE DEMO seed...');
  console.log('⚠️  This will overwrite configuration and identity tables!');

  try {
    // 1. CLEAN TABLES (Ordered to respect Foreign Keys)
    console.log('\n🧹 Cleaning tables (robust 10-level hierarchy)...');

    // -- Level 10: Highest Dependency Leafs (Audit, Logs, Leafs)
    await db.delete(transfertWebhooks);
    await db.delete(transfertAuditLogs);
    await db.delete(reevaluationAuditLogs);
    await db.delete(scoringHistory);
    await db.delete(operationsTerrainAuditLogs);
    await db.delete(tontinePenalites);
    await db.delete(tontineAlertes);
    await db.delete(tontineDistributions); 
    await db.delete(otpValidations); 
    await db.delete(transactionsBourse);
    await db.delete(ordresBourse);
    await db.delete(positionsBourse);
    await db.delete(watchlistBourse);
    await db.delete(pushNotificationLogs);
    await db.delete(smsNotifications);

    // -- Level 9: Notification, Migration & Bourse Masters
    await db.delete(portefeuillesBourse); // ref clients
    await db.delete(pushSubscriptions); // ref users
    await db.delete(notificationPreferences); // ref users
    await db.delete(agencyMigrations); // ref agences
    await db.delete(documents); // ref users (maybe)
    await db.delete(logeSettings);
    await db.delete(formationParticipants); // ref employes, formations
    await db.delete(avantagesEmployes); // ref employes
    await db.delete(demandesConges); // ref employes
    await db.delete(bulletinsPaie); // ref employes
    await db.delete(sanctions); // ref employes
    await db.delete(presences); // ref employes
    await db.delete(horairesTravail); // ref employes
    
    // -- Level 8: Audit & History
    await db.delete(auditLogs);
    await db.delete(notifications);
    await db.delete(messages);
    await db.delete(transfertsInterCoffresAuditLogs);
    await db.delete(transfertsCoffreAuditLogs);
    await db.delete(documentsTransfert);
    await db.delete(caisseCodeUsages);
    await db.delete(clientTags);
    await db.delete(clientActivities);
    await db.delete(historiquePoints);
    await db.delete(agentLocationLogs);
    await db.delete(comptageBillets);
    await db.delete(lignesFactures);
    await db.delete(reconciliationsLiaison);
    await db.delete(tachesRegularisation);

    // -- Level 7: Operational Links & Requests
    await db.delete(enquetesComplementaires); // ref reevaluationsCredit
    await db.delete(creditRefundRequests);
    
    // -- Level 6: Process Leafs & Operational Data
    await db.delete(reevaluationsCredit); // ref demandesCredit
    await db.delete(enquetesCredit); // ref demandesCredit
    await db.delete(operationsTerrain); 
    await db.delete(tontineRegles);
    await db.delete(membresTontine);

    // -- Level 5: Transactional Links
    await db.delete(factures); // ref operationsCaisse
    await db.delete(transfertsCoffreCaisse); // ref operationsCaisse
    await db.delete(caisseTransferts); // ref sessionsCaisse
    await db.delete(transferts); // ref mouvementsFinanciers
    await db.delete(transfertReconciliation);
    await db.delete(transfertLimits);
    await db.delete(transfertBlacklist);
    await db.delete(paiementsTerrain);
    await db.delete(visitesTerrain);
    await db.delete(prospections);
    await db.delete(objectifsMensuels);
    await db.delete(objectifsEpargne);
    await db.delete(plansEpargne);
    await db.delete(remboursements);
    await db.delete(lignesEcritures);

    // -- Level 4: Central Transaction Hubs
    await db.delete(operationsCaisse);
    await db.delete(transactionsCompte);
    await db.delete(mouvementsFinanciers);
    await db.delete(contributionsTontine);
    await db.delete(ecritures);
    await db.delete(remisesTerrain);
    await db.delete(caisseAssignations);

    // -- Level 3: Session & Core Business Objects
    await db.delete(credits);
    await db.delete(demandesCredit);
    await db.delete(tontines);
    await db.delete(comptes);
    await db.delete(caissesAgent);
    await db.delete(shiftsCaisse);
    await db.delete(sessionsCaisse);
    await db.delete(transfertsInterCoffres);

    // -- Level 2: Entity Infrastructure & Assets
    await db.delete(agentsTerrain);
    await db.delete(clients);
    await db.delete(employes);
    await db.delete(posDevices); // MUST be before caisses
    await db.delete(caisses);
    await db.delete(caisseSecurityCodes);
    await db.delete(codeGenerationPermissions);
    await db.delete(comptesLiaison);
    await db.delete(configCoffreFort);
    // await db.delete(configTransfertInterCoffres); // Removed constant/config
    await db.delete(coffresForts);
    await db.delete(kycLevels);

    // -- Level 1: Geography & Base Identity
    await db.delete(modelesFactures); // ref users (created_by)
    await db.delete(declarationsTva); // ref users (created_by)
    await db.delete(agences);
    await db.delete(zones);
    await db.delete(users);

    // -- Level 0: Static Configuration
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
    await db.delete(dureesSuggerees);
    await db.delete(configReevaluation);
    await db.delete(tontinePlans);
    await db.delete(formations);
    await db.delete(avantages);
    await db.delete(candidatures);

    console.log('   ✅ Robust cleanup complete');

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
        statut: 'Actif',
        latitude: a.latitude,
        longitude: a.longitude,
        telephone: a.telephone,
        email: a.email,
        dateOuverture: a.dateOuverture,
      }).returning();
      insertedAgences[a.nom] = inserted.id;
    }

    // 3. SEED COFFRES-FORTS (VAULTS) & CAISSES
    console.log('   🔐 Seeding Vaults & Cashboxes...');
    const vaultBalances: Record<string, string> = {
      'Siège': '500000000',     // 500 Millions XAF
      'Agence Nord': '100000000', // 100 Millions XAF
    };

    for (const [name, id] of Object.entries(insertedAgences)) {
      const balance = vaultBalances[name] || '0';
      const [vault] = await db.insert(coffresForts).values({
        code: `CF-${name.split(' ').pop()?.toUpperCase() || 'GEN'}`,
        nom: `Coffre-Fort ${name}`,
        ownerType: name === 'Siège' ? 'SIEGE' : 'AGENCE',
        ownerId: id,
        devise: 'XAF',
        solde: balance,
        plafondEncaisse: name === 'Siège' ? '1000000000' : '200000000',
        soldeMinimum: '10000000',
        statut: 'Actif',
        description: `Coffre-fort ${name} (Pré-crédité pour la démo)`,
      }).returning();

      await db.insert(comptesLiaison).values({
        code: `LIAISON-${name.split(' ').pop()?.toUpperCase() || 'GEN'}`,
        intitule: `Compte de liaison - ${name}`,
        numeroComptable: `581${name === 'Siège' ? '000' : '001'}`,
        entiteType: name === 'Siège' ? 'SIEGE' : 'AGENCE',
        entiteId: id,
        soldeCourant: '0',
        actif: true,
      });

      await db.insert(configCoffreFort).values({
        agenceId: id,
        seuilDoubleValidation: '10000000',
        separationInitiateurValideur: true,
        actif: true,
      });

      // 4. SEED CAISSES (CASHBOXES)
      const [caisse] = await db.insert(caisses).values({
        nom: `Caisse Principal ${name}`,
        agenceId: id,
        type: 'Physique',
        solde: '1000000', // 1M initial cash
        statut: 'Fermée',
      }).returning();

      // We'll store the Siège caisse for admin assignment later
      if (name === 'Siège') {
          (global as any).siegeCaisse = caisse;
      }
    }

    const siegeCaisse = (global as any).siegeCaisse;

    // 5. RBAC & PERMISSIONS
    console.log('\n🛡️ Seeding RBAC...');
    await seedRBAC();

    // 6. BUSINESS CONFIG
    console.log('🏷️ Seeding Business Config...');
    await db.insert(typesMarches).values(TYPES_MARCHES_DATA);
    await db.insert(tags).values(TAGS_DATA);
    
    // 7. CREATE STANDARD ADMIN USER
    console.log('\n👤 Creating Standard Admin...');
    const hashedPassword = await hashPassword('password123');
    
    const [adminUser] = await db.insert(users).values({
      username: 's.administrateur',
      password: hashedPassword,
      nom: 'Administrateur',
      prenom: 'Super',
      email: 'admin@cofin.com',
      role: 'Administrateur',
      agence: 'Siège',
      statut: 'Actif',
    }).returning();

    // Assign admin to the caisse
    await db.insert(caisseAssignations).values({
      caisseId: siegeCaisse.id,
      userId: adminUser.id,
      assignedBy: adminUser.id,
    });

    // Create a closed session for history
    await db.insert(sessionsCaisse).values({
      caissierId: adminUser.id,
      caisseId: siegeCaisse.id,
      agenceId: insertedAgences['Siège'],
      soldeInitial: '1000000',
      soldeTheorique: '1000000',
      soldeReel: '1000000',
      statut: 'Fermée',
      dateOuverture: new Date(Date.now() - 86400000),
      dateFermeture: new Date(Date.now() - 86400000),
    });

    // 8. OTHER SETTINGS (Minimum required for UI)
    await db.insert(systemSettings).values({
      agenceName: 'COFIN - Demo',
      agenceCode: 'COF-DEMO',
      devise: 'XAF',
      pays: 'République du Congo',
      adresse: 'Siège Social, Brazzaville',
      telephone: '+242060000000',
      email: 'demo@cofin.com',
      sessionTimeout: 60,
      maintenanceMode: false,
    });

    await db.insert(uiCustomization).values({
      theme: 'light',
      primaryColor: '#0f766e',
      accentColor: '#f97316',
      langue: 'fr',
      showAnimations: true,
    });

    await db.insert(featureFlags).values([
      { code: 'offline_mode', nom: 'Mode hors ligne', enabled: true },
      { code: 'agent_tracking', nom: 'Tracking agents', enabled: true },
    ]);

    // Exercise & Accounting
    const currentYear = new Date().getFullYear();
    await db.insert(exercices).values({
      code: `${currentYear}`,
      dateDebut: `${currentYear}-01-01`,
      dateFin: `${currentYear}-12-31`,
      statut: 'Ouvert',
    });

    await db.insert(journaux).values([
      { code: 'CAISSE', intitule: 'Journal de Caisse', typeJournal: 'Caisse' },
      { code: 'OD', intitule: 'Opérations Diverses', typeJournal: 'Opérations Diverses' },
    ] as any);

    console.log('\n✅ SIMPLE DEMO SEED COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('👤 Login: s.administrateur / password123');
    console.log('🔐 Vaults:');
    console.log('   CF-SIEGE : 500,000,000 XAF');
    console.log('   CF-NORD  : 100,000,000 XAF');
    console.log('🏧 Caisses: 1,000,000 XAF par agence (Fermées)');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error during demo seed:', error);
    process.exit(1);
  }
}

seedDemoSimple();
