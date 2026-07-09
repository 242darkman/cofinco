import { pgTable, uuid, text, integer, numeric, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./clients";
import { agences } from "./agences";
import { users } from "./auth";
import { scoreEventTypeEnum } from "../enum/enums";

// ============================================================================
// CLIENT SCORE EVENTS — Immutable event ledger
// ============================================================================

export const clientScoreEvents = pgTable("client_score_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  agenceId: uuid("agence_id").references(() => agences.id),

  eventType: scoreEventTypeEnum("event_type").notNull(),
  // Idempotency: unique reference for the source operation
  refId: text("ref_id").notNull(),
  refType: text("ref_type").notNull(), // 'remboursement', 'operation_caisse', 'contribution_tontine', 'credit', 'manual'

  // Points impact
  pointsDelta: integer("points_delta").notNull().default(0),

  // Financial context
  montant: numeric("montant"),

  // Audit
  reason: text("reason"), // MANDATORY for BONUS_MANUEL / MALUS_MANUEL
  metadata: jsonb("metadata"),

  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uqEventRef: uniqueIndex("uq_score_event_ref").on(t.eventType, t.refId),
  idxClientId: index("idx_score_events_client_id").on(t.clientId),
  idxAgenceId: index("idx_score_events_agence_id").on(t.agenceId),
  idxClientCreatedAt: index("idx_score_events_client_created").on(t.clientId, t.createdAt),
  idxEventType: index("idx_score_events_type").on(t.eventType),
  idxClientEventType: index("idx_score_events_client_type").on(t.clientId, t.eventType),
}));

export const insertClientScoreEventSchema = createInsertSchema(clientScoreEvents).omit({ id: true, createdAt: true });
export type InsertClientScoreEvent = z.infer<typeof insertClientScoreEventSchema>;
export type ClientScoreEvent = typeof clientScoreEvents.$inferSelect;

// ============================================================================
// CLIENT SCORE STATE — Materialized aggregate (denormalized for fast reads)
// ============================================================================

export const clientScoreState = pgTable("client_score_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id).unique(),
  agenceId: uuid("agence_id").references(() => agences.id),

  // Component scores (0-100 each, weighted)
  scorePayment: integer("score_payment").notNull().default(50),       // 40% weight
  scoreLoyalty: integer("score_loyalty").notNull().default(50),        // 30% weight
  scoreEngagement: integer("score_engagement").notNull().default(50),  // 20% weight
  scoreCompliance: integer("score_compliance").notNull().default(50),  // 10% weight

  // Computed
  scoreGlobal: integer("score_global").notNull().default(50),
  segment: text("segment").notNull().default("Standard"),
  tauxRemboursement: numeric("taux_remboursement").notNull().default("100"),

  // Counters derived from events
  totalPointsFidelite: integer("total_points_fidelite").notNull().default(0),
  totalCreditsRembourses: integer("total_credits_rembourses").notNull().default(0),
  totalIncidents: integer("total_incidents").notNull().default(0),
  totalEpargneDepots: integer("total_epargne_depots").notNull().default(0),

  // Timestamps
  lastEventAt: timestamp("last_event_at"),
  lastRecalcAt: timestamp("last_recalc_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  idxAgenceId: index("idx_score_state_agence_id").on(t.agenceId),
  idxSegment: index("idx_score_state_segment").on(t.segment),
  idxScoreGlobal: index("idx_score_state_score_global").on(t.scoreGlobal),
}));

export const insertClientScoreStateSchema = createInsertSchema(clientScoreState).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClientScoreState = z.infer<typeof insertClientScoreStateSchema>;
export type ClientScoreState = typeof clientScoreState.$inferSelect;
