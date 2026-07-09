import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, jsonb, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { sessionsCaisse, operationsCaisse, mouvementsFinanciers, credits, comptes, caisses } from "./finance";
import { employes } from "./employes";
import { planComptable } from "./accounting";
import { pays } from "./pays";
import { regions } from "./geography";
import { methodePaiementEnum, statutTransactionEnum, typePaiementTerrainEnum } from "@shared/enum/enums";
import { sql } from "drizzle-orm";

/**
 * Table Agents de terrain - Données métier spécifiques aux agents terrain
 * Liée à la table employes pour l'identité et les données RH communes
 * Les champs nom, prenom, telephone, email sont dans users (via employes.userId)
 */
export const agentsTerrain = pgTable("agents_terrain", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Lien vers la table employes (source de vérité pour l'identité RH)
  employeId: uuid("employe_id").references(() => employes.id, { onDelete: "cascade" }),

  // Rattachement financier courant (peut différer du RH pendant un transfert)
  currentAgenceId: uuid("current_agence_id")
    .references(() => agences.id, { onDelete: "set null" }),

  // Sous-compte GL auto-provisionné (ex: 573BZV001)
  currentGlAccountId: uuid("current_gl_account_id")
    .references(() => planComptable.id, { onDelete: "set null" }),

  // Zone d'affectation
  zoneAffectation: text("zone_affectation"),
  // Géolocalisation de la zone d'affectation
  zoneLatitude: numeric("zone_latitude"),
  zoneLongitude: numeric("zone_longitude"),
  zoneRayon: numeric("zone_rayon"), // Rayon en kilomètres
  zonePolygon: text("zone_polygon"), // Coordonnées du polygone JSON si zone personnalisée

  // Tracking GPS en temps réel
  lastLatitude: numeric("last_latitude"),
  lastLongitude: numeric("last_longitude"),
  lastSeenAt: timestamp("last_seen_at"),

  // Statut et performance
  statut: text("statut").notNull().default("ACTIVE"),
  objectifMensuel: numeric("objectif_mensuel"),
  totalProspections: integer("total_prospections").default(0),
  totalVisites: integer("total_visites").default(0),
  totalPaiements: numeric("total_paiements").default("0"),
  tauxConversion: numeric("taux_conversion").default("0"),

  // Métadonnées
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertAgentTerrainSchema = createInsertSchema(agentsTerrain).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertAgentTerrain = z.infer<typeof insertAgentTerrainSchema>;
export type AgentTerrain = typeof agentsTerrain.$inferSelect;


export const remisesTerrain = pgTable(
  "remises_terrain",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "restrict" }),
    sessionCaisseId: uuid("session_caisse_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),
    caisseDestinationId: uuid("caisse_destination_id").references(() => caisses.id, { onDelete: "set null" }),

    reference: text("reference").notNull(), // ex: REM-2026-000123
    idempotencyKey: text("idempotency_key"),
    montantDeclare: numeric("montant_declare").notNull(),  // montant remis
    montantCalcule: numeric("montant_calcule").notNull().default("0"), // calculable depuis paiements liés

    // Écart et justification
    ecart: numeric("ecart").default("0"),
    motifEcart: text("motif_ecart"),

    statut: text("statut").notNull().default("PENDING"), // DRAFT, PENDING, VALIDATED, SETTLED, REJECTED

    // Dates workflow
    createdAt: timestamp("created_at").notNull().defaultNow(),
    validatedAt: timestamp("validated_at"),
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    settledAt: timestamp("settled_at"),
    rejectedAt: timestamp("rejected_at"),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
    version: integer("version").notNull().default(1),

    // Mouvements comptables (créés à la validation)
    mouvementCaisseId: uuid("mouvement_caisse_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    mouvementCoffreId: uuid("mouvement_coffre_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Détail billetage
    billetage: json("billetage").$type<Record<string, number>>(),

    observations: text("observations"),
  },
  (t) => ({
    uqRef: uniqueIndex("uq_remises_terrain_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_remises_terrain_idempotency")
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    idxAgentDate: index("idx_remises_terrain_agent_date").on(t.agentId, t.createdAt),
    idxSession: index("idx_remises_terrain_session").on(t.sessionCaisseId),
    idxStatut: index("idx_remises_terrain_statut").on(t.statut),
    idxAgence: index("idx_remises_terrain_agence").on(t.agenceId),
  }),
);

export const insertRemiseTerrainSchema = createInsertSchema(remisesTerrain).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertRemiseTerrain = z.infer<typeof insertRemiseTerrainSchema>;
export type RemiseTerrain = typeof remisesTerrain.$inferSelect;


// Objectifs Mensuels (historique des objectifs par agent/mois)
export const objectifsMensuels = pgTable("objectifs_mensuels", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id),
  annee: integer("annee").notNull(),
  mois: integer("mois").notNull(), // 1-12
  montant: numeric("montant").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertObjectifMensuelSchema = createInsertSchema(objectifsMensuels).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertObjectifMensuel = z.infer<typeof insertObjectifMensuelSchema>;
export type ObjectifMensuel = typeof objectifsMensuels.$inferSelect;

// ===== Géographie (Départements, Villes, Arrondissements, Marchés) =====

/**
 * Table Departements — ADM2 administrative divisions (mondial)
 *
 * Source: GeoNames admin2Codes.txt
 * Exemples: Kinkala (CG.11.7732002), Paris (FR.11.75)
 *
 * MIGRATION: Cette table contenait 12 rows ADM1 Congo.
 * Ils ont été migrés vers `regions` et remplacés par les ADM2 mondiaux.
 */
export const departements = pgTable("departements", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),

  // Hiérarchie (ADM2 mondial)
  paysId: uuid("pays_id")
    .references(() => pays.id, { onDelete: "restrict" }),
  regionId: uuid("region_id")
    .references(() => regions.id, { onDelete: "restrict" }),

  // GeoNames identifiers
  code: text("code"),                        // ex: "CG.11.7732002"
  geonameId: integer("geoname_id"),
  nomAscii: text("nom_ascii"),

  // Géolocalisation (enrichi via allCountries.txt)
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  population: integer("population"),
}, (t) => ({
  uqCode: uniqueIndex("uq_departements_code").on(t.code),
  uqGeonameId: uniqueIndex("uq_departements_geoname_id").on(t.geonameId),
  idxRegion: index("idx_departements_region").on(t.regionId),
  idxPays: index("idx_departements_pays").on(t.paysId),
  idxRegionNom: index("idx_departements_region_nom").on(t.regionId, t.nom),
  idxActif: index("idx_departements_actif").on(t.actif),
}));

