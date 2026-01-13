import { pgTable, text, uuid, numeric, timestamp, boolean, json, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { caisses, sessionsCaisse, operationsCaisse, mouvementsFinanciers } from "./finance";

// ========== ENUM STATUT TRANSFERT COFFRE ==========
export const statutTransfertCoffreEnum = pgEnum("statut_transfert_coffre_enum", [
  "Demandé",      // Initiateur a créé la demande
  "Validé",       // Valideur a approuvé
  "Exécuté",      // Exécuteur a finalisé (état terminal)
  "Rejeté",       // Valideur a refusé (état terminal)
  "Annulé",       // Initiateur ou admin a annulé avant validation (état terminal)
]);

export const typeTransfertCoffreEnum = pgEnum("type_transfert_coffre_enum", [
  "COFFRE_VERS_CAISSE",   // Approvisionnement caisse depuis coffre
  "CAISSE_VERS_COFFRE",   // Versement caisse vers coffre
]);

// ========== TABLE TRANSFERTS COFFRE ↔ CAISSE ==========
export const transfertsCoffreCaisse = pgTable(
  "transferts_coffre_caisse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Contexte agence
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "restrict" }),
    
    // Type de transfert
    typeTransfert: typeTransfertCoffreEnum("type_transfert").notNull(),
    
    // Source et destination (l'un est toujours le coffre-fort)
    caisseSourceId: uuid("caisse_source_id").notNull().references(() => caisses.id, { onDelete: "restrict" }),
    caisseDestinationId: uuid("caisse_destination_id").notNull().references(() => caisses.id, { onDelete: "restrict" }),
    
    // Montant et devise
    montant: numeric("montant").notNull(),
    devise: text("devise").notNull().default("XAF"),
    
    // Motif et commentaire
    motif: text("motif").notNull(),
    commentaire: text("commentaire"),
    
    // Référence unique
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),
    
    // Statut workflow
    statut: statutTransfertCoffreEnum("statut").notNull().default("Demandé"),
    
    // Workflow - Phase 1: Demande
    requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    sessionRequestId: uuid("session_request_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
    
    // Workflow - Phase 2: Validation
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    validatedAt: timestamp("validated_at"),
    reasonRejection: text("reason_rejection"),
    
    // Workflow - Phase 3: Exécution
    executedBy: uuid("executed_by").references(() => users.id, { onDelete: "set null" }),
    executedAt: timestamp("executed_at"),
    sessionExecuteId: uuid("session_execute_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
    
    // Liens mouvements financiers (créés à l'exécution)
    mouvementDebitId: uuid("mouvement_debit_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    mouvementCreditId: uuid("mouvement_credit_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    
    // Liens opérations caisse (créées à l'exécution)
    operationSourceId: uuid("operation_source_id").references(() => operationsCaisse.id, { onDelete: "set null" }),
    operationDestId: uuid("operation_dest_id").references(() => operationsCaisse.id, { onDelete: "set null" }),
    
    // Billetage optionnel
    billetage: json("billetage"), // { billets_10000: 5, billets_5000: 10, ... }
    
    // Métadonnées
    metadata: json("metadata"),
    
    // Verrouillage après exécution
    verrouille: boolean("verrouille").notNull().default(false),
    
    // Audit timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Unicité référence
    uqReference: uniqueIndex("uq_transferts_coffre_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_transferts_coffre_idempotency").on(t.idempotencyKey),
    
    // Index de performance
    idxAgenceStatut: index("idx_transferts_coffre_agence_statut").on(t.agenceId, t.statut),
    idxAgenceDate: index("idx_transferts_coffre_agence_date").on(t.agenceId, t.createdAt),
    idxCaisseSource: index("idx_transferts_coffre_source").on(t.caisseSourceId),
    idxCaisseDest: index("idx_transferts_coffre_dest").on(t.caisseDestinationId),
    idxStatutDate: index("idx_transferts_coffre_statut_date").on(t.statut, t.createdAt),
    idxRequestedBy: index("idx_transferts_coffre_requested_by").on(t.requestedBy),
    
    // Contraintes métier
    chkMontantPos: sql`CONSTRAINT chk_transferts_coffre_montant_pos CHECK (${t.montant} > 0)`,
    chkDifferentCaisses: sql`CONSTRAINT chk_transferts_coffre_different CHECK (${t.caisseSourceId} <> ${t.caisseDestinationId})`,
  }),
);

