import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, jsonb, index, uniqueIndex, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { mouvementsFinanciers, comptes } from "./finance";
import { paymentIntents } from "./mobile-money";
import { holidayCalendars } from "./settings";
import { methodePaiementEnum, statutTransactionEnum } from "../enum/enums";
import { sql } from "drizzle-orm";

// Tontines
export const tontines = pgTable(
  "tontines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nom: text("nom").notNull(),
    description: text("description"),
    montantCotisation: numeric("montant_cotisation").notNull(),
    tauxPlateforme: numeric("taux_plateforme").notNull().default("0"),
    frequence: text("frequence").notNull(),
    intervalleCotisation: integer("intervalle_cotisation").default(1),
    dateDebut: timestamp("date_debut").notNull(),
    dateFin: timestamp("date_fin"),
    nombreMembres: integer("nombre_membres").notNull(),
    membresActuels: integer("membres_actuels").default(0),
    statut: text("statut").notNull().default("ACTIVE"),
    solde: numeric("solde").default("0"),
    prochainTour: timestamp("prochain_tour"),
    ordreDistribution: json("ordre_distribution"),
    gestionnaireId: uuid("gestionnaire_id").references(() => users.id), // Gestionnaire de la tontine
    agenceId: uuid("agence_id").references(() => agences.id), // Agence de la tontine
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    currentCycleId: uuid("current_cycle_id"), // References tontineCycles (defined later)
    planId: uuid("plan_id"), // References tontinePlans — template used to create this group

    // ─── Calendrier & 1ère cotisation ───
    firstContributionRule: text("first_contribution_rule").notNull().default("ON_START_DATE"),
    gracePeriodContribution: integer("grace_period_contribution").notNull().default(0),
    collectionCalendarMode: text("collection_calendar_mode").notNull().default("ALL_DAYS"),
    weekdaysMask: integer("weekdays_mask").notNull().default(127),
    shiftNonWorkingDay: text("shift_non_working_day").notNull().default("NEXT"),
    holidayCalendarId: uuid("holiday_calendar_id").references(() => holidayCalendars.id),
    timezone: text("timezone").notNull().default("Africa/Brazzaville"),
    preferredWeekday: integer("preferred_weekday"),

    // ─── Distribution ───
    distributionType: text("distribution_type").notNull().default("ROTATIVE_SUSU"),
    payoutFrequency: text("payout_frequency").notNull().default("SAME_AS_CONTRIBUTION"),
    payoutDayRule: text("payout_day_rule"),
    payoutOrderMode: text("payout_order_mode").notNull().default("FIXED_BY_ADMIN"),
    allowSwapPayoutOrder: boolean("allow_swap_payout_order").notNull().default(false),
    swapRequiresApproval: boolean("swap_requires_approval").notNull().default(true),
    payoutRequiresContribPaid: boolean("payout_requires_contrib_paid").notNull().default(true),
    allowPartialDistribution: boolean("allow_partial_distribution").notNull().default(true),
    distributionMinThresholdPct: numeric("distribution_min_threshold_pct", { precision: 5, scale: 2 }).notNull().default("50"),

    // ─── Pénalités & retards ───
    penaltyEnabled: boolean("penalty_enabled").notNull().default(false),
    penaltyType: text("penalty_type").notNull().default("FIXED"),
    penaltyValue: numeric("penalty_value", { precision: 15, scale: 2 }).notNull().default("0"),
    penaltyApplication: text("penalty_application").notNull().default("PER_PERIOD"),
    penaltyCap: numeric("penalty_cap", { precision: 15, scale: 2 }),
    lateGracePeriodDays: integer("late_grace_period_days").notNull().default(0),
    maxMissedContributions: integer("max_missed_contributions").notNull().default(0),
    arrearsPolicy: text("arrears_policy").notNull().default("MUST_PAY_BEFORE_PAYOUT"),
    suspensionPolicy: text("suspension_policy").notNull().default("SUSPEND_MEMBER"),
    defaultPolicy: text("default_policy").notNull().default("EXCLUDE_MEMBER"),
    maxLateBeforeSuspend: integer("max_late_before_suspend").notNull().default(3),
    maxLateBeforeExclude: integer("max_late_before_exclude").notNull().default(5),
    penaltyDeductedFromPayout: boolean("penalty_deducted_from_payout").notNull().default(true),
    penaltyAsRevenue: boolean("penalty_as_revenue").notNull().default(false),
    autoPenaltyPriority: boolean("auto_penalty_priority").notNull().default(true),

    // ─── Entrée/Sortie ───
    joinFeeEnabled: boolean("join_fee_enabled").notNull().default(false),
    joinFeeAmount: numeric("join_fee_amount", { precision: 15, scale: 2 }).notNull().default("0"),
    exitAllowed: boolean("exit_allowed").notNull().default(true),
    exitFeePercent: numeric("exit_fee_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    exitNoticePeriods: integer("exit_notice_periods").notNull().default(0),
    replacementAllowed: boolean("replacement_allowed").notNull().default(true),
    transferMembershipAllowed: boolean("transfer_membership_allowed").notNull().default(false),
    allowMidCycleJoin: boolean("allow_mid_cycle_join").notNull().default(false),

    // ─── Paiement & Trésorerie ───
    allowedPaymentMethods: jsonb("allowed_payment_methods").notNull().default(sql`'["CASH"]'::jsonb`),
    defaultPaymentMethod: text("default_payment_method").notNull().default("CASH"),
    cashMustGoToCaisse: boolean("cash_must_go_to_caisse").notNull().default(true),
    feeCollectionMode: text("fee_collection_mode").notNull().default("ON_EACH_PAYOUT"),
    maxAdvanceTours: integer("max_advance_tours").notNull().default(3),
    // ─── Gouvernance ───
    rolesEnabled: boolean("roles_enabled").notNull().default(true),
    groupRoles: jsonb("group_roles").notNull().default(sql`'["PRESIDENT","TRESORIER","SECRETAIRE"]'::jsonb`),
    approvalsRequiredFor: jsonb("approvals_required_for").notNull().default(sql`'["DISTRIBUTION","REORDER"]'::jsonb`),
    minKycLevel: text("min_kyc_level").notNull().default("NONE"),
    minSegmentRequired: text("min_segment_required"),

    // ─── Cycle de vie (instance uniquement) ───
    endRule: text("end_rule").notNull().default("WHEN_ALL_RECEIVED"),
    roundCount: integer("round_count"),
    currentRound: integer("current_round").notNull().default(0),
    minMembersToStart: integer("min_members_to_start").notNull().default(3),

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
  penaltyValue: z.coerce.string().optional().default("0"),
  penaltyCap: z.coerce.string().optional().nullable(),
  joinFeeAmount: z.coerce.string().optional().default("0"),
  exitFeePercent: z.coerce.string().optional().default("0"),
  distributionMinThresholdPct: z.coerce.string().optional().default("50"),
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

    lateCount: integer("late_count").notNull().default(0),
    absenceCount: integer("absence_count").notNull().default(0),
    preferredPayoutMethod: text("preferred_payout_method").default("CASH"), // CASH, MOBILE_MONEY, WALLET

    // ─── Gouvernance & Entrée/Sortie ───
    groupRole: text("group_role"), // PRESIDENT, TRESORIER, SECRETAIRE
    joinFeePaid: boolean("join_fee_paid").notNull().default(false),
    exitRequestedAt: timestamp("exit_requested_at"),
    exitApprovedAt: timestamp("exit_approved_at"),
    replacedById: uuid("replaced_by_id"), // FK to membresTontine.id — set when member is replaced

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
    membreId: uuid("membre_id").references(() => membresTontine.id, { onDelete: "set null" }),
    agenceId: uuid("agence_id").references(() => agences.id),
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
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id),
    provider: text("provider"), // MTN, AIRTEL
    phone: text("phone"), // MSISDN for MM payments
    statutContribution: text("statut_contribution").default("FULL"), // FULL | PARTIAL

    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
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

// Tontine Pénalités
export const tontinePenalites = pgTable("tontine_penalites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tontineId: uuid("tontine_id").notNull().references(() => tontines.id),
  membreId: uuid("membre_id").notNull().references(() => membresTontine.id),
  cycleId: uuid("cycle_id"),
  scheduleId: uuid("schedule_id"),

  penaltyType: text("penalty_type").default("LATE"), // LATE, ABSENCE, WITHDRAWAL_FEE, CUSTOM

  montant: numeric("montant").notNull(),
  dateFaute: timestamp("date_faute").defaultNow(),
  statut: text("statut").default("PENDING"), // PENDING, PAID, CANCELLED, WAIVED
  datePaiement: timestamp("date_paiement"),
  motif: text("motif"),
  autoApplied: boolean("auto_applied").default(false),
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


// Tontine Plans (Templates/Modèles)
export const tontinePlans = pgTable("tontine_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  description: text("description"),
  montantCotisation: numeric("montant_cotisation").notNull(),
  nombreMembres: integer("nombre_membres").notNull(),
  frequence: text("frequence").notNull(),
  tauxPlateforme: numeric("taux_plateforme").notNull().default("0"),
  intervalleCotisation: integer("intervalle_cotisation").default(1),
  agenceId: uuid("agence_id").references(() => agences.id),
  actif: boolean("actif").default(true),

  // ─── Calendrier & 1ère cotisation ───
  firstContributionRule: text("first_contribution_rule").notNull().default("ON_START_DATE"),
  gracePeriodContribution: integer("grace_period_contribution").notNull().default(0),
  collectionCalendarMode: text("collection_calendar_mode").notNull().default("ALL_DAYS"),
  weekdaysMask: integer("weekdays_mask").notNull().default(127),
  shiftNonWorkingDay: text("shift_non_working_day").notNull().default("NEXT"),
  holidayCalendarId: uuid("holiday_calendar_id").references(() => holidayCalendars.id),
  timezone: text("timezone").notNull().default("Africa/Brazzaville"),
  preferredWeekday: integer("preferred_weekday"),

  // ─── Distribution ───
  distributionType: text("distribution_type").notNull().default("ROTATIVE_SUSU"),
  payoutFrequency: text("payout_frequency").notNull().default("SAME_AS_CONTRIBUTION"),
  payoutDayRule: text("payout_day_rule"),
  payoutOrderMode: text("payout_order_mode").notNull().default("FIXED_BY_ADMIN"),
  allowSwapPayoutOrder: boolean("allow_swap_payout_order").notNull().default(false),
  swapRequiresApproval: boolean("swap_requires_approval").notNull().default(true),
  payoutRequiresContribPaid: boolean("payout_requires_contrib_paid").notNull().default(true),
  allowPartialDistribution: boolean("allow_partial_distribution").notNull().default(true),
  distributionMinThresholdPct: numeric("distribution_min_threshold_pct", { precision: 5, scale: 2 }).notNull().default("50"),

  // ─── Pénalités & retards ───
  penaltyEnabled: boolean("penalty_enabled").notNull().default(false),
  penaltyType: text("penalty_type").notNull().default("FIXED"),
  penaltyValue: numeric("penalty_value", { precision: 15, scale: 2 }).notNull().default("0"),
  penaltyApplication: text("penalty_application").notNull().default("PER_PERIOD"),
  penaltyCap: numeric("penalty_cap", { precision: 15, scale: 2 }),
  lateGracePeriodDays: integer("late_grace_period_days").notNull().default(0),
  maxMissedContributions: integer("max_missed_contributions").notNull().default(0),
  arrearsPolicy: text("arrears_policy").notNull().default("MUST_PAY_BEFORE_PAYOUT"),
  suspensionPolicy: text("suspension_policy").notNull().default("SUSPEND_MEMBER"),
  defaultPolicy: text("default_policy").notNull().default("EXCLUDE_MEMBER"),
  maxLateBeforeSuspend: integer("max_late_before_suspend").notNull().default(3),
  maxLateBeforeExclude: integer("max_late_before_exclude").notNull().default(5),
  penaltyDeductedFromPayout: boolean("penalty_deducted_from_payout").notNull().default(true),
  penaltyAsRevenue: boolean("penalty_as_revenue").notNull().default(false),
  autoPenaltyPriority: boolean("auto_penalty_priority").notNull().default(true),

  // ─── Entrée/Sortie ───
  joinFeeEnabled: boolean("join_fee_enabled").notNull().default(false),
  joinFeeAmount: numeric("join_fee_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  exitAllowed: boolean("exit_allowed").notNull().default(true),
  exitFeePercent: numeric("exit_fee_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  exitNoticePeriods: integer("exit_notice_periods").notNull().default(0),
  replacementAllowed: boolean("replacement_allowed").notNull().default(true),
  transferMembershipAllowed: boolean("transfer_membership_allowed").notNull().default(false),
  allowMidCycleJoin: boolean("allow_mid_cycle_join").notNull().default(false),

  // ─── Paiement & Trésorerie ───
  allowedPaymentMethods: jsonb("allowed_payment_methods").notNull().default(sql`'["CASH"]'::jsonb`),
  defaultPaymentMethod: text("default_payment_method").notNull().default("CASH"),
  cashMustGoToCaisse: boolean("cash_must_go_to_caisse").notNull().default(true),
  feeCollectionMode: text("fee_collection_mode").notNull().default("ON_EACH_PAYOUT"),
  maxAdvanceTours: integer("max_advance_tours").notNull().default(3),

  // ─── Gouvernance ───
  rolesEnabled: boolean("roles_enabled").notNull().default(true),
  groupRoles: jsonb("group_roles").notNull().default(sql`'["PRESIDENT","TRESORIER","SECRETAIRE"]'::jsonb`),
  approvalsRequiredFor: jsonb("approvals_required_for").notNull().default(sql`'["DISTRIBUTION","REORDER"]'::jsonb`),
  minKycLevel: text("min_kyc_level").notNull().default("NONE"),
  minSegmentRequired: text("min_segment_required"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTontinePlanSchema = (createInsertSchema(tontinePlans as any, {
  montantCotisation: z.coerce.string(),
  tauxPlateforme: z.coerce.string().optional().default("0"),
  penaltyValue: z.coerce.string().optional().default("0"),
  penaltyCap: z.coerce.string().optional().nullable(),
  joinFeeAmount: z.coerce.string().optional().default("0"),
  exitFeePercent: z.coerce.string().optional().default("0"),
  distributionMinThresholdPct: z.coerce.string().optional().default("50"),
}) as any).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTontinePlan = z.infer<typeof insertTontinePlanSchema>;
export type TontinePlan = typeof tontinePlans.$inferSelect;

// ============================================================================
// TONTINE CYCLE, TURN & SCHEDULE TABLES
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
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
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

// ============================================================================
// NEW ENUMS FOR ENTERPRISE TONTINE ENGINE
// ============================================================================

export const FirstContributionRule = {
  ON_START_DATE: 'ON_START_DATE',
  AFTER_N_DAYS: 'AFTER_N_DAYS',
  NEXT_WEEKDAY: 'NEXT_WEEKDAY',
  END_OF_WEEK: 'END_OF_WEEK',
  END_OF_MONTH: 'END_OF_MONTH',
  CUSTOM_DATE_ALLOWED: 'CUSTOM_DATE_ALLOWED',
} as const;
export type FirstContributionRule = typeof FirstContributionRule[keyof typeof FirstContributionRule];

export const CollectionCalendarMode = {
  ALL_DAYS: 'ALL_DAYS',
  BUSINESS_DAYS_ONLY: 'BUSINESS_DAYS_ONLY',
  CUSTOM_WEEKDAYS: 'CUSTOM_WEEKDAYS',
} as const;
export type CollectionCalendarMode = typeof CollectionCalendarMode[keyof typeof CollectionCalendarMode];

export const ShiftNonWorkingDay = {
  NEXT: 'NEXT',
  PREVIOUS: 'PREVIOUS',
  NEAREST: 'NEAREST',
} as const;
export type ShiftNonWorkingDay = typeof ShiftNonWorkingDay[keyof typeof ShiftNonWorkingDay];

export const DistributionType = {
  ROTATIVE_SUSU: 'ROTATIVE_SUSU',
  ACCUMULATIVE_END: 'ACCUMULATIVE_END',
  MIXED: 'MIXED',
  AUCTION_OPTIONAL: 'AUCTION_OPTIONAL',
} as const;
export type DistributionType = typeof DistributionType[keyof typeof DistributionType];

export const PayoutFrequencyMode = {
  SAME_AS_CONTRIBUTION: 'SAME_AS_CONTRIBUTION',
  CUSTOM: 'CUSTOM',
} as const;
export type PayoutFrequencyMode = typeof PayoutFrequencyMode[keyof typeof PayoutFrequencyMode];

export const PayoutOrderMode = {
  FIXED_BY_ADMIN: 'FIXED_BY_ADMIN',
  RANDOM_AT_START: 'RANDOM_AT_START',
  PRIORITY_SCORE: 'PRIORITY_SCORE',
} as const;
export type PayoutOrderMode = typeof PayoutOrderMode[keyof typeof PayoutOrderMode];

export const PenaltyTypeEnum = {
  FIXED: 'FIXED',
  PERCENT: 'PERCENT',
} as const;
export type PenaltyTypeEnum = typeof PenaltyTypeEnum[keyof typeof PenaltyTypeEnum];

export const PenaltyApplication = {
  PER_PERIOD: 'PER_PERIOD',
  PER_DAY: 'PER_DAY',
  ONE_TIME: 'ONE_TIME',
} as const;
export type PenaltyApplication = typeof PenaltyApplication[keyof typeof PenaltyApplication];

export const ArrearsPolicy = {
  MUST_PAY_BEFORE_PAYOUT: 'MUST_PAY_BEFORE_PAYOUT',
  ALLOW_PAYOUT_WITH_ARREARS: 'ALLOW_PAYOUT_WITH_ARREARS',
} as const;
export type ArrearsPolicy = typeof ArrearsPolicy[keyof typeof ArrearsPolicy];

export const SuspensionPolicy = {
  SUSPEND_MEMBER: 'SUSPEND_MEMBER',
  SUSPEND_PAYOUT_ONLY: 'SUSPEND_PAYOUT_ONLY',
  SUSPEND_BOTH: 'SUSPEND_BOTH',
} as const;
export type SuspensionPolicy = typeof SuspensionPolicy[keyof typeof SuspensionPolicy];

export const DefaultPolicy = {
  EXCLUDE_MEMBER: 'EXCLUDE_MEMBER',
  REPLACE_MEMBER: 'REPLACE_MEMBER',
  KEEP_DEBT_RUNNING: 'KEEP_DEBT_RUNNING',
} as const;
export type DefaultPolicy = typeof DefaultPolicy[keyof typeof DefaultPolicy];

export const FeeCollectionMode = {
  ON_EACH_PAYOUT: 'ON_EACH_PAYOUT',
  ON_EACH_CONTRIBUTION: 'ON_EACH_CONTRIBUTION',
  END_OF_CYCLE: 'END_OF_CYCLE',
} as const;
export type FeeCollectionMode = typeof FeeCollectionMode[keyof typeof FeeCollectionMode];

export const EndRule = {
  AFTER_N_ROUNDS: 'AFTER_N_ROUNDS',
  AFTER_N_PERIODS: 'AFTER_N_PERIODS',
  WHEN_ALL_RECEIVED: 'WHEN_ALL_RECEIVED',
} as const;
export type EndRule = typeof EndRule[keyof typeof EndRule];

export const TontineGroupRole = {
  PRESIDENT: 'PRESIDENT',
  TRESORIER: 'TRESORIER',
  SECRETAIRE: 'SECRETAIRE',
} as const;
export type TontineGroupRole = typeof TontineGroupRole[keyof typeof TontineGroupRole];

export const TontineStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TontineStatus = typeof TontineStatus[keyof typeof TontineStatus];

export const KycLevel = {
  NONE: 'NONE',
  BASIC: 'BASIC',
  FULL: 'FULL',
} as const;
export type KycLevel = typeof KycLevel[keyof typeof KycLevel];

export const TontinePaymentMethod = {
  CASH: 'CASH',
  MOBILE_MONEY: 'MOBILE_MONEY',
  BANK_TRANSFER: 'BANK_TRANSFER',
  WALLET_INTERNAL: 'WALLET_INTERNAL',
} as const;
export type TontinePaymentMethod = typeof TontinePaymentMethod[keyof typeof TontinePaymentMethod];
