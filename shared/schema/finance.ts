import { pgTable, text, uniqueIndex, integer, numeric, boolean, timestamp, uuid, json, jsonb, index, date, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./clients";
import { users } from "./auth";
import { agences } from "./agences";
// import { caisses } from "./operations"; // Removed circular dependency
import { dureeUniteEnum, frequenceRemboursementEnum, methodePaiementEnum, statutDemandeEnum, typeRevenuEnum, typeCreditEnum, typeEvenementEnum, sourceModuleEnum, sensMouvementEnum, statutTransactionEnum, typeTauxInteretEnum, typeTransactionEpargneEnum, typeOperationCaisseEnum, statutTransfertCaisseEnum, typePaiementTerrainEnum, typeCompteEnum, statutCompteEnum, motifBlocageEnum, statutReevaluationEnum, typeElementNouveauEnum, statutCreditEnum, statutCaisseMainEnum, statutSessionCaisseEnum, statutEnqueteCreditEnum, statutPlanEpargneEnum, statutObjectifEpargneEnum, statutVersementAutoEnum, statutDecaissementProgEnum, frequenceVirementEnum, statutAuditVirementEnum, statutRunVirementEnum, statutEnqueteComplementaireEnum, statutRefundRequestEnum, disbursementChannelEnum, disbursementStatusEnum, statutEcheanceCreditEnum, agentRecommendationEnum, riskLevelEnum, suspensionReasonEnum, closureRequestStatusEnum, closurePayoutStatusEnum, closurePayoutMethodEnum, openingRequestStatusEnum, caisseRequestCategoryEnum, caisseRequestStatusEnum } from "@shared/enum/enums";
import { factures } from "./operations";
import { coffresForts } from "./coffres-forts";

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

export const credits = pgTable(
  "credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numeroCredit: text("numero_credit").notNull().unique(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    demandeId: uuid("demande_id").references(() => demandesCredit.id), // Added for linking back to application (fees, etc)
    enqueteId: uuid("enquete_id").references(() => enquetesCredit.id, { onDelete: "set null" }),
    montant: numeric("montant").notNull(),
    taux: numeric("taux").notNull(),
    duree: integer("duree").notNull(),
    typeCredit: text("type_credit").notNull(),
    objetCredit: text("objet_credit"),
    statut: statutCreditEnum("statut").notNull().default("PENDING"),
    dateDebut: timestamp("date_debut"),
    dateFin: timestamp("date_fin"),
    dateSolvabilite: timestamp("date_solvabilite"),
    dateSolde: timestamp("date_solde"),
    soldeAvant2Mois: boolean("solde_avant_2_mois").default(false),
    soldeRestant: numeric("solde_restant"),
    echeance: text("echeance").default("DAILY"),

    // Suivi des échéances
    montantEcheance: numeric("montant_echeance"), // Montant à payer par période
    prochaineEcheance: timestamp("prochaine_echeance"), // Date prochaine échéance

    garanties: text("garanties"),
    observations: text("observations"),
    agenceId: uuid("agence_id").references(() => agences.id), // Agence du crédit

    // Décaissement programmé
    dateDecaissementProgramme: timestamp("date_decaissement_programme"),
    decaissementAutomatique: boolean("decaissement_automatique").notNull().default(false),
    dateDecaissementEffectif: timestamp("date_decaissement_effectif"),
    decaissementTentatives: integer("decaissement_tentatives").notNull().default(0),
    decaissementErreur: text("decaissement_erreur"),

    // Remboursement Automatique
    remboursementAutomatique: boolean("remboursement_automatique").notNull().default(false),
    remboursementCompteId: uuid("remboursement_compte_id").references(() => comptes.id), // Optionnel: Compte épargne ou autre, sinon compte courant
    lastAutoRepaymentCheck: timestamp("last_auto_repayment_check"),

    // Canal de décaissement (Multi-Canal)
    disbursementChannel: disbursementChannelEnum("disbursement_channel").default("ACCOUNT"),
    disbursementStatus: disbursementStatusEnum("disbursement_status"),
    targetCaisseId: uuid("target_caisse_id").references(() => caisses.id, { onDelete: "set null" }), // Caisse cible pour décaissement CASH
    paymentReference: text("payment_reference"), // N° reçu caisse ou ID transaction MoMo
    disbursedAt: timestamp("disbursed_at"), // Date effective du décaissement physique
    disbursedBy: uuid("disbursed_by").references(() => users.id), // Caissier qui a effectué le décaissement

    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
    version: integer("version").notNull().default(1),
  },
  (t) => ({
    // Index pour recherche par client
    idxClient: index("idx_credits_client_id").on(t.clientId),
    // Index pour recherche par statut (très fréquent)
    idxStatut: index("idx_credits_statut").on(t.statut),
    // Index composite client + statut
    idxClientStatut: index("idx_credits_client_statut").on(t.clientId, t.statut),
    // Index pour l'agence
    idxAgence: index("idx_credits_agence_id").on(t.agenceId),
    // Index composite agence + statut
    idxAgenceStatut: index("idx_credits_agence_statut").on(t.agenceId, t.statut),
    // Index pour les échéances (automatisation remboursements)
    idxProchaineEcheance: index("idx_credits_prochaine_echeance").on(t.prochaineEcheance),
    // Index pour les décaissements programmés
    idxDecaissementProgramme: index("idx_credits_decaissement_programme").on(t.dateDecaissementProgramme, t.decaissementAutomatique),
    // Index pour les remboursements automatiques
    idxRemboursementAuto: index("idx_credits_remboursement_auto").on(t.remboursementAutomatique),
    // Index pour soft delete
    idxDeletedAt: index("idx_credits_deleted_at").on(t.deletedAt),
    // Index pour les décaissements en attente (workflow caisse)
    idxDisbursementPending: index("idx_credits_disbursement_pending").on(t.disbursementChannel, t.disbursementStatus),
  }),
);

export const insertCreditSchema = createInsertSchema(credits).omit({ createdAt: true, updatedAt: true, deletedAt: true });
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof credits.$inferSelect;

