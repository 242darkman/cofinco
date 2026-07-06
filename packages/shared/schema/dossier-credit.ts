/**
 * Schéma Dossier Crédit - Demandes de crédit créées par agents terrain
 * et enquêtes de terrain associées
 */

import { pgTable, text, numeric, boolean, timestamp, uuid, jsonb, index, uniqueIndex, integer, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Imports des tables existantes
import { users } from "./auth";
import { clients } from "./clients";
import { agentsTerrain, prospections, paiementsTerrain } from "./operations";
import { agences } from "./agences";
import { demandesCredit, credits, type EnqueteCredit } from "./finance";

// Import des enums
import {
  statutDossierCreditEnum,
} from "@shared/enum/enums";

// ============================================================================
// TABLE: dossiers_credit
// Demandes de crédit créées par les agents terrain
// ============================================================================

export const dossiersCredit = pgTable(
  "dossiers_credit",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Reference and identification
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),

    // Source: from prospection or existing client
    prospectionId: uuid("prospection_id").references(() => prospections.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),

    // Agent who created the dossier
    agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "restrict" }),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    // Loan request details
    montantDemande: numeric("montant_demande").notNull(),
    objetCredit: text("objet_credit").notNull(),
    dureeSouhaitee: integer("duree_souhaitee"), // in months
    frequenceRemboursement: text("frequence_remboursement").default("MONTHLY"),

    // Client information (snapshot or editable)
    nomClient: text("nom_client").notNull(),
    prenomClient: text("prenom_client"),
    telephoneClient: text("telephone_client").notNull(),
    adresseClient: text("adresse_client"),
    profession: text("profession"),
    typeActivite: text("type_activite"),
    revenuEstime: numeric("revenu_estime"),

    // Guarantor information
    nomGarant: text("nom_garant"),
    telephoneGarant: text("telephone_garant"),
    adresseGarant: text("adresse_garant"),
    relationGarant: text("relation_garant"),

    // Documents and attachments
    documents: jsonb("documents").default([]),
    photoUrl: text("photo_url"),

    // Location
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),

    // Workflow status
    statut: statutDossierCreditEnum("statut").notNull().default("DRAFT"),

    // Fee tracking
    fraisEngagementAttendus: numeric("frais_engagement_attendus"),
    fraisEngagementPayes: numeric("frais_engagement_payes").default("0"),
    paiementFraisId: uuid("paiement_frais_id").references(() => paiementsTerrain.id, { onDelete: "set null" }),
    fraisPayesAt: timestamp("frais_payes_at"),

    // Submission
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at"),

    // Investigation link (set when enquete is created)
    enqueteId: uuid("enquete_id"),

    // Committee decision
    committeeDecision: text("committee_decision"),
    committeeDecisionAt: timestamp("committee_decision_at"),
    committeeDecisionBy: uuid("committee_decision_by").references(() => users.id, { onDelete: "set null" }),
    committeeObservations: text("committee_observations"),
    montantApprouve: numeric("montant_approuve"),

    // Final outcome
    demandeCreditId: uuid("demande_credit_id").references(() => demandesCredit.id, { onDelete: "set null" }),
    creditId: uuid("credit_id").references(() => credits.id, { onDelete: "set null" }),

    // Rejection/cancellation
    rejectedAt: timestamp("rejected_at"),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    cancelledAt: timestamp("cancelled_at"),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancellationReason: text("cancellation_reason"),

    // Audit
    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uqReference: uniqueIndex("uq_dossiers_credit_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_dossiers_credit_idempotency")
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    idxAgent: index("idx_dossiers_credit_agent").on(t.agentId),
    idxClient: index("idx_dossiers_credit_client").on(t.clientId),
    idxProspection: index("idx_dossiers_credit_prospection").on(t.prospectionId),
    idxStatut: index("idx_dossiers_credit_statut").on(t.statut),
    idxAgence: index("idx_dossiers_credit_agence").on(t.agenceId),
    idxDate: index("idx_dossiers_credit_date").on(t.createdAt),
  }),
);

export const insertDossierCreditSchema = createInsertSchema(dossiersCredit).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertDossierCredit = z.infer<typeof insertDossierCreditSchema>;
export type DossierCredit = typeof dossiersCredit.$inferSelect;

// ============================================================================
// TYPES UTILITAIRES
// ============================================================================

/**
 * Input pour créer un dossier crédit depuis une prospection
 */
export interface CreateDossierCreditFromProspectionInput {
  prospectionId: string;
  agentId: string;
  montantDemande: number;
  objetCredit: string;
  dureeSouhaitee?: number;
  frequenceRemboursement?: string;
  observations?: string;
  idempotencyKey?: string;
}

/**
 * Input pour créer un dossier crédit pour un client existant
 */
export interface CreateDossierCreditForClientInput {
  clientId: string;
  agentId: string;
  montantDemande: number;
  objetCredit: string;
  dureeSouhaitee?: number;
  frequenceRemboursement?: string;
  observations?: string;
  idempotencyKey?: string;
}

/**
 * Input pour soumettre un dossier
 */
export interface SubmitDossierCreditInput {
  dossierId: string;
  submittedBy: string;
}

/**
 * Input pour créer une enquête
 */
export interface CreateEnqueteCreditAgentInput {
  dossierId: string;
  enqueteurId: string;
  assignedBy: string;
  dateVisitePrevue?: string;
}

/**
 * Input pour compléter une enquête
 */
export interface CompleteEnqueteCreditAgentInput {
  enqueteId: string;
  completedBy: string;
  // Verification data
  adresseVerifiee?: string;
  adresseConforme?: boolean;
  activiteVerifiee?: string;
  activiteConforme?: boolean;
  localType?: string;
  ancienneteActivite?: string;
  // Revenue
  revenuConstate?: number;
  chargesMensuelles?: number;
  capaciteRemboursement?: number;
  // Guarantor
  garantVisite?: boolean;
  garantConforme?: boolean;
  garantObservations?: string;
  // Risk
  niveauRisque?: string;
  scoreRisque?: number;
  // Photos
  photos?: string[];
  documentsCollectes?: string[];
  // Location
  latitudeVisite?: number;
  longitudeVisite?: number;
  // Recommendation
  avisEnqueteur: string;
  montantRecommande?: number;
  dureeRecommandee?: number;
  observations?: string;
}

/**
 * Dossier crédit avec relations
 */
export interface DossierCreditWithRelations extends DossierCredit {
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
  prospection?: {
    id: string;
    nomProspect: string;
    telephoneProspect: string;
  } | null;
  enquete?: EnqueteCredit | null;
}
