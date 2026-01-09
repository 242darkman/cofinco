import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { sessionsCaisse, operationsCaisse, mouvementsFinanciers, credits, comptes } from "./finance";
import { employes } from "./employes";
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

  // ===== CHAMPS LEGACY (à migrer vers users via employes) =====
  // Ces champs sont conservés temporairement pour la rétro-compatibilité
  // Ils seront supprimés après migration complète
  nom: text("nom"), // LEGACY: Déplacé vers users.nom (maintenant nullable)
  prenom: text("prenom"), // LEGACY: Déplacé vers users.prenom
  telephone: text("telephone"), // LEGACY: Déplacé vers users.telephone
  email: text("email"), // LEGACY: Déplacé vers users.email
  // ===== FIN CHAMPS LEGACY =====

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
  statut: text("statut").notNull().default("Actif"),
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

    reference: text("reference").notNull(), // ex: REM-2026-000123
    montantDeclare: numeric("montant_declare").notNull(),  // montant remis
    montantCalcule: numeric("montant_calcule").notNull().default("0"), // calculable depuis paiements liés

    statut: text("statut").notNull().default("En attente"), // ou enum si tu veux (En attente, Validée, Rejetée)

    createdAt: timestamp("created_at").notNull().defaultNow(),
    validatedAt: timestamp("validated_at"),
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete

    observations: text("observations"),
  },
  (t) => ({
    uqRef: uniqueIndex("uq_remises_terrain_reference").on(t.reference),
    idxAgentDate: index("idx_remises_terrain_agent_date").on(t.agentId, t.createdAt),
    idxSession: index("idx_remises_terrain_session").on(t.sessionCaisseId),
    idxStatut: index("idx_remises_terrain_statut").on(t.statut),
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

// Prospections
export const prospections = pgTable("prospections", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id),
  nomProspect: text("nom_prospect").notNull(),
  prenomProspect: text("prenom_prospect"),
  telephoneProspect: text("telephone_prospect").notNull(),
  adresseProspect: text("adresse_prospect"),
  localisation: text("localisation"),
  latitude: numeric("latitude"), // GPS coordinates
  longitude: numeric("longitude"),
  typeActivite: text("type_activite"),
  descriptionActivite: text("description_activite"),
  revenuEstime: numeric("revenu_estime"),
  chiffreAffairesMensuel: numeric("chiffre_affaires_mensuel"),
  typeRevenu: text("type_revenu").default("Mensuel"),
  revenuJournalier: numeric("revenu_journalier"),
  joursTravailMois: integer("jours_travail_mois").default(26),
  interetCredit: boolean("interet_credit").default(false),
  montantSouhaite: numeric("montant_souhaite"),
  objetCredit: text("objet_credit"),
  photoUrl: text("photo_url"),
  statut: text("statut").notNull().default("nouveau"),
  priorite: text("priorite").default("normale"),
  commentairesAgent: text("commentaires_agent"),
  observations: text("observations"),
  dateProspection: timestamp("date_prospection").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProspectionSchema = createInsertSchema(prospections).omit({ id: true, createdAt: true });
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
  statut: text("statut").notNull().default("Planifiée"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVisiteTerrainSchema = createInsertSchema(visitesTerrain).omit({ id: true, createdAt: true });
export type InsertVisiteTerrain = z.infer<typeof insertVisiteTerrainSchema>;
export type VisiteTerrain = typeof visitesTerrain.$inferSelect;

// Paiements terrain
export const paiementsTerrain = pgTable(
  "paiements_terrain",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "restrict" }),
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
    statut: statutTransactionEnum("statut").notNull().default("Pending"),

    // OTP
    validationOTP: text("validation_otp"),
    dateValidation: timestamp("date_validation"),

    // Remise agence (lot)
    remiseId: uuid("remise_id").references(() => remisesTerrain.id, { onDelete: "set null" }),
    sessionCaisseRemiseId: uuid("session_caisse_remise_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
    dateRemise: timestamp("date_remise"),

    observations: text("observations"),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxAgentDate: index("idx_paiements_terrain_agent_date").on(t.agentId, t.createdAt),
    idxAgentStatutDate: index("idx_paiements_terrain_agent_statut_date").on(t.agentId, t.statut, t.createdAt),

    idxClientDate: index("idx_paiements_terrain_client_date").on(t.clientId, t.createdAt),
    idxTypeDate: index("idx_paiements_terrain_type_date").on(t.typePaiement, t.createdAt),

    idxRemise: index("idx_paiements_terrain_remise").on(t.remiseId),
    idxSessionRemise: index("idx_paiements_terrain_session_remise").on(t.sessionCaisseRemiseId),

    idxMvt: index("idx_paiements_terrain_mouvement").on(t.mouvementId),
    idxCredit: index("idx_paiements_terrain_credit").on(t.creditId),
    idxCompte: index("idx_paiements_terrain_compte").on(t.compteId),

    uqRef: uniqueIndex("uq_paiements_terrain_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_paiements_terrain_idempotency").on(t.idempotencyKey),
    uqRefExt: uniqueIndex("uq_paiements_terrain_reference_externe").on(t.referenceExterne),

    chkMontantPos: sql`CONSTRAINT chk_paiements_terrain_montant_pos CHECK (${t.montant} > 0)`,
  }),
);


