import { pgTable, text, varchar, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Table des départements
 * Ex: RH, Finance, Commercial, IT, etc.
 */
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

/**
 * Table des postes de travail
 * Ex: Développeur, Comptable, Caissier, Manager, etc.
 * Chaque poste appartient à un département
 */
export const jobPositions = pgTable("job_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id").notNull().references(() => departments.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobPositionSchema = createInsertSchema(jobPositions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobPosition = z.infer<typeof insertJobPositionSchema>;
export type JobPosition = typeof jobPositions.$inferSelect;

// Type combiné avec département pour affichage
export interface JobPositionWithDepartment extends JobPosition {
  department: Department;
}
