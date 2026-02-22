import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, date, jsonb, check, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { mouvementsFinanciers, credits } from "./finance";

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

  // Multi-tenant (obligatoire pour la réconciliation par agence)
  agenceId: uuid("agence_id").notNull().references(() => agences.id),

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

  // Lettrage (rapprochement comptes tiers)
  lettrageKey: text("lettrage_key"),
  lettrageDate: date("lettrage_date"),
  lettrageUserId: uuid("lettrage_user_id").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxLettrage: index("idx_lignes_ecritures_lettrage").on(t.lettrageKey, t.numeroCompte),
}));

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
  mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
  status: text("status").notNull().default("POSTED"), // POSTED | FAILED
  attempts: integer("attempts").notNull().default(1),
  lastAttemptAt: timestamp("last_attempt_at").defaultNow(),
  nextRetryAt: timestamp("next_retry_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uqSource: uniqueIndex("uq_gl_posting_links_source").on(t.agenceId, t.sourceType, t.sourceId),
  idxMouvement: index("idx_gl_posting_links_mouvement").on(t.mouvementId),
  idxStatus: index("idx_gl_posting_links_status").on(t.status),
}));

export const insertGlPostingLinkSchema = createInsertSchema(glPostingLinks).omit({ id: true, createdAt: true, lastAttemptAt: true });
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
}, (t) => ({
  // Required for get_next_piece_number function's ON CONFLICT clause
  uqSequence: uniqueIndex("uq_gl_sequences").on(t.agenceId, t.journalCode, t.year),
}));

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

// ============================================================================
// BAREME PROVISIONS (COBAC Provisioning Scale)
// ============================================================================

export const ProvisionCategorie = {
  SAIN: "SAIN",
  PRE_DOUTEUX: "PRE_DOUTEUX",
  DOUTEUX: "DOUTEUX",
  COMPROMIS: "COMPROMIS",
} as const;
export type ProvisionCategorie = typeof ProvisionCategorie[keyof typeof ProvisionCategorie];

export const baremeProvisions = pgTable("bareme_provisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id), // NULL = global
  joursRetardMin: integer("jours_retard_min").notNull(),
  joursRetardMax: integer("jours_retard_max"), // NULL = infinity
  tauxProvision: numeric("taux_provision").notNull(), // 0, 25, 50, 100
  categorie: text("categorie").notNull(), // SAIN, PRE_DOUTEUX, DOUTEUX, COMPROMIS
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBaremeProvisionSchema = createInsertSchema(baremeProvisions).omit({ id: true, createdAt: true });
export type InsertBaremeProvision = z.infer<typeof insertBaremeProvisionSchema>;
export type BaremeProvision = typeof baremeProvisions.$inferSelect;

// ============================================================================
// PROVISIONS CREDITS (Credit Provision History)
// ============================================================================

export const provisionsCredits = pgTable("provisions_credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  creditId: uuid("credit_id").notNull().references(() => credits.id),
  exerciceId: uuid("exercice_id").notNull().references(() => exercices.id),
  periodeDate: date("periode_date").notNull(),
  soldeRestant: numeric("solde_restant").notNull(),
  joursRetard: integer("jours_retard").notNull(),
  categorie: text("categorie").notNull(),
  tauxProvision: numeric("taux_provision").notNull(),
  montantProvision: numeric("montant_provision").notNull(),
  provisionPrecedente: numeric("provision_precedente").notNull().default("0"),
  dotation: numeric("dotation").notNull().default("0"),
  reprise: numeric("reprise").notNull().default("0"),
  ecritureId: uuid("ecriture_id").references(() => ecritures.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqCreditPeriode: uniqueIndex("uq_provision_credit_periode").on(t.creditId, t.periodeDate),
  idxAgencePeriode: index("idx_provisions_agence_periode").on(t.agenceId, t.periodeDate),
}));

export const insertProvisionCreditSchema = createInsertSchema(provisionsCredits).omit({ id: true, createdAt: true });
export type InsertProvisionCredit = z.infer<typeof insertProvisionCreditSchema>;
export type ProvisionCredit = typeof provisionsCredits.$inferSelect;

// ============================================================================
// EXERCICE CLOTURE STEPS (Fiscal Year Closing Workflow)
// ============================================================================

export const ClotureStep = {
  CLOSE_PERIODS: "CLOSE_PERIODS",
  CALC_PROVISIONS: "CALC_PROVISIONS",
  GENERATE_RESULT: "GENERATE_RESULT",
  GENERATE_RAN: "GENERATE_RAN",
  LOCK: "LOCK",
} as const;
export type ClotureStep = typeof ClotureStep[keyof typeof ClotureStep];

export const ClotureStepStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  DONE: "DONE",
  ERROR: "ERROR",
} as const;
export type ClotureStepStatus = typeof ClotureStepStatus[keyof typeof ClotureStepStatus];

