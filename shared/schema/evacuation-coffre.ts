import { pgTable, text, uuid, numeric, timestamp, boolean, json, index, uniqueIndex, date, time } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { coffresForts } from "./coffres-forts";
import { mouvementsFinanciers } from "./finance";
import {
  statutEvacuationCoffreEnum,
  typeDestinationEvacuationEnum,
  motifEvacuationEnum,
  actionAuditEvacuationEnum,
  typeConditionnementEnum,
  statutReconciliationEnum,
  typeTacheRegularisationEnum,
  statutTacheRegularisationEnum,
  prioriteTacheEnum,
} from "../enum/enums";

// ========== TABLE PRINCIPALE EVACUATIONS COFFRE ==========
export const evacuationsCoffre = pgTable(
  "evacuations_coffre",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    dateEvacuation: date("date_evacuation").notNull(),

    // ====== SOURCE ======
    coffreSourceId: uuid("coffre_source_id").notNull()
      .references(() => coffresForts.id, { onDelete: "restrict" }),
    agenceId: uuid("agence_id").notNull()
      .references(() => agences.id, { onDelete: "restrict" }),

    // ====== DESTINATION (polymorphique) ======
    typeDestination: typeDestinationEvacuationEnum("type_destination").notNull(),
    // Banque
    banqueNom: text("banque_nom"),
    banqueCompte: text("banque_compte"),
    banqueNumeroComptable: text("banque_numero_comptable"),
    // Coffre central
    coffreDestinationId: uuid("coffre_destination_id")
      .references(() => coffresForts.id, { onDelete: "restrict" }),
    // Transporteur
    transporteurNom: text("transporteur_nom"),
    transporteurContact: text("transporteur_contact"),
    transporteurReference: text("transporteur_reference"),

    // ====== MONTANT & DEVISE ======
    montant: numeric("montant", { precision: 15, scale: 2 }).notNull(),
    devise: text("devise").notNull().default("XAF"),

    // ====== MOTIF ======
    motifEvacuation: motifEvacuationEnum("motif_evacuation").notNull(),
    motifDetail: text("motif_detail").notNull(),

    // ====== STATUT WORKFLOW ======
    statut: statutEvacuationCoffreEnum("statut").notNull().default("DRAFT"),

    // ====== PHASE 1: CREATION (DRAFT) ======
    createdBy: uuid("created_by").notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    // ====== PHASE 2: SOUMISSION ======
    submittedBy: uuid("submitted_by")
      .references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at"),

    // ====== PHASE 3: APPROBATION ======
    approvedBy: uuid("approved_by")
      .references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    commentaireApprobation: text("commentaire_approbation"),

    // ====== PHASE 4: PREPARATION ======
    preparedBy: uuid("prepared_by")
      .references(() => users.id, { onDelete: "set null" }),
    preparedAt: timestamp("prepared_at"),
    typeConditionnement: typeConditionnementEnum("type_conditionnement"),
    numeroScelle: text("numero_scelle"),
    billetage: json("billetage").$type<Record<string, number>>(),
    montantCompte: numeric("montant_compte", { precision: 15, scale: 2 }),
    ecartPreparation: numeric("ecart_preparation", { precision: 15, scale: 2 }),
    commentairePreparation: text("commentaire_preparation"),

    // ====== PHASE 5: EXPEDITION (IN_TRANSIT) ======
    dispatchedBy: uuid("dispatched_by")
      .references(() => users.id, { onDelete: "set null" }),
    dispatchedAt: timestamp("dispatched_at"),
    heureDepart: time("heure_depart"),
    agentsTransport: json("agents_transport").$type<Array<{
      userId?: string;
      nom: string;
      contact: string;
      fonction?: string;
    }>>(),

    // ====== PHASE 6: DEPOT (DEPOSITED) ======
    depositedBy: uuid("deposited_by")
      .references(() => users.id, { onDelete: "set null" }),
    depositedAt: timestamp("deposited_at"),
    heureDepot: time("heure_depot"),
    montantDepose: numeric("montant_depose", { precision: 15, scale: 2 }),
    referenceBordereau: text("reference_bordereau"),
    referenceRecuTransporteur: text("reference_recu_transporteur"),
    commentaireDepot: text("commentaire_depot"),

    // ====== PHASE 7: RECONCILIATION ======
    reconciledBy: uuid("reconciled_by")
      .references(() => users.id, { onDelete: "set null" }),
    reconciledAt: timestamp("reconciled_at"),
    montantConfirme: numeric("montant_confirme", { precision: 15, scale: 2 }),
    ecartMontant: numeric("ecart_montant", { precision: 15, scale: 2 }),
    motifEcart: text("motif_ecart"),
    conforme: boolean("conforme"),

    // ====== LIENS COMPTABLES ======
    mouvementTransitId: uuid("mouvement_transit_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    mouvementDepotId: uuid("mouvement_depot_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    mouvementEcartId: uuid("mouvement_ecart_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    dateComptable: date("date_comptable"),

    // ====== REJET / ANNULATION ======
    rejectionReason: text("rejection_reason"),
    rejectedBy: uuid("rejected_by")
      .references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at"),
    cancellationReason: text("cancellation_reason"),
    cancelledBy: uuid("cancelled_by")
      .references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at"),

    // ====== SECURITE ======
    verrouille: boolean("verrouille").notNull().default(false),
    idempotencyKey: text("idempotency_key"),
    metadata: json("metadata"),

    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Unicité
    uqEvacuationReference: uniqueIndex("uq_evacuation_coffre_reference").on(t.reference),
    uqEvacuationIdempotency: uniqueIndex("uq_evacuation_coffre_idempotency").on(t.idempotencyKey),

    // Index de requête
    idxEvacuationStatut: index("idx_evacuation_coffre_statut").on(t.statut),
    idxEvacuationDate: index("idx_evacuation_coffre_date").on(t.dateEvacuation),
    idxEvacuationSource: index("idx_evacuation_coffre_source").on(t.coffreSourceId),
    idxEvacuationAgence: index("idx_evacuation_coffre_agence").on(t.agenceId),
    idxEvacuationCreatedBy: index("idx_evacuation_coffre_created_by").on(t.createdBy),
    idxEvacuationTypeDest: index("idx_evacuation_coffre_type_dest").on(t.typeDestination),
    idxEvacuationAgenceStatut: index("idx_evacuation_coffre_agence_statut").on(t.agenceId, t.statut),
    idxEvacuationAgenceDate: index("idx_evacuation_coffre_agence_date").on(t.agenceId, t.dateEvacuation),

    // Contraintes
    chkMontantPositif: sql`CONSTRAINT chk_evc_montant_positif CHECK (montant > 0)`,
    chkCoffreCentralDest: sql`CONSTRAINT chk_evc_coffre_central_dest CHECK (
      type_destination != 'COFFRE_CENTRAL' OR coffre_destination_id IS NOT NULL
    )`,
    chkBanqueDest: sql`CONSTRAINT chk_evc_banque_dest CHECK (
      type_destination != 'BANQUE' OR (banque_nom IS NOT NULL AND banque_compte IS NOT NULL)
    )`,
    chkTransporteurDest: sql`CONSTRAINT chk_evc_transporteur_dest CHECK (
      type_destination != 'TRANSPORTEUR' OR transporteur_nom IS NOT NULL
    )`,
    chkSourceDiffDest: sql`CONSTRAINT chk_evc_source_diff_dest CHECK (
      coffre_destination_id IS NULL OR coffre_source_id != coffre_destination_id
    )`,
  }),
);