// Echéances de crédit
export const echeancesCredits = pgTable("echeances_credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditId: uuid("credit_id").notNull().references(() => credits.id),
  numeroEcheance: integer("numero_echeance").notNull(),
  dateEcheance: timestamp("date_echeance").notNull(),
  
  montantCapital: numeric("montant_capital").notNull(),
  montantInteret: numeric("montant_interet").notNull(),
  montantTotal: numeric("montant_total").notNull(),
  
  montantPaye: numeric("montant_paye").default('0'),
  
  statut: statutEcheanceCreditEnum("statut").notNull().default('UPCOMING'),
  
  datePaiement: timestamp("date_paiement"),
  
  // Nouveaux champs pour allocations partielles/FIFO
  sequence: integer("sequence"),
  paidAt: timestamp("paid_at"),
  lateMarkedAt: timestamp("late_marked_at"),
  lastPaymentDate: timestamp("last_payment_date"),
  montantCapitalPaye: numeric("montant_capital_paye").default('0'),
  montantInteretPaye: numeric("montant_interet_paye").default('0'),
  penaliteMontant: numeric("penalite_montant").default('0'),
  penalitePayee: numeric("penalite_payee").default('0'),
  accrualPosted: boolean("accrual_posted").default(false),

  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxCredit: index("idx_echeances_credits_credit_id").on(t.creditId),
  idxDate: index("idx_echeances_credits_date").on(t.dateEcheance),
  idxStatut: index("idx_echeances_credits_statut").on(t.statut),

  // New FIFO and Status indexes
  idxFifo: index("idx_echeances_credits_fifo").on(t.creditId, t.dateEcheance, t.sequence),
  idxStatutDate: index("idx_echeances_credits_statut_date").on(t.statut, t.dateEcheance).where(sql`statut != 'PAID'`),
}));

export const insertEcheanceCreditSchema = createInsertSchema(echeancesCredits).omit({ id: true, createdAt: true });
export type InsertEcheanceCredit = z.infer<typeof insertEcheanceCreditSchema>;
export type EcheanceCredit = typeof echeancesCredits.$inferSelect;

// Demandes de crédit
export const demandesCredit = pgTable(
  "demandes_credit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numeroDemande: text("numero_demande").notNull().unique(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    agenceId: uuid("agence_id").notNull().references(() => agences.id), // Added missing agenceId reference

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
    updatedAt: timestamp("updated_at").defaultNow(),
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

export const insertDemandeCreditSchema = createInsertSchema(demandesCredit).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertDemandeCredit = z.infer<typeof insertDemandeCreditSchema>;
export type DemandeCredit = typeof demandesCredit.$inferSelect;

// Enquêtes de crédit
export const enquetesCredit = pgTable("enquetes_credit", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  demandeId: uuid("demande_id").references(() => demandesCredit.id),
  montantDemande: numeric("montant_demande").notNull(),
  objetCredit: text("objet_credit").notNull(),
  
  // === ASSIGNATION À L'AGENT ===
  assignedAgentId: uuid("assigned_agent_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  assignedBy: uuid("assigned_by").references(() => users.id),
  dueDate: timestamp("due_date"),
  priority: text("priority").default("MEDIUM"), // LOW, MEDIUM, HIGH, URGENT

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
  statut: statutEnqueteCreditEnum("statut").notNull().default("PENDING_ASSIGNMENT"),
  observations: text("observations"),
  
  // === RECOMMANDATION AGENT ===
  agentRecommendation: agentRecommendationEnum("agent_recommendation"),
  recommendedAmount: numeric("recommended_amount"),
  riskLevel: riskLevelEnum("risk_level"),
  riskFactors: text("risk_factors").array(),
  
  // === WORKFLOW TIMESTAMPS ===
  startedAt: timestamp("started_at"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  
  // === SUPERVISION ===
  supervisorNotes: text("supervisor_notes"),
  requiresAdditionalInvestigation: boolean("requires_additional_investigation").default(false),
  additionalInvestigationReason: text("additional_investigation_reason"),
  
  // === OFFLINE SYNC ===
  offlineCreated: boolean("offline_created").default(false),
  offlineSyncedAt: timestamp("offline_synced_at"),
  deviceId: text("device_id"),

  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  // Index pour recherche par agent assigné
  idxAssignedAgent: index("idx_enquete_assigned_agent").on(t.assignedAgentId),
  // Index composite agent + statut (pour dashboard agent)
  idxAgentStatut: index("idx_enquete_agent_statut").on(t.assignedAgentId, t.statut),
  // Index pour les enquêtes non assignées
  idxPendingAssignment: index("idx_enquete_pending_assignment").on(t.statut, t.assignedAgentId),
  // Index pour le superviseur
  idxReviewedBy: index("idx_enquete_reviewed_by").on(t.reviewedBy),
  // Index pour soft delete
  idxDeletedAt: index("idx_enquete_deleted_at").on(t.deletedAt),
  // Index pour sync offline
  idxOfflineSync: index("idx_enquete_offline_sync").on(t.offlineCreated, t.offlineSyncedAt),
}));

export const insertEnqueteCreditSchema = createInsertSchema(enquetesCredit).omit({ id: true, createdAt: true }).extend({
  geoLatitude: z.coerce.string().optional().nullable(),
  geoLongitude: z.coerce.string().optional().nullable(),
  geoAccuracy: z.coerce.string().optional().nullable(),
  geoTimestamp: z.coerce.date().optional().nullable(),
});
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
    
    // Reference to generated invoice/receipt
    factureId: uuid("facture_id").references(() => factures.id, { onDelete: "set null" }),

    montant: numeric("montant").notNull(),
    dateRemboursement: timestamp("date_remboursement").notNull(),

    methodePaiement: methodePaiementEnum("methode_paiement"),
    statut: statutTransactionEnum("statut").notNull().default("POSTED"),

    numeroTransaction: text("numero_transaction"),
    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    recu: text("recu"),
    observations: text("observations"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    annulledAt: timestamp("annulled_at"),
    reversedAt: timestamp("reversed_at"),

    // Allocation tracking
    overpaymentAmount: numeric("overpayment_amount").default('0'),
    allocationStrategy: text("allocation_strategy").default('FIFO'),
    
    // Reversal tracking (enhanced)
    isReversed: boolean("is_reversed").default(false),
    reversedBy: uuid("reversed_by").references(() => users.id), // Overrides generic reversedByUserId if exists or specific to reimbursement logic
    reversalReason: text("reversal_reason"),

    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
    version: integer("version").notNull().default(1),
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

export const insertRemboursementSchema = createInsertSchema(remboursements).omit({ id: true, createdAt: true, updatedAt: true });
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

    statut: statutTransactionEnum("statut").notNull().default("POSTED"),
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

    // GL Posting tracking (PR-0)
    requiresGlPosting: boolean("requires_gl_posting").notNull().default(true),
    glPostingStatus: text("gl_posting_status").notNull().default("PENDING"), // PENDING | POSTED | FAILED | SKIPPED
    glPostingError: text("gl_posting_error"),

    // Reversal tracking
    reversalOfId: uuid("reversal_of_id"), // Points to original movement being reversed
    reversalReason: text("reversal_reason"),
  },
  (t) => ({
    uqReference: uniqueIndex("uq_mouvements_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_mouvements_idempotency").on(t.idempotencyKey),
    uqReferenceExterne: uniqueIndex("uq_mouvements_reference_externe").on(t.referenceExterne),

    idxCompteDate: index("idx_mouvements_compte_date").on(t.compteId, t.dateOperation),
    idxCreditDate: index("idx_mouvements_credit_date").on(t.creditId, t.dateOperation),
    idxSessionDate: index("idx_mouvements_session_date").on(t.sessionCaisseId, t.dateOperation),
    idxModuleDate: index("idx_mouvements_module_date").on(t.sourceModule, t.dateOperation),
    idxAgenceCreated: index("idx_mouvements_agence_created").on(t.agenceId, t.createdAt),
    idxAgenceModuleRef: index("idx_mouvements_agence_module_ref").on(t.agenceId, t.sourceModule, t.reference),
    idxGlStatus: index("idx_mouvements_gl_status").on(t.glPostingStatus),
    idxReversalOf: index("idx_mouvements_reversal_of").on(t.reversalOfId),

    chkMontantPos: sql`CONSTRAINT chk_mouvements_montant_pos CHECK (${t.montant} > 0)`,
  }),
);