export const insertDepartementSchema = createInsertSchema(departements).omit({ id: true, createdAt: true });
export type InsertDepartement = z.infer<typeof insertDepartementSchema>;
export type Departement = typeof departements.$inferSelect;

/**
 * Table Villes — Villes / lieux peuplés (mondial)
 *
 * Source: GeoNames allCountries.txt (featureClass='P', population >= 5000)
 * Hiérarchie: pays → region (ADM1) → ville
 */
export const villes = pgTable("villes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),

  // Hiérarchie mondiale
  regionId: uuid("region_id")
    .references(() => regions.id, { onDelete: "set null" }),
  paysId: uuid("pays_id")
    .references(() => pays.id, { onDelete: "set null" }),

  // GeoNames
  geonameId: integer("geoname_id"),
  nomAscii: text("nom_ascii"),
  population: integer("population"),
  featureCode: text("feature_code"),         // PPLC, PPLA, PPL...
  timezone: text("timezone"),

  // Coordonnées
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  isChefLieu: boolean("is_chef_lieu").notNull().default(false),

  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxNom: index("idx_villes_nom").on(t.nom),
  idxRegion: index("idx_villes_region").on(t.regionId),
  idxPays: index("idx_villes_pays").on(t.paysId),
  idxActif: index("idx_villes_actif").on(t.actif),
  idxPopulation: index("idx_villes_population").on(t.population),
  uqGeonameId: uniqueIndex("uq_villes_geoname_id").on(t.geonameId),
}));

export const insertVilleSchema = createInsertSchema(villes).omit({ id: true, createdAt: true });
export type InsertVille = z.infer<typeof insertVilleSchema>;
export type Ville = typeof villes.$inferSelect;

export const arrondissements = pgTable("arrondissements", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  villeId: uuid("ville_id").notNull()
    .references(() => villes.id, { onDelete: "restrict" }),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  idxNom: index("idx_arrondissements_nom").on(t.nom),
  idxVille: index("idx_arrondissements_ville").on(t.villeId),
  idxActif: index("idx_arrondissements_actif").on(t.actif),
}));

export const insertArrondissementSchema = createInsertSchema(arrondissements).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertArrondissement = z.infer<typeof insertArrondissementSchema>;
export type Arrondissement = typeof arrondissements.$inferSelect;

