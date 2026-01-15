import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";

export const agencyMigrations = pgTable("agency_migrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceAgencyId: uuid("source_agency_id").notNull().references(() => agences.id),
  targetClientsAgencyId: uuid("target_clients_agency_id").references(() => agences.id),
  targetEmployeesAgencyId: uuid("target_employees_agency_id").references(() => agences.id),
  targetTreasuryAgencyId: uuid("target_treasury_agency_id").references(() => agences.id),
  
  status: text("status").notNull().default("PENDING"), // PENDING, PROCESSING, COMPLETED, FAILED
  progress: integer("progress").notNull().default(0), // 0-100
  logs: jsonb("logs").default([]), // Array of step logs
  
  error: text("error"),
  
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertAgencyMigrationSchema = createInsertSchema(agencyMigrations).omit({ 
  id: true, 
  createdAt: true, 
  completedAt: true, 
  progress: true, 
  status: true, 
  logs: true,
  error: true 
});

export type InsertAgencyMigration = z.infer<typeof insertAgencyMigrationSchema>;
export type AgencyMigration = typeof agencyMigrations.$inferSelect;
