import { pgTable, text, uniqueIndex, numeric, boolean, timestamp, uuid, jsonb, index, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./clients";
import { users } from "./auth";
import { agences } from "./agences";
import { mouvementsFinanciers, comptes, credits, remboursements, operationsCaisse } from "./finance";
import {
  mobileMoneyProviderEnum,
  typePaymentIntentEnum,
  statutPaymentIntentEnum,
  methodePaiementEnum
} from "@shared/enum/enums";

// ============================================
// PAYMENT INTENTS
// Intention de paiement Mobile Money (async lifecycle)
// ============================================

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Tenant isolation
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    // Provider info
    provider: mobileMoneyProviderEnum("provider").notNull(),
    type: typePaymentIntentEnum("type").notNull(),
    status: statutPaymentIntentEnum("status").notNull().default("CREATED"),

    // Transaction details
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default("XAF"),
    phone: text("phone").notNull(),

    // References
    externalRef: uuid("external_ref").notNull().defaultRandom(), // Notre ID unique envoyé au provider
    providerRef: text("provider_ref"),                           // ID de transaction retourné par le provider
    providerTxnId: text("provider_txn_id"),                      // ID final de confirmation du provider

    // Linked entities (pour écritures comptables au SUCCESS)
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    compteId: uuid("compte_id").references(() => comptes.id, { onDelete: "set null" }),
    creditId: uuid("credit_id").references(() => credits.id, { onDelete: "set null" }),
    tontineId: uuid("tontine_id"),
    remboursementId: uuid("remboursement_id"),

    // Ledger link (créé après SUCCESS callback)
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Caisse operation link (pour traçabilité operationsCaisse)
    operationCaisseId: uuid("operation_caisse_id").references(() => operationsCaisse.id, { onDelete: "set null" }),

    // Callbacks & URLs
    callbackUrl: text("callback_url"),

    // Idempotency
    idempotencyKey: text("idempotency_key"),

    // Error tracking
    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    // Metadata (fees, descriptions, use case, etc.)
    metadata: jsonb("metadata"),

    // Timestamps
    initiatedAt: timestamp("initiated_at"),           // Quand envoyé au provider
    confirmedAt: timestamp("confirmed_at"),           // Quand confirmé par provider
    expireAt: timestamp("expire_at"),                 // Deadline timeout

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Unique constraints
    uqExternalRef: uniqueIndex("uq_payment_intents_external_ref").on(t.externalRef),
    uqIdempotency: uniqueIndex("uq_payment_intents_idempotency").on(t.idempotencyKey),

    // Search indexes
    idxProviderRef: index("idx_payment_intents_provider_ref").on(t.providerRef),
    idxStatusProvider: index("idx_payment_intents_status_provider").on(t.status, t.provider),
    idxClientId: index("idx_payment_intents_client_id").on(t.clientId),
    idxAgenceStatus: index("idx_payment_intents_agence_status").on(t.agenceId, t.status),

    // Partial index for pending reconciliation
    idxPending: index("idx_payment_intents_pending").on(t.status, t.initiatedAt),

    // Constraints
    chkAmountPos: sql`CONSTRAINT chk_payment_intents_amount_pos CHECK (${t.amount} > 0)`,
  }),
);

export const insertPaymentIntentSchema = createInsertSchema(paymentIntents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  externalRef: true,
});
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type PaymentIntent = typeof paymentIntents.$inferSelect;

// ============================================
// PROVIDER EVENTS
// Log brut des webhooks/callbacks reçus des providers
// ============================================

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: mobileMoneyProviderEnum("provider").notNull(),
    eventType: text("event_type").notNull(),       // e.g., "PAYMENT_SUCCESS", "PAYMENT_FAILED"

    providerRef: text("provider_ref"),              // Référence transaction provider
    externalRef: uuid("external_ref"),              // Notre référence payment intent

    payload: jsonb("payload").notNull(),            // Payload brut du webhook
    signature: text("signature"),                   // Signature du webhook pour vérification

    // Processing status
    processed: boolean("processed").notNull().default(false),
    processedAt: timestamp("processed_at"),
    processingError: text("processing_error"),

    // Linked payment intent (défini après traitement)
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),

    receivedAt: timestamp("received_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxProviderRef: index("idx_provider_events_provider_ref").on(t.provider, t.providerRef),
    idxExternalRef: index("idx_provider_events_external_ref").on(t.externalRef),
    idxUnprocessed: index("idx_provider_events_unprocessed").on(t.processed, t.receivedAt),
    idxPaymentIntentId: index("idx_provider_events_payment_intent_id").on(t.paymentIntentId),
  }),
);

export const insertProviderEventSchema = createInsertSchema(providerEvents).omit({
  id: true,
  createdAt: true,
  receivedAt: true,
});
export type InsertProviderEvent = z.infer<typeof insertProviderEventSchema>;
export type ProviderEvent = typeof providerEvents.$inferSelect;

