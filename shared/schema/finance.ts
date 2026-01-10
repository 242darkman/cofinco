import { pgTable, text, uniqueIndex, integer, numeric, boolean, timestamp, uuid, json, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./clients";
import { users } from "./auth";
import { agences } from "./agences";
// import { caisses } from "./operations"; // Removed circular dependency
import { dureeUniteEnum, frequenceRemboursementEnum, methodePaiementEnum, statutDemandeEnum, typeRevenuEnum, typeCreditEnum, typeEvenementEnum, sourceModuleEnum, sensMouvementEnum, statutTransactionEnum, typeTauxInteretEnum, typeTransactionEpargneEnum, typeOperationCaisseEnum, statutTransfertCaisseEnum, typePaiementTerrainEnum, typeCompteEnum, statutCompteEnum, motifBlocageEnum, statutReevaluationEnum, typeElementNouveauEnum } from "@shared/enum/enums";

// Interest Rates
export const interestRates = pgTable(
  "interest_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nom: text("nom").notNull(),
    code: text("code").notNull(), // plus unique seul (versionné)
    tauxAnnuel: numeric("taux_annuel").notNull(),
    tauxMensuel: numeric("taux_mensuel"),
    type: typeTauxInteretEnum("type").notNull().default("credit"),

    validFrom: timestamp("valid_from").notNull().defaultNow(),
    validTo: timestamp("valid_to"),

    actif: boolean("actif").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    uqCodeFrom: uniqueIndex("uq_interest_rates_code_valid_from").on(t.code, t.validFrom),
    idxCode: index("idx_interest_rates_code").on(t.code),
    idxActif: index("idx_interest_rates_actif").on(t.actif),
    chkValidRange: sql`CONSTRAINT chk_interest_rates_valid_range CHECK (${t.validTo} IS NULL OR ${t.validTo} > ${t.validFrom})`,
  }),
);



export const insertInterestRateSchema = createInsertSchema(interestRates).omit({ id: true, createdAt: true });
export type InsertInterestRate = z.infer<typeof insertInterestRateSchema>;
export type InterestRate = typeof interestRates.$inferSelect;

// Credits table
export const creditPlans = pgTable("credit_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: text("nom").notNull(),
  description: text("description"),
  typeCredit: text("type_credit").notNull(), // Personnel, Immobilier, Commercial
  montantMin: numeric("montant_min"),
  montantMax: numeric("montant_max"),
  tauxInteret: numeric("taux_interet").notNull(), // Pourcentage
  dureeValeur: integer("duree_valeur").notNull(),
  dureeUnite: text("duree_unite").notNull(), // Jour, Semaine, Mois
  frequenceRemboursement: text("frequence_remboursement").notNull(), // Journalier, Hebdomadaire, Mensuel...
  fraisDossier: numeric("frais_dossier"), // Montant fixe ou pourcentage (à gérer logiquement)
  conditions: text("conditions").array(), // Liste de conditions requises
  documentsRequis: text("documents_requis").array(), // Documents nécessaires
  actif: boolean("actif").default(true),
  agenceId: text("agence_id"), // NULL = Global, sinon spécifique agence
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreditPlanSchema = createInsertSchema(creditPlans);
export type UserCreditPlan = typeof creditPlans.$inferSelect;
export type InsertCreditPlan = typeof creditPlans.$inferInsert;

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
    motifRejet: text("motif_rejet"),
    fraisEngagementPayes: boolean("frais_engagement_payes").default(false),
    montantFraisEngagement: numeric("montant_frais_engagement"),

    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
    
    // Reevaluation tracking
    dateRejet: timestamp("date_rejet"),
    nombreReevaluations: integer("nombre_reevaluations").notNull().default(0),
    derniereReevaluationId: uuid("derniere_reevaluation_id"), // Will reference reevaluationsCredit
    dateDerniereReevaluation: timestamp("date_derniere_reevaluation"),
    reevaluationEnCours: boolean("reevaluation_en_cours").notNull().default(false),
  },
  (t) => ({
    idxDemandesClient: index("idx_demandes_credit_client_id").on(t.clientId),
    idxDemandesStatut: index("idx_demandes_credit_statut").on(t.statut),
    idxDemandesCreatedAt: index("idx_demandes_credit_created_at").on(t.createdAt),
  }),
);

export const insertDemandeCreditSchema = createInsertSchema(demandesCredit).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertDemandeCredit = z.infer<typeof insertDemandeCreditSchema>;
export type DemandeCredit = typeof demandesCredit.$inferSelect;