export const marches = pgTable("marches", {
  id: uuid("id").primaryKey().defaultRandom(),
  arrondissementId: uuid("arrondissement_id").notNull()
    .references(() => arrondissements.id, { onDelete: "restrict" }),
  nom: text("nom").notNull(),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  idxArrondissement: index("idx_marches_arrondissement").on(t.arrondissementId),
  idxNom: index("idx_marches_nom").on(t.nom),
  idxActif: index("idx_marches_actif").on(t.actif),
  idxArrondissementActif: index("idx_marches_arrondissement_actif").on(t.arrondissementId, t.actif),
}));

export const insertMarcheSchema = createInsertSchema(marches).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertMarche = z.infer<typeof insertMarcheSchema>;
export type Marche = typeof marches.$inferSelect;

// ===== Prospections =====

export const prospections = pgTable("prospections", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id),
  nomProspect: text("nom_prospect").notNull(),
  prenomProspect: text("prenom_prospect"),
  telephoneProspect: text("telephone_prospect").notNull(),
  adresseProspect: text("adresse_prospect"),
  typeActivite: text("type_activite"),
  descriptionActivite: text("description_activite"),
  revenuEstime: numeric("revenu_estime"),
  chiffreAffairesMensuel: numeric("chiffre_affaires_mensuel"),
  typeRevenu: text("type_revenu").default("Mensuel"),
  revenuJournalier: numeric("revenu_journalier"),
  photoUrl: text("photo_url"),
  statut: text("statut").notNull().default("REGISTERED"),
  priorite: text("priorite").default("NORMAL"),
  commentairesAgent: text("commentaires_agent"),
  observations: text("observations"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete

  // New prospection fields
  sexe: text("sexe"), // M or F
  activitePrincipale: text("activite_principale"),
  ancienneteActivite: text("anciennete_activite"), // "< 1 an", "1-3 ans", "3-5 ans", "> 5 ans"
  arrondissementId: uuid("arrondissement_id")
    .references(() => arrondissements.id, { onDelete: "set null" }),
  marcheId: uuid("marche_id")
    .references(() => marches.id, { onDelete: "set null" }),
  lastActionAt: timestamp("last_action_at").defaultNow(),
  version: integer("version").notNull().default(1),
}, (t) => ({
  idxAgent: index("idx_prospections_agent").on(t.agentId),
  idxStatut: index("idx_prospections_statut").on(t.statut),
  idxArrondissement: index("idx_prospections_arrondissement").on(t.arrondissementId),
  idxMarche: index("idx_prospections_marche").on(t.marcheId),
  idxTelephone: index("idx_prospections_telephone").on(t.telephoneProspect),
  idxAgentStatut: index("idx_prospections_agent_statut").on(t.agentId, t.statut),
  idxCreatedAt: index("idx_prospections_created_at").on(t.createdAt),
  idxLastAction: index("idx_prospections_last_action").on(t.lastActionAt),
  idxDeletedAt: index("idx_prospections_deleted_at").on(t.deletedAt),
}));

