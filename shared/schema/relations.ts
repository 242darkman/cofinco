import { relations } from "drizzle-orm";
import { users, loginAttempts } from "./auth";
import { clients } from "./clients";
import { credits, remboursements, comptes, transactionsCompte, plansEpargne, sessionsCaisse, operationsCaisse, mouvementsFinanciers, creditPlans, creditPlanFees } from "./finance";
import { tontines, membresTontine, contributionsTontine, tontineAlertes, tontinePenalites } from "./tontines";
import { agentsTerrain, prospections, visitesTerrain, paiementsTerrain, factures, lignesFactures, remisesTerrain, comptageBillets } from "./operations";

import { notifications, pushSubscriptions, creditPlanVersions, creditPenaltyStructures, holidayCalendars, holidayDates } from "./settings";
import { transferts } from "./transferts";
import { clientTags, clientActivities } from "./clients";
import { clientScoreEvents, clientScoreState } from "./scoring";

export const clientsRelations = relations(clients, ({ many, one }) => ({
  credits: many(credits),
  comptes: many(comptes),
  membresTontine: many(membresTontine),
  scoreEvents: many(clientScoreEvents),
  scoreState: one(clientScoreState),
}));

export const creditsRelations = relations(credits, ({ one, many }) => ({
  client: one(clients, {
    fields: [credits.clientId],
    references: [clients.id],
  }),
  remboursements: many(remboursements),
}));

export const comptesRelations = relations(comptes, ({ one, many }) => ({
  client: one(clients, {
    fields: [comptes.clientId],
    references: [clients.id],
  }),
  transactions: many(transactionsCompte),
}));

export const tontinesRelations = relations(tontines, ({ many }) => ({
  membres: many(membresTontine),
  contributions: many(contributionsTontine),
}));

export const membresTontineRelations = relations(membresTontine, ({ one, many }) => ({
  tontine: one(tontines, {
    fields: [membresTontine.tontineId],
    references: [tontines.id],
  }),
  client: one(clients, {
    fields: [membresTontine.clientId],
    references: [clients.id],
  }),
  contributions: many(contributionsTontine),
}));

export const sessionsCaisseRelations = relations(sessionsCaisse, ({ one, many }) => ({
  caissier: one(users, {
    fields: [sessionsCaisse.caissierId],
    references: [users.id],
  }),
  operations: many(operationsCaisse),
}));

