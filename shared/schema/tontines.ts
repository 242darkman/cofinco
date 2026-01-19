import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { mouvementsFinanciers, comptes } from "./finance";
import { methodePaiementEnum, statutTransactionEnum } from "../enum/enums";
import { sql } from "drizzle-orm";

// Tontines
export const tontines = pgTable("tontines", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  description: text("description"),
  typeDistribution: text("type_distribution").notNull(),
  montantCotisation: numeric("montant_cotisation").notNull(),
  tauxPlateforme: numeric("taux_plateforme").notNull().default("0"),
  frequence: text("frequence").notNull(),
  intervalleCotisation: integer("intervalle_cotisation").default(1),
  delaiPenalite: integer("delai_penalite").default(2),
  dateDebut: timestamp("date_debut").notNull(),
  dateFin: timestamp("date_fin"),
  nombreMembres: integer("nombre_membres").notNull(),
  membresActuels: integer("membres_actuels").default(0),
  statut: text("statut").notNull().default("Active"),
  solde: numeric("solde").default("0"),
  prochainTour: timestamp("prochain_tour"),
  ordreDistribution: json("ordre_distribution"),
  regles: json("regles"),
  gestionnaireId: uuid("gestionnaire_id").references(() => users.id), // Gestionnaire de la tontine
  agenceId: uuid("agence_id").references(() => agences.id), // Agence de la tontine
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertTontineSchema = (createInsertSchema(tontines as any, {
  dateDebut: (schema) =>
    z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") return value;
        return value instanceof Date ? value : new Date(value as string);
      },
      schema,
    ),
  dateFin: (schema) =>
    z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") return value;
        return value instanceof Date ? value : new Date(value as string);
      },
      schema,
    ),
  prochainTour: (schema) =>
    z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") return value;
        return value instanceof Date ? value : new Date(value as string);
      },
      schema,
    ),
  montantCotisation: z.coerce.string(),
  tauxPlateforme: z.coerce.string().optional().default("0"),
  solde: z.coerce.string().optional().default("0"),
}) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertTontine = any;
export type Tontine = typeof tontines.$inferSelect;

// Membres de tontine
export const membresTontine = pgTable("membres_tontine", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  dateAdhesion: timestamp("date_adhesion").defaultNow(),
  statut: text("statut").notNull().default("Actif"),
  totalCotisations: numeric("total_cotisations").default("0"),
  totalRecus: numeric("total_recus").default("0"),
  position: integer("position"),
  aRecuBenefice: boolean("a_recu_benefice").default(false),
  dateBenefice: timestamp("date_benefice"),
  
  // Cotisation Automatique
  cotisationAutomatique: boolean("cotisation_automatique").notNull().default(false),
  cotisationCompteId: uuid("cotisation_compte_id").references(() => comptes.id), // Optionnel
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertMembreTontineSchema = (createInsertSchema(membresTontine) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertMembreTontine = any;
export type MembreTontine = typeof membresTontine.$inferSelect;

// Contributions tontine
export const contributionsTontine = pgTable(
  "contributions_tontine",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    tontineId: uuid("tontine_id").notNull(), // FK si tu as une table tontines
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    typeOperation: text("type_operation").notNull(), // "Versement" | "Retrait" (ou enum si tu veux)
    montant: numeric("montant").notNull(),
    tourNumero: integer("tour_numero").default(1),

    methodePaiement: methodePaiementEnum("methode_paiement").notNull().default("Espèces"),
    statutTransaction: statutTransactionEnum("statut_transaction").notNull().default("Posté"),

    reference: text("reference").notNull(),
    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    // Statut de la contribution : FULL = cotisation complète, PARTIAL = paiement partiel
    statutContribution: text("statut_contribution").default("FULL"), // 'FULL' | 'PARTIAL'

    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (t) => ({
    idxTontineDate: index("idx_contributions_tontine_tontine_date").on(t.tontineId, t.createdAt),
    idxMvt: index("idx_contributions_tontine_mouvement").on(t.mouvementId),
    uqIdempotency: uniqueIndex("uq_contributions_tontine_idempotency").on(t.idempotencyKey),
    uqRefExt: uniqueIndex("uq_contributions_tontine_reference_externe").on(t.referenceExterne),
    chkMontantPos: sql`CONSTRAINT chk_contributions_tontine_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export const insertContributionTontineSchema = (createInsertSchema(contributionsTontine as any, {
  montant: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertContributionTontine = any;
export type ContributionTontine = typeof contributionsTontine.$inferSelect;

// Tontine Règles (added from previous session context)
export const tontineRegles = pgTable("tontine_regles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  typeRegle: text("type_regle").notNull(), // 'retard', 'absence', 'defaut'
  montantPenalite: numeric("montant_penalite").notNull(),
  description: text("description"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertTontineRegleSchema = (createInsertSchema(tontineRegles as any, {
  montantPenalite: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true });
export type InsertTontineRegle = any;
export type TontineRegle = typeof tontineRegles.$inferSelect;

// Tontine Pénalités
export const tontinePenalites = pgTable("tontine_penalites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").notNull().references(() => membresTontine.id),
  regleId: uuid("regle_id").references(() => tontineRegles.id),
  montant: numeric("montant").notNull(),
  dateFaute: timestamp("date_faute").defaultNow(),
  statut: text("statut").default("impaye"), // 'impaye', 'paye', 'annule'
  datePaiement: timestamp("date_paiement"),
  motif: text("motif"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});
export const insertTontinePenaliteSchema = (createInsertSchema(tontinePenalites as any, {
  montant: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertTontinePenalite = any;
export type TontinePenalite = typeof tontinePenalites.$inferSelect;

// Tontine Distributions
export const tontineDistributions = pgTable("tontine_distributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").notNull().references(() => membresTontine.id),
  tourNumero: integer("tour_numero").notNull(),
  montantTotal: numeric("montant_total").notNull(),
  dateDistribution: timestamp("date_distribution").defaultNow(),
  modePaiement: text("mode_paiement").default("ESPECES"),
  referencePaiement: text("reference_paiement"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});
export const insertTontineDistributionSchema = (createInsertSchema(tontineDistributions as any, {
  montantTotal: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertTontineDistribution = any;
export type TontineDistribution = typeof tontineDistributions.$inferSelect;

// Tontine Alertes
export const tontineAlertes = pgTable("tontine_alertes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").references(() => membresTontine.id),
  typeAlerte: text("type_alerte").notNull(),
  priorite: text("priorite").notNull().default("Normale"),
  message: text("message").notNull(),
  statut: text("statut").notNull().default("Active"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTontineAlerteSchema = (createInsertSchema(tontineAlertes) as any).omit({ id: true, createdAt: true });
export type InsertTontineAlerte = any;
export type TontineAlerte = typeof tontineAlertes.$inferSelect;
// Tontine Plans (Presets)
export const tontinePlans = pgTable("tontine_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  description: text("description"),
  montantCotisation: numeric("montant_cotisation").notNull(),
  nombreMembres: integer("nombre_membres").notNull(),
  frequence: text("frequence").notNull(),
  typeDistribution: text("type_distribution").notNull(),
  tauxPlateforme: numeric("taux_plateforme").notNull().default("0"),
  intervalleCotisation: integer("intervalle_cotisation").default(1),
  agenceId: uuid("agence_id").references(() => agences.id),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTontinePlanSchema = (createInsertSchema(tontinePlans as any, {
  montantCotisation: z.coerce.string(),
  tauxPlateforme: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTontinePlan = any;
export type TontinePlan = typeof tontinePlans.$inferSelect;