export const exerciceClotureSteps = pgTable("exercice_cloture_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  exerciceId: uuid("exercice_id").notNull().references(() => exercices.id),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  step: text("step").notNull(),
  statut: text("statut").notNull().default("PENDING"),
  details: jsonb("details"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxExerciceStep: index("idx_cloture_exercice_step").on(t.exerciceId, t.step),
}));

export const insertExerciceClotureStepSchema = createInsertSchema(exerciceClotureSteps).omit({ id: true, createdAt: true });
export type InsertExerciceClotureStep = z.infer<typeof insertExerciceClotureStepSchema>;
export type ExerciceClotureStep = typeof exerciceClotureSteps.$inferSelect;

// ============================================================================
// RAPPROCHEMENT BANCAIRE (Bank Reconciliation)
// ============================================================================

export const RapprochementStatut = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
export type RapprochementStatut = typeof RapprochementStatut[keyof typeof RapprochementStatut];

export const MatchStatus = {
  MATCHED: "MATCHED",
  UNMATCHED: "UNMATCHED",
  DISCREPANCY: "DISCREPANCY",
} as const;
export type MatchStatus = typeof MatchStatus[keyof typeof MatchStatus];

export const rapprochementsBancaires = pgTable("rapprochements_bancaires", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  compteGl: text("compte_gl").notNull(), // "512" or sub-account
  period: text("period").notNull(), // "2025-01"
  soldeBanqueDebut: numeric("solde_banque_debut").notNull().default("0"),
  soldeBanqueFin: numeric("solde_banque_fin").notNull().default("0"),
  soldeGlDebut: numeric("solde_gl_debut").notNull().default("0"),
  soldeGlFin: numeric("solde_gl_fin").notNull().default("0"),
  ecart: numeric("ecart").notNull().default("0"),
  totalMatched: numeric("total_matched").notNull().default("0"),
  totalUnmatched: numeric("total_unmatched").notNull().default("0"),
  matchedCount: integer("matched_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  statut: text("statut").notNull().default("DRAFT"),
  importFileName: text("import_file_name"),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqAgencePeriod: uniqueIndex("uq_rapprochement_agence_period").on(t.agenceId, t.compteGl, t.period),
}));

export const insertRapprochementBancaireSchema = createInsertSchema(rapprochementsBancaires).omit({ id: true, createdAt: true });
export type InsertRapprochementBancaire = z.infer<typeof insertRapprochementBancaireSchema>;
export type RapprochementBancaire = typeof rapprochementsBancaires.$inferSelect;

export const rapprochementLignes = pgTable("rapprochement_lignes", {
  id: uuid("id").primaryKey().defaultRandom(),
  rapprochementId: uuid("rapprochement_id").notNull().references(() => rapprochementsBancaires.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // "GL" or "BANK"
  reference: text("reference"), // Numéro pièce (GL) or ref bancaire
  libelle: text("libelle"),
  debit: numeric("debit").notNull().default("0"),
  credit: numeric("credit").notNull().default("0"),
  dateValeur: date("date_valeur"),
  matchStatus: text("match_status").notNull().default("UNMATCHED"),
  matchedWithId: uuid("matched_with_id"), // ID of the matched counterpart line
  ecart: numeric("ecart").default("0"),
  ecritureId: uuid("ecriture_id"), // Link to GL entry (for GL-sourced lines)
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxRapprochement: index("idx_rapprochement_lignes_session").on(t.rapprochementId),
  idxMatchStatus: index("idx_rapprochement_lignes_match").on(t.matchStatus),
}));

export const insertRapprochementLigneSchema = createInsertSchema(rapprochementLignes).omit({ id: true, createdAt: true });
export type InsertRapprochementLigne = z.infer<typeof insertRapprochementLigneSchema>;
export type RapprochementLigne = typeof rapprochementLignes.$inferSelect;

// ============================================================================
// IMMOBILISATIONS (Fixed Assets Register)
// ============================================================================

export const AmortissementMethode = {
  LINEAIRE: "LINEAIRE",
  DEGRESSIF: "DEGRESSIF",
} as const;
export type AmortissementMethode = typeof AmortissementMethode[keyof typeof AmortissementMethode];

export const ImmobilisationStatut = {
  ACTIVE: "ACTIVE",
  FULLY_DEPRECIATED: "FULLY_DEPRECIATED",
  DISPOSED: "DISPOSED",
} as const;
export type ImmobilisationStatut = typeof ImmobilisationStatut[keyof typeof ImmobilisationStatut];

