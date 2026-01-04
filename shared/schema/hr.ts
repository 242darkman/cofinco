import { pgTable, varchar, text, date, timestamp, integer, serial, uuid, boolean, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { employes } from "./employes";

/**
 * Tables pour le module Ressources Humaines
 */

// Demandes de congés
export const demandesConges = pgTable("demandes_conges", {
  id: serial("id").primaryKey(),
  employeId: uuid("employe_id").notNull().references(() => employes.id),
  employeNom: varchar("employe_nom").notNull(), // Dénormalisé pour performance
  type: varchar("type").notNull(), // 'Congé Annuel', 'Congé Maladie', 'Congé Sans Solde', 'Congé Maternité'
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  motif: text("motif"),
  statut: varchar("statut").notNull().default("En attente"), // 'En attente', 'Approuvé', 'Refusé'
  approuvePar: uuid("approuve_par"), // User ID qui a approuvé/refusé
  dateDecision: timestamp("date_decision"),
  commentaire: text("commentaire"), // Commentaire de l'approbateur
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Formations
export const formations = pgTable("formations", {
  id: serial("id").primaryKey(),
  titre: varchar("titre").notNull(),
  formateur: varchar("formateur").notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  duree: varchar("duree").notNull(), // Ex: "3 jours", "2 semaines"
  lieu: varchar("lieu"),
  description: text("description"),
  programme: text("programme"), // Détail du programme
  statut: varchar("statut").notNull().default("Planifiée"), // 'Planifiée', 'En cours', 'Terminée', 'Annulée'
  capaciteMax: integer("capacite_max"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

// Participants aux formations (relation many-to-many)
export const formationParticipants = pgTable("formation_participants", {
  formationId: integer("formation_id").notNull().references(() => formations.id, { onDelete: "cascade" }),
  employeId: uuid("employe_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  employeNom: varchar("employe_nom").notNull(), // Dénormalisé
  dateInscription: timestamp("date_inscription").defaultNow().notNull(),
  presence: varchar("presence").default("Non noté"), // 'Présent', 'Absent', 'Non noté'
  evaluation: text("evaluation"), // Notes ou feedback post-formation
});

// Sanctions disciplinaires
export const sanctions = pgTable("sanctions", {
  id: serial("id").primaryKey(),
  employeId: uuid("employe_id").notNull().references(() => employes.id),
  employeNom: varchar("employe_nom").notNull(), // Dénormalisé
  type: varchar("type").notNull(), // 'Avertissement', 'Blâme', 'Mise à pied', 'Autre'
  motif: text("motif").notNull(),
  date: date("date").notNull(),
  gravite: varchar("gravite").notNull(), // 'Faible', 'Moyenne', 'Grave'
  emetteurId: uuid("emetteur_id"), // User ID qui a émis la sanction
  documentsJoints: text("documents_joints"), // URLs séparées par virgules
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Candidatures
export const candidatures = pgTable("candidatures", {
  id: serial("id").primaryKey(),
  nom: varchar("nom").notNull(),
  prenom: varchar("prenom").notNull(),
  email: varchar("email").notNull(),
  telephone: varchar("telephone"),
  posteVise: varchar("poste_vise").notNull(),
  experience: text("experience"), // Description de l'expérience
  formation: text("formation"), // Diplômes et certificats
  datePostulation: date("date_postulation").defaultNow().notNull(),
  statut: varchar("statut").notNull().default("En attente"), // 'En attente', 'Entretien', 'Accepté', 'Refusé'
  cvUrl: varchar("cv_url"), // Lien vers CV stocké
  lettreMotivationUrl: varchar("lettre_motivation_url"),
  notes: text("notes"), // Notes internes du recruteur
  dateEntretien: date("date_entretien"),
  responsableRhId: uuid("responsable_rh_id"), // User ID du RH en charge
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bulletins de paie (archivage)
export const bulletinsPaie = pgTable("bulletins_paie", {
  id: serial("id").primaryKey(),
  employeId: uuid("employe_id").notNull().references(() => employes.id),
  employeNom: varchar("employe_nom").notNull(), // Dénormalisé
  mois: varchar("mois").notNull(), // Format: 'YYYY-MM'
  salaireBase: varchar("salaire_base").notNull(),
  primeAnciennete: varchar("prime_anciennete").default("0"),
  primeTransport: varchar("prime_transport").default("0"),
  primeRendement: varchar("prime_rendement").default("0"),
  autresPrimes: varchar("autres_primes").default("0"),
  salaireBrut: varchar("salaire_brut").notNull(),
  cnssEmploye: varchar("cnss_employe").notNull(),
  ipr: varchar("ipr").notNull(), // Impôt
  autresRetenues: varchar("autres_retenues").default("0"),
  totalRetenues: varchar("total_retenues").notNull(),
  salaireNet: varchar("salaire_net").notNull(),
  cnssPatronale: varchar("cnss_patronale").notNull(),
  pdfUrl: varchar("pdf_url"), // URL du PDF généré stocké dans Loge Cloud
  pdfHash: varchar("pdf_hash"), // Hash SHA256 pour vérifier l'intégrité
  genereParId: uuid("genere_par_id"), // User ID qui a généré
  statut: varchar("statut").default("Brouillon"), // 'Brouillon', 'Validé', 'Payé'
  datePaiement: date("date_paiement"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Avantages (Catalog)
export const avantages = pgTable("avantages", {
  id: serial("id").primaryKey(),
  nom: varchar("nom").notNull(),
  type: varchar("type").notNull(), // 'Prime', 'Assurance', 'Avantage en nature'
  montantParDefaut: integer("montant_par_defaut").default(0),
  description: text("description"),
  eligibleContrats: json("eligible_contrats").$type<string[]>(), // Tableau des types de contrats éligibles ex: ["CDI", "CDD"]
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

// Avantages assignés aux employés
export const avantagesEmployes = pgTable("avantages_employes", {
  id: serial("id").primaryKey(),
  employeId: uuid("employe_id").notNull().references(() => employes.id),
  avantageId: integer("avantage_id").notNull().references(() => avantages.id),
  montant: integer("montant").notNull(), // Montant spécifique pour cet employé
  dateAttribution: date("date_attribution").defaultNow().notNull(),
  statut: varchar("statut").default("Actif"), // 'Actif', 'Suspendu'
});

// Suivi de présence
export const presences = pgTable("presences", {
  id: serial("id").primaryKey(),
  employeId: uuid("employe_id").notNull().references(() => employes.id),
  date: date("date").notNull(),
  statut: varchar("statut").notNull(), // 'Présent', 'Absent', 'Retard', 'Congé', 'Mission'
  heureArrivee: timestamp("heure_arrivee"),
  pauseDebut: timestamp("pause_debut"), // Départ pause déjeuner
  pauseFin: timestamp("pause_fin"), // Retour de pause
  heureDepart: timestamp("heure_depart"),
  heuresTravaillees: integer("heures_travaillees").default(0), // En minutes
  heuresSupplementaires: integer("heures_supplementaires").default(0), // En minutes
  retardJustifie: boolean("retard_justifie").default(false),
  commentaire: text("commentaire"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Horaires de travail (emploi du temps)
export const horairesTravail = pgTable("horaires_travail", {
  id: serial("id").primaryKey(),
  employeId: uuid("employe_id").notNull().references(() => employes.id),
  jourSemaine: integer("jour_semaine").notNull(), // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  heureDebut: varchar("heure_debut").notNull(), // Format "HH:MM" ex: "08:00"
  heureFin: varchar("heure_fin").notNull(), // Format "HH:MM" ex: "17:00"
  pauseMinutes: integer("pause_minutes").default(60), // Durée pause déjeuner en minutes
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Export Zod schemas and types
export const insertAvantageSchema = createInsertSchema(avantages).omit({ id: true, createdAt: true });
export type InsertAvantage = z.infer<typeof insertAvantageSchema>;
export type Avantage = typeof avantages.$inferSelect;

export const insertAvantageEmployeSchema = createInsertSchema(avantagesEmployes).omit({ id: true });
export type InsertAvantageEmploye = z.infer<typeof insertAvantageEmployeSchema>;
export type AvantageEmploye = typeof avantagesEmployes.$inferSelect;

export const insertPresenceSchema = createInsertSchema(presences).omit({ id: true, createdAt: true });
export type InsertPresence = z.infer<typeof insertPresenceSchema>;
export type Presence = typeof presences.$inferSelect;

export const insertHoraireTravailSchema = createInsertSchema(horairesTravail).omit({ id: true, createdAt: true });
export type InsertHoraireTravail = z.infer<typeof insertHoraireTravailSchema>;
export type HoraireTravail = typeof horairesTravail.$inferSelect;

export const insertBulletinPaieSchema = createInsertSchema(bulletinsPaie).omit({ id: true, createdAt: true });
export type InsertBulletinPaie = z.infer<typeof insertBulletinPaieSchema>;
export type BulletinPaie = typeof bulletinsPaie.$inferSelect;
