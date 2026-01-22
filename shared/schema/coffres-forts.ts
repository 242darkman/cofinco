import { pgTable, text, uuid, numeric, timestamp, boolean, json, index, uniqueIndex, date, time } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { mouvementsFinanciers } from "./finance";
import {
  ownerTypeCoffreEnum,
  statutCoffreEnum,
  typeTransfertInterCoffreEnum,
  statutTransfertInterCoffreEnum,
  typeConditionnementEnum,
  typeDocumentTransfertEnum,
  statutReconciliationEnum,
  typeTacheRegularisationEnum,
  statutTacheRegularisationEnum,
  prioriteTacheEnum,
  actionAuditTransfertEnum,
} from "@shared/enum/enums";

// ========== COFFRES-FORTS (VAULTS) ==========

export const coffresForts = pgTable("coffres_forts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // ex: "CF-SIEGE", "CF-AG001"
  nom: text("nom").notNull(),
  ownerType: ownerTypeCoffreEnum("owner_type").notNull(), // AGENCE ou SIEGE
  ownerId: uuid("owner_id").references(() => agences.id, { onDelete: "restrict" }), // NULL si SIEGE
  devise: text("devise").notNull().default("XAF"),
  solde: numeric("solde", { precision: 15, scale: 2 }).notNull().default("0"),
  plafondEncaisse: numeric("plafond_encaisse", { precision: 15, scale: 2 }), // Maximum autorisé
  soldeMinimum: numeric("solde_minimum", { precision: 15, scale: 2 }).default("0"), // Minimum requis
  statut: statutCoffreEnum("statut").notNull().default("ACTIVE"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idxCoffreOwner: index("idx_coffre_fort_owner").on(table.ownerType, table.ownerId),
  idxCoffreStatut: index("idx_coffre_fort_statut").on(table.statut),
}));

export const insertCoffresFortSchema = createInsertSchema(coffresForts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCoffreFort = z.infer<typeof insertCoffresFortSchema>;
export type CoffreFort = typeof coffresForts.$inferSelect;

// ========== COMPTES DE LIAISON INTERNE ==========

export const comptesLiaison = pgTable("comptes_liaison", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // ex: "LIAISON-SIEGE", "LIAISON-AG001"
  intitule: text("intitule").notNull(), // ex: "Compte de liaison - Siège"
  numeroComptable: text("numero_comptable").notNull(), // ex: "581200"
  entiteType: ownerTypeCoffreEnum("entite_type").notNull(),
  entiteId: uuid("entite_id").references(() => agences.id, { onDelete: "restrict" }), // NULL si SIEGE
  soldeCourant: numeric("solde_courant", { precision: 15, scale: 2 }).notNull().default("0"),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idxCompteLiaisonEntite: index("idx_compte_liaison_entite").on(table.entiteType, table.entiteId),
}));

export const insertCompteLiaisonSchema = createInsertSchema(comptesLiaison).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCompteLiaison = z.infer<typeof insertCompteLiaisonSchema>;
export type CompteLiaison = typeof comptesLiaison.$inferSelect;

// ========== TRANSFERTS INTER-COFFRES ==========

