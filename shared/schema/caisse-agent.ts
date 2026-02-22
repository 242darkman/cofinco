/**
 * Schéma CaisseAgent - Gestion des caisses internes des agents terrain
 * avec workflow d'approbation pour les opérations de collecte et remise
 */

import { pgTable, text, numeric, boolean, timestamp, uuid, json, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { DEFAULT_CURRENCY } from "../config/currency";

// Imports des tables existantes
import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { agentsTerrain, paiementsTerrain } from "./operations";
import { mouvementsFinanciers, caisses } from "./finance";
import { planComptable } from "./accounting";

// Import des enums
import {
  statutCaisseAgentEnum,
  statutSessionAgentEnum,
  typeOperationTerrainEnum,
  statutOperationTerrainEnum,
  methodePaiementEnum,
} from "@shared/enum/enums";

// ============================================================================
// TABLE: caisses_agent
// Compte interne (custody/float) par agent terrain
// ============================================================================

export const caissesAgent = pgTable(
  "caisses_agent",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Lien vers l'agent terrain (1:1 strict)
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTerrain.id, { onDelete: "restrict" }),

    // Solde validé (seules les opérations APPROVED impactent ce solde)
    soldeValide: numeric("solde_valide").notNull().default("0"),

    // Devise (défaut depuis shared/config/currency.ts)
    devise: text("devise").notNull().default(DEFAULT_CURRENCY.code),

    // Statut de la caisse
    statut: statutCaisseAgentEnum("statut").notNull().default("ACTIVE"),

    // Traçabilité
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (t) => ({
    // Un seul agent ne peut avoir qu'une seule caisse active
    uqAgentActif: uniqueIndex("uq_caisses_agent_agent_actif")
      .on(t.agentId)
      .where(sql`deleted_at IS NULL`),

    idxStatut: index("idx_caisses_agent_statut").on(t.statut),
    idxAgentId: index("idx_caisses_agent_agent_id").on(t.agentId),

    // Contrainte: solde ne peut pas être négatif
    chkSoldeNonNeg: sql`CONSTRAINT chk_caisses_agent_solde_nonneg CHECK (solde_valide >= 0)`,
  }),
);

export const insertCaisseAgentSchema = createInsertSchema(caissesAgent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertCaisseAgent = z.infer<typeof insertCaisseAgentSchema>;
export type CaisseAgent = typeof caissesAgent.$inferSelect;

// ============================================================================
// TABLE: operations_terrain
// Opérations de collecte et remise avec workflow d'approbation
// ============================================================================

/**
 * Type pour les métadonnées d'une opération terrain
 */
export interface OperationTerrainMetadata {
  // Informations de la collecte
  numeroRecu?: string;
  typePaiementClient?: string; // "Remboursement Crédit", "Dépôt Épargne", etc.

  // Références aux produits financiers
  creditId?: string;
  compteId?: string;
  tontineId?: string;

  // Justificatifs
  justificatifs?: string[]; // URLs des pièces jointes

  // Observations et notes
  observations?: string;

  // Géolocalisation
  latitude?: number;
  longitude?: number;

  // Informations de remise (pour SETTLEMENT_CASH)
  sessionCaisseId?: string;
  billetage?: Record<string, number>;

  // Informations de clôture de session (pour SESSION_CLOSE)
  ecart?: string;
  ecartJustification?: string;
}

export const operationsTerrain = pgTable(
  "operations_terrain",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identifiants uniques pour idempotence
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),

    // Type d'opération
    type: typeOperationTerrainEnum("type").notNull(),

    // Agent concerné
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTerrain.id, { onDelete: "restrict" }),
    caisseAgentId: uuid("caisse_agent_id")
      .notNull()
      .references(() => caissesAgent.id, { onDelete: "restrict" }),

    // Client (obligatoire pour COLLECT_CASH, null pour SETTLEMENT_CASH)
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),

    // Destination (pour SETTLEMENT_CASH uniquement)
    destinationCaisseId: uuid("destination_caisse_id").references(() => caisses.id, { onDelete: "restrict" }),

    // Montant et devise
    montant: numeric("montant").notNull(),
    devise: text("devise").notNull().default(DEFAULT_CURRENCY.code),

    // ========== WORKFLOW ==========
    statut: statutOperationTerrainEnum("statut").notNull().default("SUBMITTED"),

    // Soumission
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),

    // Approbation
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),

    // Rejet
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at"),
    rejectionReason: text("rejection_reason"),

    // Annulation
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),

    // ========== IDEMPOTENCE - Références aux écritures postées ==========
    postedAt: timestamp("posted_at"),

    // Mouvement sur la CaisseAgent (Crédit pour collecte, Débit pour remise)
    postedMouvementCaisseAgentId: uuid("posted_mouvement_caisse_agent_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Mouvement côté client (pour COLLECT_CASH uniquement)
    postedMouvementClientId: uuid("posted_mouvement_client_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Mouvement sur la caisse destination (pour SETTLEMENT_CASH uniquement)
    postedMouvementDestinationId: uuid("posted_mouvement_destination_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    // Paiement terrain créé (pour COLLECT_CASH uniquement)
    postedPaiementTerrainId: uuid("posted_paiement_terrain_id")
      .references(() => paiementsTerrain.id, { onDelete: "set null" }),

    // Session agent (optionnel — opérations existantes sans session continuent de fonctionner)
    // Pas de FK ici car sessionsAgent est défini plus bas (circular ref). FK ajoutée via SQL.
    sessionAgentId: uuid("session_agent_id"),

    // ========== MÉTADONNÉES ==========
    metadata: json("metadata").$type<OperationTerrainMetadata>(),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Unicité de la référence
    uqReference: uniqueIndex("uq_operations_terrain_reference").on(t.reference),

    // Unicité de la clé d'idempotence (seulement si non null)
    uqIdempotency: uniqueIndex("uq_operations_terrain_idempotency")
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),

    // Index de recherche
    idxAgentStatut: index("idx_operations_terrain_agent_statut").on(t.agentId, t.statut),
    idxStatutDate: index("idx_operations_terrain_statut_date").on(t.statut, t.submittedAt),
    idxTypeDate: index("idx_operations_terrain_type_date").on(t.type, t.submittedAt),
    idxClientDate: index("idx_operations_terrain_client_date").on(t.clientId, t.submittedAt),
    idxCaisseAgent: index("idx_operations_terrain_caisse_agent").on(t.caisseAgentId),
    idxDestinationCaisse: index("idx_operations_terrain_destination_caisse").on(t.destinationCaisseId),

    // Contraintes métier
    chkMontantPos: sql`CONSTRAINT chk_operations_terrain_montant_pos CHECK (montant > 0)`,

    // Pour COLLECT_CASH, clientId est obligatoire
    chkClientCollect: sql`CONSTRAINT chk_operations_terrain_client_collect
      CHECK (type != 'COLLECT_CASH' OR client_id IS NOT NULL)`,

    // Pour SETTLEMENT_CASH, destinationCaisseId est obligatoire
    chkDestinationSettlement: sql`CONSTRAINT chk_operations_terrain_destination_settlement
      CHECK (type != 'SETTLEMENT_CASH' OR destination_caisse_id IS NOT NULL)`,
  }),
);

