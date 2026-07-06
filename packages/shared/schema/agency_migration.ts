import { pgTable, text, integer, timestamp, uuid, jsonb, boolean, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";

/**
 * Statuts possibles pour une migration d'agence
 */
export const MIGRATION_STATUS = {
  DRAFT: "DRAFT",                    // Brouillon, non soumis
  PENDING: "PENDING",                // Soumis, en attente d'exécution planifiée
  SCHEDULED: "SCHEDULED",            // Planifié pour une date future
  PRE_FLIGHT_CHECK: "PRE_FLIGHT_CHECK", // Vérifications en cours
  PROCESSING: "PROCESSING",          // Migration en cours d'exécution
  COMPLETED: "COMPLETED",            // Migration terminée avec succès
  FAILED: "FAILED",                  // Migration échouée
  CANCELLED: "CANCELLED",            // Migration annulée
  ROLLED_BACK: "ROLLED_BACK"         // Migration annulée après rollback
} as const;

/**
 * Statuts possibles pour l'agence source pendant la migration.
 * Aligné avec StatutAgence de status-constants.ts.
 */
export const AGENCY_MIGRATION_MODE = {
  ACTIVE: "ACTIVE",
  CLOSING_PENDING: "CLOSING_PENDING",
  CLOSED: "CLOSED",
} as const;

/**
 * Types d'entités trackés dans les entity logs de migration
 */
export const MIGRATION_ENTITY_TYPE = {
  CLIENT: "CLIENT",
  COMPTE: "COMPTE",
  CREDIT: "CREDIT",
  DEMANDE_CREDIT: "DEMANDE_CREDIT",
  TONTINE: "TONTINE",
  EMPLOYE: "EMPLOYE",
  MOUVEMENT_FINANCIER: "MOUVEMENT_FINANCIER",
  SESSION_CAISSE: "SESSION_CAISSE",
  OPERATION_CAISSE: "OPERATION_CAISSE",
  CAISSE: "CAISSE",
  REMBOURSEMENT: "REMBOURSEMENT",
  ENQUETE_CREDIT: "ENQUETE_CREDIT",
  COFFRE_FORT: "COFFRE_FORT",
  VIREMENT_PROGRAMME: "VIREMENT_PROGRAMME",
  MEMBRE_TONTINE: "MEMBRE_TONTINE",
  CONTRIBUTION_TONTINE: "CONTRIBUTION_TONTINE",
  TONTINE_CYCLE: "TONTINE_CYCLE",
  TONTINE_TURN: "TONTINE_TURN",
  TONTINE_SCHEDULE: "TONTINE_SCHEDULE",
  DOSSIER_CREDIT: "DOSSIER_CREDIT",
  TRANSFERT_COFFRE_CAISSE: "TRANSFERT_COFFRE_CAISSE",
  TREASURY_TRANSFER: "TREASURY_TRANSFER",
} as const;

export type MigrationEntityType = (typeof MIGRATION_ENTITY_TYPE)[keyof typeof MIGRATION_ENTITY_TYPE];

/**
 * Table principale des migrations d'agence
 */
export const agencyMigrations = pgTable("agency_migrations", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Référence unique pour l'audit
  reference: text("reference").notNull().unique(), // MIG-YYYY-XXXXXX

  // Agence source
  sourceAgencyId: uuid("source_agency_id").notNull().references(() => agences.id),

  // Agences cibles (permettent des migrations différenciées)
  targetClientsAgencyId: uuid("target_clients_agency_id").references(() => agences.id),
  targetEmployeesAgencyId: uuid("target_employees_agency_id").references(() => agences.id),
  targetTreasuryAgencyId: uuid("target_treasury_agency_id").references(() => agences.id),

  // Statut et progression
  statut: text("statut").notNull().default(MIGRATION_STATUS.DRAFT),
  progress: integer("progress").notNull().default(0), // 0-100
  currentStep: text("current_step"), // Étape en cours (clients, comptes, credits, etc.)

  // Planification
  scheduledAt: timestamp("scheduled_at"), // Date/heure d'exécution planifiée (NULL = immédiat)
  executionStartedAt: timestamp("execution_started_at"),

  // Dry Run (Simulation)
  isDryRun: boolean("is_dry_run").notNull().default(false),
  dryRunResult: jsonb("dry_run_result"), // Résultat de la simulation

  // Logs détaillés (immutables une fois écrits)
  logs: jsonb("logs").default([]), // Array<{step, timestamp, details, success}>

  // Gestion des erreurs
  error: text("error"),
  errorDetails: jsonb("error_details"), // Stack trace, contexte, etc.
  canRetry: boolean("can_retry").notNull().default(true),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),

  // Rapport final
  report: jsonb("report"), // MigrationReport (volumétrie, finance, checksum)
  reportGeneratedAt: timestamp("report_generated_at"),
  reportDocumentId: uuid("report_document_id"), // Référence vers documents si PDF généré

  // Audit et traçabilité
  createdBy: uuid("created_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id), // Validation manager
  approvedAt: timestamp("approved_at"),
  executedBy: uuid("executed_by").references(() => users.id), // Qui a déclenché l'exécution

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),

  // Verrouillage (empêche modifications après démarrage)
  locked: boolean("locked").notNull().default(false),
  lockedAt: timestamp("locked_at"),

  // Metadata extensible
  metadata: jsonb("metadata")
}, (table) => ({
  idxMigrationStatus: index("idx_agency_migration_status").on(table.statut),
  idxMigrationSourceAgency: index("idx_agency_migration_source").on(table.sourceAgencyId),
  idxMigrationScheduledAt: index("idx_agency_migration_scheduled").on(table.scheduledAt),
  idxMigrationCreatedAt: index("idx_agency_migration_created").on(table.createdAt),
  uqMigrationReference: uniqueIndex("uq_agency_migration_reference").on(table.reference),
}));