export const insertProspectionSchema = createInsertSchema(prospections, {
  // Validate Congo phone format: +242XXXXXXXX or 06/05/04XXXXXXX
  telephoneProspect: z.string().regex(
    /^(\+242|0)[456]\d{7}$/,
    "Format téléphone invalide (ex: 06XXXXXXX ou +242XXXXXXXX)"
  ),
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertProspection = z.infer<typeof insertProspectionSchema>;
export type Prospection = typeof prospections.$inferSelect;

// Visites terrain
export const visitesTerrain = pgTable("visites_terrain", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id),
  clientId: uuid("client_id").references(() => clients.id),
  typeVisite: text("type_visite").notNull(),
  dateVisite: timestamp("date_visite").notNull(),
  heureDebut: text("heure_debut"),
  heureFin: text("heure_fin"),
  objetVisite: text("objet_visite"),
  resultat: text("resultat"),
  observations: text("observations"),
  coordonneesGPS: text("coordonnees_gps"),
  latitude: numeric("latitude"), // GPS coordinates
  longitude: numeric("longitude"),
  statut: text("statut").notNull().default("PLANNED"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertVisiteTerrainSchema = createInsertSchema(visitesTerrain).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertVisiteTerrain = z.infer<typeof insertVisiteTerrainSchema>;
export type VisiteTerrain = typeof visitesTerrain.$inferSelect;

// Paiements terrain
export const paiementsTerrain = pgTable(
  "paiements_terrain",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "restrict" }),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),

    typePaiement: typePaiementTerrainEnum("type_paiement").notNull(),
    montant: numeric("montant").notNull(),

    methodePaiement: methodePaiementEnum("methode_paiement").notNull(),
    numeroTelephone: text("numero_telephone"),

    reference: text("reference").notNull(),
    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Links to specific financial products (Credit/Compte/Tontine)
    creditId: uuid("credit_id").references(() => credits.id, { onDelete: "set null" }),
    compteId: uuid("compte_id").references(() => comptes.id, { onDelete: "set null" }),
    tontineId: uuid("tontine_id"), // Soft reference for now

    // Statut standard
    statut: statutTransactionEnum("statut").notNull().default("PENDING"),

    // OTP
    validationOTP: text("validation_otp"),
    dateValidation: timestamp("date_validation"),

    // Remise agence (lot) - legacy fields
    remiseId: uuid("remise_id").references(() => remisesTerrain.id, { onDelete: "set null" }),
    sessionCaisseRemiseId: uuid("session_caisse_remise_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
    dateRemise: timestamp("date_remise"),

    // Settlement tracking (new workflow)
    settledRemiseId: uuid("settled_remise_id").references(() => remisesTerrain.id, { onDelete: "set null" }),
    settledAt: timestamp("settled_at"),
    postedMouvementClientId: uuid("posted_mouvement_client_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    observations: text("observations"),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
    version: integer("version").notNull().default(1),
  },
  (t) => ({
    idxAgentDate: index("idx_paiements_terrain_agent_date").on(t.agentId, t.createdAt),
    idxAgentStatutDate: index("idx_paiements_terrain_agent_statut_date").on(t.agentId, t.statut, t.createdAt),

    idxClientDate: index("idx_paiements_terrain_client_date").on(t.clientId, t.createdAt),
    idxTypeDate: index("idx_paiements_terrain_type_date").on(t.typePaiement, t.createdAt),

    idxRemise: index("idx_paiements_terrain_remise").on(t.remiseId),
    idxSessionRemise: index("idx_paiements_terrain_session_remise").on(t.sessionCaisseRemiseId),
    idxSettled: index("idx_paiements_terrain_settled").on(t.settledRemiseId),

    idxMvt: index("idx_paiements_terrain_mouvement").on(t.mouvementId),
    idxCredit: index("idx_paiements_terrain_credit").on(t.creditId),
    idxCompte: index("idx_paiements_terrain_compte").on(t.compteId),

    uqRef: uniqueIndex("uq_paiements_terrain_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_paiements_terrain_idempotency").on(t.idempotencyKey),
    uqRefExt: uniqueIndex("uq_paiements_terrain_reference_externe").on(t.referenceExterne),

    chkMontantPos: sql`CONSTRAINT chk_paiements_terrain_montant_pos CHECK (${t.montant} > 0)`,
  }),
);


export const insertPaiementTerrainSchema = createInsertSchema(paiementsTerrain).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertPaiementTerrain = z.infer<typeof insertPaiementTerrainSchema>;
export type PaiementTerrain = typeof paiementsTerrain.$inferSelect;

// ============================================================================
// Remise Items (link table for bordereau de remise)
// ============================================================================

export const remiseItems = pgTable(
  "remise_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    remiseId: uuid("remise_id").notNull().references(() => remisesTerrain.id, { onDelete: "cascade" }),
    paiementTerrainId: uuid("paiement_terrain_id").notNull().references(() => paiementsTerrain.id, { onDelete: "restrict" }),
    operationTerrainId: uuid("operation_terrain_id"), // Will be linked later

    // Snapshot of payment details at settlement time
    montant: numeric("montant").notNull(),
    typePaiement: text("type_paiement").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),

    // Settlement tracking
    settledAt: timestamp("settled_at"),
    mouvementClientId: uuid("mouvement_client_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxRemise: index("idx_remise_items_remise").on(t.remiseId),
    idxPaiement: index("idx_remise_items_paiement").on(t.paiementTerrainId),
    uqPaiement: uniqueIndex("uq_remise_items_paiement").on(t.paiementTerrainId),
    chkMontantPos: sql`CONSTRAINT chk_remise_items_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export const insertRemiseItemSchema = createInsertSchema(remiseItems).omit({ id: true, createdAt: true });
export type InsertRemiseItem = z.infer<typeof insertRemiseItemSchema>;
export type RemiseItem = typeof remiseItems.$inferSelect;

// ============================================================================
// Agent Mobile Money Payments (bypass remise workflow)
// ============================================================================

export const agentMmPayments = pgTable(
  "agent_mm_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Payment intent reference (from mm_payment_intents table)
    paymentIntentId: uuid("payment_intent_id"), // Will be linked to mm_payment_intents

    // Agent and client
    agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    // Payment details
    typePaiement: text("type_paiement").notNull(), // CREDIT_REPAYMENT, DEPOSIT_SAVINGS, etc.
    montant: numeric("montant").notNull(),
    provider: text("provider").notNull(), // MTN, AIRTEL
    phone: text("phone").notNull(),

    // External references
    reference: text("reference").notNull(),
    externalReference: text("external_reference"),
    idempotencyKey: text("idempotency_key"),

    // Target financial product
    creditId: uuid("credit_id").references(() => credits.id, { onDelete: "set null" }),
    compteId: uuid("compte_id").references(() => comptes.id, { onDelete: "set null" }),
    tontineId: uuid("tontine_id"),

    // Status tracking
    statut: text("statut").notNull().default("PENDING"), // PENDING, PROCESSING, SUCCESS, FAILED, CANCELLED

    // Settlement (on SUCCESS)
    settledAt: timestamp("settled_at"),
    mouvementClientId: uuid("mouvement_client_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Error tracking
    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    // Location
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),

    // Audit
    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uqReference: uniqueIndex("uq_agent_mm_payments_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_agent_mm_payments_idempotency")
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    idxAgent: index("idx_agent_mm_payments_agent").on(t.agentId),
    idxClient: index("idx_agent_mm_payments_client").on(t.clientId),
    idxIntent: index("idx_agent_mm_payments_intent").on(t.paymentIntentId),
    idxStatut: index("idx_agent_mm_payments_statut").on(t.statut),
    idxDate: index("idx_agent_mm_payments_date").on(t.createdAt),
    chkMontantPos: sql`CONSTRAINT chk_agent_mm_payments_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export const insertAgentMmPaymentSchema = createInsertSchema(agentMmPayments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentMmPayment = z.infer<typeof insertAgentMmPaymentSchema>;
export type AgentMmPayment = typeof agentMmPayments.$inferSelect;

// ============================================================================
// Remise Audit Logs
// ============================================================================

export const remiseAuditLogs = pgTable(
  "remise_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    remiseId: uuid("remise_id").notNull().references(() => remisesTerrain.id, { onDelete: "cascade" }),

    action: text("action").notNull(), // CREATED, SUBMITTED, APPROVED, REJECTED, SETTLED
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres").notNull(),

    details: json("details").$type<Record<string, unknown>>(),

    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxRemise: index("idx_remise_audit_logs_remise").on(t.remiseId),
    idxTimestamp: index("idx_remise_audit_logs_timestamp").on(t.timestamp),
  }),
);

export const insertRemiseAuditLogSchema = createInsertSchema(remiseAuditLogs).omit({ id: true, timestamp: true });
export type InsertRemiseAuditLog = z.infer<typeof insertRemiseAuditLogSchema>;
export type RemiseAuditLog = typeof remiseAuditLogs.$inferSelect;

// Agent Location Logs
export const agentLocationLogs = pgTable("agent_location_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => users.id),
  latitude: numeric("latitude").notNull(),
  longitude: numeric("longitude").notNull(),
  accuracy: numeric("accuracy"),
  altitude: numeric("altitude"),
  speed: numeric("speed"),
  heading: numeric("heading"),
  source: text("source").notNull().default("gps"),
  batteryLevel: integer("battery_level"),
  sessionId: text("session_id"),
  dayKey: text("day_key"),
  clientPointId: text("client_point_id"),
  activityType: text("activity_type"),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_agent_loc_agent_captured").on(t.agentId, t.capturedAt),
  index("idx_agent_loc_session").on(t.sessionId),
  uniqueIndex("idx_agent_loc_client_point").on(t.agentId, t.clientPointId),
]);

