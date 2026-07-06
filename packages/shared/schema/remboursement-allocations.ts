import { pgTable, uuid, numeric, timestamp, integer, varchar, boolean, text, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { remboursements } from "./finance";
import { echeancesCredits } from "./finance";
import { clients } from "./clients";
import { agences } from "./agences";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Table de liaison entre remboursements et échéances
 * Trace l'allocation FIFO des paiements aux échéances
 */
export const remboursementEcheances = pgTable("remboursement_echeances", {
  id: uuid("id").primaryKey().defaultRandom(),
  remboursementId: uuid("remboursement_id").notNull().references(() => remboursements.id, { onDelete: "cascade" }),
  echeanceId: uuid("echeance_id").notNull().references(() => echeancesCredits.id, { onDelete: "cascade" }),
  
  // Montants alloués
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }).notNull(),
  allocatedCapital: numeric("allocated_capital", { precision: 15, scale: 2 }).default("0"),
  allocatedInterest: numeric("allocated_interest", { precision: 15, scale: 2 }).default("0"),
  
  // Ordre et traçabilité
  allocationOrder: integer("allocation_order").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  
  // Gestion des extournes
  reversedAt: timestamp("reversed_at"),
  reversedBy: uuid("reversed_by").references(() => users.id),
}, (t) => ({
  // Contraintes et index
  uniqueRemboursementEcheance: uniqueIndex("unique_remboursement_echeance").on(t.remboursementId, t.echeanceId),
  idxRemboursement: index("idx_remboursement_echeances_remboursement").on(t.remboursementId),
  idxEcheance: index("idx_remboursement_echeances_echeance").on(t.echeanceId),
  idxReversed: index("idx_remboursement_echeances_reversed").on(t.reversedAt),
}));

export const insertRemboursementEcheanceSchema = createInsertSchema(remboursementEcheances).omit({ 
  id: true, 
  createdAt: true 
});

export type RemboursementEcheance = typeof remboursementEcheances.$inferSelect;
export type InsertRemboursementEcheance = z.infer<typeof insertRemboursementEcheanceSchema>;

/**
 * Soldes créditeurs des clients (trop-perçus)
 */
export const clientCreditBalances = pgTable("client_credit_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  lastTransactionDate: timestamp("last_transaction_date"),
  lastTransactionType: varchar("last_transaction_type", { length: 50 }), // OVERPAYMENT, REFUND, APPLIED_TO_CREDIT
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Un seul solde par client par agence
  uniqueClientBalance: uniqueIndex("unique_client_balance_per_agency").on(t.clientId, t.agenceId),
  idxClient: index("idx_client_credit_balances_client").on(t.clientId),
  idxAgence: index("idx_client_credit_balances_agence").on(t.agenceId),
}));

export const insertClientCreditBalanceSchema = createInsertSchema(clientCreditBalances).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

export type ClientCreditBalance = typeof clientCreditBalances.$inferSelect;
export type InsertClientCreditBalance = z.infer<typeof insertClientCreditBalanceSchema>;

/**
 * Table d'audit pour les allocations de remboursement
 */
export const remboursementAllocationAudit = pgTable("remboursement_allocation_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  remboursementId: uuid("remboursement_id").notNull().references(() => remboursements.id),
  
  action: varchar("action", { length: 50 }).notNull(), // ALLOCATED, REVERSED, MODIFIED
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  metadata: jsonb("metadata"), // User agent, IP, etc.
  
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => ({
  idxRemboursement: index("idx_remboursement_allocation_audit_remboursement").on(t.remboursementId),
  idxCreated: index("idx_remboursement_allocation_audit_created").on(t.createdAt),
}));

export const insertRemboursementAllocationAuditSchema = createInsertSchema(remboursementAllocationAudit).omit({ 
  id: true, 
  createdAt: true 
});

export type RemboursementAllocationAudit = typeof remboursementAllocationAudit.$inferSelect;
export type InsertRemboursementAllocationAudit = z.infer<typeof insertRemboursementAllocationAuditSchema>;

/**
 * Enum pour les stratégies d'allocation
 */
export const AllocationStrategy = {
  FIFO: "FIFO", // First In First Out (défaut)
  LIFO: "LIFO", // Last In First Out
  PROPORTIONAL: "PROPORTIONAL", // Répartition proportionnelle
  CUSTOM: "CUSTOM", // Allocation manuelle
} as const;

export type AllocationStrategyType = typeof AllocationStrategy[keyof typeof AllocationStrategy];

/**
 * Enum pour les types de transaction sur solde créditeur
 */
export const CreditBalanceTransactionType = {
  OVERPAYMENT: "OVERPAYMENT", // Trop-perçu d'un remboursement
  REFUND: "REFUND", // Remboursement au client
  APPLIED_TO_CREDIT: "APPLIED_TO_CREDIT", // Appliqué à un nouveau crédit
  ADJUSTMENT: "ADJUSTMENT", // Ajustement manuel
} as const;

export type CreditBalanceTransactionTypeValue = typeof CreditBalanceTransactionType[keyof typeof CreditBalanceTransactionType];