export const insertOperationTerrainSchema = createInsertSchema(operationsTerrain).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOperationTerrain = z.infer<typeof insertOperationTerrainSchema>;
export type OperationTerrain = typeof operationsTerrain.$inferSelect;

// ============================================================================
// TABLE: operations_terrain_audit_logs
// Logs d'audit immuables pour toutes les transitions d'état
// ============================================================================

export const operationsTerrainAuditLogs = pgTable(
  "operations_terrain_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Référence à l'opération
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operationsTerrain.id, { onDelete: "cascade" }),

    // Action effectuée
    action: text("action").notNull(), // SUBMITTED, APPROVED, REJECTED, CANCELLED

    // États avant/après
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres").notNull(),

    // Détails de l'action (JSON flexible)
    details: json("details").notNull().$type<{
      mouvementIds?: string[];
      reason?: string;
      montant?: string;
      clientId?: string;
      [key: string]: unknown;
    }>(),

    // Acteur
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    userRole: text("user_role"),

    // Contexte de la requête
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    // Timestamp immuable
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxOperationDate: index("idx_operations_terrain_audit_operation_date")
      .on(t.operationId, t.timestamp),
    idxAction: index("idx_operations_terrain_audit_action").on(t.action),
    idxTimestamp: index("idx_operations_terrain_audit_timestamp").on(t.timestamp),
  }),
);

export const insertOperationTerrainAuditLogSchema = createInsertSchema(operationsTerrainAuditLogs).omit({
  id: true,
  timestamp: true,
});
export type InsertOperationTerrainAuditLog = z.infer<typeof insertOperationTerrainAuditLogSchema>;
export type OperationTerrainAuditLog = typeof operationsTerrainAuditLogs.$inferSelect;

// ============================================================================
// TYPES UTILITAIRES
// ============================================================================

/**
 * Résumé de la caisse d'un agent
 */
export interface CaisseAgentSummary {
  /** ID de la caisse */
  caisseId: string;
  /** ID de l'agent */
  agentId: string;
  /** Solde validé (montant confirmé en possession) */
  soldeValide: string;
  /** Montant des collectes en attente de validation (entrées) */
  pendingIn: string;
  /** Montant des remises en attente de validation (sorties) */
  pendingOut: string;
  /** Montant disponible pour remise (soldeValide - pendingOut) */
  disponible: string;
  /** Devise */
  devise: string;
  /** Statut de la caisse */
  statut: string;
}