export const insertAgentLocationLogSchema = createInsertSchema(agentLocationLogs).omit({ id: true, createdAt: true });
export type InsertAgentLocationLog = z.infer<typeof insertAgentLocationLogSchema>;
export type AgentLocationLog = typeof agentLocationLogs.$inferSelect;

// Tracking Sessions — daily field agent GPS sessions
export const trackingSessions = pgTable("tracking_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull().unique(),
  agentId: uuid("agent_id").notNull().references(() => users.id),
  agencyId: uuid("agency_id").references(() => agences.id),
  dayKey: text("day_key").notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  pointCount: integer("point_count").notNull().default(0),
  totalDistanceM: numeric("total_distance_m").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_tracking_sessions_agent_day").on(t.agentId, t.dayKey),
]);

export const insertTrackingSessionSchema = createInsertSchema(trackingSessions).omit({ id: true, createdAt: true });
export type InsertTrackingSession = z.infer<typeof insertTrackingSessionSchema>;
export type TrackingSessionRow = typeof trackingSessions.$inferSelect;

// Caisses definition moved to finance.ts to avoid circular dependency

// Caisse Security Codes
export const caisseSecurityCodes = pgTable("caisse_security_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => users.id),
  codeHash: text("code_hash").notNull(),
  active: boolean("active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),

  // Enhanced fields for access control
  caisseId: uuid("caisse_id").references(() => caisses.id, { onDelete: 'cascade' }),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: 'cascade' }),
  codeType: text("code_type").default("EMERGENCY"), // EMERGENCY, DAILY, PERMANENT
  maxUsages: integer("max_usages"), // NULL = unlimited
  usageCount: integer("usage_count").default(0),
  authorizationDurationHours: integer("authorization_duration_hours").default(4),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  description: text("description"),
});
export type CaisseSecurityCode = typeof caisseSecurityCodes.$inferSelect;
export const insertCaisseSecurityCodeSchema = createInsertSchema(caisseSecurityCodes).omit({ id: true, createdAt: true, usageCount: true });
export type InsertCaisseSecurityCode = z.infer<typeof insertCaisseSecurityCodeSchema>;