export const transfertsInterCoffres = pgTable("transferts_inter_coffres", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(), // TIC-YYYYMMDD-XXXXXX
  dateTransfert: date("date_transfert").notNull(),
  heureDepart: time("heure_depart"),

  // Source et Destination
  coffreSourceId: uuid("coffre_source_id").notNull().references(() => coffresForts.id, { onDelete: "restrict" }),
  coffreDestinationId: uuid("coffre_destination_id").notNull().references(() => coffresForts.id, { onDelete: "restrict" }),

  // Montant et devise
  montant: numeric("montant", { precision: 15, scale: 2 }).notNull(),
  devise: text("devise").notNull().default("XAF"),

  // Type et conditionnement
  typeTransfert: typeTransfertInterCoffreEnum("type_transfert").notNull(),
  typeConditionnement: typeConditionnementEnum("type_conditionnement").notNull(),
  numeroScelle: text("numero_scelle"), // Obligatoire si Sac scellé
  motif: text("motif").notNull(),

  // Statut workflow
  statut: statutTransfertInterCoffreEnum("statut").notNull().default("DRAFT"),

  // Phase 1: Création
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),

  // Phase 2: Soumission
  submittedBy: uuid("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),

  // Phase 3: Approbation Niveau 1
  approvedByLevel1: uuid("approved_by_level1").references(() => users.id),
  approvedAtLevel1: timestamp("approved_at_level1"),
  commentaireN1: text("commentaire_n1"),

  // Phase 4: Approbation Niveau 2
  approvedByLevel2: uuid("approved_by_level2").references(() => users.id),
  approvedAtLevel2: timestamp("approved_at_level2"),
  commentaireN2: text("commentaire_n2"),

  // Phase 5: Dispatch (départ)
  dispatchedBy: uuid("dispatched_by").references(() => users.id),
  dispatchedAt: timestamp("dispatched_at"),
  agentsTransport: json("agents_transport").$type<Array<{
    userId?: string;
    nom: string;
    contact: string;
  }>>(),

  // Phase 6: Réception
  receivedBy: uuid("received_by").references(() => users.id),
  receivedAt: timestamp("received_at"),
  heureReception: time("heure_reception"),
  montantRecu: numeric("montant_recu", { precision: 15, scale: 2 }),
  conforme: boolean("conforme"),
  commentaireReception: text("commentaire_reception"),
  ecartMontant: numeric("ecart_montant", { precision: 15, scale: 2 }),
  motifEcart: text("motif_ecart"),

  // Comptabilité
  mouvementSourceId: uuid("mouvement_source_id").references(() => mouvementsFinanciers.id),
  mouvementDestinationId: uuid("mouvement_destination_id").references(() => mouvementsFinanciers.id),
  dateComptable: date("date_comptable"),

  // Rejet/Annulation
  rejectionReason: text("rejection_reason"),
  rejectedBy: uuid("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  cancellationReason: text("cancellation_reason"),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),

  // Sécurité
  verrouille: boolean("verrouille").notNull().default(false),
  idempotencyKey: text("idempotency_key").unique(),
  metadata: json("metadata"),

  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uqTransfertReference: uniqueIndex("uq_transfert_inter_coffre_reference").on(table.reference),
  uqTransfertIdempotency: uniqueIndex("uq_transfert_inter_coffre_idempotency").on(table.idempotencyKey),
  idxTransfertStatut: index("idx_transfert_inter_coffre_statut").on(table.statut),
  idxTransfertDate: index("idx_transfert_inter_coffre_date").on(table.dateTransfert),
  idxTransfertSource: index("idx_transfert_inter_coffre_source").on(table.coffreSourceId),
  idxTransfertDest: index("idx_transfert_inter_coffre_dest").on(table.coffreDestinationId),
  idxTransfertCreatedBy: index("idx_transfert_inter_coffre_created_by").on(table.createdBy),
  // Contrainte: montant positif
  chkMontantPositif: sql`CONSTRAINT chk_tic_montant_positif CHECK (montant > 0)`,
  // Contrainte: source != destination
  chkSourceDifferentDest: sql`CONSTRAINT chk_tic_source_diff_dest CHECK (coffre_source_id != coffre_destination_id)`,
}));

export const insertTransfertInterCoffreSchema = createInsertSchema(transfertsInterCoffres).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verrouille: true,
  mouvementSourceId: true,
  mouvementDestinationId: true,
});
export type InsertTransfertInterCoffre = z.infer<typeof insertTransfertInterCoffreSchema>;
export type TransfertInterCoffre = typeof transfertsInterCoffres.$inferSelect;

// ========== DOCUMENTS DE TRANSFERT ==========

export const documentsTransfert = pgTable("documents_transfert", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").notNull().references(() => transfertsInterCoffres.id, { onDelete: "cascade" }),
  typeDocument: typeDocumentTransfertEnum("type_document").notNull(),
  numeroDocument: text("numero_document").notNull().unique(), // BT-YYYY-XXXXX, BS-YYYY-XXXXX, BE-YYYY-XXXXX
  dateGeneration: timestamp("date_generation").defaultNow(),
  generatedBy: uuid("generated_by").references(() => users.id),
  // Données pour régénération PDF
  contenuData: json("contenu_data").$type<Record<string, any>>(),
  // URL ou chemin du PDF généré (optionnel)
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uqDocumentNumero: uniqueIndex("uq_document_transfert_numero").on(table.numeroDocument),
  idxDocumentTransfert: index("idx_document_transfert_id").on(table.transfertId),
  idxDocumentType: index("idx_document_transfert_type").on(table.typeDocument),
}));

export const insertDocumentTransfertSchema = createInsertSchema(documentsTransfert).omit({
  id: true,
  createdAt: true,
  dateGeneration: true,
});
export type InsertDocumentTransfert = z.infer<typeof insertDocumentTransfertSchema>;
export type DocumentTransfert = typeof documentsTransfert.$inferSelect;

// ========== AUDIT LOG TRANSFERTS ==========

export const transfertsInterCoffresAuditLogs = pgTable("transferts_inter_coffres_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").notNull().references(() => transfertsInterCoffres.id, { onDelete: "cascade" }),
  action: actionAuditTransfertEnum("action").notNull(),
  statutAvant: text("statut_avant"),
  statutApres: text("statut_apres"),
  details: json("details").$type<Record<string, any>>(),
  userId: uuid("user_id").references(() => users.id),
  userRole: text("user_role"),
  userName: text("user_name"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => ({
  idxAuditTransfert: index("idx_audit_transfert_inter_coffre_id").on(table.transfertId),
  idxAuditTimestamp: index("idx_audit_transfert_inter_coffre_timestamp").on(table.timestamp),
}));

export type TransfertInterCoffreAuditLog = typeof transfertsInterCoffresAuditLogs.$inferSelect;