export const insertEvacuationCoffreSchema = createInsertSchema(evacuationsCoffre).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verrouille: true,
});
export type InsertEvacuationCoffre = z.infer<typeof insertEvacuationCoffreSchema>;
export type EvacuationCoffre = typeof evacuationsCoffre.$inferSelect;

// ========== TABLE AUDIT EVACUATIONS COFFRE ==========
export const evacuationsCoffreAuditLogs = pgTable(
  "evacuations_coffre_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evacuationId: uuid("evacuation_id").notNull()
      .references(() => evacuationsCoffre.id, { onDelete: "cascade" }),
    action: actionAuditEvacuationEnum("action").notNull(),
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres"),
    details: json("details").$type<Record<string, any>>(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    userRole: text("user_role"),
    userName: text("user_name"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxAuditEvacuationId: index("idx_audit_evacuation_coffre_id").on(t.evacuationId),
    idxAuditEvacTimestamp: index("idx_audit_evacuation_coffre_timestamp").on(t.timestamp),
    idxAuditEvacAction: index("idx_audit_evacuation_coffre_action").on(t.action),
  }),
);

export const insertEvacuationCoffreAuditLogSchema = createInsertSchema(evacuationsCoffreAuditLogs).omit({
  id: true,
  timestamp: true,
});
export type InsertEvacuationCoffreAuditLog = z.infer<typeof insertEvacuationCoffreAuditLogSchema>;
export type EvacuationCoffreAuditLog = typeof evacuationsCoffreAuditLogs.$inferSelect;

