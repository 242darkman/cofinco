/**
 * Schema pour les améliorations de fermeture de session caisse
 * - Réconciliation Mobile Money
 * - Workflow approbation écarts
 * - Clôture journalière agence
 */

import { pgTable, uuid, text, numeric, boolean, timestamp, jsonb, date, index, inet } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { sessionsCaisse, caisses } from "./finance";

// ============================================================================
// RÉCONCILIATION MOBILE MONEY
// ============================================================================

export const mmBalanceReconciliationStatusEnum = ["PENDING", "MATCHED", "DISCREPANCY", "API_FAILED", "OVERRIDDEN"] as const;
export type MMBalanceReconciliationStatus = typeof mmBalanceReconciliationStatusEnum[number];

export const mmBalanceReconciliations = pgTable("mm_balance_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'MTN' | 'AIRTEL'
  caisseDigitaleId: uuid("caisse_digitale_id").references(() => caisses.id),

  // Soldes au moment de la réconciliation
  expectedBalance: numeric("expected_balance", { precision: 15, scale: 2 }).notNull(),
  providerBalance: numeric("provider_balance", { precision: 15, scale: 2 }),
  ecart: numeric("ecart", { precision: 15, scale: 2 }).notNull(),

  // Métadonnées appel API
  apiCallSuccess: boolean("api_call_success").notNull().default(false),
  apiErrorMessage: text("api_error_message"),
  apiResponseTimeMs: numeric("api_response_time_ms"),

  // Workflow
  statut: text("statut").notNull().default("PENDING"),
  overrideReason: text("override_reason"),
  overriddenBy: uuid("overridden_by").references(() => users.id),
  overriddenAt: timestamp("overridden_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  idxSession: index("idx_mm_balance_recon_session").on(t.sessionId),
  idxStatut: index("idx_mm_balance_recon_statut").on(t.statut),
  idxProvider: index("idx_mm_balance_recon_provider").on(t.provider),
}));

export const insertMMBalanceReconciliationSchema = createInsertSchema(mmBalanceReconciliations).omit({ id: true, createdAt: true });
export type InsertMMBalanceReconciliation = z.infer<typeof insertMMBalanceReconciliationSchema>;
export type MMBalanceReconciliation = typeof mmBalanceReconciliations.$inferSelect;

// ============================================================================
// CONFIGURATION ÉCARTS CAISSE
// ============================================================================

export const configEcartCaisse = pgTable("config_ecart_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id).unique(), // NULL = global

  // Seuils d'écart (en XOF)
  seuilAutoApprove: numeric("seuil_auto_approve", { precision: 15, scale: 2 }).notNull().default("100"),
  seuilN1Approval: numeric("seuil_n1_approval", { precision: 15, scale: 2 }).notNull().default("5000"),
  seuilN2Approval: numeric("seuil_n2_approval", { precision: 15, scale: 2 }).notNull().default("50000"),

  // Rôles autorisés à approuver
  rolesApprobateursN1: jsonb("roles_approbateurs_n1").notNull().default(['SUPERVISEUR', 'CHEF_CAISSE']),
  rolesApprobateursN2: jsonb("roles_approbateurs_n2").notNull().default(['CHEF_AGENCE', 'DIRECTEUR']),

  // Comportement
  blockCloseUntilApproved: boolean("block_close_until_approved").notNull().default(true),
  allowSelfApprovalIfRole: boolean("allow_self_approval_if_role").notNull().default(false),
  requireDoubleApprovalN2: boolean("require_double_approval_n2").notNull().default(false),

  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ConfigEcartCaisse = typeof configEcartCaisse.$inferSelect;

// ============================================================================
// DEMANDES D'APPROBATION ÉCARTS
// ============================================================================

export const ecartApprovalStatusEnum = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "AUTO_APPROVED", "EXPIRED"] as const;
export type EcartApprovalStatus = typeof ecartApprovalStatusEnum[number];