export const agentsTerrainRelations = relations(agentsTerrain, ({ many }) => ({
  prospections: many(prospections),
  visites: many(visitesTerrain),
  paiements: many(paiementsTerrain),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const tontineAlertesRelations = relations(tontineAlertes, ({ one }) => ({
  tontine: one(tontines, {
    fields: [tontineAlertes.tontineId],
    references: [tontines.id],
  }),
  membre: one(membresTontine, {
    fields: [tontineAlertes.membreId],
    references: [membresTontine.id],
  }),
}));

export const tontinePenalitesRelations = relations(tontinePenalites, ({ one }) => ({
  tontine: one(tontines, {
    fields: [tontinePenalites.tontineId],
    references: [tontines.id],
  }),
  membre: one(membresTontine, {
    fields: [tontinePenalites.membreId],
    references: [membresTontine.id],
  }),
}));

export const facturesRelations = relations(factures, ({ one }) => ({
  client: one(clients, {
    fields: [factures.clientId],
    references: [clients.id],
  }),
  agent: one(users, {
    fields: [factures.agentId],
    references: [users.id],
  }),
  session: one(sessionsCaisse, {
    fields: [factures.sessionId],
    references: [sessionsCaisse.id],
  }),
}));

export const clientTagsRelations = relations(clientTags, ({ one }) => ({
  client: one(clients, {
    fields: [clientTags.clientId],
    references: [clients.id],
  }),
}));

export const clientActivitiesRelations = relations(clientActivities, ({ one }) => ({
  client: one(clients, {
    fields: [clientActivities.clientId],
    references: [clients.id],
  }),
}));

export const mouvementsFinanciersRelations = relations(mouvementsFinanciers, ({ one, many }) => ({
  client: one(clients, {
    fields: [mouvementsFinanciers.clientId],
    references: [clients.id],
  }),
  compte: one(comptes, {
    fields: [mouvementsFinanciers.compteId],
    references: [comptes.id],
  }),
  credit: one(credits, {
    fields: [mouvementsFinanciers.creditId],
    references: [credits.id],
  }),
  sessionCaisse: one(sessionsCaisse, {
    fields: [mouvementsFinanciers.sessionCaisseId],
    references: [sessionsCaisse.id],
  }),

  // Détails “canaux / modules”
  remboursements: many(remboursements),
  transactionsCompte: many(transactionsCompte),
  operationsCaisse: many(operationsCaisse),

  // si tu as une relation vers tontine/terrain :
  contributionsTontine: many(contributionsTontine),
  paiementsTerrain: many(paiementsTerrain),
}));

export const transactionsCompteRelations = relations(transactionsCompte, ({ one }) => ({
  compte: one(comptes, {
    fields: [transactionsCompte.compteId],
    references: [comptes.id],
  }),
  mouvement: one(mouvementsFinanciers, {
    fields: [transactionsCompte.mouvementId],
    references: [mouvementsFinanciers.id],
  }),
}));


export const remboursementsRelations = relations(remboursements, ({ one }) => ({
  credit: one(credits, {
    fields: [remboursements.creditId],
    references: [credits.id],
  }),
  mouvement: one(mouvementsFinanciers, {
    fields: [remboursements.mouvementId],
    references: [mouvementsFinanciers.id],
  }),
}));


export const operationsCaisseRelations = relations(operationsCaisse, ({ one }) => ({
  session: one(sessionsCaisse, {
    fields: [operationsCaisse.sessionId],
    references: [sessionsCaisse.id],
  }),
  mouvement: one(mouvementsFinanciers, {
    fields: [operationsCaisse.mouvementId],
    references: [mouvementsFinanciers.id],
  }),
}));


export const paiementsTerrainRelations = relations(paiementsTerrain, ({ one }) => ({
  client: one(clients, {
    fields: [paiementsTerrain.clientId],
    references: [clients.id],
  }),
  agent: one(agentsTerrain, {
    fields: [paiementsTerrain.agentId],
    references: [agentsTerrain.id],
  }),
  mouvement: one(mouvementsFinanciers, {
    fields: [paiementsTerrain.mouvementId],
    references: [mouvementsFinanciers.id],
  }),
}));


export const contributionsTontineRelations = relations(contributionsTontine, ({ one }) => ({
  mouvement: one(mouvementsFinanciers, {
    fields: [contributionsTontine.mouvementId],
    references: [mouvementsFinanciers.id],
  }),
}));

export const remisesTerrainRelations = relations(remisesTerrain, ({ one }) => ({
  agent: one(agentsTerrain, {
    fields: [remisesTerrain.agentId],
    references: [agentsTerrain.id],
  }),
  sessionCaisse: one(sessionsCaisse, {
    fields: [remisesTerrain.sessionCaisseId],
    references: [sessionsCaisse.id],
  }),
}));


// Notifications
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));


export const comptageBilletsRelations = relations(comptageBillets, ({ one }) => ({
  session: one(sessionsCaisse, {
    fields: [comptageBillets.sessionId],
    references: [sessionsCaisse.id],
  }),
}));

export const clientScoreEventsRelations = relations(clientScoreEvents, ({ one }) => ({
  client: one(clients, {
    fields: [clientScoreEvents.clientId],
    references: [clients.id],
  }),
}));

export const clientScoreStateRelations = relations(clientScoreState, ({ one }) => ({
  client: one(clients, {
    fields: [clientScoreState.clientId],
    references: [clients.id],
  }),
}));

// Credit Plans
export const creditPlansRelations = relations(creditPlans, ({ many }) => ({
  fees: many(creditPlanFees),
  versions: many(creditPlanVersions),
  penaltyStructures: many(creditPenaltyStructures),
}));

export const creditPlanFeesRelations = relations(creditPlanFees, ({ one }) => ({
  plan: one(creditPlans, {
    fields: [creditPlanFees.planId],
    references: [creditPlans.id],
  }),
}));

export const creditPlanVersionsRelations = relations(creditPlanVersions, ({ one }) => ({
  plan: one(creditPlans, {
    fields: [creditPlanVersions.planId],
    references: [creditPlans.id],
  }),
}));

export const creditPenaltyStructuresRelations = relations(creditPenaltyStructures, ({ one }) => ({
  plan: one(creditPlans, {
    fields: [creditPenaltyStructures.planId],
    references: [creditPlans.id],
  }),
}));

// Holiday Calendars
export const holidayCalendarsRelations = relations(holidayCalendars, ({ many }) => ({
  dates: many(holidayDates),
}));

export const holidayDatesRelations = relations(holidayDates, ({ one }) => ({
  calendar: one(holidayCalendars, {
    fields: [holidayDates.calendarId],
    references: [holidayCalendars.id],
  }),
}));

