import { pgTable, pgEnum, text, varchar, integer, numeric, boolean, timestamp, uuid, serial, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { agences } from "./agences";
import { users } from "./auth";
import { sectors, professions, activityTypes } from "./catalog";
import { employes } from "./employes";
import { pays } from "./pays";

// ===== Document Types for KYC =====
export const documentTypeEnum = z.enum([
  'ID_CARD_FRONT',
  'ID_CARD_BACK',
  'PROOF_OF_ADDRESS',
  'AVATAR',
  'OTHER'
]);
export type DocumentType = z.infer<typeof documentTypeEnum>;

export const documentStatusEnum = z.enum(['pending', 'verified', 'rejected']);
export type DocumentStatus = z.infer<typeof documentStatusEnum>;

// Schema for a single uploaded document
export const clientDocumentSchema = z.object({
  id: z.string().uuid(),
  documentType: documentTypeEnum,
  documentName: z.string().min(1),
  documentUrl: z.string().min(1), // MinIO object key or full URL
  status: documentStatusEnum.default('pending'),
  createdAt: z.string().datetime().optional(),
  isPrivate: z.boolean().default(true),
  notes: z.string().optional(),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.string().uuid().optional(),
});
export type ClientDocument = z.infer<typeof clientDocumentSchema>;

// Schema for an array of documents (for JSONB validation)
export const clientDocumentsArraySchema = z.array(clientDocumentSchema).optional();
export type ClientDocumentsArray = z.infer<typeof clientDocumentsArraySchema>;

// ===== Enum strict pour les pièces d'identité =====
export const typePieceEnum = pgEnum("type_piece_enum", [
  "CNI",
  "PASSPORT",
  "PERMIS_CONDUIRE",
  "CARTE_RESIDENT",
]);

// ===== Zod schema pour les personnes de référence (JSONB) =====
export const relationReferenceEnum = z.enum([
  "CONJOINT",
  "PARENT",
  "FRERE_SOEUR",
  "AMI",
  "COLLEGUE",
  "VOISIN",
  "AUTRE",
]);
export type RelationReference = z.infer<typeof relationReferenceEnum>;

export const referencePersonneSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().optional(),
  telephone: z.string().min(8, "Téléphone requis"),
  relation: relationReferenceEnum,
  adresse: z.string().optional(),
  profession: z.string().optional(),
});
export type ReferencePersonne = z.infer<typeof referencePersonneSchema>;

export const referencesPersonnesSchema = z.array(referencePersonneSchema).max(3, "Maximum 3 références").optional();
export type ReferencesPersonnes = z.infer<typeof referencesPersonnesSchema>;