export const ecartApprovalNiveauEnum = ["N1", "N2"] as const;
export type EcartApprovalNiveau = typeof ecartApprovalNiveauEnum[number];

export const ecartsApprovalRequests = pgTable("ecarts_approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "cascade" }),
  caissierId: uuid("caissier_id").notNull().references(() => users.id),
  agenceId: uuid("agence_id").references(() => agences.id),

  // Détails de l'écart
  soldeTheorique: numeric("solde_theorique", { precision: 15, scale: 2 }).notNull(),
  montantPhysique: numeric("montant_physique", { precision: 15, scale: 2 }).notNull(),
  ecart: numeric("ecart", { precision: 15, scale: 2 }).notNull(),
  typeEcart: text("type_ecart").notNull(), // 'SURPLUS' | 'DEFICIT'
  justification: text("justification").notNull(),

  // Workflow approbation
  niveauRequis: text("niveau_requis").notNull().default("N1"),
  statut: text("statut").notNull().default("PENDING_APPROVAL"),

  // Premier approbateur
  approverId: uuid("approver_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalDecision: text("approval_decision"), // 'APPROVED' | 'REJECTED'
  approvalComment: text("approval_comment"),

  // Second approbateur (si double approbation)
  secondApproverId: uuid("second_approver_id").references(() => users.id),
  secondApprovedAt: timestamp("second_approved_at"),
  secondApprovalComment: text("second_approval_comment"),

  // Configuration snapshot
  thresholdApplied: numeric("threshold_applied", { precision: 15, scale: 2 }).notNull(),
  configSnapshot: jsonb("config_snapshot"),

  // Expiration automatique
  expiresAt: timestamp("expires_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxSession: index("idx_ecarts_approval_session").on(t.sessionId),
  idxAgence: index("idx_ecarts_approval_agence").on(t.agenceId),
  idxStatut: index("idx_ecarts_approval_statut").on(t.statut),
  idxCaissier: index("idx_ecarts_approval_caissier").on(t.caissierId),
}));

export const insertEcartApprovalRequestSchema = createInsertSchema(ecartsApprovalRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEcartApprovalRequest = z.infer<typeof insertEcartApprovalRequestSchema>;
export type EcartApprovalRequest = typeof ecartsApprovalRequests.$inferSelect;

// ============================================================================
// AUDIT LOG APPROBATION ÉCARTS
// ============================================================================

export const ecartsApprovalAuditLog = pgTable("ecarts_approval_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => ecartsApprovalRequests.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // CREATED, APPROVED, REJECTED, EXPIRED, ESCALATED
  actorId: uuid("actor_id").references(() => users.id),
  actorRole: text("actor_role"),
  comment: text("comment"),
  metadata: jsonb("metadata"),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxRequest: index("idx_ecarts_audit_request").on(t.requestId),
}));

export type EcartApprovalAuditLog = typeof ecartsApprovalAuditLog.$inferSelect;

// ============================================================================
// CLÔTURE JOURNALIÈRE AGENCE
// ============================================================================

export const agencyClosureStatusEnum = ["OPEN", "CLOSING", "CLOSED", "REOPENED"] as const;
export type AgencyClosureStatus = typeof agencyClosureStatusEnum[number];