/**
 * Input pour créer une collecte cash
 */
export interface CreateCollectCashInput {
  agentId: string;
  clientId: string;
  montant: number;
  typePaiementClient: string;
  creditId?: string;
  compteId?: string;
  tontineId?: string;
  numeroRecu?: string;
  observations?: string;
  latitude?: number;
  longitude?: number;
  idempotencyKey?: string;
}

/**
 * Input pour créer une remise cash
 */
export interface CreateSettlementCashInput {
  agentId: string;
  destinationCaisseId: string;
  montant: number;
  observations?: string;
  sessionCaisseId?: string;
  billetage?: Record<string, number>;
  idempotencyKey?: string;
}

/**
 * Input pour approuver une opération
 */
export interface ApproveOperationInput {
  operationId: string;
  approvedBy: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Input pour rejeter une opération
 */
export interface RejectOperationInput {
  operationId: string;
  rejectedBy: string;
  rejectionReason: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Input pour annuler une opération
 */
export interface CancelOperationInput {
  operationId: string;
  cancelledBy: string;
  cancellationReason: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Résultat d'une opération de service
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Opération terrain enrichie avec les relations
 */
export interface OperationTerrainWithRelations extends OperationTerrain {
  agent?: {
    id: string;
    nom?: string | null;
    prenom?: string | null;
  };
  client?: {
    id: string;
    nom: string;
    prenom: string;
  } | null;
  destinationCaisse?: {
    id: string;
    nom: string;
  } | null;
  sourceCaisse?: {
    id: string;
    nom: string;
  } | null;
  submitter?: {
    id: string;
    nom?: string | null;
    prenom?: string | null;
  };
  approver?: {
    id: string;
    nom?: string | null;
    prenom?: string | null;
  } | null;
}

// ============================================================================
// TABLE: sessions_agent
// Session de caisse mobile pour agents terrain (cycle de vie complet)
// ============================================================================

export const sessionsAgent = pgTable(
  "sessions_agent",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Liens principaux
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTerrain.id, { onDelete: "restrict" }),
    caisseAgentId: uuid("caisse_agent_id")
      .notNull()
      .references(() => caissesAgent.id, { onDelete: "restrict" }),
    agenceId: uuid("agence_id")
      .notNull()
      .references(() => agences.id, { onDelete: "restrict" }),

    // Sous-compte GL utilisé pendant cette session
    glAccountId: uuid("gl_account_id")
      .references(() => planComptable.id, { onDelete: "set null" }),
    glAccountNumber: text("gl_account_number"), // Dénormalisé (ex: 573BZV001)

    // ========== WORKFLOW ==========
    statut: statutSessionAgentEnum("statut").notNull().default("REQUESTING_FUNDS"),

    // === Phase demande de fonds ===
    montantDemande: numeric("montant_demande"),
    montantProvisionne: numeric("montant_provisionne"),
    fundRequestedAt: timestamp("fund_requested_at"),
    fundDispatchedAt: timestamp("fund_dispatched_at"),
    fundDispatchedBy: uuid("fund_dispatched_by")
      .references(() => users.id, { onDelete: "set null" }),

    // Source caisse pour provisioning
    sourceCaisseId: uuid("source_caisse_id")
      .references(() => caisses.id, { onDelete: "set null" }),
    provisioningOperationId: uuid("provisioning_operation_id")
      .references(() => operationsTerrain.id, { onDelete: "set null" }),

    // === Phase active ===
    openedAt: timestamp("opened_at"),

    // Totaux courants (mis à jour après chaque opération approuvée)
    totalCollected: numeric("total_collected").notNull().default("0"),
    totalSettled: numeric("total_settled").notNull().default("0"),
    operationCount: integer("operation_count").notNull().default(0),

    // === Phase clôture ===
    closingInitiatedAt: timestamp("closing_initiated_at"),

    // Comptage physique à la clôture
    montantPhysique: numeric("montant_physique"),
    montantTheorique: numeric("montant_theorique"),
    ecart: numeric("ecart"),
    ecartJustification: text("ecart_justification"),

    // Billetage à la clôture
    billetageFermeture: json("billetage_fermeture").$type<Record<string, number>>(),

    // Retour de fonds
    destinationCaisseId: uuid("destination_caisse_id")
      .references(() => caisses.id, { onDelete: "set null" }),
    closingOperationId: uuid("closing_operation_id")
      .references(() => operationsTerrain.id, { onDelete: "set null" }),
    montantRetourne: numeric("montant_retourne"),