// Caisse Assignations (Many-to-Many)
export const caisseAssignations = pgTable("caisse_assignations", {
  id: uuid("id").primaryKey().defaultRandom(),
  caisseId: uuid("caisse_id").notNull().references(() => caisses.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedBy: uuid("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
});
export const insertCaisseAssignationSchema = createInsertSchema(caisseAssignations).omit({ id: true, assignedAt: true });
export type InsertCaisseAssignation = z.infer<typeof insertCaisseAssignationSchema>;
export type CaisseAssignation = typeof caisseAssignations.$inferSelect;

// Caisse Code Usages
export const caisseCodeUsages = pgTable("caisse_code_usages", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeId: uuid("code_id").references(() => caisseSecurityCodes.id),
  usedAt: timestamp("used_at").defaultNow(),
  success: boolean("success").default(false),

  // Enhanced fields for tracking
  userId: uuid("user_id").references(() => users.id, { onDelete: 'set null' }),
  authorizationId: uuid("authorization_id"), // Will be linked to caisseUserAuthorizations
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  failureReason: text("failure_reason"),
});
export type CaisseCodeUsage = typeof caisseCodeUsages.$inferSelect;

// Caisse User Authorizations - Tracks users who validated a security code
export const caisseUserAuthorizations = pgTable("caisse_user_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  caisseId: uuid("caisse_id").references(() => caisses.id, { onDelete: 'cascade' }),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: 'cascade' }),
  codeId: uuid("code_id").references(() => caisseSecurityCodes.id, { onDelete: 'set null' }),
  reason: text("reason"),

  // Validity period
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),

  // Revocation tracking
  revokedAt: timestamp("revoked_at"),
  revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: 'set null' }),
  revokeReason: text("revoke_reason"),

  // Connection metadata
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
});
export type CaisseUserAuthorization = typeof caisseUserAuthorizations.$inferSelect;
export const insertCaisseUserAuthorizationSchema = createInsertSchema(caisseUserAuthorizations).omit({ id: true, createdAt: true, grantedAt: true });
export type InsertCaisseUserAuthorization = z.infer<typeof insertCaisseUserAuthorizationSchema>;

// POS Devices
export const posDevices = pgTable("pos_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  serial: text("serial").notNull().unique(),
  model: text("model"),
  agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "restrict" }),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  lastSyncAt: timestamp("last_sync_at"),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
export const insertPosDeviceSchema = createInsertSchema(posDevices).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertPosDevice = z.infer<typeof insertPosDeviceSchema>;
export type PosDevice = typeof posDevices.$inferSelect;

