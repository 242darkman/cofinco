import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, serial, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { agences } from "./agences";
import { users } from "./auth";
import { employes } from "./employes";

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

// Types de marchés commerciaux
export const typesMarches = pgTable("types_marches", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull().unique(),
  description: text("description"),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTypeMarcheSchema = createInsertSchema(typesMarches).omit({ id: true, createdAt: true });
export type InsertTypeMarche = z.infer<typeof insertTypeMarcheSchema>;
export type TypeMarche = typeof typesMarches.$inferSelect;

/**
 * Table Clients - Données métier client
 * Liée à la table users pour l'identité commune
 * Les champs nom, prenom, email, telephone, photoProfile sont dans users
 */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Lien vers la table users (source de vérité pour l'identité)
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

  // Adresses
  adresseDomicile: text("adresse_domicile"),
  lieuActivite: text("lieu_activite"),
  ville: text("ville"),
  villeId: uuid("ville_id"), // FK to villes table (nullable for backward compat)
  pays: text("pays").default("République du Congo"),

  // Documents d'identité
  dateNaissance: text("date_naissance"),
  numeroPiece: text("numero_piece"),
  typePiece: text("type_piece"),

  // Situation professionnelle
  profession: text("profession"),
  employeur: text("employeur"),
  typeActivite: text("type_activite"),
  revenuMensuel: numeric("revenu_mensuel"),
  revenuJournalier: numeric("revenu_journalier"),
  typeRevenu: text("type_revenu").default("Mensuel"), // 'Mensuel' | 'Journalier'

  // KYC Documents
  documents: jsonb("documents"),

  // Classification
  typeMarcheId: uuid("type_marche_id").references(() => typesMarches.id),
  segment: text("segment").notNull().default("STANDARD"),
  frequenceCarte: text("frequence_carte").default("DAILY"),

  // Géolocalisation
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),

  // Scoring & Limites
  score: integer("score").default(50),
  creditTotal: numeric("credit_total").default("0"),
  epargneTotal: numeric("epargne_total").default("0"),
  tauxRemboursement: numeric("taux_remboursement").default("100"),
  limiteRetraitJournalier: numeric("limite_retrait_journalier").default("2000000"),
  limiteRetraitHebdomadaire: numeric("limite_retrait_hebdomadaire").default("10000000"),
  limiteRetraitMensuel: numeric("limite_retrait_mensuel").default("30000000"),

  // Fidélité & Engagement
  pointsFidelite: integer("points_fidelite").default(0),
  scoreEngagement: integer("score_engagement").default(0),
  derniereActivite: timestamp("derniere_activite"),

  // Origine et prospection
  clientOrigin: text("client_origin").notNull().default("OTHER"), // FIELD_PROSPECTION, WALK_IN_AGENCY, REFERRAL, CAMPAIGN, OTHER
  prospectId: uuid("prospect_id"), // Soft FK to prospections (cross-schema, enforced in application)

  // Organisation
  agenceId: uuid("agence_id").references(() => agences.id),
  agentReferentId: uuid("agent_referent_id").references(() => employes.id), // Agent commercial référent

  // Dates
  dateAdhesion: timestamp("date_adhesion").defaultNow(),
  dateInscription: timestamp("date_inscription").defaultNow(), // LEGACY: Utiliser dateAdhesion
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
}, (t) => ({
  // P1.2: Performance indexes for frequently queried columns
  idxUserId: index("idx_clients_user_id").on(t.userId),
  idxAgenceId: index("idx_clients_agence_id").on(t.agenceId),
  idxAgentReferent: index("idx_clients_agent_referent_id").on(t.agentReferentId),
  idxDeletedAt: index("idx_clients_deleted_at").on(t.deletedAt),
  // Composite indexes for common query patterns
  idxAgenceSegment: index("idx_clients_agence_segment").on(t.agenceId, t.segment),
  idxAgenceCreatedAt: index("idx_clients_agence_created_at").on(t.agenceId, t.createdAt),
  // Prospection origin indexes
  idxClientOrigin: index("idx_clients_client_origin").on(t.clientOrigin),
  idxProspectId: index("idx_clients_prospect_id").on(t.prospectId),
}));

export const insertClientSchema = createInsertSchema(clients, {
  creditTotal: (schema) =>
    z.preprocess(
      (value) => (value === undefined || value === null || value === "" ? undefined : String(value)),
      schema,
    ),
  epargneTotal: (schema) =>
    z.preprocess(
      (value) => (value === undefined || value === null || value === "" ? undefined : String(value)),
      schema,
    ),
  tauxRemboursement: (schema) =>
    z.preprocess(
      (value) => (value === undefined || value === null || value === "" ? undefined : String(value)),
      schema,
    ),
  dateInscription: (schema) =>
    z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") {
          return undefined;
        }
        return value instanceof Date ? value : new Date(value as string);
      },
      schema,
    ),
  // Validate documents as an array of ClientDocument objects
  documents: () => clientDocumentsArraySchema,
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
  photoProfile: string | null;
  statut: string;
  // Champs enrichis (jointures)
  type_marche_nom?: string | null;
  agenceNom?: string | null;
  agence_nom?: string | null;
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