    // Clôture finale
    closedAt: timestamp("closed_at"),
    closedBy: uuid("closed_by")
      .references(() => users.id, { onDelete: "set null" }),
    closureReason: text("closure_reason").default("manual"), // manual, timeout, admin

    // Audit
    observations: text("observations"),
    createdBy: uuid("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Un seul agent ne peut avoir qu'une session non-clôturée
    uqAgentActive: uniqueIndex("uq_sessions_agent_active")
      .on(t.agentId)
      .where(sql`statut != 'CLOSED'`),

    idxAgentStatut: index("idx_sessions_agent_agent_statut").on(t.agentId, t.statut),
    idxAgence: index("idx_sessions_agent_agence").on(t.agenceId),
    idxStatut: index("idx_sessions_agent_statut").on(t.statut),
    idxCreatedAt: index("idx_sessions_agent_created_at").on(t.createdAt),
  }),
);

export const insertSessionAgentSchema = createInsertSchema(sessionsAgent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSessionAgent = z.infer<typeof insertSessionAgentSchema>;
export type SessionAgent = typeof sessionsAgent.$inferSelect;

// ============================================================================
// TABLE: agent_agency_history
// Historique des assignations agence des agents (pour mobilité & audit)
// ============================================================================

export const agentAgencyHistory = pgTable(
  "agent_agency_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTerrain.id, { onDelete: "cascade" }),
    agenceId: uuid("agence_id")
      .notNull()
      .references(() => agences.id, { onDelete: "restrict" }),

    // Sous-compte GL rattaché à cette assignation
    glAccountId: uuid("gl_account_id")
      .references(() => planComptable.id, { onDelete: "set null" }),
    glAccountNumber: text("gl_account_number"),

    // Période
    dateFrom: timestamp("date_from").notNull().defaultNow(),
    dateTo: timestamp("date_to"), // NULL = assignation courante

    // Traçabilité du transfert
    reason: text("reason"), // "Initial", "Transfert", etc.
    transferredBy: uuid("transferred_by")
      .references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxAgent: index("idx_agent_agency_history_agent").on(t.agentId),
    idxAgence: index("idx_agent_agency_history_agence").on(t.agenceId),
    idxCurrent: index("idx_agent_agency_history_current")
      .on(t.agentId)
      .where(sql`date_to IS NULL`),
  }),
);

export const insertAgentAgencyHistorySchema = createInsertSchema(agentAgencyHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentAgencyHistory = z.infer<typeof insertAgentAgencyHistorySchema>;
export type AgentAgencyHistory = typeof agentAgencyHistory.$inferSelect;

// ============================================================================
// TABLE: sessions_agent_audit_logs
// Logs d'audit immuables pour les transitions d'état des sessions
// ============================================================================

export const sessionsAgentAuditLogs = pgTable(
  "sessions_agent_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessionsAgent.id, { onDelete: "cascade" }),

    action: text("action").notNull(), // REQUESTED, PROVISIONED, OPENED, CLOSING, CLOSED, FORCE_CLOSED

    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres").notNull(),

    details: json("details").$type<Record<string, unknown>>(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxSession: index("idx_sessions_agent_audit_session").on(t.sessionId),
    idxTimestamp: index("idx_sessions_agent_audit_timestamp").on(t.timestamp),
  }),
);

export const insertSessionAgentAuditLogSchema = createInsertSchema(sessionsAgentAuditLogs).omit({
  id: true,
  timestamp: true,
});
export type InsertSessionAgentAuditLog = z.infer<typeof insertSessionAgentAuditLogSchema>;
export type SessionAgentAuditLog = typeof sessionsAgentAuditLogs.$inferSelect;

// ============================================================================
// TABLE: agent_session_config
// Configuration par agence pour les sessions agent terrain
// ============================================================================

export const agentSessionConfig = pgTable(
  "agent_session_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    agenceId: uuid("agence_id")
      .notNull()
      .references(() => agences.id, { onDelete: "cascade" }),

    // Si true, le dispatch de fonds nécessite une approbation séparée
    requireProvisioningApproval: boolean("require_provisioning_approval").notNull().default(false),

    // Durée max d'une session avant alerte (heures)
    maxSessionDurationHours: integer("max_session_duration_hours").notNull().default(24),

    // Plafond de provisioning par session (null = pas de plafond)
    maxProvisioningAmount: numeric("max_provisioning_amount"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uqAgence: uniqueIndex("uq_agent_session_config_agence").on(t.agenceId),
  }),
);

export const insertAgentSessionConfigSchema = createInsertSchema(agentSessionConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentSessionConfig = z.infer<typeof insertAgentSessionConfigSchema>;
export type AgentSessionConfig = typeof agentSessionConfig.$inferSelect;
