import { pgTable, text, uuid, numeric, timestamp, boolean, json, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { coffresForts } from "./coffres-forts";
import { caisses, sessionsCaisse, operationsCaisse, mouvementsFinanciers } from "./finance";
import { 
  statutTransfertCoffreEnum, 
  typeTransfertCoffreEnum, 
  statutReconciliationEnum, 
  statutTacheRegularisationEnum, 
  typeTacheRegularisationEnum,
  prioriteTacheEnum 
} from "../enum/enums";

// ========== TABLE TRANSFERTS COFFRE ↔ CAISSE ==========
export const transfertsCoffreCaisse = pgTable(
  "transferts_coffre_caisse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Contexte agence
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "restrict" }),
    
    // Type de transfert
    typeTransfert: typeTransfertCoffreEnum("type_transfert").notNull(),
    
    // Relation Coffre <-> Caisse
    coffreId: uuid("coffre_id").notNull().references(() => coffresForts.id, { onDelete: "restrict" }),
    caisseId: uuid("caisse_id").notNull().references(() => caisses.id, { onDelete: "restrict" }),
    
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
    statut: statutTransfertCoffreEnum("statut").notNull().default("REQUESTED"),
    
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
    billetage: json("billetage"),

    // Métadonnées
    metadata: json("metadata"),

    // Verrouillage après exécution
    verrouille: boolean("verrouille").notNull().default(false),

    // ========== WORKFLOW OUVERTURE SECURISEE (Coffre → Caisse) ==========
    // Lien vers la session d'ouverture (si ce transfert est pour ouvrir une caisse)
    sessionOuvertureId: uuid("session_ouverture_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),

    // Flag indiquant que ce transfert est pour l'ouverture d'une session caisse
    isOpeningFund: boolean("is_opening_fund").notNull().default(false),
    // ========== FIN WORKFLOW OUVERTURE ==========

    // Audit timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uqReference: uniqueIndex("uq_transferts_coffre_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_transferts_coffre_idempotency").on(t.idempotencyKey),
    idxAgenceStatut: index("idx_transferts_coffre_agence_statut").on(t.agenceId, t.statut),
    idxAgenceDate: index("idx_transferts_coffre_agence_date").on(t.agenceId, t.createdAt),
    idxCoffre: index("idx_transferts_coffre_coffre").on(t.coffreId),
    idxCaisse: index("idx_transferts_coffre_caisse").on(t.caisseId),
    idxStatutDate: index("idx_transferts_coffre_statut_date").on(t.statut, t.createdAt),
    idxRequestedBy: index("idx_transferts_coffre_requested_by").on(t.requestedBy),
    idxSessionOuverture: index("idx_transferts_coffre_session_ouverture").on(t.sessionOuvertureId),
    idxOpeningFund: index("idx_transferts_coffre_opening_fund").on(t.isOpeningFund),
    chkMontantPos: sql`CONSTRAINT chk_transferts_coffre_montant_pos CHECK (${t.montant} > 0)`,
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
    transfertId: uuid("transfert_id").notNull().references(() => transfertsCoffreCaisse.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres").notNull(),
    details: json("details").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    userRole: text("user_role"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
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

// ========== RECONCILIATION COFFRE-CAISSE ==========
export const reconciliationsCoffreCaisse = pgTable("reconciliations_coffre_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  compteLiaisonSourceId: uuid("compte_liaison_source_id").references(() => caisses.id),
  compteLiaisonDestId: uuid("compte_liaison_dest_id").references(() => caisses.id),
  transfertId: uuid("transfert_id").references(() => transfertsCoffreCaisse.id),
  montant: numeric("montant").notNull(),
  dateOperation: timestamp("date_operation").notNull(),
  statut: statutReconciliationEnum("statut").notNull().default("PENDING"),
  ecritureSourceId: uuid("ecriture_source_id"),
  ecritureDestId: uuid("ecriture_dest_id"),
  dateRapprochement: timestamp("date_rapprochement"),
  rapprochePar: uuid("rapproche_par").references(() => users.id),
  joursEnAttente: numeric("jours_en_attente"),
  alerteEnvoyee: boolean("alerte_envoyee").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idxReconciliationCoffreCaisseTransfert: index("idx_reconciliation_cc_transfert").on(table.transfertId),
  idxReconciliationCoffreCaisseStatut: index("idx_reconciliation_cc_statut").on(table.statut),
}));

export const insertReconciliationCoffreCaisseSchema = createInsertSchema(reconciliationsCoffreCaisse).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertReconciliationCoffreCaisse = z.infer<typeof insertReconciliationCoffreCaisseSchema>;
export type ReconciliationCoffreCaisse = typeof reconciliationsCoffreCaisse.$inferSelect;

// ========== TACHES DE REGULARISATION COFFRE-CAISSE ==========
export const tachesRegularisationCoffreCaisse = pgTable("taches_regularisation_coffre_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").references(() => transfertsCoffreCaisse.id),
  type: typeTacheRegularisationEnum("type").notNull(),
  description: text("description").notNull(),
  montantEcart: numeric("montant_ecart"),
  statut: statutTacheRegularisationEnum("statut").notNull().default("OPEN"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  priorite: prioriteTacheEnum("priorite").notNull().default("NORMAL"),
  dateEcheance: timestamp("date_echeance"),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idxTacheCoffreCaisseTransfert: index("idx_tache_reg_cc_transfert").on(table.transfertId),
  idxTacheCoffreCaisseStatut: index("idx_tache_reg_cc_statut").on(table.statut),
  idxTacheCoffreCaissePriorite: index("idx_tache_reg_cc_priorite").on(table.priorite),
}));

