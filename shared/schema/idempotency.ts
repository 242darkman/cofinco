import { pgTable, text, integer, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";

/**
 * idempotency_keys — Persistent idempotency store (replaces in-memory Map)
 *
 * Ensures financial operations are never duplicated, even across server restarts.
 * Keys expire after TTL and are cleaned up by a periodic SQL function.
 */
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  resourceType: text("resource_type").notNull(),
  statusCode: integer("status_code"),
  responseBody: jsonb("response_body"),
  /** 'processing' while in-flight, 'completed' when response cached */
  status: text("status").notNull().default("processing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("idx_idempotency_keys_expires").on(table.expiresAt),
  index("idx_idempotency_keys_status").on(table.status),
]);
