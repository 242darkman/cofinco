import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, date, jsonb, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { mouvementsFinanciers } from "./finance";

// ============================================================================
// ENUMS
// ============================================================================

export const EntryStatus = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
} as const;
export type EntryStatus = typeof EntryStatus[keyof typeof EntryStatus];

export const PeriodStatus = {
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  CLOSED: "CLOSED",
  LOCKED: "LOCKED",
} as const;
export type PeriodStatus = typeof PeriodStatus[keyof typeof PeriodStatus];

export const OhadaClass = {
  CAPITAUX: 1,
  IMMOBILISATIONS: 2,
  STOCKS: 3,
  TIERS: 4,
  TRESORERIE: 5,
  CHARGES: 6,
  PRODUITS: 7,
  COMPTES_SPECIAUX: 8,
} as const;
export type OhadaClass = typeof OhadaClass[keyof typeof OhadaClass];

export const AccountType = {
  ACTIF: "Actif",
  PASSIF: "Passif",
  CHARGE: "Charge",
  PRODUIT: "Produit",
  CAPITAUX: "Capitaux",
} as const;
export type AccountType = typeof AccountType[keyof typeof AccountType];

// ============================================================================
// EXERCICE COMPTABLE (Fiscal Year)
// ============================================================================

export const exercices = pgTable("exercices_comptables", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // ex: 2024
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  statut: text("statut").notNull().default("OPEN"), // OPEN, CLOSED
  description: text("description"),
  agenceId: uuid("agence_id").references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExerciceSchema = createInsertSchema(exercices).omit({ id: true, createdAt: true });
export type InsertExercice = z.infer<typeof insertExerciceSchema>;
export type Exercice = typeof exercices.$inferSelect;

// ============================================================================
// PLAN COMPTABLE OHADA (Chart of Accounts)
// ============================================================================

export const planComptable = pgTable("plan_comptable", {
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
  agenceId: uuid("agence_id").references(() => agences.id), // NULL = global
  isSystem: boolean("is_system").default(false), // System accounts cannot be deleted
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCompteComptableSchema = createInsertSchema(planComptable).omit({ id: true, createdAt: true });
export type InsertCompteComptable = z.infer<typeof insertCompteComptableSchema>;
export type CompteComptable = typeof planComptable.$inferSelect;

// ============================================================================
// JOURNAUX COMPTABLES (Accounting Journals)
// ============================================================================

export const journaux = pgTable("journaux_comptables", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // AC, VE, BQ, OD, CAI, MMTN, MAIR...
  intitule: text("intitule").notNull(),
  typeJournal: text("type_journal").notNull(), // Achat, Vente, Trésorerie, Général
  compteContrepartie: text("compte_contrepartie"), // Si applicable
  actif: boolean("actif").default(true),
  agenceId: uuid("agence_id").references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJournalSchema = createInsertSchema(journaux).omit({ id: true, createdAt: true });
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Journal = typeof journaux.$inferSelect;

// ============================================================================
// ECRITURES COMPTABLES (Accounting Entries - Header)
// ============================================================================

export const ecritures = pgTable("ecritures_comptables", {
  id: uuid("id").primaryKey().defaultRandom(),
  exerciceId: uuid("exercice_id").references(() => exercices.id),
  journalId: uuid("journal_id").notNull().references(() => journaux.id),
  dateEcriture: date("date_ecriture").notNull(),
  numeroPiece: text("numero_piece").notNull(),
  libelle: text("libelle").notNull(),
  statut: text("statut").default("DRAFT"), // DRAFT, POSTED, REVERSED

  // Source tracking (link to business transaction)
  sourceType: text("source_type"), // MOUVEMENT, PAYMENT_INTENT, OPERATION_TERRAIN, etc.
  sourceId: uuid("source_id"), // ID of the source record
  mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id),

  // Reversal tracking
  reversalOfId: uuid("reversal_of_id"), // If this is a reversal, points to original
  reversedById: uuid("reversed_by_id"), // If this was reversed, points to reversal
  reversalReason: text("reversal_reason"),

  // Metadata for analytics (clientId, loanId, etc.)
  metadata: jsonb("metadata").default({}),

  // Multi-tenant
  agenceId: uuid("agence_id").references(() => agences.id),

  // Audit
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcritureSchema = createInsertSchema(ecritures).omit({ id: true, createdAt: true, validatedAt: true });
export type InsertEcriture = z.infer<typeof insertEcritureSchema>;
export type Ecriture = typeof ecritures.$inferSelect;

// ============================================================================
// LIGNES D'ECRITURES (Entry Lines - Detail)
// ============================================================================

export const lignesEcritures = pgTable("lignes_ecritures", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecritureId: uuid("ecriture_id").notNull().references(() => ecritures.id, { onDelete: "cascade" }),
  compteId: uuid("compte_id").notNull().references(() => planComptable.id),
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

// ============================================================================
// GL POSTING LINKS (Idempotency for Accounting Postings)
// ============================================================================

export const glPostingLinks = pgTable("gl_posting_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  ecritureId: uuid("ecriture_id").notNull().references(() => ecritures.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGlPostingLinkSchema = createInsertSchema(glPostingLinks).omit({ id: true, createdAt: true });
export type InsertGlPostingLink = z.infer<typeof insertGlPostingLinkSchema>;
export type GlPostingLink = typeof glPostingLinks.$inferSelect;

// ============================================================================
// GL PERIODS (Monthly Period Management)
// ============================================================================

export const glPeriods = pgTable("gl_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  exerciceId: uuid("exercice_id").notNull().references(() => exercices.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  name: text("name").notNull(), // e.g., "Janvier 2025"
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  statut: text("statut").notNull().default("OPEN"), // OPEN, CLOSING, CLOSED, LOCKED
  closedAt: timestamp("closed_at"),
  closedBy: uuid("closed_by").references(() => users.id),
  closureNotes: text("closure_notes"),
  totalDebits: numeric("total_debits").default("0"),
  totalCredits: numeric("total_credits").default("0"),
  entryCount: integer("entry_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGlPeriodSchema = createInsertSchema(glPeriods).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGlPeriod = z.infer<typeof insertGlPeriodSchema>;
export type GlPeriod = typeof glPeriods.$inferSelect;

// ============================================================================
// ACCOUNTING RULES (Mapping Business Events to GL Accounts)
// ============================================================================

export const accountingRules = pgTable("accounting_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id), // NULL = global rule
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull(), // MOUVEMENT, PAYMENT_INTENT, etc.
  eventType: text("event_type").notNull(), // DEPOSIT_SAVINGS, WITHDRAWAL_SAVINGS, etc.
  paymentMethod: text("payment_method"), // CASH, MOBILE_MONEY, TRANSFER (NULL = any)
  provider: text("provider"), // MTN, AIRTEL (NULL = any)
  journalCode: text("journal_code").notNull(),
  debitAccount: text("debit_account").notNull(),
  creditAccount: text("credit_account").notNull(),
  descriptionTemplate: text("description_template"),
  priority: integer("priority").default(100),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAccountingRuleSchema = createInsertSchema(accountingRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccountingRule = z.infer<typeof insertAccountingRuleSchema>;
export type AccountingRule = typeof accountingRules.$inferSelect;

// ============================================================================
// GL SEQUENCES (Piece Number Generation)
// ============================================================================

export const glSequences = pgTable("gl_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  journalCode: text("journal_code").notNull(),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGlSequenceSchema = createInsertSchema(glSequences).omit({ id: true, updatedAt: true });
export type InsertGlSequence = z.infer<typeof insertGlSequenceSchema>;
export type GlSequence = typeof glSequences.$inferSelect;

// ============================================================================
// DECLARATIONS TVA (VAT Declarations)
// ============================================================================

export const declarationsTva = pgTable("declarations_tva", {
  id: uuid("id").primaryKey().defaultRandom(),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  tvaCollectee: numeric("tva_collectee").notNull().default("0"),
  tvaDeductible: numeric("tva_deductible").notNull().default("0"),
  tvaAPayer: numeric("tva_a_payer").notNull().default("0"),
  creditTva: numeric("credit_tva").notNull().default("0"),
  statut: text("statut").notNull().default("DRAFT"), // DRAFT, VALIDATED, PAID
  numeroQuittance: text("numero_quittance"),
  dateDepot: timestamp("date_depot"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeclarationTvaSchema = createInsertSchema(declarationsTva).omit({ id: true, createdAt: true });
export type InsertDeclarationTva = z.infer<typeof insertDeclarationTvaSchema>;
export type DeclarationTva = typeof declarationsTva.$inferSelect;

// ============================================================================
// TYPES FOR POSTING SERVICE
// ============================================================================

export interface PostEntryLine {
  compteId: string;
  numeroCompte: string;
  libelle?: string;
  debit: number;
  credit: number;
  refExterne?: string;
}

export interface PostEntryRequest {
  agenceId: string;
  sourceType: string;
  sourceId: string;
  journalCode: string;
  entryDate: Date;
  description: string;
  lines: PostEntryLine[];
  metadata?: Record<string, any>;
  mouvementId?: string;
  userId?: string;
}

export interface PostEntryResult {
  ecritureId: string;
  numeroPiece: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
}

export interface GrandLivreEntry {
  id: string;
  dateEcriture: string;
  numeroPiece: string;
  journalCode: string;
  journalIntitule: string;
  ecritureLibelle: string;
  ligneLibelle: string;
  debit: number;
  credit: number;
  soldeProgressif: number;
  sourceType?: string;
  sourceId?: string;
  refExterne?: string;
}

export interface GrandLivreResponse {
  compteId: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  sensNormal: string;
  soldeOuverture: number;
  totalDebits: number;
  totalCredits: number;
  soldeFinal: number;
  entries: GrandLivreEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface BalanceEntry {
  compteId: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  sensNormal: string;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

export interface BalanceResponse {
  entries: BalanceEntry[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    totalSoldeDebiteur: number;
    totalSoldeCrediteur: number;
    isBalanced: boolean;
  };
  dateDebut: string;
  dateFin: string;
}
