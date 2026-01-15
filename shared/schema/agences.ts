import { pgTable, text, varchar, integer, boolean, numeric, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";

// Agences table - Liste des agences/succursales
export const agences = pgTable("agences", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeAgence: varchar("code_agence", { length: 20 }).notNull().unique(),
  nom: text("nom").notNull(),
  typeAgence: text("type_agence").notNull().default("Secondaire"), // 'Principale', 'Secondaire', 'Kiosque'
  adresse: text("adresse"),
  ville: text("ville"),
  region: text("region"),
  pays: text("pays").default("Congo-Brazzaville"),
  telephone: text("telephone"),
  email: text("email"),
  responsableId: uuid("responsable_id").references(() => users.id),
  responsableNom: text("responsable_nom"),
  responsablePhone: text("responsable_phone"),
  statut: text("statut").notNull().default("Actif"), // 'Actif', 'Suspendu', 'Fermé'
  dateOuverture: date("date_ouverture"),
  nombreEmployes: integer("nombre_employes").default(0),
  nombreClients: integer("nombre_clients").default(0),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertAgenceSchema = createInsertSchema(agences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgence = z.infer<typeof insertAgenceSchema>;
export type Agence = typeof agences.$inferSelect;

// UserAgences table - Table de liaison pour les utilisateurs multi-agences
export const userAgences = pgTable("user_agences", {
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
});

export const insertUserAgenceSchema = createInsertSchema(userAgences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserAgence = z.infer<typeof insertUserAgenceSchema>;
export type UserAgence = typeof userAgences.$inferSelect;