/**
 * Table Clients - Données métier client
 * Liée à la table users pour l'identité commune
 *
 * Champs d'IDENTITÉ (dans users) : nom, prenom, email, telephone, sexe,
 *   dateNaissance, lieuNaissance, nationaliteId, paysNaissanceId, photoProfile
 *
 * Champs MÉTIER (ici) : adresse, professionnel, financier, conformité, KYC
 */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Lien vers la table users (source de vérité pour l'identité)
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

  // ========== ADRESSE ==========
  adresseDomicile: text("adresse_domicile"),
  lieuActivite: text("lieu_activite"),
  villeId: uuid("ville_id"), // FK to villes or departements depending on localityType
  localityType: text("locality_type"), // 'CITY' | 'DISTRICT' — null = legacy CITY
  paysResidenceId: uuid("pays_residence_id").references(() => pays.id, { onDelete: "set null" }),
  statutLogement: text("statut_logement"), // PROPRIETAIRE, LOCATAIRE, HEBERGE, AUTRE

  // ========== PIÈCE D'IDENTITÉ ==========
  typePiece: typePieceEnum("type_piece"),
  numeroPiece: text("numero_piece"),
  dateExpirationPiece: timestamp("date_expiration_piece"),
  paysEmissionId: uuid("pays_emission_id").references(() => pays.id, { onDelete: "set null" }),
  // Vérification de la pièce
  statutVerificationPiece: text("statut_verification_piece").notNull().default("PENDING"), // PENDING, VERIFIED, REJECTED
  verificationPieceBy: uuid("verification_piece_by").references(() => users.id),
  verificationPieceDate: timestamp("verification_piece_date"),

  // ========== SITUATION PERSONNELLE ==========
  situationMatrimoniale: text("situation_matrimoniale"), // CELIBATAIRE, MARIE, DIVORCE, VEUF, UNION_LIBRE
  nombrePersonnesCharge: integer("nombre_personnes_charge").default(0),
  niveauEducation: text("niveau_education"), // AUCUN, PRIMAIRE, SECONDAIRE, UNIVERSITAIRE, PROFESSIONNEL

  // ========== CLASSIFICATION ==========
  typeClient: text("type_client").notNull().default("PARTICULIER"), // PARTICULIER, PME, ASSOCIATION, GIE
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  segment: text("segment").notNull().default("Standard"),
  frequenceCarte: text("frequence_carte").default("DAILY"),

  // ========== PROFESSIONNEL ==========
  professionId: uuid("profession_id").references(() => professions.id, { onDelete: "set null" }),
  professionAutreTexte: text("profession_autre_texte"), // texte libre quand "Autre" est sélectionné
  activityTypeId: uuid("activity_type_id").references(() => activityTypes.id, { onDelete: "set null" }),
  employeur: text("employeur"),
  ancienneteActiviteMois: integer("anciennete_activite_mois"),
  sourceFonds: text("source_fonds"), // SALAIRE, COMMERCE, AGRICULTURE, PENSION, AIDE_FAMILIALE, AUTRE
  revenuMensuel: numeric("revenu_mensuel"),
  revenuJournalier: numeric("revenu_journalier"),
  typeRevenu: text("type_revenu").default("Mensuel"), // 'Mensuel' | 'Journalier'

  // ========== GÉOLOCALISATION ==========
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),

  // ========== SCORING & LIMITES ==========
  score: integer("score").default(50),
  creditTotal: numeric("credit_total").default("0"),
  epargneTotal: numeric("epargne_total").default("0"),
  tauxRemboursement: numeric("taux_remboursement").default("100"),
  limiteRetraitJournalier: numeric("limite_retrait_journalier").default("2000000"),
  limiteRetraitHebdomadaire: numeric("limite_retrait_hebdomadaire").default("10000000"),
  limiteRetraitMensuel: numeric("limite_retrait_mensuel").default("30000000"),

  // ========== FIDÉLITÉ & ENGAGEMENT ==========
  pointsFidelite: integer("points_fidelite").default(0),
  scoreEngagement: integer("score_engagement").default(0),
  derniereActivite: timestamp("derniere_activite"),

  // ========== CONFORMITÉ AML ==========
  isPep: boolean("is_pep").notNull().default(false),
  pepDetails: text("pep_details"),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  blacklistReason: text("blacklist_reason"),
  blacklistedAt: timestamp("blacklisted_at"),
  riskLevel: text("risk_level").notNull().default("LOW"), // LOW, MEDIUM, HIGH, VERY_HIGH

  // ========== KYC GLOBAL ==========
  kycStatus: text("kyc_status").notNull().default("PENDING"), // PENDING, PARTIAL, VERIFIED, REJECTED, EXPIRED
  kycVerifiedAt: timestamp("kyc_verified_at"),
  kycVerifiedBy: uuid("kyc_verified_by").references(() => users.id),
  kycExpiryDate: timestamp("kyc_expiry_date"),
  kycNotes: text("kyc_notes"),

  // KYC Documents (JSONB array)
  documents: jsonb("documents"),

  // ========== CONSENTEMENT ==========
  consentementDonnees: boolean("consentement_donnees").notNull().default(false),
  consentementDate: timestamp("consentement_date"),

  // ========== NOTES & RÉFÉRENCES (JSONB) ==========
  notes: jsonb("notes").default([]),
  referencesPersonnes: jsonb("references_personnes").default([]),

  // ========== ORIGINE & ORGANISATION ==========
  clientOrigin: text("client_origin").notNull().default("OTHER"),
  prospectId: uuid("prospect_id"), // Soft FK to prospections
  agenceId: uuid("agence_id").references(() => agences.id),
  agentReferentId: uuid("agent_referent_id").references(() => employes.id),

  // ========== DATES ==========
  dateAdhesion: timestamp("date_adhesion").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
  version: integer("version").notNull().default(1),
}, (t) => ({
  // Performance indexes
  idxUserId: index("idx_clients_user_id").on(t.userId),
  idxAgenceId: index("idx_clients_agence_id").on(t.agenceId),
  idxAgentReferent: index("idx_clients_agent_referent_id").on(t.agentReferentId),
  idxDeletedAt: index("idx_clients_deleted_at").on(t.deletedAt),
  // Composite indexes
  idxAgenceSegment: index("idx_clients_agence_segment").on(t.agenceId, t.segment),
  idxAgenceCreatedAt: index("idx_clients_agence_created_at").on(t.agenceId, t.createdAt),
  // Prospection
  idxClientOrigin: index("idx_clients_client_origin").on(t.clientOrigin),
  idxProspectId: index("idx_clients_prospect_id").on(t.prospectId),
  // Conformité
  idxRiskLevel: index("idx_clients_risk_level").on(t.riskLevel),
  idxKycStatus: index("idx_clients_kyc_status").on(t.kycStatus),
  idxTypeClient: index("idx_clients_type_client").on(t.typeClient),
  idxIsBlacklisted: index("idx_clients_is_blacklisted").on(t.isBlacklisted),
  idxIsPep: index("idx_clients_is_pep").on(t.isPep),
  idxAgenceKyc: index("idx_clients_agence_kyc").on(t.agenceId, t.kycStatus),
  idxAgenceRisk: index("idx_clients_agence_risk").on(t.agenceId, t.riskLevel),
}));

