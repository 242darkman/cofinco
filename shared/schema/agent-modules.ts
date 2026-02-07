/**
 * Agent Sub-Modules Schema
 *
 * Tables for agent-specific operational data:
 * - agent_commissions: Commission tracking per agent per period
 * - agent_objectifs: Performance objectives and targets
 * - agent_plannings: Activity scheduling
 * - agent_rapports: Generated activity reports
 * - agent_incidents: Incident reporting and resolution
 * - agent_materiel: Equipment inventory tracking
 * - agent_communications: Internal messaging (Info/Alerte/Instruction)
 * - agent_communications: Internal messaging (Info/Alerte/Instruction)
 */

import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { agentsTerrain } from "./operations";
import { agences } from "./agences";
import { users } from "./auth";
import { relations } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════════════════════
// AGENT COMMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

export const agentCommissions = pgTable("agent_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "cascade" }),
  agenceId: uuid("agence_id").references(() => agences.id),
  periode: varchar("periode", { length: 7 }).notNull(), // YYYY-MM
  montantCollecte: numeric("montant_collecte").notNull().default("0"),
  tauxCommission: numeric("taux_commission").notNull().default("5.0"),
  montantCommission: numeric("montant_commission").notNull().default("0"),
  primes: numeric("primes").notNull().default("0"),
  avances: numeric("avances").notNull().default("0"),
  montantNet: numeric("montant_net").notNull().default("0"),
  statutPaiement: text("statut_paiement").notNull().default("En attente"),
  datePaiement: timestamp("date_paiement"),
  methodePaiement: text("methode_paiement"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_commissions_agent").on(table.agentId),
  index("idx_agent_commissions_periode").on(table.periode),
  index("idx_agent_commissions_agence").on(table.agenceId),
]);

export const insertAgentCommissionSchema = createInsertSchema(agentCommissions).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentCommission = z.infer<typeof insertAgentCommissionSchema>;
export type AgentCommission = typeof agentCommissions.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// AGENT OBJECTIFS
// ══════════════════════════════════════════════════════════════════════════════

export const agentObjectifs = pgTable("agent_objectifs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "cascade" }),
  agenceId: uuid("agence_id").references(() => agences.id),
  periode: varchar("periode", { length: 7 }).notNull(), // YYYY-MM
  typeObjectif: text("type_objectif").notNull().default("Collecte"),
  valeurObjectif: numeric("valeur_objectif").notNull().default("0"),
  valeurRealisee: numeric("valeur_realisee").notNull().default("0"),
  unite: text("unite").notNull().default("FCFA"),
  statut: text("statut").notNull().default("IN_PROGRESS"),
  recompense: numeric("recompense").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_objectifs_agent").on(table.agentId),
  index("idx_agent_objectifs_periode").on(table.periode),
  index("idx_agent_objectifs_agence").on(table.agenceId),
]);

export const insertAgentObjectifSchema = createInsertSchema(agentObjectifs).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentObjectif = z.infer<typeof insertAgentObjectifSchema>;
export type AgentObjectif = typeof agentObjectifs.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// AGENT PLANNINGS
// ══════════════════════════════════════════════════════════════════════════════

export const agentPlannings = pgTable("agent_plannings", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "cascade" }),
  agenceId: uuid("agence_id").references(() => agences.id),
  datePlanning: text("date_planning").notNull(), // YYYY-MM-DD
  heureDebut: text("heure_debut").notNull().default("08:00"),
  heureFin: text("heure_fin").notNull().default("17:00"),
  typeActivite: text("type_activite").notNull().default("Visite"),
  zone: text("zone").default(""),
  statut: text("statut").notNull().default("PLANNED"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_plannings_agent").on(table.agentId),
  index("idx_agent_plannings_date").on(table.datePlanning),
  index("idx_agent_plannings_agence").on(table.agenceId),
]);

export const insertAgentPlanningSchema = createInsertSchema(agentPlannings).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentPlanning = z.infer<typeof insertAgentPlanningSchema>;
export type AgentPlanning = typeof agentPlannings.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// AGENT RAPPORTS
// ══════════════════════════════════════════════════════════════════════════════

export const agentRapports = pgTable("agent_rapports", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "cascade" }),
  agenceId: uuid("agence_id").references(() => agences.id),
  periodeDebut: text("periode_debut").notNull(),
  periodeFin: text("periode_fin").notNull(),
  typeRapport: text("type_rapport").notNull().default("Mensuel"),
  nombreVisites: integer("nombre_visites").notNull().default(0),
  nombreCollectes: integer("nombre_collectes").notNull().default(0),
  montantTotalCollecte: numeric("montant_total_collecte").notNull().default("0"),
  tauxReussite: numeric("taux_reussite").notNull().default("0"),
  clientsNouveaux: integer("clients_nouveaux").notNull().default(0),
  incidents: integer("incidents").notNull().default(0),
  kmParcourus: numeric("km_parcourus").notNull().default("0"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_rapports_agent").on(table.agentId),
  index("idx_agent_rapports_type").on(table.typeRapport),
  index("idx_agent_rapports_agence").on(table.agenceId),
]);

export const insertAgentRapportSchema = createInsertSchema(agentRapports).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentRapport = z.infer<typeof insertAgentRapportSchema>;
export type AgentRapport = typeof agentRapports.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// AGENT INCIDENTS
// ══════════════════════════════════════════════════════════════════════════════