export const insertTacheRegularisationCoffreCaisseSchema = createInsertSchema(tachesRegularisationCoffreCaisse).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertTacheRegularisationCoffreCaisse = z.infer<typeof insertTacheRegularisationCoffreCaisseSchema>;
export type TacheRegularisationCoffreCaisse = typeof tachesRegularisationCoffreCaisse.$inferSelect;

// ========== CONFIGURATION COFFRE-FORT ==========
export const configCoffreFort = pgTable(
  "config_coffre_fort",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "cascade" }),
    seuilDoubleValidation: numeric("seuil_double_validation").default("1000000"),
    montantMaxTransfert: numeric("montant_max_transfert"),
    separationInitiateurValideur: boolean("separation_initiateur_valideur").notNull().default(true),
    separationValideurExecuteur: boolean("separation_valideur_executeur").notNull().default(false),
    rolesInitiateurs: json("roles_initiateurs").default('["CAISSIER", "COMPTABLE"]'),
    rolesValideurs: json("roles_valideurs").default('["CHEF_AGENCE", "SUPERVISEUR"]'),
    rolesExecuteurs: json("roles_executeurs").default('["CAISSIER", "COMPTABLE", "CHEF_AGENCE"]'),
    horairesOuverture: json("horaires_ouverture").$type<{ debut: string; fin: string }>().default({ debut: "08:00", fin: "18:00" }),
    joursOuvrables: json("jours_ouvrables").$type<string[]>().default(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]),
    tentativesMaxParJour: numeric("tentatives_max_par_jour").default("20"),
    verouillageApresEchec: boolean("verouillage_apres_echec").notNull().default(true),
    montantMinTransfert: numeric("montant_min_transfert").default("100"),
    plafondJournalierSortant: numeric("plafond_journalier_sortant"),
    plafondJournalierEntrant: numeric("plafond_journalier_entrant"),
    seuilSoldeMin: numeric("seuil_solde_min").default("1000000"),
    seuilSoldeCritique: numeric("seuil_solde_critique").default("100000"),
    alerteEmailActif: boolean("alerte_email_actif").notNull().default(false),
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
