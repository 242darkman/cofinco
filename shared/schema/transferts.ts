import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { clients } from "./clients";
import { mouvementsFinanciers } from "./finance";
import { methodePaiementEnum, statutTransactionEnum } from "../enum/enums";
import { sql } from "drizzle-orm";

// ============================================================================
// TABLE DEFINITIONS
// ============================================================================

// Niveaux KYC pour les clients
export const kycLevels = pgTable("kyc_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  niveau: integer("niveau").notNull().unique(),
  nom: text("nom").notNull(),
  description: text("description"),
  limiteTransactionJournaliere: numeric("limite_transaction_journaliere").notNull(),
  limiteTransactionMensuelle: numeric("limite_transaction_mensuelle").notNull(),
  limiteTransactionUnique: numeric("limite_transaction_unique").notNull(),
  documentsRequis: text("documents_requis").array(),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transferts d'argent
export const transferts = pgTable(
  "transferts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),

    montant: numeric("montant").notNull(),
    methodePaiement: methodePaiementEnum("methode_paiement"),
    statut: statutTransactionEnum("statut").notNull().default("Posté"),

    reference: text("reference").notNull(),
    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    sens: text("sens").notNull(), // "Entrée" | "Sortie"
    destinataire: text("destinataire"),
    numeroTelephone: text("numero_telephone"),
    motif: text("motif"),
    observations: text("observations"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idxClientDate: index("idx_transferts_client_date").on(t.clientId, t.createdAt),
    idxMvt: index("idx_transferts_mouvement").on(t.mouvementId),
    uqRef: uniqueIndex("uq_transferts_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_transferts_idempotency").on(t.idempotencyKey),
    uqRefExt: uniqueIndex("uq_transferts_reference_externe").on(t.referenceExterne),
    chkMontantPos: sql`CONSTRAINT chk_transferts_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

// Audit des transferts
export const transfertAuditLogs = pgTable("transfert_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").notNull().references(() => transferts.id),
  action: text("action").notNull(),
  ancienStatut: text("ancien_statut"),
  nouveauStatut: text("nouveau_statut"),
  details: json("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").references(() => users.id),
  hashPrecedent: text("hash_precedent"),
  hashActuel: text("hash_actuel"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Limites de transfert
export const transfertLimits = pgTable("transfert_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id"),
  telephone: text("telephone").notNull(),
  kycLevel: integer("kyc_level").notNull().default(1),
  totalJournalier: numeric("total_journalier").notNull().default("0"),
  totalMensuel: numeric("total_mensuel").notNull().default("0"),
  nombreTransfertJour: integer("nombre_transfert_jour").default(0),
  nombreTransfertMois: integer("nombre_transfert_mois").default(0),
  dernierTransfert: timestamp("dernier_transfert"),
  dateResetJournalier: timestamp("date_reset_journalier").defaultNow(),
  dateResetMensuel: timestamp("date_reset_mensuel").defaultNow(),
  bloque: boolean("bloque").default(false),
  raisonBlocage: text("raison_blocage"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Webhooks
export const transfertWebhooks = pgTable("transfert_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").references(() => transferts.id),
  operateurId: text("operateur_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: json("payload").notNull(),
  signature: text("signature"),
  signatureValide: boolean("signature_valide"),
  traite: boolean("traite").default(false),
  erreur: text("erreur"),
  tentatives: integer("tentatives").default(0),
  ipSource: text("ip_source"),
  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Blacklist
export const transfertBlacklist = pgTable("transfert_blacklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  valeur: text("valeur").notNull(),
  raison: text("raison").notNull(),
  source: text("source"),
  severite: text("severite").notNull().default("high"),
  actif: boolean("actif").notNull().default(true),
  dateExpiration: timestamp("date_expiration"),
  ajouteParId: uuid("ajoute_par_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reconciliation
export const transfertReconciliation = pgTable("transfert_reconciliation", {
  id: uuid("id").primaryKey().defaultRandom(),
  operateurId: text("operateur_id").notNull(),
  dateReconciliation: timestamp("date_reconciliation").notNull(),
  periode: text("periode").notNull(),
  totalTransferts: integer("total_transferts").notNull().default(0),
  montantTotal: numeric("montant_total").notNull().default("0"),
  montantOperateur: numeric("montant_operateur").default("0"),
  ecart: numeric("ecart").default("0"),
  statut: text("statut").notNull().default("pending"),
  anomalies: json("anomalies"),
  resolvedById: uuid("resolved_by_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// OTP Validations
export const otpValidations = pgTable("otp_validations", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionType: text("transaction_type").notNull(),
  transactionReference: text("transaction_reference").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  clientPhone: text("client_phone").notNull(),
  montant: numeric("montant").notNull(),
  otpCode: text("otp_code").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  status: text("status").notNull().default("pending"),
  createdBy: uuid("created_by").references(() => users.id),
  createdByRole: text("created_by_role"),
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedByName: text("validated_by_name"),
  validatedByRole: text("validated_by_role"),
  validatedAt: timestamp("validated_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// SCHEMAS & TYPES
// ============================================================================

export const insertKycLevelSchema = (createInsertSchema(kycLevels) as any).omit({ id: true, createdAt: true });
export type InsertKycLevel = any;
export type KycLevel = typeof kycLevels.$inferSelect;

export const insertTransfertSchema = (createInsertSchema(transferts) as any).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransfert = any;
export type Transfert = typeof transferts.$inferSelect;

export const insertTransfertAuditLogSchema = (createInsertSchema(transfertAuditLogs) as any).omit({ id: true, timestamp: true });
export type InsertTransfertAuditLog = any;
export type TransfertAuditLog = typeof transfertAuditLogs.$inferSelect;

export const insertTransfertLimitSchema = (createInsertSchema(transfertLimits) as any).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransfertLimit = any;
export type TransfertLimit = typeof transfertLimits.$inferSelect;

export const insertTransfertWebhookSchema = (createInsertSchema(transfertWebhooks) as any).omit({ id: true, receivedAt: true });
export type InsertTransfertWebhook = any;
export type TransfertWebhook = typeof transfertWebhooks.$inferSelect;

export const insertTransfertBlacklistSchema = (createInsertSchema(transfertBlacklist) as any).omit({ id: true, createdAt: true });
export type InsertTransfertBlacklist = any;
export type TransfertBlacklist = typeof transfertBlacklist.$inferSelect;

export const insertTransfertReconciliationSchema = (createInsertSchema(transfertReconciliation) as any).omit({ id: true, createdAt: true });
export type InsertTransfertReconciliation = any;
export type TransfertReconciliation = typeof transfertReconciliation.$inferSelect;

export const insertOtpValidationSchema = (createInsertSchema(otpValidations) as any).omit({ id: true, createdAt: true });
export type InsertOtpValidation = any;
export type OtpValidation = typeof otpValidations.$inferSelect;