export const insertPaiementTerrainSchema = createInsertSchema(paiementsTerrain).omit({ id: true, createdAt: true });
export type InsertPaiementTerrain = z.infer<typeof insertPaiementTerrainSchema>;
export type PaiementTerrain = typeof paiementsTerrain.$inferSelect;

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
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentLocationLogSchema = createInsertSchema(agentLocationLogs).omit({ id: true, createdAt: true });
export type InsertAgentLocationLog = z.infer<typeof insertAgentLocationLogSchema>;
export type AgentLocationLog = typeof agentLocationLogs.$inferSelect;

// Caisses Agents
// Caisses (Physical/Logical)
export const caisses = pgTable("caisses", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  type: text("type").notNull().default("Physique"), // 'Physique', 'Coffre-Fort', 'Virtuelle'
  solde: numeric("solde").notNull().default("0"),
  statut: text("statut").notNull().default("Fermée"), // 'Ouverte', 'Fermée'
  // Optional: link to a specific device or location?
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertCaisseSchema = createInsertSchema(caisses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCaisse = z.infer<typeof insertCaisseSchema>;
export type Caisse = typeof caisses.$inferSelect;

// Caisse Security Codes
export const caisseSecurityCodes = pgTable("caisse_security_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => users.id),
  codeHash: text("code_hash").notNull(),
  active: boolean("active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CaisseSecurityCode = typeof caisseSecurityCodes.$inferSelect;

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
});
export type CaisseCodeUsage = typeof caisseCodeUsages.$inferSelect;

// Shifts Caisse
export const shiftsCaisse = pgTable("shifts_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  caisseId: uuid("caisse_id").references(() => caisses.id), // Renamed from caisseAgentId
  agentId: uuid("agent_id").references(() => users.id),
  dateOuverture: timestamp("date_ouverture").defaultNow(),
  dateFermeture: timestamp("date_fermeture"),
  soldeOuverture: numeric("solde_ouverture").default("0"),
  soldeFermeture: numeric("solde_fermeture"),
  soldeTheorique: numeric("solde_theorique").default("0"),
  ecart: numeric("ecart"),
  statut: text("statut").notNull().default("ouvert"), 
  codeSecuriteId: uuid("code_securite_id").references(() => caisseSecurityCodes.id),
  observations: text("observations"),
  fermetureAutomatique: boolean("fermeture_automatique").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertShiftCaisseSchema = createInsertSchema(shiftsCaisse).omit({ id: true, createdAt: true });
export type InsertShiftCaisse = z.infer<typeof insertShiftCaisseSchema>;
export type ShiftCaisse = typeof shiftsCaisse.$inferSelect;

// Code Generation Permissions
export const codeGenerationPermissions = pgTable("code_generation_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  managerId: uuid("manager_id").references(() => users.id),
  canGenerate: boolean("can_generate").default(false),
});

// POS Devices
export const posDevices = pgTable("pos_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => users.id),
  caisseId: uuid("caisse_id").references(() => caisses.id), // Renamed from caisseAgentId
  deviceId: text("device_id").notNull().unique(), 
  nom: text("nom").notNull(),
  modele: text("modele"),
  numeroSerie: text("numero_serie"),
  dateEnregistrement: timestamp("date_enregistrement").defaultNow(),
  derniereSynchronisation: timestamp("derniere_synchronisation"),
  versionApp: text("version_app"),
  statut: text("statut").notNull().default("actif"), 
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertPosDeviceSchema = createInsertSchema(posDevices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPosDevice = z.infer<typeof insertPosDeviceSchema>;
export type PosDevice = typeof posDevices.$inferSelect;

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
  shiftId: uuid("shift_id").references(() => shiftsCaisse.id),
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
  shiftId: uuid("shift_id").notNull().references(() => shiftsCaisse.id),
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
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertComptageBilletsSchema = createInsertSchema(comptageBillets).omit({ id: true, createdAt: true });
export type InsertComptageBillets = z.infer<typeof insertComptageBilletsSchema>;
export type ComptageBillets = typeof comptageBillets.$inferSelect;

// Zones
export const zones = pgTable("zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(), // e.g., "Poto-Poto"
  ville: text("ville").notNull(), // e.g., "Brazzaville"
  description: text("description"),
  statut: text("statut").notNull().default("Actif"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertZoneSchema = createInsertSchema(zones).omit({ id: true, createdAt: true });
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;