export const insertTransfertCoffreCaisseSchema = createInsertSchema(transfertsCoffreCaisse).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verrouille: true,
});
export type InsertTransfertCoffreCaisse = z.infer<typeof insertTransfertCoffreCaisseSchema>;
export type TransfertCoffreCaisse = typeof transfertsCoffreCaisse.$inferSelect;


// ========== TABLE AUDIT TRANSFERTS COFFRE ==========
export const transfertsCoffreAuditLogs = pgTable(
  "transferts_coffre_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Référence au transfert
    transfertId: uuid("transfert_id").notNull().references(() => transfertsCoffreCaisse.id, { onDelete: "cascade" }),
    
    // Action effectuée
    action: text("action").notNull(), // CREATED, VALIDATED, REJECTED, EXECUTED, CANCELLED
    
    // État avant/après
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres").notNull(),
    
    // Détails de l'action
    details: json("details").notNull(),
    
    // Acteur
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    userRole: text("user_role"),
    
    // Contexte technique
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    
    // Timestamp immuable
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxTransfertId: index("idx_coffre_audit_transfert_id").on(t.transfertId),
    idxAction: index("idx_coffre_audit_action").on(t.action),
    idxTimestamp: index("idx_coffre_audit_timestamp").on(t.timestamp),
  }),
);

export const insertTransfertCoffreAuditLogSchema = createInsertSchema(transfertsCoffreAuditLogs).omit({
  id: true,
  timestamp: true,
});
export type InsertTransfertCoffreAuditLog = z.infer<typeof insertTransfertCoffreAuditLogSchema>;
export type TransfertCoffreAuditLog = typeof transfertsCoffreAuditLogs.$inferSelect;


// ========== CONFIGURATION COFFRE-FORT ==========
export const configCoffreFort = pgTable(
  "config_coffre_fort",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "cascade" }),
    
    // Seuils
    seuilDoubleValidation: numeric("seuil_double_validation").default("1000000"), // Double validation si montant >= seuil
    montantMaxTransfert: numeric("montant_max_transfert"), // Limite par transfert
    
    // Règles de séparation des rôles
    separationInitiateurValideur: boolean("separation_initiateur_valideur").notNull().default(true),
    separationValideurExecuteur: boolean("separation_valideur_executeur").notNull().default(false),
    
    // Rôles autorisés (JSON arrays)
    rolesInitiateurs: json("roles_initiateurs").default('["caissier", "chef_caisse"]'),
    rolesValideurs: json("roles_valideurs").default('["chef_agence", "superviseur"]'),
    rolesExecuteurs: json("roles_executeurs").default('["caissier", "chef_caisse", "chef_agence"]'),
    
    // --- Sécurité & Accès ---
    horairesOuverture: json("horaires_ouverture").$type<{ debut: string; fin: string }>().default({ debut: "08:00", fin: "18:00" }),
    joursOuvrables: json("jours_ouvrables").$type<string[]>().default(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]),
    tentativesMaxParJour: numeric("tentatives_max_par_jour").default("20"),
    verouillageApresEchec: boolean("verouillage_apres_echec").notNull().default(true),

    // --- Limites Financières ---
    montantMinTransfert: numeric("montant_min_transfert").default("100"),
    plafondJournalierSortant: numeric("plafond_journalier_sortant"), // Null = illimité
    plafondJournalierEntrant: numeric("plafond_journalier_entrant"),

    // --- Alertes Solde ---
    seuilSoldeMin: numeric("seuil_solde_min").default("1000000"), // Alerte warning
    seuilSoldeCritique: numeric("seuil_solde_critique").default("100000"), // Alerte critique
    alerteEmailActif: boolean("alerte_email_actif").notNull().default(false),

    // --- Contrôle & Audit ---
    justificatifObligatoire: boolean("justificatif_obligatoire").notNull().default(false),
    billetageObligatoireSiMontantSup: numeric("billetage_obligatoire_si_montant_sup"),
    comptageDoublePersonne: boolean("comptage_double_personne").notNull().default(false),
    
    actif: boolean("actif").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uqAgence: uniqueIndex("uq_config_coffre_agence").on(t.agenceId),
  }),
);

export const insertConfigCoffreFortSchema = createInsertSchema(configCoffreFort).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConfigCoffreFort = z.infer<typeof insertConfigCoffreFortSchema>;
export type ConfigCoffreFort = typeof configCoffreFort.$inferSelect;
