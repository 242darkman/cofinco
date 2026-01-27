import { pgTable, varchar, text, date, timestamp, integer, serial, uuid, boolean, json, numeric, inet } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { employes } from "./employes";
import { agences } from "./agences";

/**
 * Tables pour le module Ressources Humaines
 *
 * Architecture:
 * - employes: Table master (définie dans employes.ts)
 * - demandesConges: Demandes de congés avec workflow approbation
 * - leaveBalances: Soldes de congés par employé/année
 * - formations: Programmes de formation
 * - formationParticipants: Participants aux formations
 * - sanctions: Sanctions disciplinaires
 * - candidatures: Recrutement/candidatures
 * - bulletinsPaie: Fiches de paie générées
 * - avantages: Catalogue des avantages
 * - avantagesEmployes: Avantages assignés aux employés
 * - presences: Pointage présence journalier
 * - horairesTravail: Emplois du temps
 * - hrAuditLog: Audit trail des actions RH
 * - payrollConfig: Configuration paramètres paie
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
  statut: varchar("statut").notNull().default("PENDING"), // 'PENDING', 'APPROVED', 'REJECTED'
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
  statut: varchar("statut").notNull().default("PLANNED"), // 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
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
  statut: varchar("statut").notNull().default("PENDING"), // 'PENDING', 'INTERVIEW', 'ACCEPTED', 'REJECTED'
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
  statut: varchar("statut").default("DRAFT"), // 'DRAFT', 'VALIDATED', 'PAID'
  datePaiement: date("date_paiement"),
  // GL Posting tracking (PR-4)
  engagementMouvementId: uuid("engagement_mouvement_id"), // Set when VALIDATED → mouvement engagement
  paiementMouvementId: uuid("paiement_mouvement_id"),     // Set when PAID → mouvement décaissement
  engagementEcritureId: uuid("engagement_ecriture_id"),   // GL écriture for engagement
  paiementEcritureId: uuid("paiement_ecriture_id"),       // GL écriture for payment
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
  statut: varchar("statut").default("ACTIVE"), // 'ACTIVE', 'SUSPENDED'
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

// ============================================
// NOUVELLES TABLES PRODUCTION-READY
// ============================================

// Soldes de congés par employé et année
export const leaveBalances = pgTable("leave_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeId: uuid("employe_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  leaveType: varchar("leave_type", { length: 50 }).notNull().default("Congé Annuel"),
  // Quotas
  initialAllocation: integer("initial_allocation").notNull().default(30),
  acquired: integer("acquired").notNull().default(0),
  used: integer("used").notNull().default(0),
  pending: integer("pending").notNull().default(0),
  // Report année précédente
  carryOver: integer("carry_over").default(0),
  expiryDate: date("expiry_date"),
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit trail pour actions RH sensibles
export const hrAuditLog = pgTable("hr_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Target
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 'employe', 'conge', 'bulletin', etc.
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  // Action
  action: varchar("action", { length: 50 }).notNull(), // 'created', 'approved', 'rejected', etc.
  // Actor
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorName: varchar("actor_name", { length: 255 }),
  actorRole: varchar("actor_role", { length: 100 }),
  // Changes
  oldValues: json("old_values").$type<Record<string, any>>(),
  newValues: json("new_values").$type<Record<string, any>>(),
  diff: json("diff").$type<Record<string, { old: any; new: any }>>(),
  // Context
  ipAddress: varchar("ip_address", { length: 45 }), // IPv6 max length
  userAgent: text("user_agent"),
  reason: text("reason"),
  // Severity
  severity: varchar("severity", { length: 20 }).default("info"), // 'info', 'warning', 'critical'
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),
});

// Configuration paramètres paie (taux cotisations, IPR, primes)
export const payrollConfig = pgTable("payroll_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Scope (NULL = global)
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "cascade" }),
  // Taux cotisations employé
  cnssEmployeeRate: numeric("cnss_employee_rate", { precision: 5, scale: 4 }).notNull().default("0.0500"),
  cnssEmployerRate: numeric("cnss_employer_rate", { precision: 5, scale: 4 }).notNull().default("0.0900"),
  // Barème IPR (impôt progressif sur le revenu)
  iprBrackets: json("ipr_brackets").$type<IprBracket[]>().notNull().default([
    { min: 0, max: 524000, rate: 0 },
    { min: 524001, max: 1428000, rate: 0.15 },
    { min: 1428001, max: 2700000, rate: 0.30 },
    { min: 2700001, max: null, rate: 0.40 },
  ]),
  // Primes fixes configurables
  transportAllowance: integer("transport_allowance").default(50000),
  housingAllowance: integer("housing_allowance").default(0),
  // Taux heures supplémentaires
  overtimeRate: numeric("overtime_rate", { precision: 3, scale: 2 }).default("1.50"),
  nightShiftRate: numeric("night_shift_rate", { precision: 3, scale: 2 }).default("1.25"),
  holidayRate: numeric("holiday_rate", { precision: 3, scale: 2 }).default("2.00"),
  // Période de validité
  effectiveFrom: date("effective_from").notNull().defaultNow(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true),
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
});

// Type pour les tranches IPR
export interface IprBracket {
  min: number;
  max: number | null;
  rate: number;
}

// ============================================
// Export Zod schemas and types
// ============================================
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

// Leave Balances
export const insertLeaveBalanceSchema = createInsertSchema(leaveBalances).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;
export type LeaveBalance = typeof leaveBalances.$inferSelect;

// HR Audit Log
export const insertHrAuditLogSchema = createInsertSchema(hrAuditLog).omit({ id: true, createdAt: true });
export type InsertHrAuditLog = z.infer<typeof insertHrAuditLogSchema>;
export type HrAuditLog = typeof hrAuditLog.$inferSelect;

// Payroll Config
export const insertPayrollConfigSchema = createInsertSchema(payrollConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayrollConfig = z.infer<typeof insertPayrollConfigSchema>;
export type PayrollConfig = typeof payrollConfig.$inferSelect;

// Demandes Conges (types additionnels)
export const insertDemandeCongeSchema = createInsertSchema(demandesConges).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDemandeConge = z.infer<typeof insertDemandeCongeSchema>;
export type DemandeConge = typeof demandesConges.$inferSelect;

// Formations
export const insertFormationSchema = createInsertSchema(formations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormation = z.infer<typeof insertFormationSchema>;
export type Formation = typeof formations.$inferSelect;

// Sanctions
export const insertSanctionSchema = createInsertSchema(sanctions).omit({ id: true, createdAt: true });
export type InsertSanction = z.infer<typeof insertSanctionSchema>;
export type Sanction = typeof sanctions.$inferSelect;

// Candidatures
export const insertCandidatureSchema = createInsertSchema(candidatures).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCandidature = z.infer<typeof insertCandidatureSchema>;
export type Candidature = typeof candidatures.$inferSelect;

// ============================================
// ENUM CONSTANTS FOR STATUS
// ============================================

export const LeaveStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type LeaveStatusType = typeof LeaveStatus[keyof typeof LeaveStatus];

export const BulletinStatus = {
  DRAFT: 'DRAFT',
  VALIDATED: 'VALIDATED',
  PAID: 'PAID',
  ARCHIVED: 'ARCHIVED',
} as const;
export type BulletinStatusType = typeof BulletinStatus[keyof typeof BulletinStatus];

export const FormationStatus = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type FormationStatusType = typeof FormationStatus[keyof typeof FormationStatus];

export const CandidatureStatus = {
  NEW: 'NEW',
  SCREENING: 'SCREENING',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  HIRED: 'HIRED',
  REJECTED: 'REJECTED',
} as const;
export type CandidatureStatusType = typeof CandidatureStatus[keyof typeof CandidatureStatus];

export const PresenceStatus = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  LATE: 'Retard',
  ON_LEAVE: 'Congé',
  MISSION: 'Mission',
} as const;
export type PresenceStatusType = typeof PresenceStatus[keyof typeof PresenceStatus];

export const SanctionSeverity = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Grave',
} as const;
export type SanctionSeverityType = typeof SanctionSeverity[keyof typeof SanctionSeverity];

export const LeaveType = {
  ANNUAL: 'Congé Annuel',
  SICK: 'Congé Maladie',
  UNPAID: 'Congé Sans Solde',
  MATERNITY: 'Congé Maternité',
  PATERNITY: 'Congé Paternité',
  BEREAVEMENT: 'Congé Décès',
  SPECIAL: 'Congé Spécial',
} as const;
export type LeaveTypeType = typeof LeaveType[keyof typeof LeaveType];

// ============================================
// VALIDATION SCHEMAS (with refinements)
// ============================================

// Schema for creating a leave request with validation
export const createLeaveRequestSchema = z.object({
  employeId: z.string().uuid(),
  employeNom: z.string().min(1),
  type: z.enum([LeaveType.ANNUAL, LeaveType.SICK, LeaveType.UNPAID, LeaveType.MATERNITY, LeaveType.PATERNITY, LeaveType.BEREAVEMENT, LeaveType.SPECIAL]),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motif: z.string().optional(),
}).refine(
  (data) => new Date(data.dateFin) >= new Date(data.dateDebut),
  { message: "La date de fin doit être postérieure ou égale à la date de début", path: ["dateFin"] }
);

// Schema for payroll generation
export const generatePayrollSchema = z.object({
  mois: z.string().regex(/^\d{4}-\d{2}$/, "Format attendu: YYYY-MM"),
});

// Schema for approving/rejecting leave
export const leaveDecisionSchema = z.object({
  commentaire: z.string().optional(),
});

// Schema for payroll config update
export const updatePayrollConfigSchema = z.object({
  cnssEmployeeRate: z.number().min(0).max(1).optional(),
  cnssEmployerRate: z.number().min(0).max(1).optional(),
  iprBrackets: z.array(z.object({
    min: z.number(),
    max: z.number().nullable(),
    rate: z.number().min(0).max(1),
  })).optional(),
  transportAllowance: z.number().min(0).optional(),
  housingAllowance: z.number().min(0).optional(),
  overtimeRate: z.number().min(1).optional(),
  nightShiftRate: z.number().min(1).optional(),
  holidayRate: z.number().min(1).optional(),
});