// ============================================
// LOAN PAYMENT ALLOCATIONS
// Allocation des remboursements crédit (pénalités → intérêts → principal)
// ============================================

export const loanPaymentAllocations = pgTable(
  "loan_payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Liens vers les entités concernées
    remboursementId: uuid("remboursement_id").references(() => remboursements.id, { onDelete: "set null" }),
    creditId: uuid("credit_id").notNull().references(() => credits.id, { onDelete: "restrict" }),
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),

    // Montants allocués
    montantTotal: numeric("montant_total").notNull(),
    montantPenalites: numeric("montant_penalites").notNull().default("0"),
    montantInterets: numeric("montant_interets").notNull().default("0"),
    montantPrincipal: numeric("montant_principal").notNull().default("0"),

    // Solde crédit avant/après l'allocation
    soldeAvant: numeric("solde_avant").notNull(),
    soldeApres: numeric("solde_apres").notNull(),

    // Méthode de paiement utilisée
    methodePaiement: methodePaiementEnum("methode_paiement"),

    // Détails supplémentaires (pénalités payées, intérêts breakdown, etc.)
    details: jsonb("details"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCreditId: index("idx_loan_payment_allocations_credit").on(t.creditId),
    idxMouvementId: index("idx_loan_payment_allocations_mouvement").on(t.mouvementId),
    idxPaymentIntentId: index("idx_loan_payment_allocations_payment_intent").on(t.paymentIntentId),
    idxCreatedAt: index("idx_loan_payment_allocations_created_at").on(t.createdAt),

    // Contrainte: la somme des allocations doit égaler le montant total
    chkAllocationSum: sql`CONSTRAINT chk_loan_allocation_sum CHECK (
      ${t.montantPenalites}::numeric + ${t.montantInterets}::numeric + ${t.montantPrincipal}::numeric = ${t.montantTotal}::numeric
    )`,
    chkMontantPos: sql`CONSTRAINT chk_loan_allocation_montant_pos CHECK (${t.montantTotal} > 0)`,
  }),
);

export const insertLoanPaymentAllocationSchema = createInsertSchema(loanPaymentAllocations).omit({
  id: true,
  createdAt: true,
});
export type InsertLoanPaymentAllocation = z.infer<typeof insertLoanPaymentAllocationSchema>;
export type LoanPaymentAllocation = typeof loanPaymentAllocations.$inferSelect;

// ============================================
// MM RECONCILIATION REPORTS
// Rapports de réconciliation quotidiens Mobile Money
// ============================================

/**
 * Enum statut rapport réconciliation
 */
export const reconciliationReportStatutEnum = ["GENERATED", "REVIEWED", "RESOLVED"] as const;
export type ReconciliationReportStatut = typeof reconciliationReportStatutEnum[number];

/**
 * Type pour les anomalies détectées
 */
export interface ReconciliationAnomaly {
  intentId: string;
  type: "PENDING_TIMEOUT" | "SUCCESS_NO_MOUVEMENT" | "DUPLICATE" | "AMOUNT_MISMATCH" | "OTHER";
  description: string;
  montant?: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export const mmReconciliationReports = pgTable(
  "mm_reconciliation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Période du rapport
    dateRapport: timestamp("date_rapport").notNull(),
    provider: mobileMoneyProviderEnum("provider").notNull(),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    // Statistiques
    totalIntents: integer("total_intents").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    pendingCount: integer("pending_count").notNull().default(0),
    expiredCount: integer("expired_count").notNull().default(0),

    // Montants
    montantAttendu: numeric("montant_attendu").notNull().default("0"),
    montantConfirme: numeric("montant_confirme").notNull().default("0"),
    ecart: numeric("ecart").notNull().default("0"),

    // Anomalies détectées
    anomalies: jsonb("anomalies").$type<ReconciliationAnomaly[]>(),
    anomaliesCount: integer("anomalies_count").notNull().default(0),

    // Review workflow
    statut: text("statut").notNull().default("GENERATED"), // GENERATED | REVIEWED | RESOLVED
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),

    // Résolution
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    resolutionNotes: text("resolution_notes"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Index pour recherche par date et provider
    idxDateProvider: index("idx_mm_reconciliation_date_provider").on(t.dateRapport, t.provider),
    idxAgenceDate: index("idx_mm_reconciliation_agence_date").on(t.agenceId, t.dateRapport),
    idxStatut: index("idx_mm_reconciliation_statut").on(t.statut),

    // Contrainte: un seul rapport par jour/provider/agence
    uqDateProviderAgence: uniqueIndex("uq_mm_reconciliation_date_provider_agence").on(
      t.dateRapport,
      t.provider,
      t.agenceId
    ),
  }),
);

export const insertMmReconciliationReportSchema = createInsertSchema(mmReconciliationReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMmReconciliationReport = z.infer<typeof insertMmReconciliationReportSchema>;
export type MmReconciliationReport = typeof mmReconciliationReports.$inferSelect;