const numericPreprocess = (schema: z.ZodTypeAny) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? undefined : String(value)),
    schema,
  );

export const insertClientSchema = createInsertSchema(clients, {
  creditTotal: numericPreprocess,
  epargneTotal: numericPreprocess,
  tauxRemboursement: numericPreprocess,
  // Validate documents as an array of ClientDocument objects
  documents: () => clientDocumentsArraySchema,
  // Validate references as an array of ReferencePersonne objects
  referencesPersonnes: () => referencesPersonnesSchema,
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

/**
 * Type Client avec données d'identité fusionnées depuis users
 * Utilisé par l'API et le frontend pour avoir une vue complète
 */
export interface ClientWithIdentity extends Client {
  // Champs d'identité (proviennent de users)
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  sexe: string | null;
  dateNaissance: Date | null;
  lieuNaissance: string | null;
  lieuNaissanceLocalityId?: string | null;
  lieuNaissanceLocalityType?: string | null;
  photoProfile: string | null;
  statut: string;
  // Nationalité / pays (jointures)
  nationaliteNom?: string | null;
  nationaliteIso2?: string | null;
  paysNaissanceNom?: string | null;
  paysNaissanceIso2?: string | null;
  paysResidenceNom?: string | null;
  paysResidenceIso2?: string | null;
  paysEmissionNom?: string | null;
  paysEmissionIso2?: string | null;
  // Champs enrichis (jointures catalogue professionnel)
  sectorNom?: string | null;
  professionNom?: string | null;
  activityTypeNom?: string | null;
  // Champs enrichis (jointures organisation)
  agenceNom?: string | null;
  agence_nom?: string | null;
  villeNom?: string | null;
  photoUrl?: string | null;
}

// Tags definition
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").default("#000000"), // Hex code
  type: text("type").default("general"), // 'status', 'risk', 'category'
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertTagSchema = createInsertSchema(tags).omit({ id: true, createdAt: true });
export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;

// Client Tags assignment
export const clientTags = pgTable("client_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  tagId: uuid("tag_id").notNull().references(() => tags.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxClientId: index("idx_client_tags_client_id").on(t.clientId),
  idxTagId: index("idx_client_tags_tag_id").on(t.tagId),
}));

export const insertClientTagSchema = createInsertSchema(clientTags).omit({ id: true, createdAt: true });
export type InsertClientTag = z.infer<typeof insertClientTagSchema>;
export type ClientTag = typeof clientTags.$inferSelect;

// Client Activities log
export const clientActivities = pgTable("client_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  type: text("type").notNull(), // 'call', 'visit', 'payment', 'update', 'alert'
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON stringified or text
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxClientId: index("idx_client_activities_client_id").on(t.clientId),
  idxClientCreatedAt: index("idx_client_activities_client_created").on(t.clientId, t.createdAt),
}));

export const insertClientActivitySchema = createInsertSchema(clientActivities).omit({ id: true, createdAt: true });
export type InsertClientActivity = z.infer<typeof insertClientActivitySchema>;
export type ClientActivity = typeof clientActivities.$inferSelect;

// Historique des points de fidélité
export const historiquePoints = pgTable("historique_points", {
  id: serial("id").primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  points: integer("points").notNull(), // Positif = gain, Négatif = dépense
  type: varchar("type").notNull(), // 'EPARGNE', 'CREDIT_REMBOURSEMENT', 'TONTINE', 'BONUS', 'DEPENSE'
  description: text("description"),
  montantAssocie: integer("montant_associe"), // Montant de la transaction qui a généré les points
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  idxClientId: index("idx_historique_points_client_id").on(t.clientId),
  idxClientCreatedAt: index("idx_historique_points_client_created").on(t.clientId, t.createdAt),
}));

export const insertHistoriquePointsSchema = createInsertSchema(historiquePoints).omit({ id: true, createdAt: true });
export type InsertHistoriquePoints = z.infer<typeof insertHistoriquePointsSchema>;
export type HistoriquePoints = typeof historiquePoints.$inferSelect;