export const agentIncidents = pgTable("agent_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "cascade" }),
  agenceId: uuid("agence_id").references(() => agences.id),
  typeIncident: text("type_incident").notNull().default("Autre"),
  gravite: text("gravite").notNull().default("Moyenne"),
  description: text("description").notNull(),
  dateIncident: text("date_incident").notNull(),
  localisation: text("localisation").default(""),
  statut: text("statut").notNull().default("OPEN"),
  resolution: text("resolution").default(""),
  dateResolution: timestamp("date_resolution"),
  piecesJointes: jsonb("pieces_jointes").$type<string[]>().default([]),
  escaladePar: text("escalade_par"),
  dateEscalade: timestamp("date_escalade"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_incidents_agent").on(table.agentId),
  index("idx_agent_incidents_statut").on(table.statut),
  index("idx_agent_incidents_agence").on(table.agenceId),
]);

export const insertAgentIncidentSchema = createInsertSchema(agentIncidents, {
  piecesJointes: z.array(z.string()).optional(),
}).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentIncident = z.infer<typeof insertAgentIncidentSchema>;
export type AgentIncident = typeof agentIncidents.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// AGENT MATERIEL
// ══════════════════════════════════════════════════════════════════════════════

export const agentMateriel = pgTable("agent_materiel", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agentsTerrain.id, { onDelete: "cascade" }),
  agenceId: uuid("agence_id").references(() => agences.id),
  typeMateriel: text("type_materiel").notNull().default("Tablette"),
  nomMateriel: text("nom_materiel").notNull(),
  numeroSerie: text("numero_serie").default(""),
  dateAttribution: text("date_attribution").notNull(),
  dateRetour: text("date_retour"),
  etat: text("etat").notNull().default("Neuf"),
  valeur: numeric("valeur").notNull().default("0"),
  dateGarantieFin: text("date_garantie_fin"), // YYYY-MM-DD
  dureeAmortissementMois: integer("duree_amortissement_mois").default(36),
  prochaineMaintenance: text("prochaine_maintenance"), // YYYY-MM-DD
  historiqueMaintenances: jsonb("historique_maintenances").$type<Array<{ date: string; description: string; cout: number }>>().default([]),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_materiel_agent").on(table.agentId),
  index("idx_agent_materiel_etat").on(table.etat),
  index("idx_agent_materiel_agence").on(table.agenceId),
]);

export const insertAgentMaterielSchema = createInsertSchema(agentMateriel, {
  historiqueMaintenances: z.array(z.object({
    date: z.string(),
    description: z.string(),
    cout: z.number(),
  })).optional(),
}).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentMateriel = z.infer<typeof insertAgentMaterielSchema>;
export type SelectAgentMateriel = typeof agentMateriel.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// AGENT COMMUNICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const agentCommunications = pgTable("agent_communications", {
  id: uuid("id").primaryKey().defaultRandom(),
  expediteurId: text("expediteur_id").notNull(), // userId or 'admin'
  destinataireId: uuid("destinataire_id").notNull(), // agent_id (agents_terrain.id)
  agenceId: uuid("agence_id").references(() => agences.id),
  typeMessage: text("type_message").notNull().default("Info"),
  sujet: text("sujet").notNull(),
  message: text("message").notNull(),
  priorite: text("priorite").notNull().default("Normale"),
  lu: boolean("lu").notNull().default(false),
  dateLecture: timestamp("date_lecture"),
  pieceJointeUrl: text("piece_jointe_url").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_agent_communications_dest").on(table.destinataireId),
  index("idx_agent_communications_exp").on(table.expediteurId),
  index("idx_agent_communications_agence").on(table.agenceId),
]);

export const insertAgentCommunicationSchema = createInsertSchema(agentCommunications).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export type InsertAgentCommunication = z.infer<typeof insertAgentCommunicationSchema>;
export type AgentCommunication = typeof agentCommunications.$inferSelect;



// ══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const agentCommissionsRelations = relations(agentCommissions, ({ one }) => ({
  agent: one(agentsTerrain, { fields: [agentCommissions.agentId], references: [agentsTerrain.id] }),
  agence: one(agences, { fields: [agentCommissions.agenceId], references: [agences.id] }),
}));

export const agentObjectifsRelations = relations(agentObjectifs, ({ one }) => ({
  agent: one(agentsTerrain, { fields: [agentObjectifs.agentId], references: [agentsTerrain.id] }),
  agence: one(agences, { fields: [agentObjectifs.agenceId], references: [agences.id] }),
}));

export const agentPlanningsRelations = relations(agentPlannings, ({ one }) => ({
  agent: one(agentsTerrain, { fields: [agentPlannings.agentId], references: [agentsTerrain.id] }),
  agence: one(agences, { fields: [agentPlannings.agenceId], references: [agences.id] }),
}));

export const agentRapportsRelations = relations(agentRapports, ({ one }) => ({
  agent: one(agentsTerrain, { fields: [agentRapports.agentId], references: [agentsTerrain.id] }),
  agence: one(agences, { fields: [agentRapports.agenceId], references: [agences.id] }),
}));

export const agentIncidentsRelations = relations(agentIncidents, ({ one }) => ({
  agent: one(agentsTerrain, { fields: [agentIncidents.agentId], references: [agentsTerrain.id] }),
  agence: one(agences, { fields: [agentIncidents.agenceId], references: [agences.id] }),
}));

export const agentMaterielRelations = relations(agentMateriel, ({ one }) => ({
  agent: one(agentsTerrain, { fields: [agentMateriel.agentId], references: [agentsTerrain.id] }),
  agence: one(agences, { fields: [agentMateriel.agenceId], references: [agences.id] }),
}));

export const agentCommunicationsRelations = relations(agentCommunications, ({ one }) => ({
  agence: one(agences, { fields: [agentCommunications.agenceId], references: [agences.id] }),
}));


