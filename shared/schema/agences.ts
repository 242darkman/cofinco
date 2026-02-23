import { pgTable, text, varchar, boolean, numeric, timestamp, uuid, date, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { sql } from "drizzle-orm";
import { typeAgenceEnum } from "../enum/enums";
import { TypeAgence } from "../enum/status-constants";

// Agences table - Liste des agences/succursales
export const agences = pgTable("agences", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeAgence: varchar("code_agence", { length: 20 }).notNull().unique(),
  nom: text("nom").notNull(),
  typeAgence: typeAgenceEnum("type_agence").notNull().default(TypeAgence.SECONDARY),
  adresse: text("adresse"),
  villeId: uuid("ville_id"), // FK to villes table (no TS ref to avoid circular) — pays déduit via villes.paysId
  telephone: text("telephone"),
  email: text("email"),
  responsableId: uuid("responsable_id").references(() => users.id),
  responsableNom: text("responsable_nom"),
  responsablePhone: text("responsable_phone"),
  statut: text("statut").notNull().default("DRAFT"),
  dateOuverture: date("date_ouverture"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  notes: text("notes"),
  // Workflow fields
  activatedAt: timestamp("activated_at"),
  activatedBy: uuid("activated_by").references(() => users.id),
  suspendedAt: timestamp("suspended_at"),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertAgenceSchema = createInsertSchema(agences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgence = z.infer<typeof insertAgenceSchema>;
export type Agence = typeof agences.$inferSelect;

// Agency Status History - Audit trail for all status transitions
export const agencyStatusHistory = pgTable("agency_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),        // null on creation
  toStatus: text("to_status").notNull(),
  changedBy: uuid("changed_by").notNull().references(() => users.id),
  reason: text("reason"),                 // mandatory for suspend/close/reject
  checklistSnapshot: jsonb("checklist_snapshot"), // snapshot of checklist at activation
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxAgence: index("idx_agency_status_history_agence").on(t.agenceId),
  idxCreatedAt: index("idx_agency_status_history_date").on(t.createdAt),
}));

export const insertAgencyStatusHistorySchema = createInsertSchema(agencyStatusHistory).omit({ id: true, createdAt: true });
export type InsertAgencyStatusHistory = z.infer<typeof insertAgencyStatusHistorySchema>;
export type AgencyStatusHistory = typeof agencyStatusHistory.$inferSelect;

// UserAgences table - Table de liaison pour les utilisateurs multi-agences
export const userAgences = pgTable(
  "user_agences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false), // Agence principale de l'utilisateur
    role: text("role"), // Rôle spécifique à cette agence (optionnel)
    dateAffectation: date("date_affectation").defaultNow(),
    dateFin: date("date_fin"), // Si l'affectation est temporaire
    actif: boolean("actif").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    uqUserPrimary: uniqueIndex("uq_user_agences_primary").on(t.userId).where(sql`${t.isPrimary} IS TRUE`),
  }),
);

export const insertUserAgenceSchema = createInsertSchema(userAgences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserAgence = z.infer<typeof insertUserAgenceSchema>;
export type UserAgence = typeof userAgences.$inferSelect;