// ========== CONFIGURATION EVACUATION COFFRE ==========
export const configEvacuationCoffre = pgTable(
  "config_evacuation_coffre",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "cascade" }),

    // Seuils
    montantMinEvacuation: numeric("montant_min_evacuation", { precision: 15, scale: 2 }).default("100000"),
    montantMaxEvacuation: numeric("montant_max_evacuation", { precision: 15, scale: 2 }),
    seuilEvacuationObligatoire: numeric("seuil_evacuation_obligatoire", { precision: 15, scale: 2 }),

    // Approbation
    approbationRequise: boolean("approbation_requise").notNull().default(true),

    // Séparation des fonctions
    separationCreateurApprobateur: boolean("separation_createur_approbateur").notNull().default(true),
    separationApprobateurPreparateur: boolean("separation_approbateur_preparateur").notNull().default(true),
    separationPreparateurDispatcher: boolean("separation_preparateur_dispatcher").notNull().default(false),

    // Rôles autorisés
    rolesCreateurs: json("roles_createurs").$type<string[]>().default(["agent_caisse", "Comptable", "Chef d'Agence"]),
    rolesApprobateurs: json("roles_approbateurs").$type<string[]>().default(["Chef d'Agence", "Directeur", "Trésorier"]),
    rolesPreparateurs: json("roles_preparateurs").$type<string[]>().default(["agent_caisse", "Comptable", "Trésorier"]),
    rolesDispatchers: json("roles_dispatchers").$type<string[]>().default(["Chef d'Agence", "Trésorier"]),

    // Transport
    nombreAgentsTransportMin: numeric("nombre_agents_transport_min").notNull().default("1"),
    scelleObligatoire: boolean("scelle_obligatoire").notNull().default(false),
    scelleObligatoireSiMontantSuperieur: numeric("scelle_obligatoire_si_montant_superieur", { precision: 15, scale: 2 }),
    billetageObligatoire: boolean("billetage_obligatoire").notNull().default(true),

    // Destinations autorisées
    destinationsAutorisees: json("destinations_autorisees").$type<string[]>().default(["BANQUE", "COFFRE_CENTRAL", "TRANSPORTEUR"]),

    // Réconciliation
    delaiMaxReconciliation: numeric("delai_max_reconciliation").default("5"),
    alerteReconciliationActive: boolean("alerte_reconciliation_active").notNull().default(true),
    seuilEcartAcceptable: numeric("seuil_ecart_acceptable", { precision: 15, scale: 2 }).default("0"),

    actif: boolean("actif").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uqConfigEvacAgence: uniqueIndex("uq_config_evacuation_coffre_agence").on(t.agenceId),
  }),
);

export const insertConfigEvacuationCoffreSchema = createInsertSchema(configEvacuationCoffre).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConfigEvacuationCoffre = z.infer<typeof insertConfigEvacuationCoffreSchema>;
export type ConfigEvacuationCoffre = typeof configEvacuationCoffre.$inferSelect;
