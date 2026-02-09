import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, jsonb, index, uniqueIndex, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { mouvementsFinanciers, comptes } from "./finance";
import { paymentIntents } from "./mobile-money";
import { methodePaiementEnum, statutTransactionEnum } from "../enum/enums";
import { sql } from "drizzle-orm";

// Tontines
export const tontines = pgTable(
  "tontines",
  {
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
    statut: text("statut").notNull().default("ACTIVE"),
    solde: numeric("solde").default("0"),
    prochainTour: timestamp("prochain_tour"),
    ordreDistribution: json("ordre_distribution"),
    regles: json("regles"),
    gestionnaireId: uuid("gestionnaire_id").references(() => users.id), // Gestionnaire de la tontine
    agenceId: uuid("agence_id").references(() => agences.id), // Agence de la tontine
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    // New columns for production-ready tontines
    rulesetId: uuid("ruleset_id"), // References tontineRulesets (defined later)
    currentCycleId: uuid("current_cycle_id"), // References tontineCycles (defined later)
    defaultPayoutMethod: text("default_payout_method").default("CASH"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
    version: integer("version").notNull().default(1),
  },
  (t) => ({
    // Index pour recherche par statut et agence
    idxStatut: index("idx_tontines_statut").on(t.statut),
    idxAgence: index("idx_tontines_agence_id").on(t.agenceId),
    idxAgenceStatut: index("idx_tontines_agence_statut").on(t.agenceId, t.statut),
    // Index pour le prochain tour (automatisation)
    idxProchainTour: index("idx_tontines_prochain_tour").on(t.prochainTour),
    // Index pour le gestionnaire
    idxGestionnaire: index("idx_tontines_gestionnaire_id").on(t.gestionnaireId),
    // Index pour soft delete
    idxDeletedAt: index("idx_tontines_deleted_at").on(t.deletedAt),
  }),
);

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
export type InsertTontine = z.infer<typeof insertTontineSchema>;
export type Tontine = typeof tontines.$inferSelect;

// Membres de tontine
export const membresTontine = pgTable(
  "membres_tontine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    dateAdhesion: timestamp("date_adhesion").defaultNow(),
    statut: text("statut").notNull().default("ACTIVE"),
    totalCotisations: numeric("total_cotisations").default("0"),
    totalRecus: numeric("total_recus").default("0"),
    position: integer("position"),
    aRecuBenefice: boolean("a_recu_benefice").default(false),
    dateBenefice: timestamp("date_benefice"),

    // Cotisation Automatique
    cotisationAutomatique: boolean("cotisation_automatique").notNull().default(false),
    cotisationCompteId: uuid("cotisation_compte_id").references(() => comptes.id), // Optionnel

    // New columns for production-ready tontines
    rulesetId: uuid("ruleset_id"), // References tontineRulesets (defined later)
    lateCount: integer("late_count").notNull().default(0),
    absenceCount: integer("absence_count").notNull().default(0),
    msisdn: text("msisdn"), // Phone for auto-pay MM
    preferredProvider: text("preferred_provider"), // MTN, AIRTEL
    preferredPayoutMethod: text("preferred_payout_method").default("CASH"), // CASH, MOBILE_MONEY, WALLET

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (t) => ({
    // Index pour recherche par tontine
    idxTontine: index("idx_membres_tontine_tontine_id").on(t.tontineId),
    // Index pour recherche par client
    idxClient: index("idx_membres_tontine_client_id").on(t.clientId),
    // Index composite pour vérifier si un client est membre d'une tontine
    idxTontineClient: index("idx_membres_tontine_tontine_client").on(t.tontineId, t.clientId),
    // Index pour les cotisations automatiques
    idxCotisationAuto: index("idx_membres_tontine_cotisation_auto").on(t.cotisationAutomatique),
    // Index pour le statut
    idxStatut: index("idx_membres_tontine_statut").on(t.statut),
  }),
);

export const insertMembreTontineSchema = (createInsertSchema(membresTontine) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertMembreTontine = z.infer<typeof insertMembreTontineSchema>;
export type MembreTontine = typeof membresTontine.$inferSelect;

// Contributions tontine
export const contributionsTontine = pgTable(
  "contributions_tontine",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    // New: explicit member reference for production-ready module
    membreId: uuid("membre_id").references(() => membresTontine.id, { onDelete: "set null" }),
    agenceId: uuid("agence_id").references(() => agences.id),

    // New: cycle and schedule references for production-ready module
    cycleId: uuid("cycle_id"), // References tontineCycles (defined later)
    scheduleId: uuid("schedule_id"), // References tontineSchedules (defined later)

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    typeOperation: text("type_operation").notNull(), // "Versement" | "Retrait" (ou enum si tu veux)
    montant: numeric("montant").notNull(),
    tourNumero: integer("tour_numero").default(1),

    methodePaiement: methodePaiementEnum("methode_paiement").notNull().default("CASH"),
    statutTransaction: statutTransactionEnum("statut_transaction").notNull().default("POSTED"),

    reference: text("reference").notNull(),
    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    // New: Mobile Money integration
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id),
    provider: text("provider"), // MTN, AIRTEL
    phone: text("phone"), // MSISDN for MM payments

    // Statut de la contribution : FULL = cotisation complète, PARTIAL = paiement partiel
    statutContribution: text("statut_contribution").default("FULL"), // 'FULL' | 'PARTIAL'

    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    // New: who received the contribution (for cash)
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at"),
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
export type InsertContributionTontine = z.infer<typeof insertContributionTontineSchema>;
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
export type InsertTontineRegle = z.infer<typeof insertTontineRegleSchema>;
export type TontineRegle = typeof tontineRegles.$inferSelect;

// Tontine Pénalités
export const tontinePenalites = pgTable("tontine_penalites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").notNull().references(() => membresTontine.id),
  regleId: uuid("regle_id").references(() => tontineRegles.id),

  // New: cycle and schedule references for production-ready module
  cycleId: uuid("cycle_id"), // References tontineCycles (defined later)
  scheduleId: uuid("schedule_id"), // References tontineSchedules (defined later)

  // New: penalty type for better categorization
  penaltyType: text("penalty_type").default("LATE"), // LATE, ABSENCE, WITHDRAWAL_FEE, CUSTOM

  montant: numeric("montant").notNull(),
  dateFaute: timestamp("date_faute").defaultNow(),
  statut: text("statut").default("PENDING"), // 'PENDING', 'PAID', 'CANCELLED', 'WAIVED'
  datePaiement: timestamp("date_paiement"),
  motif: text("motif"),

  // New: auto-application tracking
  autoApplied: boolean("auto_applied").default(false),

  // New: waiver support
  waivedAt: timestamp("waived_at"),
  waivedBy: uuid("waived_by").references(() => users.id),
  waiveReason: text("waive_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});
export const insertTontinePenaliteSchema = (createInsertSchema(tontinePenalites as any, {
  montant: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertTontinePenalite = z.infer<typeof insertTontinePenaliteSchema>;
export type TontinePenalite = typeof tontinePenalites.$inferSelect;

// Tontine Distributions
export const tontineDistributions = pgTable("tontine_distributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").notNull().references(() => membresTontine.id),
  tourNumero: integer("tour_numero").notNull(),
  montantTotal: numeric("montant_total").notNull(),
  dateDistribution: timestamp("date_distribution").defaultNow(),
  modePaiement: text("mode_paiement").default("CASH"),
  referencePaiement: text("reference_paiement"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});
export const insertTontineDistributionSchema = (createInsertSchema(tontineDistributions as any, {
  montantTotal: z.coerce.string(),
}) as any).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertTontineDistribution = z.infer<typeof insertTontineDistributionSchema>;
export type TontineDistribution = typeof tontineDistributions.$inferSelect;

// Tontine Alertes
export const tontineAlertes = pgTable("tontine_alertes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").references(() => membresTontine.id),
  typeAlerte: text("type_alerte").notNull(),
  priorite: text("priorite").notNull().default("NORMAL"),
  message: text("message").notNull(),
  statut: text("statut").notNull().default("ACTIVE"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTontineAlerteSchema = (createInsertSchema(tontineAlertes) as any).omit({ id: true, createdAt: true });
export type InsertTontineAlerte = z.infer<typeof insertTontineAlerteSchema>;
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
export type InsertTontinePlan = z.infer<typeof insertTontinePlanSchema>;
export type TontinePlan = typeof tontinePlans.$inferSelect;

// ============================================================================
// NEW TABLES FOR PRODUCTION-READY TONTINE MODULE
// ============================================================================

// Tontine Cycles - Formal rotation cycles
export const tontineCycles = pgTable(
  "tontine_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),

    cycleNumber: integer("cycle_number").notNull().default(1),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),

    status: text("status").notNull().default("OPEN"), // DRAFT, OPEN, PAUSED, CLOSED

    // Denormalized totals (cached for performance)
    potCollected: numeric("pot_collected", { precision: 15, scale: 2 }).notNull().default("0"),
    potDistributed: numeric("pot_distributed", { precision: 15, scale: 2 }).notNull().default("0"),
    membersCount: integer("members_count").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    closedAt: timestamp("closed_at"),
    closedBy: uuid("closed_by").references(() => users.id),
  },
  (t) => ({
    idxTontine: index("idx_tontine_cycles_tontine").on(t.tontineId),
    idxStatus: index("idx_tontine_cycles_status").on(t.status),
    idxAgence: index("idx_tontine_cycles_agence").on(t.agenceId),
    uqTontineCycle: uniqueIndex("uq_tontine_cycles_tontine_cycle").on(t.tontineId, t.cycleNumber),
  })
);

export const insertTontineCycleSchema = createInsertSchema(tontineCycles).omit({
  id: true, createdAt: true, updatedAt: true
});
export type InsertTontineCycle = z.infer<typeof insertTontineCycleSchema>;
export type TontineCycle = typeof tontineCycles.$inferSelect;

// Tontine Turns - Distribution turns with beneficiary and locking
export const tontineTurns = pgTable(
  "tontine_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => tontineCycles.id, { onDelete: "cascade" }),

    turnNumber: integer("turn_number").notNull(),
    beneficiaryMemberId: uuid("beneficiary_member_id").references(() => membresTontine.id),

    dueDate: date("due_date").notNull(),

    status: text("status").notNull().default("SCHEDULED"), // SCHEDULED, READY, PARTIAL_PAID, PAID_OUT, SKIPPED

    // Amounts
    amountExpected: numeric("amount_expected", { precision: 15, scale: 2 }).notNull().default("0"),
    amountPaidOut: numeric("amount_paid_out", { precision: 15, scale: 2 }).notNull().default("0"),

    // Locking - once locked, order cannot change
    isLocked: boolean("is_locked").notNull().default(false),
    lockedAt: timestamp("locked_at"),
    lockedReason: text("locked_reason"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    idxTontine: index("idx_tontine_turns_tontine").on(t.tontineId),
    idxCycle: index("idx_tontine_turns_cycle").on(t.cycleId),
    idxBeneficiary: index("idx_tontine_turns_beneficiary").on(t.beneficiaryMemberId),
    idxStatus: index("idx_tontine_turns_status").on(t.status),
    idxDueDate: index("idx_tontine_turns_due_date").on(t.dueDate),
    uqTontineCycleTurn: uniqueIndex("uq_tontine_turns_cycle_turn").on(t.tontineId, t.cycleId, t.turnNumber),
  })
);

export const insertTontineTurnSchema = createInsertSchema(tontineTurns).omit({
  id: true, createdAt: true, updatedAt: true
});
export type InsertTontineTurn = z.infer<typeof insertTontineTurnSchema>;
export type TontineTurn = typeof tontineTurns.$inferSelect;

// Tontine Schedules - Planned contribution dates
export const tontineSchedules = pgTable(
  "tontine_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => tontineCycles.id, { onDelete: "cascade" }),

    periodNumber: integer("period_number").notNull(),
    dueDate: date("due_date").notNull(),

    amountExpectedPerMember: numeric("amount_expected_per_member", { precision: 15, scale: 2 }).notNull(),

    status: text("status").notNull().default("OPEN"), // UPCOMING, OPEN, CLOSED, CANCELLED

    // Denormalized totals
    totalCollected: numeric("total_collected", { precision: 15, scale: 2 }).notNull().default("0"),
    membersPaidCount: integer("members_paid_count").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (t) => ({
    idxTontine: index("idx_tontine_schedules_tontine").on(t.tontineId),
    idxCycle: index("idx_tontine_schedules_cycle").on(t.cycleId),
    idxDueDate: index("idx_tontine_schedules_due_date").on(t.dueDate),
    idxStatus: index("idx_tontine_schedules_status").on(t.status),
    uqTontineCyclePeriod: uniqueIndex("uq_tontine_schedules_cycle_period").on(t.tontineId, t.cycleId, t.periodNumber),
  })
);

export const insertTontineScheduleSchema = createInsertSchema(tontineSchedules).omit({
  id: true, createdAt: true, updatedAt: true
});
export type InsertTontineSchedule = z.infer<typeof insertTontineScheduleSchema>;
export type TontineSchedule = typeof tontineSchedules.$inferSelect;

// Tontine Rulesets - Structured rules (JSON)
export const tontineRulesets = pgTable(
  "tontine_rulesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").references(() => agences.id),

    name: text("name").notNull(),
    description: text("description"),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),

    // Structured rules as JSON
    rules: jsonb("rules").notNull().default("{}"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => ({
    idxActive: index("idx_tontine_rulesets_active").on(t.isActive),
    idxAgence: index("idx_tontine_rulesets_agence").on(t.agenceId),
  })
);

// TypeScript interface for ruleset JSON structure
export interface TontineRulesConfig {
  grace_days: number;                          // Days before penalty applies
  late_fee_amount: number | null;              // Fixed late fee amount
  late_fee_percent: number | null;             // OR percentage of contribution
  max_late_count_before_suspend: number;       // Lates before suspension
  max_late_count_before_exclude: number;       // Lates before exclusion
  allow_partial_distribution: boolean;         // Allow partial payout
  distribution_min_threshold_percent: number;  // Min % of pot to distribute
  withdrawal_fee_amount: number;               // Fixed withdrawal fee
  withdrawal_fee_percent: number;              // Withdrawal fee %
  allow_reorder_turns_until: 'BEFORE_CYCLE_START' | 'BEFORE_TURN_DUE' | 'NEVER';
  penalty_deducted_from_payout: boolean;       // Penalties deducted from gain
  penalty_as_revenue: boolean;                 // Penalties = accounting revenue
  auto_pay_penalty_priority: boolean;          // Penalties prioritized over contributions
  min_members_to_start: number;                // Min members to start cycle
  max_advance_tours: number;                   // Max tours payable in advance
}

export const insertTontineRulesetSchema = createInsertSchema(tontineRulesets).omit({
  id: true, createdAt: true, updatedAt: true
});
export type InsertTontineRuleset = z.infer<typeof insertTontineRulesetSchema>;
export type TontineRuleset = typeof tontineRulesets.$inferSelect;

// Tontine Turn Audit - Audit trail for turn modifications
export const tontineTurnAudit = pgTable(
  "tontine_turn_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => tontineCycles.id, { onDelete: "cascade" }),

    actionType: text("action_type").notNull(), // INITIAL_GENERATION, REORDER, SWAP, SKIP, BENEFICIARY_CHANGE

    // Before/after state (for reorder)
    oldOrder: jsonb("old_order"),
    newOrder: jsonb("new_order"),

    // Specific details
    affectedTurnIds: text("affected_turn_ids").array(),
    affectedMemberIds: text("affected_member_ids").array(),

    reason: text("reason").notNull(),

    changedBy: uuid("changed_by").notNull().references(() => users.id),
    changedAt: timestamp("changed_at").notNull().defaultNow(),

    // Metadata (seed for random, etc.)
    metadata: jsonb("metadata"),
  },
  (t) => ({
    idxTontine: index("idx_tontine_turn_audit_tontine").on(t.tontineId),
    idxCycle: index("idx_tontine_turn_audit_cycle").on(t.cycleId),
    idxDate: index("idx_tontine_turn_audit_date").on(t.changedAt),
  })
);

export const insertTontineTurnAuditSchema = createInsertSchema(tontineTurnAudit).omit({
  id: true
});
export type InsertTontineTurnAudit = z.infer<typeof insertTontineTurnAuditSchema>;
export type TontineTurnAudit = typeof tontineTurnAudit.$inferSelect;

// Tontine Distribution Requests - Formal distribution workflow
export const tontineDistributionRequests = pgTable(
  "tontine_distribution_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    tontineId: uuid("tontine_id").notNull().references(() => tontines.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => tontineCycles.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").notNull().references(() => tontineTurns.id),
    beneficiaryMemberId: uuid("beneficiary_member_id").notNull().references(() => membresTontine.id),

    // Amounts
    amountRequested: numeric("amount_requested", { precision: 15, scale: 2 }).notNull(),
    amountApproved: numeric("amount_approved", { precision: 15, scale: 2 }),
    amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),

    // Deductions
    penaltiesDeducted: numeric("penalties_deducted", { precision: 15, scale: 2 }).notNull().default("0"),
    feesDeducted: numeric("fees_deducted", { precision: 15, scale: 2 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 15, scale: 2 }),

    // Payment method
    payoutMethod: text("payout_method").notNull(), // CASH, MOBILE_MONEY, WALLET
    provider: text("provider"), // MTN, AIRTEL (if MOBILE_MONEY)
    targetMsisdn: text("target_msisdn"), // If MOBILE_MONEY
    targetWalletAccountId: uuid("target_wallet_account_id").references(() => comptes.id), // If WALLET

    // Status
    status: text("status").notNull().default("DRAFT"), // DRAFT, SUBMITTED, APPROVED, PENDING_PROVIDER, SUCCESS, PARTIAL, FAILED, CANCELLED

    // External references
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id),
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id),
    referenceExterne: text("reference_externe"),

    // Idempotency
    idempotencyKey: text("idempotency_key"),

    // Workflow
    createdBy: uuid("created_by").notNull().references(() => users.id),
    submittedAt: timestamp("submitted_at"),
    submittedBy: uuid("submitted_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    approvedBy: uuid("approved_by").references(() => users.id),
    paidAt: timestamp("paid_at"),

    // Notes
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    idxTontine: index("idx_tontine_dist_req_tontine").on(t.tontineId),
    idxCycle: index("idx_tontine_dist_req_cycle").on(t.cycleId),
    idxTurn: index("idx_tontine_dist_req_turn").on(t.turnId),
    idxBeneficiary: index("idx_tontine_dist_req_beneficiary").on(t.beneficiaryMemberId),
    idxStatus: index("idx_tontine_dist_req_status").on(t.status),
    idxPaymentIntent: index("idx_tontine_dist_req_payment_intent").on(t.paymentIntentId),
    uqIdempotency: uniqueIndex("uq_tontine_dist_req_idempotency").on(t.idempotencyKey),
  })
);

