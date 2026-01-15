import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { agences } from "./agences";
import { users } from "./auth";
import { employes } from "./employes";

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

  // ===== CHAMPS LEGACY (à migrer vers users) =====
  // Ces champs sont conservés temporairement pour la rétro-compatibilité
  // Ils seront supprimés après migration complète vers users
  nom: text("nom"), // LEGACY: Déplacé vers users.nom (temporairement nullable)
  prenom: text("prenom"), // LEGACY: Déplacé vers users.prenom
  email: text("email"), // LEGACY: Déplacé vers users.email
  telephone: text("telephone"), // LEGACY: Déplacé vers users.telephone
  photoUrl: text("photo_url"), // LEGACY: Déplacé vers users.photoProfile
  photoProfile: text("photo_profile"), // LEGACY: Déplacé vers users.photoProfile
  // ===== FIN CHAMPS LEGACY =====

  // Adresses
  adresse: text("adresse"),
  adresseDomicile: text("adresse_domicile"),
  lieuActivite: text("lieu_activite"),
  ville: text("ville"),
  pays: text("pays").default("République du Congo"),

  // Documents d'identité
  dateNaissance: text("date_naissance"),
  numeroPiece: text("numero_piece"),
  typePiece: text("type_piece"),

  // Situation professionnelle
  profession: text("profession"),
  employeur: text("employeur"),
  typeActivite: text("type_activite"), // Added missing column
  revenuMensuel: numeric("revenu_mensuel"),
  
  // KYC Documents
  documents: jsonb("documents"), // Stockage documents KYC et Contrats format JSON

  // Classification
  typeMarcheId: uuid("type_marche_id").references(() => typesMarches.id),
  segment: text("segment").notNull().default("Standard"), // 'Standard', 'Premium', 'VIP'
  frequenceCarte: text("frequence_carte").default("Journalier"),

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
  scoreEngagement: integer("score_engagement").default(0), // 0-100
  derniereActivite: timestamp("derniere_activite"),

  // Organisation
  agence: text("agence"), // LEGACY: Champ pour isolation par agence (nom texte)
  agenceId: uuid("agence_id").references(() => agences.id),
  agentReferentId: uuid("agent_referent_id").references(() => employes.id), // Agent commercial référent

  // Statut (LEGACY - le statut principal est dans users.statut)
  status: text("status").notNull().default("Actif"),

  // Dates
  dateAdhesion: timestamp("date_adhesion").defaultNow(),
  dateInscription: timestamp("date_inscription").defaultNow(), // LEGACY: Utiliser dateAdhesion
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

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
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

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
});

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
});

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
});

export const insertHistoriquePointsSchema = createInsertSchema(historiquePoints).omit({ id: true, createdAt: true });
export type InsertHistoriquePoints = z.infer<typeof insertHistoriquePointsSchema>;
export type HistoriquePoints = typeof historiquePoints.$inferSelect;

