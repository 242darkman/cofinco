import { pgTable, text, varchar, integer, boolean, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { pays } from "./pays";
import { jobPositions, departments, type JobPosition, type Department } from "./departments";

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
  jobPositionId: uuid("job_position_id").references(() => jobPositions.id, { onDelete: "set null" }),
  dateEmbauche: date("date_embauche"),
  typeContrat: varchar("type_contrat", { length: 20 }).default("CDI"), // 'CDI', 'CDD', 'Stage', 'Intérim'

  // Organisation
  agenceId: uuid("agence_id").references(() => agences.id),
  managerId: uuid("manager_id"), // Self-reference vers employes.id (géré au niveau app)
  statut: text("statut").notNull().default("ACTIVE"),

  // Rémunération
  salaireBase: integer("salaire_base").default(0),
  tauxHoraire: integer("taux_horaire").default(0),
  tauxJournalier: integer("taux_journalier").default(0),
  modeCalculPaie: varchar("mode_calcul_paie", { length: 20 }).default("MONTHLY"), // 'MONTHLY', 'HOURLY', 'DAILY'

  // CNSS
  numeroCnss: varchar("numero_cnss", { length: 50 }).unique(),

  // Pièce d'identité
  typePiece: varchar("type_piece", { length: 20 }), // 'CNI', 'PASSPORT', 'PERMIS_CONDUIRE', 'CARTE_RESIDENT'
  numeroPiece: text("numero_piece"),
  dateExpirationPiece: date("date_expiration_piece"),
  paysEmissionId: uuid("pays_emission_id").references(() => pays.id, { onDelete: "set null" }),

  // Paiement
  paymentMethod: varchar("payment_method", { length: 20 }).default("CASH"), // 'CASH', 'TRANSFER', 'MOBILE_MONEY', 'CHECK', 'INTERNAL_WALLET'
  paymentDetails: text("payment_details"), // Coordonnées bancaires, N° Mobile Money, etc.

  // Coordonnées bancaires (virement)
  bankName: varchar("bank_name", { length: 100 }),
  bankCode: varchar("bank_code", { length: 10 }),
  branchCode: varchar("branch_code", { length: 10 }),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  accountKey: varchar("account_key", { length: 5 }),

  // Classification
  coefficient: integer("coefficient"),                         // Coefficient salarial (ex: 100, 150, 220)
  categorie: varchar("categorie", { length: 20 }),            // Catégorie (ex: 'CADRE', 'AGENT_MAITRISE', 'OUVRIER')

  // Contrat & Période d'essai
  dateFinContrat: date("date_fin_contrat"),       // Date fin CDD
  dateFinEssai: date("date_fin_essai"),           // Date fin période d'essai
  dureeEssaiMois: integer("duree_essai_mois"),    // Durée période essai en mois (auto-calcul dateFinEssai)
  prochaineMedicale: date("prochaine_medicale"),  // Prochaine visite médicale

  // Sortie
  dateSortie: date("date_sortie"),
  motifSortie: varchar("motif_sortie", { length: 50 }), // DEMISSION, LICENCIEMENT, FIN_CDD, RETRAITE, DECES

  // Fiscal & Social
  niu: varchar("niu", { length: 30 }),                                          // Numéro d'Identification Unique fiscal
  situationFamiliale: varchar("situation_familiale", { length: 20 }).default("CELIBATAIRE"), // CELIBATAIRE, MARIE, VEUF, DIVORCE
  nombreEnfantsCharge: integer("nombre_enfants_charge").default(0),

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
    dateNaissance: Date | string | null;
    lieuNaissance: string | null;
    lieuNaissanceLocalityId: string | null;
    lieuNaissanceLocalityType: string | null;
    nationaliteId: string | null;
    paysNaissanceId: string | null;
    adresse: string | null;
    ville: string | null;
    photoProfile: string | null;
    statut: string;
    typeCompte?: string | null;
    role?: string | null; // Rôle principal depuis userRoles
  };
  nationaliteNom?: string | null;
  paysNaissanceNom?: string | null;
  jobPosition?: JobPosition | null;
  department?: Department | null;
  agence?: {
    id: string;
    nom: string;
    typeAgence: 'MAIN' | 'SECONDARY' | 'KIOSK';
    codeAgence: string;
  } | null;
}
