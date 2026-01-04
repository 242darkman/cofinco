import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";

// Exercice Comptable
export const exercices = pgTable("exercices_comptables", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // ex: 2024
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  statut: text("statut").notNull().default("Ouvert"), // Ouvert, Clôturé
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExerciceSchema = createInsertSchema(exercices).omit({ id: true, createdAt: true });
export type InsertExercice = z.infer<typeof insertExerciceSchema>;
export type Exercice = typeof exercices.$inferSelect;

// Plan Comptable OHADA
export const comptes = pgTable("plan_comptable", {
  id: uuid("id").primaryKey().defaultRandom(),
  numeroCompte: text("numero_compte").notNull().unique(),
  intitule: text("intitule").notNull(),
  classe: integer("classe").notNull(), // 1 à 9
  typeCompte: text("type_compte").notNull(), // Actif, Passif, Charge, Produit, Capitaux
  sensNormal: text("sens_normal"), // Débit, Crédit
  niveau: integer("niveau").default(1),
  parentCompte: text("parent_compte"), // Pour hiérarchie
  reportANouveau: boolean("report_a_nouveau").default(false),
  actif: boolean("actif").default(true),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCompteSchema = createInsertSchema(comptes).omit({ id: true, createdAt: true });
export type InsertCompte = z.infer<typeof insertCompteSchema>;
export type Compte = typeof comptes.$inferSelect;

// Journaux Comptables
export const journaux = pgTable("journaux_comptables", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // AC, VE, BQ, OD...
  intitule: text("intitule").notNull(),
  typeJournal: text("type_journal").notNull(), // Achat, Vente, Trésorerie, Général
  compteContrepartie: text("compte_contrepartie"), // Si applicable
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJournalSchema = createInsertSchema(journaux).omit({ id: true, createdAt: true });
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Journal = typeof journaux.$inferSelect;

// Ecritures Comptables (Header)
export const ecritures = pgTable("ecritures_comptables", {
  id: uuid("id").primaryKey().defaultRandom(),
  exerciceId: uuid("exercice_id").references(() => exercices.id),
  journalId: uuid("journal_id").notNull().references(() => journaux.id),
  dateEcriture: date("date_ecriture").notNull(),
  numeroPiece: text("numero_piece").notNull(),
  libelle: text("libelle").notNull(),
  statut: text("statut").default("Brouillon"), // Brouillon, Validé
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcritureSchema = createInsertSchema(ecritures).omit({ id: true, createdAt: true, validatedAt: true });
export type InsertEcriture = z.infer<typeof insertEcritureSchema>;
export type Ecriture = typeof ecritures.$inferSelect;

// Lignes d'Écritures (Details)
export const lignesEcritures = pgTable("lignes_ecritures", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecritureId: uuid("ecriture_id").notNull().references(() => ecritures.id, { onDelete: "cascade" }),
  compteId: uuid("compte_id").notNull().references(() => comptes.id),
  numeroCompte: text("numero_compte").notNull(), // Denormalized for speed
  libelle: text("libelle"),
  debit: numeric("debit").notNull().default("0"),
  credit: numeric("credit").notNull().default("0"),
  refExterne: text("ref_externe"), // ID transaction, facture etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLigneEcritureSchema = createInsertSchema(lignesEcritures).omit({ id: true, createdAt: true });
export type InsertLigneEcriture = z.infer<typeof insertLigneEcritureSchema>;
export type LigneEcriture = typeof lignesEcritures.$inferSelect;

// Déclarations TVA
export const declarationsTva = pgTable("declarations_tva", {
  id: uuid("id").primaryKey().defaultRandom(),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  tvaCollectee: numeric("tva_collectee").notNull().default("0"),
  tvaDeductible: numeric("tva_deductible").notNull().default("0"),
  tvaAPayer: numeric("tva_a_payer").notNull().default("0"),
  creditTva: numeric("credit_tva").notNull().default("0"),
  statut: text("statut").notNull().default("Brouillon"), // Brouillon, Validé, Payé
  numeroQuittance: text("numero_quittance"),
  dateDepot: timestamp("date_depot"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeclarationTvaSchema = createInsertSchema(declarationsTva).omit({ id: true, createdAt: true });
export type InsertDeclarationTva = z.infer<typeof insertDeclarationTvaSchema>;
export type DeclarationTva = typeof declarationsTva.$inferSelect;