export const immobilisations = pgTable("immobilisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  code: text("code").notNull(), // Numéro d'inventaire
  designation: text("designation").notNull(),
  categorie: text("categorie").notNull(), // INCORPOREL, TERRAIN, BATIMENT, MATERIEL, MOBILIER, INFORMATIQUE, TRANSPORT
  compteImmobilisation: text("compte_immobilisation").notNull(), // 21, 22, 23, 24...
  compteAmortissement: text("compte_amortissement").notNull(), // 281, 282, 283, 284...
  dateAcquisition: date("date_acquisition").notNull(),
  dateMiseEnService: date("date_mise_en_service"),
  valeurAcquisition: numeric("valeur_acquisition").notNull(),
  valeurResiduelle: numeric("valeur_residuelle").notNull().default("0"),
  dureeAmortissementMois: integer("duree_amortissement_mois").notNull(),
  methodeAmortissement: text("methode_amortissement").notNull().default("LINEAIRE"),
  tauxAmortissement: numeric("taux_amortissement"), // Auto-calculated if null
  cumulAmortissements: numeric("cumul_amortissements").notNull().default("0"),
  valeurNetteComptable: numeric("valeur_nette_comptable").notNull(), // = valeurAcquisition - cumulAmortissements
  statut: text("statut").notNull().default("ACTIVE"),
  dateCession: date("date_cession"),
  prixCession: numeric("prix_cession"),
  fournisseur: text("fournisseur"),
  numeroFacture: text("numero_facture"),
  localisation: text("localisation"),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_immobilisation_code").on(t.agenceId, t.code),
  idxCategorie: index("idx_immobilisations_categorie").on(t.categorie),
  idxStatut: index("idx_immobilisations_statut").on(t.statut),
}));

export const insertImmobilisationSchema = createInsertSchema(immobilisations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImmobilisation = z.infer<typeof insertImmobilisationSchema>;
export type Immobilisation = typeof immobilisations.$inferSelect;

// ============================================================================
// AMORTISSEMENTS (Depreciation History)
// ============================================================================

export const amortissements = pgTable("amortissements", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  immobilisationId: uuid("immobilisation_id").notNull().references(() => immobilisations.id),
  exerciceId: uuid("exercice_id").notNull().references(() => exercices.id),
  periodeDate: date("periode_date").notNull(), // Date du calcul (fin de mois)
  baseAmortissable: numeric("base_amortissable").notNull(), // valeurAcquisition - valeurResiduelle
  tauxApplique: numeric("taux_applique").notNull(),
  montantDotation: numeric("montant_dotation").notNull(),
  cumulAvant: numeric("cumul_avant").notNull(),
  cumulApres: numeric("cumul_apres").notNull(),
  valeurNetteComptable: numeric("valeur_nette_comptable").notNull(),
  ecritureId: uuid("ecriture_id").references(() => ecritures.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqImmoPeriode: uniqueIndex("uq_amortissement_immo_periode").on(t.immobilisationId, t.periodeDate),
  idxAgencePeriode: index("idx_amortissements_agence_periode").on(t.agenceId, t.periodeDate),
}));

export const insertAmortissementSchema = createInsertSchema(amortissements).omit({ id: true, createdAt: true });
export type InsertAmortissement = z.infer<typeof insertAmortissementSchema>;
export type Amortissement = typeof amortissements.$inferSelect;

// ============================================================================
// RATIOS PRUDENTIELS COBAC (Prudential Ratio Snapshots)
// ============================================================================

export const ratiosPrudentiels = pgTable("ratios_prudentiels", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  exerciceId: uuid("exercice_id").references(() => exercices.id),
  periodeDate: date("periode_date").notNull(),

  // Core COBAC ratios
  roe: numeric("roe"),
  roa: numeric("roa"),
  ratioSolvabilite: numeric("ratio_solvabilite"),
  ratioLiquidite: numeric("ratio_liquidite"),
  coeffExploitation: numeric("coeff_exploitation"),

  // PAR metrics
  par30: numeric("par30"),
  par60: numeric("par60"),
  par90: numeric("par90"),
  tauxRecouvrement: numeric("taux_recouvrement"),
  tauxDefaut: numeric("taux_defaut"),

  // Underlying values
  resultatNet: numeric("resultat_net"),
  capitauxPropres: numeric("capitaux_propres"),
  totalActif: numeric("total_actif"),
  fondsPropres: numeric("fonds_propres"),
  encoursPondere: numeric("encours_pondere"),
  actifsLiquides: numeric("actifs_liquides"),
  passifsCt: numeric("passifs_ct"),
  chargesExploitation: numeric("charges_exploitation"),
  pnb: numeric("pnb"),

  // Alerts
  alerts: jsonb("alerts").default([]),

  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: uuid("generated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqAgencePeriode: uniqueIndex("uq_ratios_prudentiels_periode").on(t.agenceId, t.periodeDate),
  idxPeriode: index("idx_ratios_prudentiels_date").on(t.periodeDate),
}));

