/**
 * Schéma CaisseAgent - Gestion des caisses internes des agents terrain
 * avec workflow d'approbation pour les opérations de collecte et remise
 */

import { pgTable, text, numeric, boolean, timestamp, uuid, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Imports des tables existantes
import { users } from "./auth";
import { clients } from "./clients";
import { agentsTerrain, paiementsTerrain } from "./operations";
import { mouvementsFinanciers, caisses } from "./finance";

// Import des enums
import {
  statutCaisseAgentEnum,
  typeOperationTerrainEnum,
  statutOperationTerrainEnum,
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

    // Devise (XOF par défaut, cohérent avec le système existant)
    devise: text("devise").notNull().default("XOF"),

    // Statut de la caisse
    statut: statutCaisseAgentEnum("statut").notNull().default("Active"),

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
    devise: text("devise").notNull().default("XOF"),

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
  statut: "Active" | "Suspendue" | "Clôturée";
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
