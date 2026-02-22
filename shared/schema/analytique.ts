import { pgTable, text, numeric, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { agences } from "./agences";
import { ecritures, lignesEcritures } from "./accounting";

// ============================================================================
// CENTRES DE COUTS (Cost Centers — Class 9)
// ============================================================================

export const centresCouts = pgTable("centres_couts", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id),
  code: text("code").notNull(),
  intitule: text("intitule").notNull(),
  typeCenter: text("type_center").default("COST"), // COST, PROFIT, INVESTMENT
  parentId: uuid("parent_id"),
  responsable: text("responsable"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_centres_couts_code").on(t.agenceId, t.code),
}));

export const insertCentreCoutSchema = createInsertSchema(centresCouts).omit({ id: true, createdAt: true });
export type InsertCentreCout = z.infer<typeof insertCentreCoutSchema>;
export type CentreCout = typeof centresCouts.$inferSelect;

// ============================================================================
// LIGNES DE PRODUITS (Product Lines)
// ============================================================================

export const lignesProduits = pgTable("lignes_produits", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id),
  code: text("code").notNull(),
  intitule: text("intitule").notNull(),
  categorie: text("categorie"), // CREDIT, EPARGNE, SERVICES, etc.
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_lignes_produits_code").on(t.agenceId, t.code),
}));

export const insertLigneProduitSchema = createInsertSchema(lignesProduits).omit({ id: true, createdAt: true });
export type InsertLigneProduit = z.infer<typeof insertLigneProduitSchema>;
export type LigneProduit = typeof lignesProduits.$inferSelect;

// ============================================================================
// CLES DE REPARTITION (Distribution Keys)
// ============================================================================

export const clesRepartition = pgTable("cles_repartition", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id),
  code: text("code").notNull(),
  intitule: text("intitule").notNull(),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_cles_repartition_code").on(t.agenceId, t.code),
}));

export const insertCleRepartitionSchema = createInsertSchema(clesRepartition).omit({ id: true, createdAt: true });
export type InsertCleRepartition = z.infer<typeof insertCleRepartitionSchema>;
export type CleRepartition = typeof clesRepartition.$inferSelect;

// ============================================================================
// CLES DE REPARTITION LIGNES (Distribution Key Lines)
// ============================================================================

export const clesRepartitionLignes = pgTable("cles_repartition_lignes", {
  id: uuid("id").primaryKey().defaultRandom(),
  cleId: uuid("cle_id").notNull().references(() => clesRepartition.id, { onDelete: "cascade" }),
  centreCoutId: uuid("centre_cout_id").notNull().references(() => centresCouts.id),
  pourcentage: numeric("pourcentage").notNull(), // 0-100
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqCleCentre: uniqueIndex("uq_cle_centre").on(t.cleId, t.centreCoutId),
}));

export const insertCleRepartitionLigneSchema = createInsertSchema(clesRepartitionLignes).omit({ id: true, createdAt: true });
export type InsertCleRepartitionLigne = z.infer<typeof insertCleRepartitionLigneSchema>;
export type CleRepartitionLigne = typeof clesRepartitionLignes.$inferSelect;

// ============================================================================
// LIGNES ANALYTIQUES (Analytical Entry Lines)
// ============================================================================

export const lignesAnalytiques = pgTable("lignes_analytiques", {
  id: uuid("id").primaryKey().defaultRandom(),
  ligneEcritureId: uuid("ligne_ecriture_id").notNull().references(() => lignesEcritures.id, { onDelete: "cascade" }),
  ecritureId: uuid("ecriture_id").notNull().references(() => ecritures.id, { onDelete: "cascade" }),
  compteAnalytique: text("compte_analytique"),
  centreCoutId: uuid("centre_cout_id").references(() => centresCouts.id),
  ligneProduitId: uuid("ligne_produit_id").references(() => lignesProduits.id),
  debit: numeric("debit").notNull().default("0"),
  credit: numeric("credit").notNull().default("0"),
  pourcentage: numeric("pourcentage").default("100"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxEcriture: index("idx_lignes_analytiques_ecriture").on(t.ecritureId),
  idxCentreCout: index("idx_lignes_analytiques_centre").on(t.centreCoutId),
  idxLigneProduit: index("idx_lignes_analytiques_produit").on(t.ligneProduitId),
}));

export const insertLigneAnalytiqueSchema = createInsertSchema(lignesAnalytiques).omit({ id: true, createdAt: true });
export type InsertLigneAnalytique = z.infer<typeof insertLigneAnalytiqueSchema>;
export type LigneAnalytique = typeof lignesAnalytiques.$inferSelect;