/**
 * Pre-flight checks (garde-fous) pour une migration
 */
export const migrationPreFlightChecks = pgTable("migration_pre_flight_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  migrationId: uuid("migration_id").notNull().references(() => agencyMigrations.id, { onDelete: "cascade" }),

  // Type de vérification
  checkType: text("check_type").notNull(), // OPEN_SESSIONS, PENDING_TRANSFERS, ACTIVE_OPERATIONS, BALANCE_VERIFICATION

  // Résultat
  passed: boolean("passed").notNull(),
  blocking: boolean("blocking").notNull().default(true), // Si échec = bloquant

  // Détails
  message: text("message"),
  details: jsonb("details"), // Données spécifiques (ex: liste des sessions ouvertes)

  // Suggestions de résolution
  resolution: text("resolution"), // Action suggérée pour résoudre

  checkedAt: timestamp("checked_at").defaultNow(),
  checkedBy: uuid("checked_by").references(() => users.id),
}, (table) => ({
  idxPreFlightMigration: index("idx_pre_flight_migration").on(table.migrationId),
  idxPreFlightType: index("idx_pre_flight_type").on(table.checkType),
}));

/**
 * Détail des entités migrées (pour audit et rollback potentiel)
 */
export const migrationEntityLogs = pgTable("migration_entity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  migrationId: uuid("migration_id").notNull().references(() => agencyMigrations.id, { onDelete: "cascade" }),

  // Entité migrée
  entityType: text("entity_type").notNull(), // CLIENT, COMPTE, CREDIT, EMPLOYE, TONTINE, etc.
  entityId: uuid("entity_id").notNull(),

  // Données avant/après (pour audit et rollback)
  previousAgencyId: uuid("previous_agency_id").notNull(),
  newAgencyId: uuid("new_agency_id").notNull(),

  // Snapshot des données au moment de la migration (optionnel, pour audit complet)
  snapshotBefore: jsonb("snapshot_before"),

  // Statut
  success: boolean("success").notNull().default(true),
  error: text("error"),

  migratedAt: timestamp("migrated_at").defaultNow(),
}, (table) => ({
  idxEntityLogMigration: index("idx_entity_log_migration").on(table.migrationId),
  idxEntityLogType: index("idx_entity_log_type").on(table.entityType),
  idxEntityLogEntity: index("idx_entity_log_entity").on(table.entityType, table.entityId),
}));

/**
 * Audit log pour les migrations (immutable)
 */
export const migrationAuditLogs = pgTable("migration_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  migrationId: uuid("migration_id").notNull().references(() => agencyMigrations.id, { onDelete: "cascade" }),

  // Action
  action: text("action").notNull(), // CREATED, SCHEDULED, APPROVED, STARTED, STEP_COMPLETED, FAILED, COMPLETED, CANCELLED, ROLLBACK

  // État avant/après
  statutAvant: text("statut_avant"),
  statutApres: text("statut_apres"),

  // Détails
  details: jsonb("details").notNull(),

  // Acteur
  userId: uuid("user_id").references(() => users.id),
  userRole: text("user_role"),
  userName: text("user_name"),

  // Contexte
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  // Timestamp immuable
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  idxAuditMigration: index("idx_migration_audit_migration").on(table.migrationId),
  idxAuditAction: index("idx_migration_audit_action").on(table.action),
  idxAuditTimestamp: index("idx_migration_audit_timestamp").on(table.timestamp),
}));

