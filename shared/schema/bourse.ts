import { pgTable, text, integer, numeric, boolean, timestamp, uuid, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./clients";
import { users } from "./auth"; // For loge/documents if needed

// Documents / Fichiers de la Loge
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  description: text("description"),
  type: text("type").notNull(), // 'dossier', 'fichier'
  mimeType: text("mime_type"),
  taille: integer("taille"), 
  chemin: text("chemin").notNull(), 
  objectPath: text("object_path"), 
  parentId: uuid("parent_id"), 
  categorie: text("categorie").notNull().default("GENERAL"), 
  referenceId: uuid("reference_id"), 
  referenceType: text("reference_type"), 
  visibilite: text("visibilite").notNull().default("prive"), 
  tags: text("tags").array(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Paramètres de la Loge
export const logeSettings = pgTable("loge_settings", {
  id: integer("id").primaryKey().default(1),
  quotaTotal: bigint("quota_total", { mode: "number" }).default(4398046511104), 
  quotaUtilise: bigint("quota_utilise", { mode: "number" }).default(0),
  retentionJours: integer("retention_jours").default(365), 
  sauvegardeAuto: boolean("sauvegarde_auto").default(true),
  frequenceSauvegarde: text("frequence_sauvegarde").default("DAILY"),
  compressionEnabled: boolean("compression_enabled").default(true),
  encryptionEnabled: boolean("encryption_enabled").default(true),
  logePasswordRequired: boolean("loge_password_required").default(true), 
  archivageAutoExports: boolean("archivage_auto_exports").default(true), 
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLogeSettingsSchema = createInsertSchema(logeSettings).omit({ updatedAt: true });
export type InsertLogeSettings = z.infer<typeof insertLogeSettingsSchema>;
export type LogeSettings = typeof logeSettings.$inferSelect;

// Portefeuilles Bourse
export const portefeuillesBourse = pgTable("portefeuilles_bourse", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  nom: text("nom").notNull().default("Mon Portefeuille"),
  devise: text("devise").notNull().default("XAF"),
  soldeDisponible: numeric("solde_disponible").notNull().default("0"),
  valeurTotale: numeric("valeur_totale").notNull().default("0"),
  gainPerte: numeric("gain_perte").notNull().default("0"),
  gainPertePercent: numeric("gain_perte_percent").notNull().default("0"),
  statut: text("statut").notNull().default("ACTIVE"), 
  profilRisque: text("profil_risque").default("modere"), 
  objectifInvestissement: text("objectif_investissement"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPortefeuilleBourseSchema = createInsertSchema(portefeuillesBourse).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPortefeuilleBourse = z.infer<typeof insertPortefeuilleBourseSchema>;
export type PortefeuilleBourse = typeof portefeuillesBourse.$inferSelect;

// Positions Bourse
export const positionsBourse = pgTable("positions_bourse", {
  id: uuid("id").primaryKey().defaultRandom(),
  portefeuilleId: uuid("portefeuille_id").references(() => portefeuillesBourse.id).notNull(),
  symbole: text("symbole").notNull(), 
  nom: text("nom").notNull(),
  quantite: numeric("quantite").notNull(),
  prixAchatMoyen: numeric("prix_achat_moyen").notNull(),
  prixActuel: numeric("prix_actuel").notNull().default("0"),
  valeurActuelle: numeric("valeur_actuelle").notNull().default("0"),
  gainPerte: numeric("gain_perte").notNull().default("0"),
  gainPertePercent: numeric("gain_perte_percent").notNull().default("0"),
  devise: text("devise").notNull().default("USD"),
  marche: text("marche").default("NYSE"), 
  secteur: text("secteur"),
  datePremiereAchat: timestamp("date_premiere_achat").defaultNow(),
  derniereMiseAJour: timestamp("derniere_mise_a_jour").defaultNow(),
});

export const insertPositionBourseSchema = createInsertSchema(positionsBourse).omit({ id: true });
export type InsertPositionBourse = z.infer<typeof insertPositionBourseSchema>;
export type PositionBourse = typeof positionsBourse.$inferSelect;

// Ordres Bourse
export const ordresBourse = pgTable("ordres_bourse", {
  id: uuid("id").primaryKey().defaultRandom(),
  portefeuilleId: uuid("portefeuille_id").references(() => portefeuillesBourse.id).notNull(),
  type: text("type").notNull(), 
  typeOrdre: text("type_ordre").notNull().default("MARKET"), 
  symbole: text("symbole").notNull(),
  nom: text("nom").notNull(),
  quantite: numeric("quantite").notNull(),
  prixLimite: numeric("prix_limite"),
  prixStop: numeric("prix_stop"),
  prixExecution: numeric("prix_execution"),
  montantTotal: numeric("montant_total"),
  frais: numeric("frais").default("0"),
  devise: text("devise").notNull().default("USD"),
  statut: text("statut").notNull().default("PENDING"), 
  motifAnnulation: text("motif_annulation"),
  dateExpiration: timestamp("date_expiration"),
  executionPartielle: boolean("execution_partielle").default(false),
  quantiteExecutee: numeric("quantite_executee").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  executedAt: timestamp("executed_at"),
});

export const insertOrdreBourseSchema = createInsertSchema(ordresBourse).omit({ id: true, createdAt: true });
export type InsertOrdreBourse = z.infer<typeof insertOrdreBourseSchema>;
export type OrdreBourse = typeof ordresBourse.$inferSelect;

// Transactions Bourse
export const transactionsBourse = pgTable("transactions_bourse", {
  id: uuid("id").primaryKey().defaultRandom(),
  portefeuilleId: uuid("portefeuille_id").references(() => portefeuillesBourse.id).notNull(),
  ordreId: uuid("ordre_id").references(() => ordresBourse.id),
  type: text("type").notNull(),
  symbole: text("symbole"),
  quantite: numeric("quantite"),
  prix: numeric("prix"),
  montant: numeric("montant").notNull(),
  frais: numeric("frais").default("0"),
  devise: text("devise").notNull().default("XAF"),
  tauxChange: numeric("taux_change").default("1"),
  description: text("description"),
  reference: text("reference"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransactionBourseSchema = createInsertSchema(transactionsBourse).omit({ id: true, createdAt: true });
export type InsertTransactionBourse = z.infer<typeof insertTransactionBourseSchema>;
export type TransactionBourse = typeof transactionsBourse.$inferSelect;

// Watchlist Bourse
export const watchlistBourse = pgTable("watchlist_bourse", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  symbole: text("symbole").notNull(),
  nom: text("nom").notNull(),
  marche: text("marche").default("NYSE"),
  alertePrixHaut: numeric("alerte_prix_haut"),
  alertePrixBas: numeric("alerte_prix_bas"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWatchlistBourseSchema = createInsertSchema(watchlistBourse).omit({ id: true, createdAt: true });
export type InsertWatchlistBourse = z.infer<typeof insertWatchlistBourseSchema>;
export type WatchlistBourse = typeof watchlistBourse.$inferSelect;