// ========== RECONCILIATION LIAISON ==========

export const reconciliationsLiaison = pgTable("reconciliations_liaison", {
  id: uuid("id").primaryKey().defaultRandom(),
  compteLiaisonSourceId: uuid("compte_liaison_source_id").references(() => comptesLiaison.id),
  compteLiaisonDestId: uuid("compte_liaison_dest_id").references(() => comptesLiaison.id),
  transfertId: uuid("transfert_id").references(() => transfertsInterCoffres.id),
  montant: numeric("montant", { precision: 15, scale: 2 }).notNull(),
  dateOperation: date("date_operation").notNull(),
  statut: statutReconciliationEnum("statut").notNull().default("PENDING"),
  ecritureSourceId: uuid("ecriture_source_id"), // FK vers lignesEcritures si besoin
  ecritureDestId: uuid("ecriture_dest_id"),
  dateRapprochement: timestamp("date_rapprochement"),
  rapprochePar: uuid("rapproche_par").references(() => users.id),
  joursEnAttente: numeric("jours_en_attente"),
  alerteEnvoyee: boolean("alerte_envoyee").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idxReconciliationTransfert: index("idx_reconciliation_transfert").on(table.transfertId),
  idxReconciliationStatut: index("idx_reconciliation_statut").on(table.statut),
}));

export const insertReconciliationLiaisonSchema = createInsertSchema(reconciliationsLiaison).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertReconciliationLiaison = z.infer<typeof insertReconciliationLiaisonSchema>;
export type ReconciliationLiaison = typeof reconciliationsLiaison.$inferSelect;

// ========== TACHES DE REGULARISATION ==========

export const tachesRegularisation = pgTable("taches_regularisation", {
  id: uuid("id").primaryKey().defaultRandom(),
  transfertId: uuid("transfert_id").references(() => transfertsInterCoffres.id),
  type: typeTacheRegularisationEnum("type").notNull(),
  description: text("description").notNull(),
  montantEcart: numeric("montant_ecart", { precision: 15, scale: 2 }),
  statut: statutTacheRegularisationEnum("statut").notNull().default("OPEN"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  priorite: prioriteTacheEnum("priorite").notNull().default("NORMAL"),
  dateEcheance: date("date_echeance"),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  idxTacheTransfert: index("idx_tache_regularisation_transfert").on(table.transfertId),
  idxTacheStatut: index("idx_tache_regularisation_statut").on(table.statut),
  idxTachePriorite: index("idx_tache_regularisation_priorite").on(table.priorite),
}));

export const insertTacheRegularisationSchema = createInsertSchema(tachesRegularisation).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertTacheRegularisation = z.infer<typeof insertTacheRegularisationSchema>;
export type TacheRegularisation = typeof tachesRegularisation.$inferSelect;

// ========== CONFIGURATION TRANSFERT INTER-COFFRES ==========

export const configTransfertInterCoffres = pgTable("config_transfert_inter_coffres", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "cascade" }).unique(), // NULL = config siège/globale

  // Seuils
  montantMinTransfert: numeric("montant_min_transfert", { precision: 15, scale: 2 }).default("10000"),
  montantMaxTransfert: numeric("montant_max_transfert", { precision: 15, scale: 2 }),
  seuilAlertePlafond: numeric("seuil_alerte_plafond").default("80"), // % du plafond

  // Workflow
  approbationDoubleNiveau: boolean("approbation_double_niveau").notNull().default(true),
  nombreAgentsTransportMin: numeric("nombre_agents_transport_min").notNull().default("2"),
  scelleObligatoireSiMontantSuperieur: numeric("scelle_obligatoire_si_montant_superieur", { precision: 15, scale: 2 }),

  // Séparation des tâches
  separationCreateurApprobateurN1: boolean("separation_createur_approbateur_n1").notNull().default(true),
  separationApprobateurN1N2: boolean("separation_approbateur_n1_n2").notNull().default(true),
  separationApprobateurRecepteur: boolean("separation_approbateur_recepteur").notNull().default(true),

  // Rôles autorisés (JSON arrays) - pas de defaults ici car les apostrophes causent des erreurs SQL
  rolesCreateurs: json("roles_createurs").$type<string[]>(),
  rolesApprobateursN1: json("roles_approbateurs_n1").$type<string[]>(),
  rolesApprobateursN2: json("roles_approbateurs_n2").$type<string[]>(),
  rolesRecepteurs: json("roles_recepteurs").$type<string[]>(),

  // Réconciliation
  delaiMaxReconciliation: numeric("delai_max_reconciliation").default("3"), // jours
  alerteReconciliationActive: boolean("alerte_reconciliation_active").notNull().default(true),

  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConfigTransfertInterCoffreSchema = createInsertSchema(configTransfertInterCoffres).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertConfigTransfertInterCoffre = z.infer<typeof insertConfigTransfertInterCoffreSchema>;
export type ConfigTransfertInterCoffre = typeof configTransfertInterCoffres.$inferSelect;