export const insertRatioPrudentielSchema = createInsertSchema(ratiosPrudentiels).omit({ id: true, createdAt: true, generatedAt: true });
export type InsertRatioPrudentiel = z.infer<typeof insertRatioPrudentielSchema>;
export type RatioPrudentiel = typeof ratiosPrudentiels.$inferSelect;

// ============================================================================
// COBAC SEUILS (Regulatory Thresholds)
// ============================================================================

export const cobacSeuils = pgTable("cobac_seuils", {
  id: uuid("id").primaryKey().defaultRandom(),
  ratioCode: text("ratio_code").notNull().unique(),
  libelle: text("libelle").notNull(),
  seuilMinimum: numeric("seuil_minimum"),
  seuilWarning: numeric("seuil_warning"),
  seuilMaximum: numeric("seuil_maximum"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCobacSeuilSchema = createInsertSchema(cobacSeuils).omit({ id: true, createdAt: true });
export type InsertCobacSeuil = z.infer<typeof insertCobacSeuilSchema>;
export type CobacSeuil = typeof cobacSeuils.$inferSelect;

// ============================================================================
// DECLARATIONS DSF (Déclaration Statistique et Fiscale)
// ============================================================================

export const DsfStatut = {
  DRAFT: "DRAFT",
  GENERATED: "GENERATED",
  VALIDATED: "VALIDATED",
  SUBMITTED: "SUBMITTED",
} as const;
export type DsfStatut = typeof DsfStatut[keyof typeof DsfStatut];

export const declarationsDsf = pgTable("declarations_dsf", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  exerciceId: uuid("exercice_id").notNull().references(() => exercices.id),
  annee: integer("annee").notNull(),

  statut: text("statut").notNull().default("DRAFT"),

  tableaux: jsonb("tableaux").notNull().default({}),

  totalActif: numeric("total_actif"),
  totalPassif: numeric("total_passif"),
  resultatNet: numeric("resultat_net"),
  chiffreAffaires: numeric("chiffre_affaires"),

  generatedAt: timestamp("generated_at"),
  generatedBy: uuid("generated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  validatedBy: uuid("validated_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqAgenceAnnee: uniqueIndex("uq_dsf_agence_annee").on(t.agenceId, t.annee),
}));

export const insertDeclarationDsfSchema = createInsertSchema(declarationsDsf).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeclarationDsf = z.infer<typeof insertDeclarationDsfSchema>;
export type DeclarationDsf = typeof declarationsDsf.$inferSelect;

// ============================================================================
// ENGAGEMENTS HORS BILAN (Off-Balance Sheet — Class 8)
// ============================================================================

export const EngagementType = {
  CREDIT_NON_DECAISSE: "CREDIT_NON_DECAISSE",
  GARANTIE_DONNEE: "GARANTIE_DONNEE",
  CAUTION_DONNEE: "CAUTION_DONNEE",
  GARANTIE_RECUE: "GARANTIE_RECUE",
  CAUTION_RECUE: "CAUTION_RECUE",
  SURETE_REELLE: "SURETE_REELLE",
  SURETE_PERSONNELLE: "SURETE_PERSONNELLE",
} as const;
export type EngagementType = typeof EngagementType[keyof typeof EngagementType];

export const EngagementStatut = {
  ACTIVE: "ACTIVE",
  REALISE: "REALISE",
  EXPIRE: "EXPIRE",
  ANNULE: "ANNULE",
} as const;
export type EngagementStatut = typeof EngagementStatut[keyof typeof EngagementStatut];

export const engagementsHorsBilan = pgTable("engagements_hors_bilan", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),

  classe: integer("classe").notNull().default(8),
  sousClasse: text("sous_classe").notNull(),
  compteHorsBilan: text("compte_hors_bilan").notNull(),
  typeEngagement: text("type_engagement").notNull(),

  clientId: uuid("client_id"),
  contrepartie: text("contrepartie"),

  montant: numeric("montant").notNull(),
  devise: text("devise").default("XAF"),

  dateDebut: date("date_debut").notNull(),
  dateEcheance: date("date_echeance"),

  statut: text("statut").notNull().default("ACTIVE"),

  creditId: uuid("credit_id"),

  description: text("description"),
  reference: text("reference"),

  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  idxAgence: index("idx_engagements_hb_agence").on(t.agenceId),
  idxCredit: index("idx_engagements_hb_credit").on(t.creditId),
  idxSousClasse: index("idx_engagements_hb_sous_classe").on(t.sousClasse),
  idxStatut: index("idx_engagements_hb_statut").on(t.statut),
}));

export const insertEngagementHorsBilanSchema = createInsertSchema(engagementsHorsBilan).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEngagementHorsBilan = z.infer<typeof insertEngagementHorsBilanSchema>;
export type EngagementHorsBilan = typeof engagementsHorsBilan.$inferSelect;
