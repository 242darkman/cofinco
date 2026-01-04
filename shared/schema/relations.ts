import { relations } from "drizzle-orm";
import { users, loginAttempts } from "./auth";
import { clients } from "./clients";
import { credits, remboursements, comptesEpargne, transactionsEpargne, plansEpargne, sessionsCaisse, operationsCaisse } from "./finance";
import { tontines, membresTontine, contributionsTontine, tontineAlertes, tontinePenalites } from "./tontines";
import { agentsTerrain, prospections, visitesTerrain, paiementsTerrain, factures, lignesFactures } from "./operations";
import { notifications, pushSubscriptions } from "./settings";
import { transferts } from "./transferts";
import { clientTags, clientActivities } from "./clients";

export const clientsRelations = relations(clients, ({ many }) => ({
  credits: many(credits),
  comptesEpargne: many(comptesEpargne),
  membresTontine: many(membresTontine),
}));

export const creditsRelations = relations(credits, ({ one, many }) => ({
  client: one(clients, {
    fields: [credits.clientId],
    references: [clients.id],
  }),
  remboursements: many(remboursements),
}));

export const comptesEpargneRelations = relations(comptesEpargne, ({ one, many }) => ({
  client: one(clients, {
    fields: [comptesEpargne.clientId],
    references: [clients.id],
  }),
  transactions: many(transactionsEpargne),
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

// Notifications
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));