// ============================================
// SCHEMAS DE VALIDATION ZOD
// ============================================

export const insertAgencyMigrationSchema = createInsertSchema(agencyMigrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  progress: true,
  statut: true,
  logs: true,
  error: true,
  errorDetails: true,
  locked: true,
  lockedAt: true,
  reference: true,
  report: true,
  reportGeneratedAt: true,
  reportDocumentId: true,
  executionStartedAt: true,
  dryRunResult: true,
  retryCount: true,
});

export const insertPreFlightCheckSchema = createInsertSchema(migrationPreFlightChecks).omit({
  id: true,
  checkedAt: true,
});

export const insertMigrationEntityLogSchema = createInsertSchema(migrationEntityLogs).omit({
  id: true,
  migratedAt: true,
});

export const insertMigrationAuditLogSchema = createInsertSchema(migrationAuditLogs).omit({
  id: true,
  timestamp: true,
});

// ============================================
// TYPES TYPESCRIPT
// ============================================

export type InsertAgencyMigration = z.infer<typeof insertAgencyMigrationSchema>;
export type AgencyMigration = typeof agencyMigrations.$inferSelect;

export type InsertPreFlightCheck = z.infer<typeof insertPreFlightCheckSchema>;
export type PreFlightCheck = typeof migrationPreFlightChecks.$inferSelect;

export type InsertMigrationEntityLog = z.infer<typeof insertMigrationEntityLogSchema>;
export type MigrationEntityLog = typeof migrationEntityLogs.$inferSelect;

export type InsertMigrationAuditLog = z.infer<typeof insertMigrationAuditLogSchema>;
export type MigrationAuditLog = typeof migrationAuditLogs.$inferSelect;

// ============================================
// INTERFACES POUR LE RAPPORT
// ============================================

export interface MigrationVolumetry {
  clients: number;
  comptes: number;
  credits: number;
  demandesCredit: number;
  tontines: number;
  employes: number;
  sessionsCaisse: number;
  mouvementsFinanciers: number;
  operationsCaisse: number;
  virementsProgrammes: number;
  dossiersCredit: number;
  membresTontine: number;
  contributionsTontine: number;
  tontineCycles: number;
  tontineTurns: number;
  tontineSchedules: number;
  transfertsCoffreCaisse: number;
}

export interface MigrationOptions {
  includeArchived?: boolean;       // Inclure les entités archivées (default: false)
  includeCancelled?: boolean;      // Inclure les entités annulées (default: false)
  batchSize?: number;              // Taille de batch pour les entity logs (default: 500)
  snapshotFields?: "minimal" | "full"; // Niveau de détail du snapshot (default: "minimal")
}

export interface MigrationFinancials {
  soldesCoffresTransferes: number;
  totalSoldesComptes: number;
  totalCreditsEnCours: number;
  totalDemandesEnAttente: number;
}

export interface MigrationReport {
  // Volumétrie
  volumetry: MigrationVolumetry;

  // Données financières
  financials: MigrationFinancials;

  // Intégrité
  checksum: string; // Hash SHA256 des données migrées

  // Timing
  durationMs: number;
  startedAt: string;
  completedAt: string;

  // Erreurs (s'il y en a eu des non-bloquantes)
  warnings: string[];

  // Détail par étape
  steps: Array<{
    name: string;
    count: number;
    durationMs: number;
    success: boolean;
  }>;
}

export interface DryRunResult {
  // Entités qui seraient migrées
  volumetry: MigrationVolumetry;

  // Vérifications préalables
  preFlightChecks: Array<{
    type: string;
    passed: boolean;
    blocking: boolean;
    message: string;
    details?: any;
  }>;

  // Conflits potentiels détectés
  conflicts: Array<{
    type: string;
    entityId: string;
    description: string;
    resolution: string;
  }>;

  // Estimation financière
  financials: MigrationFinancials;

  // Avertissements
  warnings: string[];

  // Est-ce que la migration peut procéder?
  canProceed: boolean;
  blockingReasons: string[];
}