export type MouvementFinancier = typeof mouvementsFinanciers.$inferSelect;
export type InsertMouvementFinancier = typeof mouvementsFinanciers.$inferInsert;


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

    statut: statutCompteEnum("statut").notNull().default("ACTIVE"),

    // Snapshot immuable de la config produit à l'ouverture
    openingSnapshot: jsonb("opening_snapshot"),

    // Cumuls des paiements d'ouverture
    paidOpeningFee: numeric("paid_opening_fee").notNull().default("0"),
    paidInitialDeposit: numeric("paid_initial_deposit").notNull().default("0"),

    // Validation maker-checker ouverture
    isApproved: boolean("is_approved").notNull().default(false),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),

    // Blocage (utile même pour un compte non-bloqué "temporairement gelé")
    blocageActif: boolean("blocage_actif").notNull().default(false),
    blocageMotif: motifBlocageEnum("blocage_motif"),
    blocageReference: text("blocage_reference"), // ex: CREDIT:xxx / TONTINE:yyy / DECISION:...
    blocageDebut: timestamp("blocage_debut"),
    blocageFin: timestamp("blocage_fin"),

    // Suspension (lifecycle - distinct du blocage financier)
    suspendedAt: timestamp("suspended_at"),
    suspendedBy: uuid("suspended_by").references(() => users.id, { onDelete: "set null" }),
    suspendedReasonCode: suspensionReasonEnum("suspended_reason_code"),
    suspendedReasonText: text("suspended_reason_text"),
    autoLift: boolean("auto_lift").notNull().default(false),
    suspendedEndDate: timestamp("suspended_end_date"),
    suspendedReviewRequired: boolean("suspended_review_required").notNull().default(false),

    // Cache solde (la vérité reste le ledger / mouvements)
    soldeCourant: numeric("solde_courant").notNull().default("0"),

    // Versements automatiques
    versementAutoActif: boolean("versement_auto_actif").notNull().default(false),
    versementAutoMontant: numeric("versement_auto_montant"),
    versementAutoFrequence: frequenceRemboursementEnum("versement_auto_frequence"),
    versementAutoJour: integer("versement_auto_jour"), // 1-28 pour mensuel, 1-7 pour hebdo
    compteSourceId: uuid("compte_source_id"), // Self-reference, will be linked after table creation
    dernierVersementAuto: timestamp("dernier_versement_auto"),
    prochainVersementAuto: timestamp("prochain_versement_auto"),

    // Intérêts
    accruedInterest: numeric("accrued_interest").notNull().default("0"),
    dateDerniereCapitalisation: timestamp("date_derniere_capitalisation"),

    // Frais de tenue de compte
    dateDerniereFraisTenue: timestamp("date_derniere_frais_tenue"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    version: integer("version").notNull().default(1),

    // Clôture
    closedAt: timestamp("closed_at"),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    uqNumero: uniqueIndex("uq_comptes_numero_compte").on(t.numeroCompte),

    // CRITIQUE: Un client ne peut avoir qu'UN SEUL compte par type (toutes agences confondues)
    // Index unique partiel excluant les comptes supprimés (soft delete)
    uqClientTypeActif: sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_comptes_client_type_actif ON comptes (client_id, type_compte) WHERE deleted_at IS NULL`,

    idxClient: index("idx_comptes_client_id").on(t.clientId),
    idxAgenceTypeStatut: index("idx_comptes_agence_type_statut").on(t.agenceId, t.typeCompte, t.statut),
    idxTypeStatut: index("idx_comptes_type_statut").on(t.typeCompte, t.statut),
    idxVersementAuto: index("idx_comptes_versement_auto").on(t.versementAutoActif, t.prochainVersementAuto),
    // P3.2: Additional indexes for common queries
    idxStatut: index("idx_comptes_statut").on(t.statut),
    idxDeletedAt: index("idx_comptes_deleted_at").on(t.deletedAt),
    idxProduitId: index("idx_comptes_produit_id").on(t.produitId),
    idxAgenceId: index("idx_comptes_agence_id").on(t.agenceId),

    chkSoldeNonNeg: sql`CONSTRAINT chk_comptes_solde_nonneg CHECK (${t.soldeCourant} >= 0)`,
    chkBlocageRange: sql`CONSTRAINT chk_comptes_blocage_range CHECK (${t.blocageFin} IS NULL OR ${t.blocageDebut} IS NULL OR ${t.blocageFin} > ${t.blocageDebut})`,
  }),
);

export const insertCompteSchema = createInsertSchema(comptes).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertCompte = z.infer<typeof insertCompteSchema>;
export type Compte = typeof comptes.$inferSelect;

// ============================================================================
// DEMANDES DE CLÔTURE (Maker-Checker workflow)
// ============================================================================

export const accountClosureRequests = pgTable(
  "account_closure_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compteId: uuid("compte_id").notNull().references(() => comptes.id, { onDelete: "restrict" }),

    // Maker-Checker
    initiatedBy: uuid("initiated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    initiatedAt: timestamp("initiated_at").notNull().defaultNow(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),

    // Statut
    status: closureRequestStatusEnum("status").notNull().default("PENDING"),
    reason: text("reason").notNull(),

    // Frais
    closingFeeAmount: numeric("closing_fee_amount").notNull().default("0"),

    // Payout
    payoutMethod: closurePayoutMethodEnum("payout_method").notNull(),
    payoutAmount: numeric("payout_amount").notNull(),
    payoutPhoneNumber: text("payout_phone_number"),
    payoutStatus: closurePayoutStatusEnum("payout_status").notNull().default("PENDING"),
    payoutMouvementId: uuid("payout_mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    payoutPaymentIntentId: uuid("payout_payment_intent_id"),

    // Snapshot
    balanceAtInitiation: numeric("balance_at_initiation").notNull(),

    // Annulation
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCompteId: index("idx_closure_requests_compte_id").on(t.compteId),
    idxStatus: index("idx_closure_requests_status").on(t.status),
    idxInitiatedBy: index("idx_closure_requests_initiated_by").on(t.initiatedBy),
    chkPayoutPos: sql`CONSTRAINT chk_closure_payout_pos CHECK (${t.payoutAmount} >= 0)`,
  }),
);

export const insertAccountClosureRequestSchema = createInsertSchema(accountClosureRequests).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAccountClosureRequest = z.infer<typeof insertAccountClosureRequestSchema>;
export type AccountClosureRequest = typeof accountClosureRequests.$inferSelect;

// ============================================================================
// DEMANDES D'OUVERTURE (Maker-Checker workflow — validation chef d'agence)
// ============================================================================

export const accountOpeningRequests = pgTable(
  "account_opening_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compteId: uuid("compte_id").notNull().references(() => comptes.id, { onDelete: "restrict" }),

    // Maker-Checker
    initiatedBy: uuid("initiated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    initiatedAt: timestamp("initiated_at").notNull().defaultNow(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),

    // Statut
    status: openingRequestStatusEnum("status").notNull().default("PENDING"),

    // Snapshot frais & dépôt au moment de la demande
    openingFeeAmount: numeric("opening_fee_amount").notNull().default("0"),
    initialDepositAmount: numeric("initial_deposit_amount").notNull(),
    produitId: uuid("produit_id").references(() => produitsCompte.id, { onDelete: "set null" }),

    // Rejet
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at"),
    rejectReason: text("reject_reason"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCompteId: index("idx_opening_requests_compte_id").on(t.compteId),
    idxStatus: index("idx_opening_requests_status").on(t.status),
    idxInitiatedBy: index("idx_opening_requests_initiated_by").on(t.initiatedBy),
  }),
);

export const insertAccountOpeningRequestSchema = createInsertSchema(accountOpeningRequests).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAccountOpeningRequest = z.infer<typeof insertAccountOpeningRequestSchema>;
export type AccountOpeningRequest = typeof accountOpeningRequests.$inferSelect;


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

// Historique des versements automatiques
export const versementsAutomatiques = pgTable(
  "versements_automatiques",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    compteSourceId: uuid("compte_source_id").notNull().references(() => comptes.id, { onDelete: "cascade" }),
    compteDestId: uuid("compte_dest_id").notNull().references(() => comptes.id, { onDelete: "cascade" }),

    montant: numeric("montant").notNull(),

    statut: statutVersementAutoEnum("statut").notNull(),

    dateExecution: timestamp("date_execution"),
    datePlanifiee: timestamp("date_planifiee").notNull(),

    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    erreur: text("erreur"),
    tentatives: integer("tentatives").notNull().default(0),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCompteSource: index("idx_versements_auto_source").on(t.compteSourceId, t.dateExecution),
    idxCompteDest: index("idx_versements_auto_dest").on(t.compteDestId, t.dateExecution),
    idxStatut: index("idx_versements_auto_statut").on(t.statut, t.datePlanifiee),
  }),
);

export type VersementAutomatique = typeof versementsAutomatiques.$inferSelect;

// Virements internes programmes
export const virementsProgrammes = pgTable(
  "virements_programmes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    compteSourceId: uuid("compte_source_id").notNull().references(() => comptes.id, { onDelete: "cascade" }),
    compteDestId: uuid("compte_dest_id").notNull().references(() => comptes.id, { onDelete: "cascade" }),

    // Agence pour filtrage RBAC rapide (denormalise depuis compte source)
    agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

    montant: numeric("montant").notNull(),
    frequence: frequenceVirementEnum("frequence").notNull(),

    // Configuration timezone et jour d'execution
    timezone: text("timezone").notNull().default("Africa/Brazzaville"),
    jourExecution: integer("jour_execution"), // 1-28 pour mensuel, 1-7 pour hebdo

    // Scheduling
    prochaineExecution: timestamp("prochaine_execution"),
    actif: boolean("actif").notNull().default(true),

    // Dernier resultat (cache pour affichage rapide)
    dernierExecution: timestamp("dernier_execution"),
    statutDernier: statutAuditVirementEnum("statut_dernier"),
    erreurDerniere: text("erreur_derniere"),

    // Retry management
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),

    // Verrou de traitement (anti double-execution)
    processingLock: text("processing_lock"), // worker_id
    processingStartedAt: timestamp("processing_started_at"),

    // Libelle personnalise (optionnel)
    libelle: text("libelle"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (t) => ({
    idxExecution: index("idx_virements_prog_execution").on(t.actif, t.prochaineExecution),
    idxSource: index("idx_virements_prog_source").on(t.compteSourceId, t.createdAt),
    idxDest: index("idx_virements_prog_dest").on(t.compteDestId, t.createdAt),
    idxAgence: index("idx_virements_prog_agence").on(t.agenceId, t.actif),
    idxProcessingLock: index("idx_virements_prog_lock").on(t.processingLock, t.processingStartedAt),
    chkMontantPos: sql`CONSTRAINT chk_virements_prog_montant_pos CHECK (${t.montant} > 0)`,
    chkJourExecution: sql`CONSTRAINT chk_virements_prog_jour_execution CHECK (${t.jourExecution} IS NULL OR (${t.jourExecution} >= 1 AND ${t.jourExecution} <= 28))`,
  }),
);

export const insertVirementProgrammeSchema = createInsertSchema(virementsProgrammes).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true, processingLock: true, processingStartedAt: true });
export type InsertVirementProgramme = z.infer<typeof insertVirementProgrammeSchema>;
export type VirementProgramme = typeof virementsProgrammes.$inferSelect;

// Executions de virements programmes (1 ligne par tentative)
// CRITIQUE: La contrainte UNIQUE sur executionKey garantit l'idempotence
export const scheduledTransferRuns = pgTable(
  "scheduled_transfer_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    scheduledTransferId: uuid("scheduled_transfer_id").notNull().references(() => virementsProgrammes.id, { onDelete: "cascade" }),

    // Cle d'idempotence: VP-{scheduleId}-{YYYY-MM-DD}
    // UNIQUE constraint empeche toute double execution pour la meme date
    executionKey: text("execution_key").notNull(),

    // Statut de l'execution
    status: statutRunVirementEnum("status").notNull().default("PENDING"),

    // Timestamps
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),

    // Resultat
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),

    // Tentative (pour retries)
    attemptNumber: integer("attempt_number").notNull().default(1),

    // Metadata supplementaire (montants, soldes avant/apres, etc.)
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // CRITIQUE: Contrainte unique anti double-execution
    uqExecutionKey: uniqueIndex("uq_scheduled_transfer_runs_execution_key").on(t.executionKey),
    // Index pour recherche par schedule
    idxScheduleStatus: index("idx_scheduled_runs_schedule_status").on(t.scheduledTransferId, t.status),
    // Index pour recherche par date
    idxCreatedAt: index("idx_scheduled_runs_created_at").on(t.createdAt),
  }),
);

export const insertScheduledTransferRunSchema = createInsertSchema(scheduledTransferRuns).omit({ id: true, createdAt: true });
export type InsertScheduledTransferRun = z.infer<typeof insertScheduledTransferRunSchema>;
export type ScheduledTransferRun = typeof scheduledTransferRuns.$inferSelect;

// Audit logs pour virements programmés
// Note: Cette table est conservee pour compatibilite ascendante
// Les nouvelles executions utilisent scheduled_transfer_runs comme source de verite
export const virementsProgrammesAuditLogs = pgTable(
  "virements_programmes_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    virementId: uuid("virement_id").notNull().references(() => virementsProgrammes.id, { onDelete: "cascade" }),

    // Reference optionnelle au run (nouveau champ)
    runId: uuid("run_id").references(() => scheduledTransferRuns.id, { onDelete: "set null" }),

    statut: statutAuditVirementEnum("statut").notNull(),
    message: text("message"),

    executedAt: timestamp("executed_at").notNull().defaultNow(),
    executionTimeMs: integer("execution_time_ms"),

    metadata: jsonb("metadata"), // Détails supplémentaires (montant, soldes, etc.)

    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
  },
  (t) => ({
    idxVirementId: index("idx_virement_audit_virement_id").on(t.virementId),
    idxExecutedAt: index("idx_virement_audit_executed_at").on(t.executedAt),
    idxStatut: index("idx_virement_audit_statut").on(t.statut),
    idxRunId: index("idx_virement_audit_run_id").on(t.runId),
  }),
);

export const insertVirementAuditLogSchema = createInsertSchema(virementsProgrammesAuditLogs).omit({ id: true });
export type InsertVirementAuditLog = z.infer<typeof insertVirementAuditLogSchema>;
export type VirementAuditLog = typeof virementsProgrammesAuditLogs.$inferSelect;

// Historique des décaissements programmés
export const decaissementsProgrammes = pgTable(
  "decaissements_programmes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    creditId: uuid("credit_id").notNull().references(() => credits.id, { onDelete: "cascade" }),

    montant: numeric("montant").notNull(),

    statut: statutDecaissementProgEnum("statut").notNull(),

    dateExecution: timestamp("date_execution"),
    datePlanifiee: timestamp("date_planifiee").notNull(),

    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    erreur: text("erreur"),
    tentatives: integer("tentatives").notNull().default(0),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxCredit: index("idx_decaissements_prog_credit").on(t.creditId, t.dateExecution),
    idxStatut: index("idx_decaissements_prog_statut").on(t.statut, t.datePlanifiee),
  }),
);

export type DecaissementProgramme = typeof decaissementsProgrammes.$inferSelect;

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
    
    // Reference to generated invoice/receipt
    factureId: uuid("facture_id").references(() => factures.id, {
      onDelete: "set null",
    }),

    // Unification : même enum partout (terrain/caisse/crédit/tontine/compte)
    typePaiement: typePaiementTerrainEnum("type_paiement").notNull(),

    statut: statutTransactionEnum("statut").notNull().default("POSTED"),

    // Direction of transaction (CREDIT = money in, DEBIT = money out)
    // Stored directly to avoid complex JOINs and ensure correct classification
    sens: sensMouvementEnum("sens").notNull().default("DEBIT"),

    montant: numeric("montant").notNull(),

    // Cache UI (facultatif mais pratique)
    soldeApres: numeric("solde_apres"),

    methodePaiement: methodePaiementEnum("methode_paiement")
      .notNull()
      .default("CASH"),

    referenceExterne: text("reference_externe"),
    idempotencyKey: text("idempotency_key"),

    observations: text("observations"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    annulledAt: timestamp("annulled_at"),
    reversedAt: timestamp("reversed_at"),

    // Reversal tracking
    reversalOfId: uuid("reversal_of_id"), // Self-referencing: points to original transaction
    reversalReason: text("reversal_reason"),
    reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, { onDelete: "set null" }),
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
    idxReversalOf: index("idx_transactions_compte_reversal_of").on(t.reversalOfId),
    idxSens: index("idx_transactions_compte_sens").on(t.sens),
    idxCompteSensDate: index("idx_transactions_compte_compte_sens_date").on(
      t.compteId,
      t.sens,
      t.createdAt,
    ),
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

    statut: statutPlanEpargneEnum("statut").notNull().default("ACTIVE"),
    observations: text("observations"),

    // Optionnel : pour uniformiser le "sens" des versements
    typePaiement: typePaiementTerrainEnum("type_paiement").default("DEPOSIT_SAVINGS"),

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

    statut: statutObjectifEpargneEnum("statut").notNull().default("IN_PROGRESS"),
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
  type: text("type").notNull().default("PHYSICAL"), // 'PHYSICAL'
  solde: numeric("solde").notNull().default("0"),
  statut: statutCaisseMainEnum("statut").notNull().default("CLOSED"),

  // Operating hours configuration
  operatingHoursEnabled: boolean("operating_hours_enabled").default(false),
  operatingHoursStart: text("operating_hours_start").default("08:00"), // HH:MM format
  operatingHoursEnd: text("operating_hours_end").default("17:00"),     // HH:MM format
  operatingDays: jsonb("operating_days").default([1, 2, 3, 4, 5]),     // 0=Sun, 1=Mon, etc.

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});
export const insertCaisseSchema = createInsertSchema(caisses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCaisse = z.infer<typeof insertCaisseSchema>;
export type Caisse = typeof caisses.$inferSelect;

// Sessions caisse
export const sessionsCaisse = pgTable("sessions_caisse", {
  id: uuid("id").primaryKey().defaultRandom(),
  caissierId: uuid("caissier_id").notNull().references(() => users.id),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  montantOuverture: numeric("montant_ouverture").notNull().default("0"),
  montantFermetureTheorique: numeric("montant_fermeture_theorique").notNull().default("0"),
  montantFermetureDeclare: numeric("montant_fermeture_declare"),
  ecart: numeric("ecart"),
  statut: statutSessionCaisseEnum("statut").notNull().default("REQUESTING_FUNDS"),
  observations: text("observations"),
  billetageOuverture: json("billetage_ouverture"),
  billetageFermeture: json("billetage_fermeture"),
  agenceId: uuid("agence_id").references(() => agences.id), // Agence de la session caisse
  caisseId: uuid("caisse_id").notNull().references(() => caisses.id), // Physical caisse link
  // Colonnes pour robustesse production
  connectionStatus: text("connection_status", { enum: ["CONNECTED", "DISCONNECTED"] }).default("DISCONNECTED"),
  lastActivity: timestamp("last_activity").defaultNow(), // Heartbeat - dernière activité
  timeoutAt: timestamp("timeout_at"), // Date d'expiration prévue
  forcedCloseReason: text("forced_close_reason"),
  closedReason: text("closed_reason").default("manual"), // manual | timeout | admin

  // Force close fields (admin override)
  forceClosedBy: uuid("force_closed_by").references(() => users.id, { onDelete: "set null" }),
  forceClosedAt: timestamp("force_closed_at"),

  // Flexible closure options
  fundsKeptInCaisse: boolean("funds_kept_in_caisse").default(false),
  transferToCoffreId: uuid("transfer_to_coffre_id").references(() => coffresForts.id, { onDelete: "set null" }),

  // ========== WORKFLOW OUVERTURE SECURISEE (Coffre → Caisse) ==========
  // Lien vers le transfert d'ouverture (FK gérée au niveau migration SQL pour éviter dépendance circulaire)
  openingTransfertId: uuid("opening_transfert_id"), // Référence vers transferts_coffre_caisse.id

  // Montants du workflow d'ouverture
  montantDemande: numeric("montant_demande"),           // Montant demandé par le caissier au coffre
  soldeVeille: numeric("solde_veille").default("0"),    // Solde résiduel de la veille (si fundsKeptInCaisse)

  // Timestamps du workflow d'ouverture
  fundsRequestedAt: timestamp("funds_requested_at"),    // Phase A: Demande soumise
  fundsDispatchedAt: timestamp("funds_dispatched_at"),  // Phase B: Coffre a validé
  fundsReceivedAt: timestamp("funds_received_at"),      // Phase C: Caissier a confirmé réception

  // Billetage à la réception (pour détection d'écart avec montant demandé)
  billetageReception: json("billetage_reception"),

  // Expiration automatique de la demande
  requestExpiresAt: timestamp("request_expires_at"),
  // ========== FIN WORKFLOW OUVERTURE ==========

  // ========== WORKFLOW FERMETURE SECURISEE (Caisse → Coffre) ==========
  // Règle d'Or: L'argent compté physiquement doit correspondre à:
  // MontantVersCoffre + MontantReporte = TotalPhysique

  // Timestamps du workflow de fermeture
  closingInitiatedAt: timestamp("closing_initiated_at"),    // Début du gel (CLOSING_COUNT)
  countSubmittedAt: timestamp("count_submitted_at"),        // Comptage soumis (CLOSING_VALIDATION)
  closingFinalizedAt: timestamp("closing_finalized_at"),    // Clôture définitive (CLOSED)

  // Comptage physique et écart
  montantPhysique: numeric("montant_physique"),             // Montant compté physiquement
  ecartJustification: text("ecart_justification"),          // Obligatoire si écart != 0

  // Décision de transfert vers coffre
  montantVersCoffre: numeric("montant_vers_coffre"),        // Montant à transférer au coffre
  montantReporte: numeric("montant_reporte"),               // Montant gardé pour J+1 (fonds de roulement)
  closingTransfertId: uuid("closing_transfert_id"),         // Référence vers transferts_coffre_caisse.id

  // Validation par responsable coffre (si transfert)
  coffreValidationStatus: text("coffre_validation_status", { enum: ["PENDING", "APPROVED", "REJECTED"] }),
  coffreValidatedBy: uuid("coffre_validated_by").references(() => users.id, { onDelete: "set null" }),
  coffreValidatedAt: timestamp("coffre_validated_at"),

  // Bordereau de clôture
  closingBordereauUrl: text("closing_bordereau_url"),       // URL du PDF généré
  // ========== FIN WORKFLOW FERMETURE ==========

  // ========== ÉCART APPROVAL ==========
  ecartApprovalId: uuid("ecart_approval_id"),               // Référence vers ecartsApprovalRequests.id
  ecartApprovalStatus: text("ecart_approval_status"),       // AUTO_APPROVED, PENDING_APPROVAL, APPROVED, REJECTED
  // ========== FIN ÉCART APPROVAL ==========

  // ========== HANDOVER (TRANSFERT DE GARDE) ==========
  handoverCount: integer("handover_count").default(0),                    // Nombre de transferts de garde effectués
  lastHandoverId: uuid("last_handover_id"),                               // Référence vers caisse_handovers.id
  originalCaissierId: uuid("original_caissier_id").references(() => users.id, { onDelete: "set null" }), // Caissier qui a ouvert la session
  // Solde actuel (mis à jour après chaque opération pour les handovers)
  soldeActuel: numeric("solde_actuel"),
  // ========== FIN HANDOVER ==========

  // ========== GL GUARD - OUVERTURE SECURISEE ==========
  // Vérification cohérence billetage vs GL à l'ouverture
  openingGlBalance: numeric("opening_gl_balance"),                  // Solde GL (521xxx) calculé à l'ouverture
  openingBilletageTotal: numeric("opening_billetage_total"),        // Total billetage déclaré
  openingEcart: numeric("opening_ecart"),                           // Écart = billetage - GL
  openingStrictnessApplied: text("opening_strictness_applied"),     // STRICT_BLOCK | WARNING_WITH_JUSTIFICATION | LOG_ONLY
  hasOpeningDiscrepancy: boolean("has_opening_discrepancy").default(false), // Flag pour filtrage rapide
  openingDiscrepancyJustification: text("opening_discrepancy_justification"), // Justification si écart (mode WARNING)
  openingDiscrepancyApprovedBy: uuid("opening_discrepancy_approved_by").references(() => users.id, { onDelete: "set null" }),
  openingDiscrepancyApprovedAt: timestamp("opening_discrepancy_approved_at"),
  // ========== FIN GL GUARD ==========

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertSessionCaisseSchema = createInsertSchema(sessionsCaisse).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionCaisse = z.infer<typeof insertSessionCaisseSchema>;
export type SessionCaisse = typeof sessionsCaisse.$inferSelect;

// ========== DISCREPANCIES D'OUVERTURE CAISSE (GL GUARD) ==========
// Table dédiée pour traçabilité complète des écarts d'ouverture
export const cashOpeningDiscrepancies = pgTable(
  "cash_opening_discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Liens
    sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "cascade" }),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    caisseId: uuid("caisse_id").notNull().references(() => caisses.id),
    userId: uuid("user_id").notNull().references(() => users.id), // Caissier qui a ouvert

    // Valeurs financières
    glBalance: numeric("gl_balance").notNull(),          // Solde GL (521xxx) au moment de l'ouverture
    billetageTotal: numeric("billetage_total").notNull(), // Total billetage déclaré
    ecart: numeric("ecart").notNull(),                    // Écart = billetage - GL
    ecartPercent: numeric("ecart_percent"),               // Écart en pourcentage

    // Mode et décision
    strictnessMode: text("strictness_mode").notNull(),    // STRICT_BLOCK | WARNING_WITH_JUSTIFICATION | LOG_ONLY
    action: text("action").notNull(),                     // BLOCKED | APPROVED_WITH_JUSTIFICATION | LOGGED_ONLY

    // Justification (obligatoire si WARNING_WITH_JUSTIFICATION)
    justification: text("justification"),

    // Approbation (si écart accepté)
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),

    // Détails billetage pour investigation
    billetageDetail: json("billetage_detail"),            // Détail par coupure

    // Contexte supplémentaire
    previousSessionId: uuid("previous_session_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
    previousSessionClosedAt: timestamp("previous_session_closed_at"),
    previousSessionEcart: numeric("previous_session_ecart"), // Écart de la session précédente (corrélation)

    // Audit
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    // Index pour recherche par session
    idxSession: index("idx_cash_opening_discrepancies_session").on(t.sessionId),
    // Index pour recherche par agence
    idxAgence: index("idx_cash_opening_discrepancies_agence").on(t.agenceId),
    // Index pour recherche par caisse
    idxCaisse: index("idx_cash_opening_discrepancies_caisse").on(t.caisseId),
    // Index pour filtrage par action (dashboard)
    idxAction: index("idx_cash_opening_discrepancies_action").on(t.action),
    // Index temporel pour rapports
    idxCreatedAt: index("idx_cash_opening_discrepancies_created").on(t.createdAt),
  }),
);

export const insertCashOpeningDiscrepancySchema = createInsertSchema(cashOpeningDiscrepancies).omit({ id: true, createdAt: true });
export type InsertCashOpeningDiscrepancy = z.infer<typeof insertCashOpeningDiscrepancySchema>;
export type CashOpeningDiscrepancy = typeof cashOpeningDiscrepancies.$inferSelect;

// Opérations caisse
export const operationsCaisse = pgTable(
  "operations_caisse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "restrict" }),

    // Pivot ledger
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

    typeOperation: typeOperationCaisseEnum("type_operation").notNull(),
    statut: statutTransactionEnum("statut").notNull().default("POSTED"),

    montant: numeric("montant").notNull(), // garde pour compat
    methodePaiement: methodePaiementEnum("methode_paiement").notNull().default("CASH"),

    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),

    description: text("description"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),

    // Traçabilité de la vérification de présence du titulaire (pour retraits sans OTP)
    presenceVerification: jsonb("presence_verification"),

    // Métadonnées additionnelles (chèques, virements, etc.)
    metadata: jsonb("metadata"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    annulledAt: timestamp("annulled_at"),
    reversedAt: timestamp("reversed_at"),

    // Reversal tracking
    reversalOfId: uuid("reversal_of_id"), // Self-referencing: points to original operation
    reversalReason: text("reversal_reason"),
    reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, { onDelete: "set null" }),

    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (t) => ({
    idxSessionDate: index("idx_operations_caisse_session_date").on(t.sessionId, t.createdAt),
    idxSessionType: index("idx_operations_caisse_session_type").on(t.sessionId, t.typeOperation),
    idxMvt: index("idx_operations_caisse_mouvement").on(t.mouvementId),
    uqReference: uniqueIndex("uq_operations_caisse_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_operations_caisse_idempotency").on(t.idempotencyKey),
    chkMontantPos: sql`CONSTRAINT chk_operations_caisse_montant_pos CHECK (${t.montant} > 0)`,
    idxReversalOf: index("idx_operations_caisse_reversal_of").on(t.reversalOfId),
  }),
);

export const insertOperationCaisseSchema = createInsertSchema(operationsCaisse).omit({ id: true, createdAt: true, updatedAt: true });
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
    statut: statutTransfertCaisseEnum("statut").notNull().default("PENDING"),

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

// ========== SCHEDULED CAISSE TRANSFERS ==========
export const scheduledCaisseTransfers = pgTable("scheduled_caisse_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceSourceId: uuid("agence_source_id").notNull().references(() => agences.id),
  agenceDestId: uuid("agence_dest_id").notNull().references(() => agences.id),
  montant: numeric("montant").notNull(),
  datePrevue: date("date_prevue").notNull(),
  frequence: varchar("frequence", { length: 20 }).default("ONE_TIME"), // ONE_TIME, DAILY, WEEKLY, MONTHLY
  jourSemaine: integer("jour_semaine"), // 0-6 for weekly
  jourMois: integer("jour_mois"), // 1-31 for monthly
  motif: text("motif"),
  statut: varchar("statut", { length: 20 }).default("SCHEDULED"), // SCHEDULED, EXECUTED, CANCELLED, FAILED
  transfertId: uuid("transfert_id").references(() => caisseTransferts.id),
  derniereExecution: timestamp("derniere_execution"),
  prochaineExecution: timestamp("prochaine_execution"),
  nombreExecutions: integer("nombre_executions").default(0),
  maxExecutions: integer("max_executions"), // NULL = unlimited
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ScheduledCaisseTransfer = typeof scheduledCaisseTransfers.$inferSelect;
export type InsertScheduledCaisseTransfer = typeof scheduledCaisseTransfers.$inferInsert;

// ========== AUDIT SESSIONS CAISSE ==========
export const sessionsCaisseAuditLogs = pgTable("sessions_caisse_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // OPENED, CLOSED, TIMEOUT, ADMIN_CLOSED, HEARTBEAT
  statutAvant: text("statut_avant"),
  statutApres: text("statut_apres"),
  details: jsonb("details").notNull().default({}),
  caisseId: uuid("caisse_id").references(() => caisses.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SessionCaisseAuditLog = typeof sessionsCaisseAuditLogs.$inferSelect;

// ========== DENOMINATION TEMPLATES ==========
export const denominationTemplates = pgTable("denomination_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  description: text("description"),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "cascade" }),
  caisseId: uuid("caisse_id").references(() => caisses.id, { onDelete: "cascade" }),
  billetage: jsonb("billetage").$type<Record<string, number>>().notNull(),
  totalCalcule: numeric("total_calcule").notNull(),
  typeTemplate: text("type_template").default("GENERAL"), // OPENING, CLOSING, GENERAL
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDenominationTemplateSchema = createInsertSchema(denominationTemplates).omit({ id: true, createdAt: true, updatedAt: true, usageCount: true, lastUsedAt: true });
export type InsertDenominationTemplate = z.infer<typeof insertDenominationTemplateSchema>;
export type DenominationTemplate = typeof denominationTemplates.$inferSelect;

// ========== REEVALUATION WORKFLOW TABLES ==========

// Configuration for reevaluation rules
export const configReevaluation = pgTable("config_reevaluation", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Eligibility rules
  delaiMinimumJours: integer("delai_minimum_jours").notNull().default(1), // Minimum delay reduced to 1 day
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
    statut: statutReevaluationEnum("statut").notNull().default("REQUESTED"),
    
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
    statut: statutEnqueteComplementaireEnum("statut").notNull().default("IN_PROGRESS"),

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

// =======================
// REMBOURSEMENT FRAIS DE CRÉDIT (CR)
// =======================

export const creditRefundRequests = pgTable(
  "credit_refund_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Core Links
    demandeId: uuid("demande_id").notNull().references(() => demandesCredit.id, { onDelete: 'restrict' }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: 'restrict' }),
    agenceId: uuid("agence_id").notNull().references(() => agences.id, { onDelete: 'restrict' }),

    // Financial Data
    montantEncaisse: numeric("montant_encaisse").notNull(),
    montantRemboursable: numeric("montant_remboursable").notNull(),
    montantNonRemboursable: numeric("montant_non_remboursable").notNull(),

    // Workflow State
    statut: statutRefundRequestEnum("statut").notNull().default("DRAFT"),

    // Context
    motifRejetCredit: text("motif_rejet_credit"),
    motifRemboursement: text("motif_remboursement"),
    
    // Decisions (Audit constraints)
    makerId: uuid("maker_id").references(() => users.id),
    makerAt: timestamp("maker_at"),
    
    checkerId: uuid("checker_id").references(() => users.id),
    checkerAt: timestamp("checker_at"),
    
    checkerDecision: text("checker_decision"), // APPROVED | REJECTED
    checkerComment: text("checker_comment"),

    // Execution / Payment
    paidAt: timestamp("paid_at"),
    paidBy: uuid("paid_by").references(() => users.id),
    paymentMethod: text("payment_method"), // CASH | ACCOUNT | MOBILE_MONEY
    mobileMoneyProvider: text("mobile_money_provider"), // MTN | AIRTEL (for MOBILE_MONEY only)
    mobileMoneyPhone: text("mobile_money_phone"), // Phone number for MoMo disbursement
    paymentReference: text("payment_reference"), // Bon de sortie / Transfer ref
    
    mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    idxDemande: index("idx_refund_demande").on(t.demandeId),
    idxStatus: index("idx_refund_status").on(t.statut),
  })
);

export const insertCreditRefundRequestSchema = createInsertSchema(creditRefundRequests).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertCreditRefundRequest = z.infer<typeof insertCreditRefundRequestSchema>;
export type CreditRefundRequest = typeof creditRefundRequests.$inferSelect;

// ========== CAISSE HANDOVER (TRANSFERT DE GARDE) ==========

/**
 * Table des transferts de garde - permet le changement de caissier
 * en cours de journée sans clôturer la session
 */
export const caisseHandovers = pgTable("caisse_handovers", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Session concernée
  sessionId: uuid("session_id").notNull().references(() => sessionsCaisse.id, { onDelete: "restrict" }),
  caisseId: uuid("caisse_id").notNull().references(() => caisses.id, { onDelete: "restrict" }),
  agenceId: uuid("agence_id").references(() => agences.id, { onDelete: "set null" }),

  // Caissiers impliqués
  fromCaissierId: uuid("from_caissier_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  toCaissierId: uuid("to_caissier_id").notNull().references(() => users.id, { onDelete: "restrict" }),

  // Montants au moment du transfert
  montantTheorique: numeric("montant_theorique").notNull(),
  montantCompte: numeric("montant_compte").notNull(),
  ecart: numeric("ecart").default("0"),

  // Billetage au moment du transfert
  billetageSortant: jsonb("billetage_sortant").$type<Record<string, number>>(),
  billetageEntrant: jsonb("billetage_entrant").$type<Record<string, number>>(),

  // Statut du workflow
  statut: text("statut").notNull().default("PENDING"), // PENDING, COUNTING, CONFIRMED, CANCELLED, DISPUTED

  // Justifications et observations
  motif: text("motif"),
  observationsSortant: text("observations_sortant"),
  observationsEntrant: text("observations_entrant"),
  ecartJustification: text("ecart_justification"),

  // Timestamps workflow
  initiatedAt: timestamp("initiated_at").notNull().defaultNow(),
  countingStartedAt: timestamp("counting_started_at"),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
  cancelReason: text("cancel_reason"),

  // Approbation (si écart)
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  approvalComment: text("approval_comment"),

  // Métadonnées
  ipAddressFrom: text("ip_address_from"),
  ipAddressTo: text("ip_address_to"),
  userAgentFrom: text("user_agent_from"),
  userAgentTo: text("user_agent_to"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCaisseHandoverSchema = createInsertSchema(caisseHandovers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  initiatedAt: true,
});
export type InsertCaisseHandover = z.infer<typeof insertCaisseHandoverSchema>;
export type CaisseHandover = typeof caisseHandovers.$inferSelect;

/**
 * Audit logs pour les transferts de garde
 */
export const caisseHandoverAuditLogs = pgTable("caisse_handover_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  handoverId: uuid("handover_id").notNull().references(() => caisseHandovers.id, { onDelete: "cascade" }),

  action: text("action").notNull(), // INITIATED, COUNTING_STARTED, CONFIRMED, CANCELLED, DISPUTED, APPROVED, REJECTED
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),

  statutAvant: text("statut_avant"),
  statutApres: text("statut_apres"),

  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
});

export type CaisseHandoverAuditLog = typeof caisseHandoverAuditLogs.$inferSelect;

// ============================================================================
// CAISSE PAYMENT REQUESTS (queue centralisée des demandes de paiement en caisse)
// ============================================================================

export const caissePaymentRequests = pgTable("caisse_payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: caisseRequestCategoryEnum("category").notNull(),
  direction: text("direction").notNull(), // "IN" (argent entre en caisse) | "OUT" (argent sort)
  agenceId: uuid("agence_id").notNull().references(() => agences.id),

  // Liens polymorphiques vers la source
  sourceType: text("source_type").notNull(),  // "demande_credit" | "credit_refund" | "bulletin_paie" | "compte"
  sourceId: text("source_id").notNull(),

  // Caisse cible (si la demande est destinée à une caisse spécifique)
  targetCaisseId: uuid("target_caisse_id").references(() => caisses.id, { onDelete: "set null" }),

  // Cible
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  employeeId: uuid("employee_id"),

  // Montant
  montant: numeric("montant").notNull(),

  // Affichage
  label: text("label").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),

  // Statut
  statut: caisseRequestStatusEnum("statut").notNull().default("PENDING"),

  // Traitement
  processedBy: uuid("processed_by").references(() => users.id, { onDelete: "set null" }),
  processedAt: timestamp("processed_at"),
  sessionCaisseId: uuid("session_caisse_id").references(() => sessionsCaisse.id, { onDelete: "set null" }),
  mouvementId: uuid("mouvement_id").references(() => mouvementsFinanciers.id, { onDelete: "set null" }),

  // Audit
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  idxAgenceStatut: index("idx_caisse_requests_agence_statut").on(t.agenceId, t.statut),
  idxSource: index("idx_caisse_requests_source").on(t.sourceType, t.sourceId),
}));

export type CaissePaymentRequest = typeof caissePaymentRequests.$inferSelect;
export type InsertCaissePaymentRequest = typeof caissePaymentRequests.$inferInsert;
