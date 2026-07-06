/**
 * KPI Snapshots Schema
 * ====================
 * Stocke les indicateurs clés de performance calculés par période et par scope.
 * Un snapshot = un JSON complet de tous les KPIs pour une période/agence donnée.
 *
 * Stratégie : calcul à la demande (recalculate) → stockage en JSONB → lecture rapide.
 */
import { pgTable, uuid, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { agences } from "./agences";

// =====================
// KPI Snapshots Table
// =====================

export const kpiSnapshots = pgTable("kpi_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Type de période : MONTH ou YEAR */
  periodType: text("period_type").notNull(),

  /** Clé de période : '2026-02' pour mois, '2026' pour année */
  periodKey: text("period_key").notNull(),

  /** Type de scope : AGENCY (une agence) ou CONSOLIDATED (toutes) */
  scopeType: text("scope_type").notNull(),

  /** ID agence — null pour CONSOLIDATED */
  agencyId: uuid("agency_id").references(() => agences.id, { onDelete: "set null" }),

  /** Payload complet des KPIs (JSONB) */
  payload: jsonb("payload").notNull().$type<KpiPayload>(),

  /** Date/heure du calcul */
  generatedAt: timestamp("generated_at").notNull().defaultNow(),

  /** Utilisateur ayant déclenché le calcul */
  generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),

  /** Version (incrémentée à chaque recalcul) */
  version: integer("version").notNull().default(1),

  /** Métadonnées : warnings, source (manual/scheduled), durée calcul */
  metadata: jsonb("metadata").$type<KpiMetadata>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  /** Un seul snapshot par combinaison période/scope/agence */
  uqPeriodScope: uniqueIndex("uq_kpi_period_scope").on(t.periodType, t.periodKey, t.scopeType, t.agencyId),
  idxPeriodKey: index("idx_kpi_period_key").on(t.periodKey),
  idxAgency: index("idx_kpi_agency_id").on(t.agencyId),
  idxGeneratedAt: index("idx_kpi_generated_at").on(t.generatedAt),
}));

// =====================
// TypeScript Types
// =====================

export type KpiPeriodType = 'MONTH' | 'YEAR';
export type KpiScopeType = 'AGENCY' | 'CONSOLIDATED';

export interface KpiDelta {
  value: number;
  percent: number;
}

export interface KpiCreditPayload {
  encoursTotalActif: number;
  nombreCreditsActifs: number;
  decaissementsPeriode: number;
  nombreDecaissements: number;
  tauxApprobation: number;
  panierMoyen: number;
  repartitionParPlan: Array<{
    planId: string;
    planNom: string;
    count: number;
    montant: number;
    encours: number;
  }>;
}

export interface KpiRisquePayload {
  par30: number;
  par60: number;
  par90: number;
  tauxRecouvrement: number;
  tauxDefaut: number;
  tauxRadiation: number;
  creditsEnSouffrance: number;
  montantEnSouffrance: number;
}

export interface KpiTontinesEpargnePayload {
  encoursEpargne: number;
  encoursComptesCourants: number;
  tontinesActives: number;
  membresTontines: number;
  volumesCollectes: number;
  volumesRetires: number;
  cotisationsTontines: number;
}

export interface KpiRentabilitePayload {
  interetsPercus: number;
  fraisCommissions: number;
  revenusTontines: number;
  totalRevenus: number;
  charges: number;
  resultatNet: number;
  ratioChargesEncours: number;
}

export interface KpiTresoreriePayload {
  soldeCaisses: number;
  soldeCoffres: number;
  soldeBanque: number;
  soldeMobileMoney: number;
  fluxEntrants: number;
  fluxSortants: number;
  ratioLiquidite: number;
  ecartsCaisses: number;
}

export interface KpiClientsPayload {
  totalClientsActifs: number;
  nouveauxClients: number;
  clientsParSegment: Record<string, number>;
  tauxRetention: number;
}

export interface KpiRhProductivitePayload {
  agentsActifs: number;
  clientsParAgent: number;
  encoursParAgent: number;
  decaissementsParAgent: number;
  topAgents: Array<{
    id: string;
    nom: string;
    prenom: string;
    decaissements: number;
    montant: number;
    clients: number;
  }>;
  bottomAgents: Array<{
    id: string;
    nom: string;
    prenom: string;
    decaissements: number;
    montant: number;
    clients: number;
  }>;
  masseSalariale: number;
}

export interface KpiDeltas {
  credit: Partial<Record<keyof KpiCreditPayload, KpiDelta>>;
  risque: Partial<Record<keyof KpiRisquePayload, KpiDelta>>;
  tontinesEpargne: Partial<Record<keyof KpiTontinesEpargnePayload, KpiDelta>>;
  rentabilite: Partial<Record<keyof KpiRentabilitePayload, KpiDelta>>;
  tresorerie: Partial<Record<keyof KpiTresoreriePayload, KpiDelta>>;
  clients: Partial<Record<keyof KpiClientsPayload, KpiDelta>>;
  rhProductivite: Partial<Record<keyof KpiRhProductivitePayload, KpiDelta>>;
}

export interface KpiPayload {
  credit: KpiCreditPayload;
  risque: KpiRisquePayload;
  tontinesEpargne: KpiTontinesEpargnePayload;
  rentabilite: KpiRentabilitePayload;
  tresorerie: KpiTresoreriePayload;
  clients: KpiClientsPayload;
  rhProductivite: KpiRhProductivitePayload;
  deltas: KpiDeltas;
}

export interface KpiMetadata {
  source: 'manual' | 'scheduled';
  triggeredBy?: string;
  computeDurationMs?: number;
  warnings?: string[];
}

export type KpiSnapshot = typeof kpiSnapshots.$inferSelect;
export type InsertKpiSnapshot = typeof kpiSnapshots.$inferInsert;
