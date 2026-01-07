import { pgTable, text, varchar, integer, numeric, boolean, timestamp, uuid, json, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./clients";
import { users } from "./auth";
import { agences } from "./agences";
import { caisses } from "./operations";
import { dureeUniteEnum, frequenceRemboursementEnum, methodePaiementEnum, statutDemandeEnum, typeRevenuEnum, typeCreditEnum } from "@shared/enum/enums";

// Interest Rates
export const interestRates = pgTable("interest_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  code: text("code").notNull().unique(),
  tauxAnnuel: numeric("taux_annuel").notNull(),
  tauxMensuel: numeric("taux_mensuel"),
  type: text("type").default("credit"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterestRateSchema = createInsertSchema(interestRates).omit({ id: true, createdAt: true });
export type InsertInterestRate = z.infer<typeof insertInterestRateSchema>;
export type InterestRate = typeof interestRates.$inferSelect;

// Credits table
export const credits = pgTable("credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  numeroCredit: text("numero_credit").notNull().unique(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  enqueteId: uuid("enquete_id"),
  montant: numeric("montant").notNull(),
  taux: numeric("taux").notNull(),
  duree: integer("duree").notNull(),
  typeCredit: text("type_credit").notNull(),
  objetCredit: text("objet_credit"),
  statut: text("statut").notNull().default("En attente"),
  dateDebut: timestamp("date_debut"),
  dateFin: timestamp("date_fin"),
  dateSolvabilite: timestamp("date_solvabilite"),
  dateSolde: timestamp("date_solde"),
  soldeAvant2Mois: boolean("solde_avant_2_mois").default(false),
  soldeRestant: numeric("solde_restant"),
  echeance: text("echeance").default("Journalier"),
  garanties: text("garanties"),
  observations: text("observations"),
  agenceId: uuid("agence_id").references(() => agences.id), // Agence du crédit
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertCreditSchema = createInsertSchema(credits).omit({ createdAt: true, updatedAt: true, deletedAt: true });
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof credits.$inferSelect;

// Demandes de crédit
export const demandesCredit = pgTable(
  "demandes_credit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numeroDemande: text("numero_demande").notNull().unique(),
    clientId: uuid("client_id").notNull().references(() => clients.id),

    montantDemande: numeric("montant_demande").notNull(),
    tauxInteret: numeric("taux_interet").notNull(),

    // Fréquence et durée (V2 - champs principaux)
    frequenceRemboursement: frequenceRemboursementEnum("frequence_remboursement").notNull(),
    dureeValeur: integer("duree_valeur").notNull(),       // ex: 15, 3, 12
    dureeUnite: dureeUniteEnum("duree_unite").notNull(),  // Jour / Semaine / Mois

    // Calculs backend
    nombreEcheances: integer("nombre_echeances"),    // calculé / recalculable

    // Enums
    typeRevenu: typeRevenuEnum("type_revenu"),
    statut: statutDemandeEnum("statut"),
    typeCredit: typeCreditEnum("type_credit"),
    objetCredit: text("objet_credit").notNull(),

    revenusMensuels: numeric("revenus_mensuels"),
    revenuJournalier: numeric("revenu_journalier"),
    chargesMensuelles: numeric("charges_mensuelles"),
    scoreCredit: integer("score_credit"),
    montantApprouve: numeric("montant_approuve"),

    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    idxDemandesClient: index("idx_demandes_credit_client_id").on(t.clientId),
    idxDemandesStatut: index("idx_demandes_credit_statut").on(t.statut),
    idxDemandesCreatedAt: index("idx_demandes_credit_created_at").on(t.createdAt),
  }),
);

export const insertDemandeCreditSchema = createInsertSchema(demandesCredit).omit({ id: true, createdAt: true });
export type InsertDemandeCredit = z.infer<typeof insertDemandeCreditSchema>;
export type DemandeCredit = typeof demandesCredit.$inferSelect;

// Enquêtes de crédit
export const enquetesCredit = pgTable("enquetes_credit", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  demandeId: uuid("demande_id").references(() => demandesCredit.id),
  montantDemande: numeric("montant_demande").notNull(),
  objetCredit: text("objet_credit").notNull(),
  revenuMensuel: numeric("revenu_mensuel"),
  typeRevenu: typeRevenuEnum("type_revenu"),
  revenuJournalier: numeric("revenu_journalier"),
  joursTravailMois: integer("jours_travail_mois").default(26),
  chargesMensuelles: numeric("charges_mensuelles"),
  autrePrets: numeric("autre_prets").default("0"),
  personnesCharge: integer("personnes_charge").default(0),
  typeHabitation: text("type_habitation"),
  ancienneteActivite: integer("anciennete_activite"),
  evaluationActivite: text("evaluation_activite"),
  capaciteRemboursement: numeric("capacite_remboursement"),
  scoreGlobal: integer("score_global"),
  recommandation: text("recommandation"),
  statut: text("statut").notNull().default("En cours"),
  observations: text("observations"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEnqueteCreditSchema = createInsertSchema(enquetesCredit).omit({ id: true, createdAt: true });
export type InsertEnqueteCredit = z.infer<typeof insertEnqueteCreditSchema>;
export type EnqueteCredit = typeof enquetesCredit.$inferSelect;

// Remboursements
export const remboursements = pgTable(
  "remboursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creditId: uuid("credit_id").notNull().references(() => credits.id),

    montant: numeric("montant").notNull(),
    dateRemboursement: timestamp("date_remboursement").notNull(),

    methodePaiement: methodePaiementEnum("methode_paiement"),

    numeroTransaction: text("numero_transaction"),
    recu: text("recu"),
    observations: text("observations"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    idxRembCredit: index("idx_remboursements_credit_id").on(t.creditId),
    idxRembDate: index("idx_remboursements_date").on(t.dateRemboursement),
  }),
);

// Durees suggerees
export const dureesSuggerees = pgTable("durees_suggerees", {
  id: uuid("id").primaryKey().defaultRandom(),

  frequence: frequenceRemboursementEnum("frequence").notNull(),

  dureeValeur: integer("duree_valeur").notNull(),     // ex 15, 30, 3, 6
  dureeUnite: dureeUniteEnum("duree_unite").notNull(),// Jour/Mois…

  estRecommandee: integer("est_recommandee").notNull().default(0), // 0/1 simple
  ordre: integer("ordre").notNull().default(0),
  actif: integer("actif").notNull().default(1),

  createdAt: timestamp("created_at").defaultNow(),
});


export const insertRemboursementSchema = createInsertSchema(remboursements).omit({ id: true, createdAt: true });
export type InsertRemboursement = z.infer<typeof insertRemboursementSchema>;
export type Remboursement = typeof remboursements.$inferSelect;

// Durees Suggerees types
export const insertDureeSuggereeSchema = createInsertSchema(dureesSuggerees).omit({ id: true, createdAt: true });
export type InsertDureeSuggeree = z.infer<typeof insertDureeSuggereeSchema>;
export type DureeSuggeree = typeof dureesSuggerees.$inferSelect;

// Comptes épargne
export const comptesEpargne = pgTable("comptes_epargne", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  numeroCompte: text("numero_compte").notNull().unique(),
  typeCompte: text("type_compte").notNull(),
  solde: numeric("solde").notNull().default("0"),
  tauxInteret: numeric("taux_interet").notNull(),
  dateOuverture: timestamp("date_ouverture").defaultNow(),
  statut: text("statut").notNull().default("Actif"),
  objectifEpargne: numeric("objectif_epargne"),
  dateObjectif: timestamp("date_objectif"),
  versementMensuel: numeric("versement_mensuel"),
  agenceId: uuid("agence_id").references(() => agences.id), // Agence du compte épargne
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertCompteEpargneSchema = createInsertSchema(comptesEpargne).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertCompteEpargne = z.infer<typeof insertCompteEpargneSchema>;
export type CompteEpargne = typeof comptesEpargne.$inferSelect;

// Transactions épargne
export const transactionsEpargne = pgTable("transactions_epargne", {
  id: uuid("id").primaryKey().defaultRandom(),
  compteId: uuid("compte_id").notNull().references(() => comptesEpargne.id),
  typeTransaction: text("type_transaction").notNull(),
  montant: numeric("montant").notNull(),
  soldeApres: numeric("solde_apres").notNull(),
  methodePaiement: text("methode_paiement").default("Espèces"),
  reference: text("reference"),
  observations: text("observations"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransactionEpargneSchema = createInsertSchema(transactionsEpargne).omit({ id: true, createdAt: true });
export type InsertTransactionEpargne = z.infer<typeof insertTransactionEpargneSchema>;
export type TransactionEpargne = typeof transactionsEpargne.$inferSelect;

// Plans d'épargne liés aux crédits
export const plansEpargne = pgTable("plans_epargne", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditId: uuid("credit_id").notNull().references(() => credits.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  compteEpargneId: uuid("compte_epargne_id").references(() => comptesEpargne.id),
  montantMensuel: numeric("montant_mensuel").notNull(),
  duree: integer("duree").notNull(),
  montantTotal: numeric("montant_total").notNull(),
  dateDebut: timestamp("date_debut").notNull(),
  dateFin: timestamp("date_fin").notNull(),
  statut: text("statut").notNull().default("Actif"),
  observations: text("observations"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlanEpargneSchema = createInsertSchema(plansEpargne).omit({ id: true, createdAt: true });
export type InsertPlanEpargne = z.infer<typeof insertPlanEpargneSchema>;
export type PlanEpargne = typeof plansEpargne.$inferSelect;

// Objectifs d'épargne
export const objectifsEpargne = pgTable("objectifs_epargne", {
  id: uuid("id").primaryKey().defaultRandom(),
  compteId: uuid("compte_id").notNull().references(() => comptesEpargne.id),
  nom: text("nom").notNull(),
  montantCible: numeric("montant_cible").notNull(),
  montantActuel: numeric("montant_actuel").notNull().default("0"),
  dateCible: timestamp("date_cible").notNull(),
  description: text("description"),
  statut: text("statut").notNull().default("En cours"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertObjectifEpargneSchema = createInsertSchema(objectifsEpargne).omit({ id: true, createdAt: true });
export type InsertObjectifEpargne = z.infer<typeof insertObjectifEpargneSchema>;
export type ObjectifEpargne = typeof objectifsEpargne.$inferSelect;

// Sessions caisse
export const sessionsCaisse = pgTable("sessions_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  caissierId: uuid("caissier_id").notNull().references(() => users.id),
  dateOuverture: timestamp("date_ouverture").defaultNow(),
  dateFermeture: timestamp("date_fermeture"),
  soldeInitial: numeric("solde_initial").notNull().default("0"),
  soldeTheorique: numeric("solde_theorique").notNull().default("0"),
  soldeReel: numeric("solde_reel"),
  ecart: numeric("ecart"),
  statut: text("statut").notNull().default("Ouverte"),
  observations: text("observations"),
  billetageOuverture: json("billetage_ouverture"),
  billetageFermeture: json("billetage_fermeture"),
  agenceId: uuid("agence_id").references(() => agences.id), // Agence de la session caisse
  caisseId: uuid("caisse_id").notNull().references(() => caisses.id), // Physical caisse link
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionCaisseSchema = createInsertSchema(sessionsCaisse).omit({ id: true, createdAt: true });
export type InsertSessionCaisse = z.infer<typeof insertSessionCaisseSchema>;
export type SessionCaisse = typeof sessionsCaisse.$inferSelect;

// Opérations caisse
export const operationsCaisse = pgTable("operations_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id),
  typeOperation: text("type_operation").notNull(),
  montant: numeric("montant").notNull(),
  modePaiement: text("mode_paiement").notNull().default("Espèces"),
  reference: text("reference").notNull(),
  description: text("description"),
  clientId: uuid("client_id").references(() => clients.id),
  compteId: uuid("compte_id"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOperationCaisseSchema = createInsertSchema(operationsCaisse).omit({ id: true, createdAt: true });
export type InsertOperationCaisse = z.infer<typeof insertOperationCaisseSchema>;
export type OperationCaisse = typeof operationsCaisse.$inferSelect;

// Caisse Transferts (Treasury)
export const caisseTransferts = pgTable("caisse_transferts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionSourceId: uuid("session_source_id").notNull().references(() => sessionsCaisse.id),
  sessionDestId: uuid("session_dest_id").references(() => sessionsCaisse.id), // Filled when received, or if targeted directly
  agenceSourceId: uuid("agence_source_id").notNull().references(() => agences.id),
  agenceDestId: uuid("agence_dest_id").notNull().references(() => agences.id),
  montant: numeric("montant").notNull(),
  statut: text("statut").notNull().default("en_attente"), // en_attente, valide, rejete, annule
  reference: text("reference").notNull().unique(),
  motif: text("motif"),
  observations: text("observations"),
  dateCreation: timestamp("date_creation").defaultNow(),
  dateValidation: timestamp("date_validation"),
  validatedBy: uuid("validated_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
});

export const insertCaisseTransfertSchema = createInsertSchema(caisseTransferts).omit({ id: true, dateCreation: true });
export type InsertCaisseTransfert = z.infer<typeof insertCaisseTransfertSchema>;
export type CaisseTransfert = typeof caisseTransferts.$inferSelect;

// End of finance tables