export const insertTontineDistributionRequestSchema = createInsertSchema(tontineDistributionRequests).omit({
  id: true, createdAt: true, updatedAt: true
});
export type InsertTontineDistributionRequest = z.infer<typeof insertTontineDistributionRequestSchema>;
export type TontineDistributionRequest = typeof tontineDistributionRequests.$inferSelect;

// ============================================================================
// ENUMS AND CONSTANTS FOR TONTINE MODULE
// ============================================================================

export const TontineCycleStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PAUSED: 'PAUSED',
  CLOSED: 'CLOSED',
} as const;
export type TontineCycleStatus = typeof TontineCycleStatus[keyof typeof TontineCycleStatus];

export const TontineTurnStatus = {
  SCHEDULED: 'SCHEDULED',
  READY: 'READY',
  PARTIAL_PAID: 'PARTIAL_PAID',
  PAID_OUT: 'PAID_OUT',
  SKIPPED: 'SKIPPED',
} as const;
export type TontineTurnStatus = typeof TontineTurnStatus[keyof typeof TontineTurnStatus];

export const TontineScheduleStatus = {
  UPCOMING: 'UPCOMING',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type TontineScheduleStatus = typeof TontineScheduleStatus[keyof typeof TontineScheduleStatus];

export const TontineDistributionRequestStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PENDING_PROVIDER: 'PENDING_PROVIDER',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type TontineDistributionRequestStatus = typeof TontineDistributionRequestStatus[keyof typeof TontineDistributionRequestStatus];

export const TontinePayoutMethod = {
  CASH: 'CASH',
  MOBILE_MONEY: 'MOBILE_MONEY',
  WALLET: 'WALLET',
} as const;
export type TontinePayoutMethod = typeof TontinePayoutMethod[keyof typeof TontinePayoutMethod];

export const TontineTurnAuditActionType = {
  INITIAL_GENERATION: 'INITIAL_GENERATION',
  REORDER: 'REORDER',
  SWAP: 'SWAP',
  SKIP: 'SKIP',
  BENEFICIARY_CHANGE: 'BENEFICIARY_CHANGE',
} as const;
export type TontineTurnAuditActionType = typeof TontineTurnAuditActionType[keyof typeof TontineTurnAuditActionType];

export const TontinePenaltyType = {
  LATE: 'LATE',
  ABSENCE: 'ABSENCE',
  WITHDRAWAL_FEE: 'WITHDRAWAL_FEE',
  CUSTOM: 'CUSTOM',
} as const;
export type TontinePenaltyType = typeof TontinePenaltyType[keyof typeof TontinePenaltyType];

export const TontineFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  BIMONTHLY: 'BIMONTHLY',
  QUARTERLY: 'QUARTERLY',
} as const;
export type TontineFrequency = typeof TontineFrequency[keyof typeof TontineFrequency];
