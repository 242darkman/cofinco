import { pgTable, pgEnum, text, timestamp, jsonb, index, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";

// ========== DEVICE KEY STATUS ENUM ==========

export const deviceKeyStatusEnum = pgEnum("device_key_status", [
  "active",
  "rotated",
  "revoked",
]);

// ========== DEVICE KEYS TABLE ==========

/**
 * Stores ECDSA P-256 public keys for agent devices.
 * Used to verify signatures on offline journal entries during sync.
 *
 * Each device/agent pair has one active key at a time.
 * Keys are rotated every 90 days. Old keys are kept for
 * historical signature verification.
 */
export const deviceKeys = pgTable("device_keys", {
  // SHA-256 fingerprint of the public key JWK
  id: text("id").primaryKey(),

  agentId: uuid("agent_id").notNull().references(() => users.id),
  deviceFingerprint: text("device_fingerprint").notNull(),

  // The ECDSA P-256 public key in JWK format
  publicKeyJwk: jsonb("public_key_jwk").notNull(),

  status: deviceKeyStatusEnum("status").notNull().default("active"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),

  // Revocation details
  revokedAt: timestamp("revoked_at"),
  revokeReason: text("revoke_reason"),

  // Last time this key was used to sign an operation that was synced
  lastUsedAt: timestamp("last_used_at"),
}, (table) => [
  index("idx_device_keys_agent").on(table.agentId),
  index("idx_device_keys_status").on(table.status),
  index("idx_device_keys_fingerprint").on(table.deviceFingerprint),
]);

export const insertDeviceKeySchema = createInsertSchema(deviceKeys);
export type InsertDeviceKey = z.infer<typeof insertDeviceKeySchema>;
export type DeviceKey = typeof deviceKeys.$inferSelect;

// ========== DEVICE SYNC STATES TABLE ==========

/**
 * État de synchronisation déclaré par chaque appareil offline.
 *
 * Le client annonce son nombre d'opérations en attente au handshake
 * (pendingCount) puis après chaque lot uploadé (remainingPending).
 * Ces déclarations alimentent le compteur « opérations offline en
 * attente » de l'écran KPI : tant qu'il est non nul, les indicateurs
 * temps réel sont potentiellement incomplets.
 *
 * Une ligne par appareil (clé = empreinte de l'appareil).
 */
export const deviceSyncStates = pgTable("device_sync_states", {
  deviceId: text("device_id").primaryKey(),

  agentId: uuid("agent_id").notNull().references(() => users.id),
  /** Agence de rattachement au dernier contact (scoping des agrégats) */
  agenceId: uuid("agence_id"),

  /** Opérations en attente déclarées par l'appareil (dernier rapport) */
  reportedPendingCount: integer("reported_pending_count").notNull().default(0),

  lastHandshakeAt: timestamp("last_handshake_at"),
  lastUploadAt: timestamp("last_upload_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dss_agent").on(table.agentId),
  index("idx_dss_agence").on(table.agenceId),
  index("idx_dss_pending").on(table.reportedPendingCount),
]);

export const insertDeviceSyncStateSchema = createInsertSchema(deviceSyncStates);
export type InsertDeviceSyncState = z.infer<typeof insertDeviceSyncStateSchema>;
export type DeviceSyncState = typeof deviceSyncStates.$inferSelect;

// ========== OFFLINE JOURNAL ENTRIES TABLE ==========

/**
 * Server-side storage for synced offline journal entries.
 * These are the authoritative records of offline operations
 * after validation and sync.
 *
 * The hash chain and signatures are preserved for audit purposes.
 */

export const offlineJournalStatusEnum = pgEnum("offline_journal_status", [
  "confirmed",
  "rejected",
  "quarantined",
]);

export const offlineJournalEntries = pgTable("offline_journal_entries", {
  id: text("id").primaryKey(), // UUID from client

  // Client-side ordering
  clientSequence: text("client_sequence").notNull(),
  deviceId: text("device_id").notNull(),
  agentId: uuid("agent_id").notNull().references(() => users.id),
  agenceId: uuid("agence_id").notNull(),

  // Event type
  eventType: text("event_type").notNull(),

  // Payload (stored decrypted on server for auditability)
  payload: jsonb("payload").notNull(),
  payloadHash: text("payload_hash").notNull(),

  // Chain integrity (preserved from client for audit)
  previousHash: text("previous_hash").notNull(),
  entryHash: text("entry_hash").notNull(),

  // Signature (preserved for audit/compliance)
  signature: text("signature").notNull(),
  deviceKeyId: text("device_key_id").notNull().references(() => deviceKeys.id),

  // Timestamps
  clientTimestamp: timestamp("client_timestamp").notNull(), // Agent's local time
  ntpOffset: text("ntp_offset"), // In milliseconds
  serverTimestamp: timestamp("server_timestamp").defaultNow().notNull(),
  serverSequence: text("server_sequence"), // Global ordering

  // Processing status
  status: offlineJournalStatusEnum("status").notNull().default("confirmed"),
  rejectReason: text("reject_reason"),

  // Link to the server-side mouvement/operation created from this entry
  mouvementId: text("mouvement_id"),
  operationRef: text("operation_ref"),

  // Session reference
  offlineSessionDate: text("offline_session_date"), // YYYY-MM-DD

  // Idempotency
  idempotencyKey: text("idempotency_key").notNull().unique(),

  // Metadata (GPS, billetage, etc.)
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_oje_agent").on(table.agentId),
  index("idx_oje_agence").on(table.agenceId),
  index("idx_oje_status").on(table.status),
  index("idx_oje_device_key").on(table.deviceKeyId),
  index("idx_oje_session_date").on(table.agentId, table.offlineSessionDate),
  index("idx_oje_server_timestamp").on(table.serverTimestamp),
]);

export const insertOfflineJournalEntrySchema = createInsertSchema(offlineJournalEntries);
export type InsertOfflineJournalEntry = z.infer<typeof insertOfflineJournalEntrySchema>;
export type OfflineJournalEntry = typeof offlineJournalEntries.$inferSelect;

// ========== OFFLINE DAY SESSIONS TABLE ==========

export const offlineDaySessionStatusEnum = pgEnum("offline_day_session_status", [
  "synced",
  "reconciled",
  "pending_review",
  "flagged",
]);

/**
 * Server-side record of an agent's offline day session.
 * Tracks opening/closing balances and reconciliation status.
 */
export const offlineDaySessions = pgTable("offline_day_sessions", {
  id: text("id").primaryKey().default("gen_random_uuid()"),

  date: text("date").notNull(), // YYYY-MM-DD
  agentId: uuid("agent_id").notNull().references(() => users.id),
  deviceId: text("device_id").notNull(),
  agenceId: uuid("agence_id").notNull(),

  // Opening
  openingBalance: text("opening_balance").notNull(), // Stored as text for precision
  openingBilletage: jsonb("opening_billetage"),

  // Closing
  closingBalance: text("closing_balance"),
  closingBilletage: jsonb("closing_billetage"),

  // Computed totals (from confirmed journal entries)
  totalCollected: text("total_collected").default("0"),
  totalDisbursed: text("total_disbursed").default("0"),
  operationCount: text("operation_count").default("0"),
  dailyVolume: text("daily_volume").default("0"),

  // Reconciliation
  expectedBalance: text("expected_balance"), // Computed by server
  discrepancy: text("discrepancy"), // closingBalance - expectedBalance
  discrepancyJustification: text("discrepancy_justification"),

  status: offlineDaySessionStatusEnum("status").notNull().default("synced"),

  // Journal chain references
  firstEntryId: text("first_entry_id"),
  lastEntryId: text("last_entry_id"),
  entryCount: text("entry_count").default("0"),
  chainValid: text("chain_valid"), // 'true' or 'false'

  // Timestamps
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at"),
  syncedAt: timestamp("synced_at").defaultNow(),
  reconciledAt: timestamp("reconciled_at"),
  reconciledBy: uuid("reconciled_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ods_agent_date").on(table.agentId, table.date),
  index("idx_ods_status").on(table.status),
  index("idx_ods_agence").on(table.agenceId),
]);

export const insertOfflineDaySessionSchema = createInsertSchema(offlineDaySessions);
export type InsertOfflineDaySession = z.infer<typeof insertOfflineDaySessionSchema>;
export type OfflineDaySession = typeof offlineDaySessions.$inferSelect;