// Enquêtes de crédit
export const enquetesCredit = pgTable("enquetes_credit", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  demandeId: uuid("demande_id").references(() => demandesCredit.id),
  montantDemande: numeric("montant_demande").notNull(),
  objetCredit: text("objet_credit").notNull(),

  // Activité professionnelle
  categorieActivite: text("categorie_activite"),
  typeActivite: text("type_activite"),
  ancienneteActivite: integer("anciennete_activite"),
  evaluationActivite: text("evaluation_activite"),

  // Revenus
  revenuMensuel: numeric("revenu_mensuel"),
  typeRevenu: typeRevenuEnum("type_revenu"),
  revenuJournalier: numeric("revenu_journalier"),
  joursTravailMois: integer("jours_travail_mois").default(26),

  // Charges et situation
  chargesMensuelles: numeric("charges_mensuelles"),
  autrePrets: numeric("autre_prets").default("0"),
  personnesCharge: integer("personnes_charge").default(0),
  typeHabitation: text("type_habitation"),

  // Données complémentaires (JSON)
  autresCredits: json("autres_credits"), // [{organisme, montant, echeance}]
  garantiesProposees: json("garanties_proposees"), // [{type, description, valeur}]
  photosActivite: text("photos_activite").array(), // URLs ou base64
  documentsJustificatifs: text("documents_justificatifs").array(),

  // Géolocalisation terrain
  geoLatitude: numeric("geo_latitude"),
  geoLongitude: numeric("geo_longitude"),
  geoAccuracy: numeric("geo_accuracy"),
  geoTimestamp: timestamp("geo_timestamp"),

  // Analyse
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
    creditId: uuid("credit_id").notNull().references(() => credits.id, { onDelete: "restrict" }),

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    montant: numeric("montant").notNull(),
    dateRemboursement: timestamp("date_remboursement").notNull(),

    methodePaiement: methodePaiementEnum("methode_paiement"),
    statut: statutTransactionEnum("statut").notNull().default("Posté"),

    numeroTransaction: text("numero_transaction"),
    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    recu: text("recu"),
    observations: text("observations"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    annulledAt: timestamp("annulled_at"),
    reversedAt: timestamp("reversed_at"),
  },
  (t) => ({
    idxCredit: index("idx_remboursements_credit_id").on(t.creditId),
    idxDate: index("idx_remboursements_date").on(t.dateRemboursement),
    idxMvt: index("idx_remboursements_mouvement").on(t.mouvementId),
    uqIdempotency: uniqueIndex("uq_remboursements_idempotency").on(t.idempotencyKey),
    uqRefExt: uniqueIndex("uq_remboursements_reference_externe").on(t.referenceExterne),
    chkMontantPos: sql`CONSTRAINT chk_remboursements_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export const insertRemboursementSchema = createInsertSchema(remboursements).omit({ id: true, createdAt: true });
export type InsertRemboursement = z.infer<typeof insertRemboursementSchema>;
export type Remboursement = typeof remboursements.$inferSelect;

// Durees suggerees
export const dureesSuggerees = pgTable(
  "durees_suggerees",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    frequence: frequenceRemboursementEnum("frequence").notNull(),
    dureeValeur: integer("duree_valeur").notNull(),
    dureeUnite: dureeUniteEnum("duree_unite").notNull(),

    // optionnel : segmentation évolutive
    typeCredit: text("type_credit"),
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    estRecommandee: boolean("est_recommandee").notNull().default(false),
    ordre: integer("ordre").notNull().default(0),
    actif: boolean("actif").notNull().default(true),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    uqTriplet: uniqueIndex("uq_durees_suggerees_triplet").on(
      t.frequence,
      t.dureeValeur,
      t.dureeUnite,
      t.typeCredit,
      t.agenceId,
    ),
    idxActif: index("idx_durees_suggerees_actif").on(t.actif),
    idxReco: index("idx_durees_suggerees_reco").on(t.estRecommandee, t.ordre),
    chkValeurPos: sql`CONSTRAINT chk_durees_suggerees_valeur_pos CHECK (${t.dureeValeur} > 0)`,
  }),
);

export const insertDureeSuggereeSchema = createInsertSchema(dureesSuggerees).omit({ id: true, createdAt: true });
export type InsertDureeSuggeree = z.infer<typeof insertDureeSuggereeSchema>;
export type DureeSuggeree = typeof dureesSuggerees.$inferSelect;



// =======================
// Mouvements financiers (Source de vérité)
// =======================
export const mouvementsFinanciers = pgTable(
  "mouvements_financiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    dateOperation: timestamp("date_operation").notNull().defaultNow(),
    montant: numeric("montant").notNull(),
    sens: sensMouvementEnum("sens").notNull(), // Débit / Crédit

    statut: statutTransactionEnum("statut").notNull().default("Posté"),
    methodePaiement: methodePaiementEnum("methode_paiement"),

    reference: text("reference").notNull(), // unique interne
    referenceExterne: text("reference_externe"), // Mobile Money / banque
    idempotencyKey: text("idempotency_key"),

    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),
    sessionCaisseId: uuid("session_caisse_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),

    // Liens métier (optionnels, remplis selon module)
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    compteId: uuid("compte_id").references(() => comptes.id, { onDelete: "set null" }),
    creditId: uuid("credit_id").references(() => credits.id, { onDelete: "set null" }),
    tontineId: uuid("tontine_id"), // référence optionnelle (si tu veux FK vers tontines.ts plus tard)
    agentId: uuid("agent_id"), // Référence agent terrain (sans FK stricte pour éviter cycle)

    typePaiement: typePaiementTerrainEnum("type_paiement"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    sourceModule: sourceModuleEnum("source_module").notNull().default("SYSTEME"),
    sourceTable: text("source_table"),
    sourceId: uuid("source_id"),
    metadata: json("metadata"),
  },
  (t) => ({
    uqReference: uniqueIndex("uq_mouvements_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_mouvements_idempotency").on(t.idempotencyKey),
    uqReferenceExterne: uniqueIndex("uq_mouvements_reference_externe").on(t.referenceExterne),

    idxCompteDate: index("idx_mouvements_compte_date").on(t.compteId, t.dateOperation),
    idxCreditDate: index("idx_mouvements_credit_date").on(t.creditId, t.dateOperation),
    idxSessionDate: index("idx_mouvements_session_date").on(t.sessionCaisseId, t.dateOperation),
    idxModuleDate: index("idx_mouvements_module_date").on(t.sourceModule, t.dateOperation),

    chkMontantPos: sql`CONSTRAINT chk_mouvements_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

// =======================
// Outbox temps réel fiable
// =======================
export const evenementsOutbox = pgTable(
  "evenements_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    type: typeEvenementEnum("type").notNull(),
    aggregateType: text("aggregate_type").notNull(), // "compte" | "credit" | "session_caisse" | ...
    aggregateId: uuid("aggregate_id").notNull(),

    payload: json("payload").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    publishedAt: timestamp("published_at"),
    tentative: integer("tentative").notNull().default(0),
    erreur: text("erreur"),
  },
  (t) => ({
    idxNonPublie: index("idx_outbox_non_publie").on(t.publishedAt, t.createdAt),
    idxAggregate: index("idx_outbox_aggregate").on(t.aggregateType, t.aggregateId),
  }),
);



// Comptes
export const comptes = pgTable(
  "comptes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    produitId: uuid("produit_id").references(() => produitsCompte.id, { onDelete: "set null" }),

    // Agence “courante” (pour accès rapide)
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    numeroCompte: text("numero_compte").notNull(),

    // Type comptable (règle “un seul par client”)
    typeCompte: typeCompteEnum("type_compte").notNull(),

    statut: statutCompteEnum("statut").notNull().default("Actif"),

    // Blocage (utile même pour un compte non-bloqué “temporairement gelé”)
    blocageActif: boolean("blocage_actif").notNull().default(false),
    blocageMotif: motifBlocageEnum("blocage_motif"),
    blocageReference: text("blocage_reference"), // ex: CREDIT:xxx / TONTINE:yyy / DECISION:...
    blocageDebut: timestamp("blocage_debut"),
    blocageFin: timestamp("blocage_fin"),

    // Cache solde (la vérité reste le ledger / mouvements)
    soldeCourant: numeric("solde_courant").notNull().default("0"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uqNumero: uniqueIndex("uq_comptes_numero_compte").on(t.numeroCompte),

    // CRITIQUE: Un client ne peut avoir qu'UN SEUL compte par type (toutes agences confondues)
    // Index unique partiel excluant les comptes supprimés (soft delete)
    uqClientTypeActif: sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_comptes_client_type_actif ON comptes (client_id, type_compte) WHERE deleted_at IS NULL`,

    idxClient: index("idx_comptes_client_id").on(t.clientId),
    idxAgenceTypeStatut: index("idx_comptes_agence_type_statut").on(t.agenceId, t.typeCompte, t.statut),
    idxTypeStatut: index("idx_comptes_type_statut").on(t.typeCompte, t.statut),

    chkSoldeNonNeg: sql`CONSTRAINT chk_comptes_solde_nonneg CHECK (${t.soldeCourant} >= 0)`,
    chkBlocageRange: sql`CONSTRAINT chk_comptes_blocage_range CHECK (${t.blocageFin} IS NULL OR ${t.blocageDebut} IS NULL OR ${t.blocageFin} > ${t.blocageDebut})`,
  }),
);

export const insertCompteSchema = createInsertSchema(comptes).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertCompte = z.infer<typeof insertCompteSchema>;
export type Compte = typeof comptes.$inferSelect;


export const produitsCompte = pgTable(
  "produits_compte",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    code: text("code").notNull(),     // ex: EPARGNE_CLASSIC
    nom: text("nom").notNull(),       // ex: Épargne Classic

    typeCompte: typeCompteEnum("type_compte").notNull(), // Épargne/Courant/Bloqué

    tauxInteret: numeric("taux_interet"), // optionnel
    frais: json("frais"),                 // optionnel (frais ouverture, tenue, etc.)
    regles: json("regles"),               // optionnel (plafonds, conditions, etc.)

    actif: boolean("actif").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uqCode: uniqueIndex("uq_produits_compte_code").on(t.code),
    idxTypeActif: index("idx_produits_compte_type_actif").on(t.typeCompte, t.actif),
  }),
);

export const insertProduitCompteSchema = createInsertSchema(produitsCompte).omit({ id: true, createdAt: true });
export type InsertProduitCompte = z.infer<typeof insertProduitCompteSchema>;
export type ProduitCompte = typeof produitsCompte.$inferSelect;


// Historique des agences
export const compteAgencesHistorique = pgTable(
  "compte_agences_historique",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    compteId: uuid("compte_id").notNull().references(() => comptes.id, { onDelete: "cascade" }),
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: "restrict" }),

    dateDebut: timestamp("date_debut").notNull().defaultNow(),
    dateFin: timestamp("date_fin"), // null = agence courante

    motif: text("motif"), // ex: "Transfert inter-agence"
    reference: text("reference"), // ex: TR-2026-00012

    transferePar: uuid("transfere_par").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCompte: index("idx_compte_agences_hist_compte").on(t.compteId, t.dateDebut),
    idxAgence: index("idx_compte_agences_hist_agence").on(t.agenceId, t.dateDebut),
    chkDateFin: sql`CONSTRAINT chk_compte_agences_hist_date_fin CHECK (${t.dateFin} IS NULL OR ${t.dateFin} > ${t.dateDebut})`,
  }),
);

export const insertCompteAgenceHistoriqueSchema = createInsertSchema(compteAgencesHistorique).omit({ id: true, createdAt: true });
export type InsertCompteAgenceHistorique = z.infer<typeof insertCompteAgenceHistoriqueSchema>;
export type CompteAgenceHistorique = typeof compteAgencesHistorique.$inferSelect;

// Transactions comptes
export const transactionsCompte = pgTable(
  "transactions_compte",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    compteId: uuid("compte_id")
      .notNull()
      .references(() => comptes.id, { onDelete: "restrict" }),

    // Pivot ledger (source de vérité)
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, {
      onDelete: "set null",
    }),

    // Unification : même enum partout (terrain/caisse/crédit/tontine/compte)
    typePaiement: typePaiementTerrainEnum("type_paiement").notNull(),

    statut: statutTransactionEnum("statut").notNull().default("Posté"),

    montant: numeric("montant").notNull(),

    // Cache UI (facultatif mais pratique)
    soldeApres: numeric("solde_apres"),

    methodePaiement: methodePaiementEnum("methode_paiement")
      .notNull()
      .default("Espèces"),

    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    annulledAt: timestamp("annulled_at"),
    reversedAt: timestamp("reversed_at"),
  },
  (t) => ({
    idxCompteDate: index("idx_transactions_compte_compte_date").on(
      t.compteId,
      t.createdAt,
    ),
    idxMvt: index("idx_transactions_compte_mouvement").on(t.mouvementId),

    uqIdempotency: uniqueIndex("uq_transactions_compte_idempotency").on(t.idempotencyKey),
    uqRefExt: uniqueIndex("uq_transactions_compte_reference_externe").on(t.referenceExterne),

    chkMontantPos: sql`CONSTRAINT chk_transactions_compte_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export const insertTransactionCompteSchema = createInsertSchema(transactionsCompte).omit({ id: true, createdAt: true });
export type InsertTransactionCompte = z.infer<typeof insertTransactionCompteSchema>;
export type TransactionCompte = typeof transactionsCompte.$inferSelect;

// Plans d'épargne liés aux crédits
export const plansEpargne = pgTable(
  "plans_epargne",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    creditId: uuid("credit_id").notNull().references(() => credits.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),

    compteId: uuid("compte_id").notNull().references(() => comptes.id, { onDelete: "restrict" }),

    montantMensuel: numeric("montant_mensuel").notNull(),
    duree: integer("duree").notNull(), // en mois ou selon ta règle
    montantTotal: numeric("montant_total").notNull(),

    dateDebut: timestamp("date_debut").notNull(),
    dateFin: timestamp("date_fin").notNull(),

    statut: text("statut").notNull().default("Actif"),
    observations: text("observations"),

    // Optionnel : pour uniformiser le “sens” des versements
    typePaiement: typePaiementTerrainEnum("type_paiement").default("Dépôt Épargne"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxClient: index("idx_plans_epargne_client").on(t.clientId),
    idxCredit: index("idx_plans_epargne_credit").on(t.creditId),
    idxCompte: index("idx_plans_epargne_compte").on(t.compteId),
  }),
);

export const insertPlanEpargneSchema = createInsertSchema(plansEpargne).omit({ id: true, createdAt: true });
export type InsertPlanEpargne = z.infer<typeof insertPlanEpargneSchema>;
export type PlanEpargne = typeof plansEpargne.$inferSelect;

// Objectifs d'épargne
export const objectifsEpargne = pgTable(
  "objectifs_epargne",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    compteId: uuid("compte_id").notNull().references(() => comptes.id, { onDelete: "restrict" }),

    nom: text("nom").notNull(),
    montantCible: numeric("montant_cible").notNull(),

    // cache facultatif (tu peux aussi recalculer depuis mouvements)
    montantActuel: numeric("montant_actuel").notNull().default("0"),

    dateCible: timestamp("date_cible").notNull(),
    description: text("description"),

    statut: text("statut").notNull().default("En cours"),
    actif: boolean("actif").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCompte: index("idx_objectifs_epargne_compte").on(t.compteId),
    idxActif: index("idx_objectifs_epargne_actif").on(t.actif),
  }),
);

export const insertObjectifEpargneSchema = createInsertSchema(objectifsEpargne).omit({ id: true, createdAt: true });
export type InsertObjectifEpargne = z.infer<typeof insertObjectifEpargneSchema>;
export type ObjectifEpargne = typeof objectifsEpargne.$inferSelect;

// Objectifs Mensuels (moved here? No, kept in operations)

// Caisses (Physical/Logical) - Moved from operations.ts
export const caisses = pgTable("caisses", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  agenceId: uuid("agence_id").notNull().references(() => agences.id),
  type: text("type").notNull().default("Physique"), // 'Physique', 'Coffre-Fort', 'Virtuelle'
  solde: numeric("solde").notNull().default("0"),
  statut: text("statut").notNull().default("Fermée"), // 'Ouverte', 'Fermée'
  // Optional: link to a specific device or location?
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertCaisseSchema = createInsertSchema(caisses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCaisse = z.infer<typeof insertCaisseSchema>;
export type Caisse = typeof caisses.$inferSelect;

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
export const operationsCaisse = pgTable(
  "operations_caisse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "restrict" }),

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    typeOperation: typeOperationCaisseEnum("type_operation").notNull(),
    statut: statutTransactionEnum("statut").notNull().default("Posté"),

    montant: numeric("montant").notNull(), // garde pour compat
    methodePaiement: methodePaiementEnum("methode_paiement").notNull().default("Espèces"),

    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),

    description: text("description"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),

    // Traçabilité de la vérification de présence du titulaire (pour retraits sans OTP)
    presenceVerification: jsonb("presence_verification"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    annulledAt: timestamp("annulled_at"),
    reversedAt: timestamp("reversed_at"),
  },
  (t) => ({
    idxSessionDate: index("idx_operations_caisse_session_date").on(t.sessionId, t.createdAt),
    idxSessionType: index("idx_operations_caisse_session_type").on(t.sessionId, t.typeOperation),
    idxMvt: index("idx_operations_caisse_mouvement").on(t.mouvementId),
    uqReference: uniqueIndex("uq_operations_caisse_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_operations_caisse_idempotency").on(t.idempotencyKey),
    chkMontantPos: sql`CONSTRAINT chk_operations_caisse_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export const insertOperationCaisseSchema = createInsertSchema(operationsCaisse).omit({ id: true, createdAt: true });
export type InsertOperationCaisse = z.infer<typeof insertOperationCaisseSchema>;
export type OperationCaisse = typeof operationsCaisse.$inferSelect;

// Caisse Transferts (Treasury)
export const caisseTransferts = pgTable(
  "caisse_transferts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    sessionSourceId: uuid("session_source_id").notNull().references(() => sessionsCaisse.id, { onDelete: "restrict" }),
    sessionDestId: uuid("session_dest_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),

    agenceSourceId: uuid("agence_source_id").notNull().references(() => agences.id, { onDelete: "restrict" }),
    agenceDestId: uuid("agence_dest_id").notNull().references(() => agences.id, { onDelete: "restrict" }),

    montant: numeric("montant").notNull(),
    statut: statutTransfertCaisseEnum("statut").notNull().default("En attente"),

    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),

    // 2 mouvements = sortie/entrée
    mouvementSortieId: uuid("mouvement_sortie_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    mouvementEntreeId: uuid("mouvement_entree_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    motif: text("motif"),
    observations: text("observations"),

    dateCreation: timestamp("date_creation").notNull().defaultNow(),
    dateValidation: timestamp("date_validation"),
    dateReception: timestamp("date_reception"),

    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    uqRef: uniqueIndex("uq_caisse_transferts_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_caisse_transferts_idempotency").on(t.idempotencyKey),

    idxSourceDate: index("idx_caisse_transferts_source_date").on(t.sessionSourceId, t.dateCreation),
    idxDestDate: index("idx_caisse_transferts_dest_date").on(t.sessionDestId, t.dateCreation),
    idxStatutDate: index("idx_caisse_transferts_statut_date").on(t.statut, t.dateCreation),

    chkMontantPos: sql`CONSTRAINT chk_caisse_transferts_montant_pos CHECK (${t.montant} > 0)`,
    chkAgencesDiff: sql`CONSTRAINT chk_caisse_transferts_agences_diff CHECK (${t.agenceSourceId} <> ${t.agenceDestId})`,
  }),
);

export const insertCaisseTransfertSchema = createInsertSchema(caisseTransferts).omit({ id: true, dateCreation: true });
export type InsertCaisseTransfert = z.infer<typeof insertCaisseTransfertSchema>;
export type CaisseTransfert = typeof caisseTransferts.$inferSelect;

// ========== REEVALUATION WORKFLOW TABLES ==========

// Configuration for reevaluation rules
export const configReevaluation = pgTable("config_reevaluation", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Eligibility rules
  delaiMinimumJours: integer("delai_minimum_jours").notNull().default(30),
  maxReevaluationsParDemande: integer("max_reevaluations_par_demande").notNull().default(2),
  motifsNonReevaluables: text("motifs_non_reevaluables").array(), // ['Fraude avérée', 'Client blacklisté']
  
  // Documentary requirements
  elementsNouveauxObligatoires: boolean("elements_nouveaux_obligatoires").notNull().default(true),
  enqueteComplementaireObligatoire: boolean("enquete_complementaire_obligatoire").notNull().default(false),
  documentsMinimum: integer("documents_minimum").notNull().default(1),
  
  // Scoring thresholds
  seuilScoreMinimum: integer("seuil_score_minimum").default(40),
  deltaScoreMinimum: integer("delta_score_minimum").default(5), // Minimum improvement required
  
  // Amount limits
  reductionMontantMaxPourcentage: integer("reduction_montant_max_pourcentage").default(50),
  
  // Validity
  actif: boolean("actif").notNull().default(true),
  agenceId: uuid("agence_id").references(() => agences.id), // NULL = global
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConfigReevaluationSchema = createInsertSchema(configReevaluation).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConfigReevaluation = z.infer<typeof insertConfigReevaluationSchema>;
export type ConfigReevaluation = typeof configReevaluation.$inferSelect;

// Main reevaluation records
export const reevaluationsCredit = pgTable(
  "reevaluations_credit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Original demande reference (IMMUTABLE after creation)
    demandeId: uuid("demande_id").notNull().references(() => demandesCredit.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    
    // Version number (1st reevaluation = 1, 2nd = 2, etc.)
    numeroVersion: integer("numero_version").notNull().default(1),
    numeroReevaluation: text("numero_reevaluation").notNull().unique(), // REEV-2026-0001
    
    // Snapshot of initial rejection (IMMUTABLE - copy for audit)
    motifRejetInitial: text("motif_rejet_initial").notNull(),
    dateRejetInitial: timestamp("date_rejet_initial").notNull(),
    scoreRejetInitial: integer("score_rejet_initial"),
    montantInitialDemande: numeric("montant_initial_demande").notNull(),
    
    // New elements proposed
    elementsNouveaux: json("elements_nouveaux").notNull(), // Array<{type, description, valeurAjoutee, documents}>
    justification: text("justification").notNull(),
    
    // Requested adjustments
    nouveauMontantDemande: numeric("nouveau_montant_demande"),
    nouvelleDureeValeur: integer("nouvelle_duree_valeur"),
    nouvelleDureeUnite: dureeUniteEnum("nouvelle_duree_unite"),
    nouvelleFrequence: frequenceRemboursementEnum("nouvelle_frequence"),
    
    // Additional guarantees
    garantiesAdditionnelles: json("garanties_additionnelles"), // [{type, description, valeur, documents}]
    
    // Co-borrower (if applicable)
    coEmprunteurId: uuid("co_emprunteur_id").references(() => clients.id),
    coEmprunteurDetails: json("co_emprunteur_details"), // {nom, relation, revenus, consentement}
    
    // Attached documents
    documentsJoints: text("documents_joints").array(),
    
    // State and workflow
    statut: statutReevaluationEnum("statut").notNull().default("Demandée"),
    
    // Eligibility
    eligibiliteValidee: boolean("eligibilite_validee"),
    motifRefusEligibilite: text("motif_refus_eligibilite"),
    dateValidationEligibilite: timestamp("date_validation_eligibilite"),
    validePar: uuid("valide_par").references(() => users.id),
    
    // Complementary inquiry (external reference)
    enqueteComplementaireId: uuid("enquete_complementaire_id"),
    
    // Post-reevaluation scoring
    nouveauScore: integer("nouveau_score"),
    deltaScore: integer("delta_score"), // new - old
    detailsScoring: json("details_scoring"), // Breakdown of new score
    
    // Committee decision
    decisionComite: text("decision_comite"), // 'Approuvée', 'Rejetée définitivement', 'Montant réduit'
    montantApprouveComite: numeric("montant_approuve_comite"),
    dureeApprouveeComite: integer("duree_approuvee_comite"),
    conditionsSpeciales: text("conditions_speciales"),
    commentaireComite: text("commentaire_comite"),
    dateDecisionComite: timestamp("date_decision_comite"),
    decidePar: uuid("decide_par").references(() => users.id),
    membresComite: uuid("membres_comite").array(), // List of present members
    
    // Metadata
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    
    // Locking (after final decision, no longer modifiable)
    verrouille: boolean("verrouille").notNull().default(false),
    dateVerrouillage: timestamp("date_verrouillage"),
  },
  (t) => ({
    idxDemandeId: index("idx_reevaluations_demande_id").on(t.demandeId),
    idxClientId: index("idx_reevaluations_client_id").on(t.clientId),
    idxStatut: index("idx_reevaluations_statut").on(t.statut),
    idxCreatedAt: index("idx_reevaluations_created_at").on(t.createdAt),
    // Constraint: only one active reevaluation per demande version
    uqDemandeVersion: uniqueIndex("uq_reevaluation_demande_version").on(t.demandeId, t.numeroVersion),
  }),
);

export const insertReevaluationCreditSchema = createInsertSchema(reevaluationsCredit).omit({ 
  id: true, createdAt: true, updatedAt: true, verrouille: true, dateVerrouillage: true 
});
export type InsertReevaluationCredit = z.infer<typeof insertReevaluationCreditSchema>;
export type ReevaluationCredit = typeof reevaluationsCredit.$inferSelect;

// Complementary inquiries for reevaluations
export const enquetesComplementaires = pgTable(
  "enquetes_complementaires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Links
    reevaluationId: uuid("reevaluation_id").notNull().references(() => reevaluationsCredit.id),
    demandeId: uuid("demande_id").notNull().references(() => demandesCredit.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    enqueteInitialeId: uuid("enquete_initiale_id").references(() => enquetesCredit.id),
    
    // Unique number
    numeroEnquete: text("numero_enquete").notNull().unique(), // ENQC-2026-0001
    
    // Inquiry objective
    objectifEnquete: text("objectif_enquete").notNull(), // What to verify
    pointsAVerifier: text("points_a_verifier").array(), // List of specific points
    
    // Verifications performed (similar to normal inquiry but targeted)
    verificationsEffectuees: json("verifications_effectuees"), // [{point, resultat, preuve, commentaire}]
    
    // Current situation (delta since last inquiry)
    situationActuelle: json("situation_actuelle"), /* {
      revenuActuel, revenuPrecedent, deltaRevenu,
      chargesActuelles, chargesPrecedentes, deltaCharges,
      nouveauxCredits, creditsSoldes,
      changementSituation
    } */
    
    // Verified guarantees
    garantiesVerifiees: json("garanties_verifiees"), // [{type, existe, valeurEstimee, preuve}]
    
    // Verified co-borrower
    coEmprunteurVerifie: json("co_emprunteur_verifie"), // {identiteConfirmee, revenusVerifies, consentementObtenu}
    
    // Photos and documents
    photosEnquete: text("photos_enquete").array(),
    documentsCollectes: text("documents_collectes").array(),
    
    // Geolocation
    geoLatitude: numeric("geo_latitude"),
    geoLongitude: numeric("geo_longitude"),
    geoAccuracy: numeric("geo_accuracy"),
    geoTimestamp: timestamp("geo_timestamp"),
    
    // Analysis and scoring
    scoreComplementaire: integer("score_complementaire"),
    recommandationEnqueteur: text("recommandation_enqueteur"), // Favorable, Défavorable, Réservé
    observationsEnqueteur: text("observations_enqueteur"),
    risquesIdentifies: text("risques_identifies").array(),
    
    // Status
    statut: text("statut").notNull().default("En cours"), // En cours, Terminée, Annulée
    
    // Field agent
    enqueteurId: uuid("enqueteur_id").notNull().references(() => users.id),
    dateDebut: timestamp("date_debut").defaultNow(),
    dateFin: timestamp("date_fin"),
    
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    idxReevaluationId: index("idx_enquetes_comp_reevaluation_id").on(t.reevaluationId),
    idxEnqueteurId: index("idx_enquetes_comp_enqueteur_id").on(t.enqueteurId),
    idxStatut: index("idx_enquetes_comp_statut").on(t.statut),
  }),
);

export const insertEnqueteComplementaireSchema = createInsertSchema(enquetesComplementaires).omit({ 
  id: true, createdAt: true, updatedAt: true 
});
export type InsertEnqueteComplementaire = z.infer<typeof insertEnqueteComplementaireSchema>;
export type EnqueteComplementaire = typeof enquetesComplementaires.$inferSelect;

// Scoring history tracking
export const scoringHistory = pgTable(
  "scoring_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // References
    demandeId: uuid("demande_id").notNull().references(() => demandesCredit.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    reevaluationId: uuid("reevaluation_id").references(() => reevaluationsCredit.id), // NULL if initial score
    enqueteId: uuid("enquete_id").references(() => enquetesCredit.id),
    enqueteComplementaireId: uuid("enquete_complementaire_id").references(() => enquetesComplementaires.id),
    
    // Score type
    typeScore: text("type_score").notNull(), // 'Préliminaire', 'Post-enquête', 'Post-réévaluation'
    numeroVersion: integer("numero_version").notNull().default(1),
    
    // Detailed scores
    scoreTotal: integer("score_total").notNull(),
    
    // Breakdown by category
    scoreCapaciteRemboursement: integer("score_capacite_remboursement"),
    scoreStabiliteRevenus: integer("score_stabilite_revenus"),
    scoreAncienneteActivite: integer("score_anciennete_activite"),
    scoreHistoriqueCredit: integer("score_historique_credit"),
    scoreGaranties: integer("score_garanties"),
    scoreChargesEndettement: integer("score_charges_endettement"),
    
    // Data used for calculation (snapshot)
    donneesCalcul: json("donnees_calcul").notNull(), /* {
      revenuMensuel, charges, autresPrets, capacite,
      anciennete, garantiesValeur, ratioEndettement
    } */
    
    // Delta compared to previous score
    scorePrecedent: integer("score_precedent"),
    deltaScore: integer("delta_score"),
    facteursDelta: json("facteurs_delta"), // [{facteur, impact, explication}]
    
    // Thresholds and recommendation
    seuilApprobation: integer("seuil_approbation").default(60),
    recommandationAuto: text("recommandation_auto"), // Based on score
    
    // Metadata
    calculeParSysteme: boolean("calcule_par_systeme").notNull().default(true),
    calculePar: uuid("calcule_par").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    idxDemandeId: index("idx_scoring_history_demande_id").on(t.demandeId),
    idxReevaluationId: index("idx_scoring_history_reevaluation_id").on(t.reevaluationId),
    idxCreatedAt: index("idx_scoring_history_created_at").on(t.createdAt),
    uqDemandeTypeVersion: uniqueIndex("uq_scoring_demande_type_version").on(t.demandeId, t.typeScore, t.numeroVersion),
  }),
);

export const insertScoringHistorySchema = createInsertSchema(scoringHistory).omit({ id: true, createdAt: true });
export type InsertScoringHistory = z.infer<typeof insertScoringHistorySchema>;
export type ScoringHistory = typeof scoringHistory.$inferSelect;

// Reevaluation audit logs (immutable)
export const reevaluationAuditLogs = pgTable(
  "reevaluation_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // References
    reevaluationId: uuid("reevaluation_id").notNull().references(() => reevaluationsCredit.id),
    demandeId: uuid("demande_id").notNull().references(() => demandesCredit.id),
    
    // Action
    action: text("action").notNull(), /* 
      'REEVALUATION_CREEE', 'ELIGIBILITE_VERIFIEE', 'ELIGIBILITE_REFUSEE',
      'ENQUETE_COMPLEMENTAIRE_DEMARREE', 'ENQUETE_COMPLEMENTAIRE_TERMINEE',
      'SOUMIS_COMITE', 'DECISION_COMITE', 'APPROUVEE', 'REJETEE_DEFINITIVEMENT',
      'DOCUMENT_AJOUTE', 'SCORING_CALCULE', 'ANNULEE'
    */
    
    // State before/after
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres"),
    
    // Action details
    details: json("details").notNull(), /* {
      description, champModifies, valeurAvant, valeurApres, 
      motif, commentaire, documentsAffectes
    } */
    
    // Actor
    userId: uuid("user_id").notNull().references(() => users.id),
    roleUtilisateur: text("role_utilisateur"),
    
    // Context
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    
    // Immutable timestamp
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxReevaluationId: index("idx_reeval_audit_reevaluation_id").on(t.reevaluationId),
    idxDemandeId: index("idx_reeval_audit_demande_id").on(t.demandeId),
    idxAction: index("idx_reeval_audit_action").on(t.action),
    idxTimestamp: index("idx_reeval_audit_timestamp").on(t.timestamp),
  }),
);

export const insertReevaluationAuditLogSchema = createInsertSchema(reevaluationAuditLogs).omit({ id: true, timestamp: true });
export type InsertReevaluationAuditLog = z.infer<typeof insertReevaluationAuditLogSchema>;
export type ReevaluationAuditLog = typeof reevaluationAuditLogs.$inferSelect;

// End of finance tables