export const posDeviceLogs = pgTable("pos_device_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id").notNull().references(() => posDevices.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  message: text("message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertPosDeviceLogSchema = createInsertSchema(posDeviceLogs).omit({ id: true, createdAt: true });
export type InsertPosDeviceLog = z.infer<typeof insertPosDeviceLogSchema>;
export type PosDeviceLog = typeof posDeviceLogs.$inferSelect;

// Modeles Factures
export const modelesFactures = pgTable("modeles_factures", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  code: text("code").notNull().unique(), 
  description: text("description"),
  typeDocument: text("type_document").notNull().default("facture"), 
  prefixeNumero: text("prefixe_numero").notNull().default("FAC"),
  dernierNumero: integer("dernier_numero").default(0),
  entete: text("entete"), 
  piedPage: text("pied_page"), 
  mentionsLegales: text("mentions_legales"),
  logoUrl: text("logo_url"),
  couleurPrincipale: text("couleur_principale").default("#1e3a8a"),
  afficherTva: boolean("afficher_tva").default(false),
  tauxTva: numeric("taux_tva").default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertModeleFactureSchema = createInsertSchema(modelesFactures).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertModeleFacture = z.infer<typeof insertModeleFactureSchema>;
export type ModeleFacture = typeof modelesFactures.$inferSelect;

// Factures
export const factures = pgTable("factures", {
  id: uuid("id").primaryKey().defaultRandom(),
  numero: text("numero").notNull().unique(),
  modeleId: uuid("modele_id").references(() => modelesFactures.id),
  clientId: uuid("client_id").references(() => clients.id),
  agentId: uuid("agent_id").references(() => users.id),
  sessionId: uuid("session_id").references(() => sessionsCaisse.id),
  dateFacture: timestamp("date_facture").notNull().defaultNow(),
  dateEcheance: timestamp("date_echeance"),
  sousTotal: numeric("sous_total").notNull().default("0"),
  montantTva: numeric("montant_tva").default("0"),
  montantTotal: numeric("montant_total").notNull(),
  montantPaye: numeric("montant_paye").default("0"),
  statut: text("statut").notNull().default("emise"), 
  modePaiement: text("mode_paiement"),
  referenceTransaction: text("reference_transaction"),
  operationCaisseId: uuid("operation_caisse_id").references(() => operationsCaisse.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertFactureSchema = createInsertSchema(factures).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFacture = z.infer<typeof insertFactureSchema>;
export type Facture = typeof factures.$inferSelect;

// Lignes Factures
export const lignesFactures = pgTable("lignes_factures", {
  id: uuid("id").primaryKey().defaultRandom(),
  factureId: uuid("facture_id").notNull().references(() => factures.id),
  description: text("description").notNull(),
  quantite: integer("quantite").notNull().default(1),
  prixUnitaire: numeric("prix_unitaire").notNull(),
  montant: numeric("montant").notNull(),
  typeOperation: text("type_operation"), 
  referenceId: uuid("reference_id"), 
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertLigneFactureSchema = createInsertSchema(lignesFactures).omit({ id: true, createdAt: true });
export type InsertLigneFacture = z.infer<typeof insertLigneFactureSchema>;
export type LigneFacture = typeof lignesFactures.$inferSelect;

// Comptage Billets
export const comptageBillets = pgTable("comptage_billets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id),
  typeComptage: text("type_comptage").notNull(),
  billets10000: integer("billets_10000").default(0),
  billets5000: integer("billets_5000").default(0),
  billets2000: integer("billets_2000").default(0),
  billets1000: integer("billets_1000").default(0),
  billets500: integer("billets_500").default(0),
  pieces250: integer("pieces_250").default(0),
  pieces100: integer("pieces_100").default(0),
  pieces50: integer("pieces_50").default(0),
  pieces25: integer("pieces_25").default(0),
  totalCalcule: numeric("total_calcule").notNull(),
  totalDeclare: numeric("total_declare"),
  ecart: numeric("ecart").default("0"),
  validePar: uuid("valide_par").references(() => users.id),
  dateValidation: timestamp("date_validation"),
  observations: text("observations"),
  // Dual count verification columns
  compteurId: uuid("compteur_id").references(() => users.id),
  verificateurId: uuid("verificateur_id").references(() => users.id),
  verificationBilletage: jsonb("verification_billetage").$type<Record<string, number>>(),
  verificationTotal: numeric("verification_total"),
  ecartVerification: numeric("ecart_verification"),
  dualCountRequired: boolean("dual_count_required").default(false),
  dualCountCompleted: boolean("dual_count_completed").default(false),
  verificationSubmittedAt: timestamp("verification_submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertComptageBilletsSchema = createInsertSchema(comptageBillets).omit({ id: true, createdAt: true });
export type InsertComptageBillets = z.infer<typeof insertComptageBilletsSchema>;
export type ComptageBillets = typeof comptageBillets.$inferSelect;

// Configuration du comptage à deux par agence
export const dualCountConfig = pgTable("dual_count_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "cascade" }),
  thresholdMontant: numeric("threshold_montant").default("1000000"),
  alwaysRequiredForClosing: boolean("always_required_for_closing").default(true),
  requireDifferentUser: boolean("require_different_user").default(true),
  maxEcartTolerance: numeric("max_ecart_tolerance").default("100"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type DualCountConfig = typeof dualCountConfig.$inferSelect;
export type InsertDualCountConfig = typeof dualCountConfig.$inferInsert;

// Zones
export const zones = pgTable("zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(), // e.g., "Poto-Poto"
  ville: text("ville").notNull(), // e.g., "Brazzaville"
  villeId: uuid("ville_id"), // FK to villes table (nullable for backward compat)
  description: text("description"),
  statut: text("statut").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertZoneSchema = createInsertSchema(zones).omit({ id: true, createdAt: true });
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;

// ===== Prospection Prime Configuration =====

export const prospectionPrimeConfig = pgTable("prospection_prime_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull().default("Prime de Prospection"), // Display name for this config
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "cascade" }),
  typePrime: text("type_prime").notNull().default("FIXED"), // FIXED or VARIABLE
  montantFixe: numeric("montant_fixe").default("5000"), // Fixed amount per qualified prospect (FCFA)
  tauxVariable: numeric("taux_variable"), // Variable rate percentage (if VARIABLE)
  // Qualification rules
  requireFirstCredit: boolean("require_first_credit").default(false),
  requireMinRevenu: numeric("require_min_revenu"),
  actif: boolean("actif").notNull().default(true),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveTo: timestamp("effective_to"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  idxAgence: index("idx_prospection_prime_config_agence").on(t.agenceId),
  idxActif: index("idx_prospection_prime_config_actif").on(t.actif),
}));

export const insertProspectionPrimeConfigSchema = createInsertSchema(prospectionPrimeConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProspectionPrimeConfig = z.infer<typeof insertProspectionPrimeConfigSchema>;
export type ProspectionPrimeConfig = typeof prospectionPrimeConfig.$inferSelect;

// ===== Prospection Primes (incentives per qualified prospect) =====

export const prospectionPrimes = pgTable("prospection_primes", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull()
    .references(() => agentsTerrain.id, { onDelete: "restrict" }),
  agenceId: uuid("agence_id")
    .references(() => agences.id, { onDelete: "set null" }),
  prospectionId: uuid("prospection_id").notNull()
    .references(() => prospections.id, { onDelete: "restrict" }),
  clientId: uuid("client_id"),

  // Prime details
  montant: numeric("montant").notNull(),
  typePrime: text("type_prime").notNull().default("FIXED"), // FIXED or VARIABLE
  periode: varchar("periode", { length: 7 }).notNull(), // YYYY-MM

  // Status workflow: PENDING -> APPROVED -> PAID  (or PENDING -> REJECTED)
  statut: text("statut").notNull().default("PENDING"),

  // Approval tracking
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  // Payment tracking
  paidAt: timestamp("paid_at"),
  mouvementId: uuid("mouvement_id")
    .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

  // HR integration
  avantageEmployeId: integer("avantage_employe_id"),

  observations: text("observations"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  idxAgent: index("idx_prospection_primes_agent").on(t.agentId),
  idxAgence: index("idx_prospection_primes_agence").on(t.agenceId),
  idxProspection: index("idx_prospection_primes_prospection").on(t.prospectionId),
  idxStatut: index("idx_prospection_primes_statut").on(t.statut),
  idxPeriode: index("idx_prospection_primes_periode").on(t.periode),
  idxAgentPeriode: index("idx_prospection_primes_agent_periode").on(t.agentId, t.periode),
  idxAgentStatut: index("idx_prospection_primes_agent_statut").on(t.agentId, t.statut),
  // One prime per converted prospect
  uqProspection: uniqueIndex("uq_prospection_primes_prospection").on(t.prospectionId),
}));

export const insertProspectionPrimeSchema = createInsertSchema(prospectionPrimes).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertProspectionPrime = z.infer<typeof insertProspectionPrimeSchema>;
export type ProspectionPrime = typeof prospectionPrimes.$inferSelect;
