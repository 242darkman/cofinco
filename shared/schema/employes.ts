import { pgTable, text, varchar, integer, boolean, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";

/**
 * Table des employés - Données métier RH
 * Liée à la table users pour l'identité commune
 *
 * IMPORTANT: Les rôles sont gérés via la table user_roles (voir auth.ts)
 * - Un employé peut avoir plusieurs rôles
 * - Le rôle principal (isPrimary=true) est utilisé par défaut
 * - Les rôles peuvent être scopés par agence
 */
export const employes = pgTable("employes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),

  // Identité RH
  matricule: varchar("matricule", { length: 50 }).unique(),
  poste: varchar("poste", { length: 100 }),
  departement: varchar("departement", { length: 100 }),
  dateEmbauche: date("date_embauche"),
  typeContrat: varchar("type_contrat", { length: 20 }).default("CDI"), // 'CDI', 'CDD', 'Stage', 'Intérim'

  // Organisation
  agenceId: uuid("agence_id").references(() => agences.id),
  managerId: uuid("manager_id"), // Self-reference vers employes.id (géré au niveau app)
  // NOTE: roleSystem a été supprimé - utiliser user_roles à la place
  statut: text("statut").notNull().default("ACTIVE"),

  // Rémunération
  salaireBase: integer("salaire_base").default(0),
  tauxHoraire: integer("taux_horaire").default(0),
  tauxJournalier: integer("taux_journalier").default(0),
  modeCalculPaie: varchar("mode_calcul_paie", { length: 20 }).default("MONTHLY"), // 'MONTHLY', 'HOURLY', 'DAILY'

  // Sécurité Caisse
  caissePin: text("caisse_pin"), // PIN hashé pour autorisation caisse

  // Métadonnées
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeSchema = createInsertSchema(employes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmploye = z.infer<typeof insertEmployeSchema>;
export type Employe = typeof employes.$inferSelect;

// Type combiné User + Employe pour le frontend
export interface EmployeWithUser extends Employe {
  user: {
    id: string;
    username: string | null;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    sexe: string | null;
    photoProfile: string | null;
    statut: string;
  };
}