export const agencyDailyClosure = pgTable("agency_daily_closure", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  dateCloture: date("date_cloture").notNull(),

  // Statut global
  statut: text("statut").notNull().default("OPEN"),

  // Compteurs caisses
  totalCaisses: numeric("total_caisses").notNull().default("0"),
  caissesClosed: numeric("caisses_closed").notNull().default("0"),
  caissesWithPendingTransfers: numeric("caisses_with_pending_transfers").notNull().default("0"),
  caissesWithPendingRemises: numeric("caisses_with_pending_remises").notNull().default("0"),
  caissesWithPendingEcarts: numeric("caisses_with_pending_ecarts").notNull().default("0"),

  // Agrégats financiers
  totalMontantOuverture: numeric("total_montant_ouverture", { precision: 15, scale: 2 }).default("0"),
  totalMontantFermeture: numeric("total_montant_fermeture", { precision: 15, scale: 2 }).default("0"),
  totalMontantVersCoffre: numeric("total_montant_vers_coffre", { precision: 15, scale: 2 }).default("0"),
  totalMontantReporte: numeric("total_montant_reporte", { precision: 15, scale: 2 }).default("0"),
  totalEcarts: numeric("total_ecarts", { precision: 15, scale: 2 }).default("0"),
  totalEcartsSurplus: numeric("total_ecarts_surplus", { precision: 15, scale: 2 }).default("0"),
  totalEcartsDeficit: numeric("total_ecarts_deficit", { precision: 15, scale: 2 }).default("0"),

  // Workflow validations
  allCaissesClosed: boolean("all_caisses_closed").notNull().default(false),
  allTransfersExecuted: boolean("all_transfers_executed").notNull().default(false),
  allRemisesSettled: boolean("all_remises_settled").notNull().default(false),
  allEcartsApproved: boolean("all_ecarts_approved").notNull().default(false),
  coffreReconciled: boolean("coffre_reconciled").notNull().default(false),

  // Clôture finale
  closedBy: uuid("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  closureObservations: text("closure_observations"),

  // Réouverture exceptionnelle
  reopenedBy: uuid("reopened_by").references(() => users.id),
  reopenedAt: timestamp("reopened_at"),
  reopenedReason: text("reopened_reason"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxAgence: index("idx_agency_closure_agence").on(t.agenceId),
  idxDate: index("idx_agency_closure_date").on(t.dateCloture),
  idxStatut: index("idx_agency_closure_statut").on(t.statut),
  uqAgenceDate: index("uq_agency_closure_agence_date").on(t.agenceId, t.dateCloture),
}));

export const insertAgencyDailyClosureSchema = createInsertSchema(agencyDailyClosure).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgencyDailyClosure = z.infer<typeof insertAgencyDailyClosureSchema>;
export type AgencyDailyClosure = typeof agencyDailyClosure.$inferSelect;

// ============================================================================
// BLOCKERS CLÔTURE AGENCE
// ============================================================================

export const agencyClosureBlockerTypeEnum = [
  "CAISSE_OPEN",
  "TRANSFER_PENDING",
  "REMISE_PENDING",
  "ECART_PENDING",
  "MM_DISCREPANCY",
  "COFFRE_MISMATCH"
] as const;
export type AgencyClosureBlockerType = typeof agencyClosureBlockerTypeEnum[number];

export const agencyClosureBlockers = pgTable("agency_closure_blockers", {
  id: uuid("id").primaryKey().defaultRandom(),
  closureId: uuid("closure_id").notNull().references(() => agencyDailyClosure.id, { onDelete: "cascade" }),
  blockerType: text("blocker_type").notNull(),
  entityId: uuid("entity_id"),
  entityType: text("entity_type"),
  description: text("description").notNull(),
  montant: numeric("montant", { precision: 15, scale: 2 }),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxClosure: index("idx_closure_blockers_closure").on(t.closureId),
}));

export type AgencyClosureBlocker = typeof agencyClosureBlockers.$inferSelect;

// ============================================================================
// AUDIT LOG CLÔTURE AGENCE
// ============================================================================

export const agencyClosureAuditLog = pgTable("agency_closure_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  closureId: uuid("closure_id").notNull().references(() => agencyDailyClosure.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  statutAvant: text("statut_avant"),
  statutApres: text("statut_apres"),
  metadata: jsonb("metadata"),
  ipAddress: inet("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxClosure: index("idx_closure_audit_closure").on(t.closureId),
}));

export type AgencyClosureAuditLog = typeof agencyClosureAuditLog.$inferSelect;
