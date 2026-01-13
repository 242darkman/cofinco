import { pgEnum } from "drizzle-orm/pg-core";

export const statutTransfertCoffreEnum = pgEnum("statut_transfert_coffre_enum", [
  "Demandé",
  "Validé",
  "Exécuté",
  "Rejeté",
  "Annulé",
]);

export const typeTransfertCoffreEnum = pgEnum("type_transfert_coffre_enum", [
  "COFFRE_VERS_CAISSE",
  "CAISSE_VERS_COFFRE",
]);

export const frequenceRemboursementEnum = pgEnum("frequence_remboursement_enum", [
  "Journalier",
  "Hebdomadaire",
  "Mensuel",
  "Bimensuel",
  "Trimestriel",
]);

export const dureeUniteEnum = pgEnum("duree_unite_enum", [
  "Jour",
  "Semaine",
  "Mois",
]);

export const statutDemandeEnum = pgEnum("statut_demande_enum", [
  "En attente",       // Attente paiement frais
  "A enquêter",       // Frais payés, prêt pour enquête
  "En enquête",        // En cours d'enquête
  "Enquête terminée",  // Enquête soumise, attente validation investigation
  "Approuvée",        // Investigation validée, prêt pour décision finale
  "Rejetée",
  "Annulée",
  "Décaissée",
  "Clôturée",
  // Reevaluation workflow states
  "Réévaluation en cours",      // Reevaluation in progress
  "Approuvée après réévaluation", // Approved after reevaluation
  "Rejetée définitivement",     // Definitively rejected (no more reevaluation possible)
]);

// ========== REEVALUATION WORKFLOW ENUMS ==========

export const statutReevaluationEnum = pgEnum("statut_reevaluation_enum", [
  "Demandée",                    // Client/Agent a initié la demande
  "Éligibilité en cours",        // Vérification automatique
  "Autorisée",                   // Éligible, peut procéder
  "Refusée",                     // Non éligible (délai, max atteint, motif blacklisté)
  "Enquête complémentaire",      // Enquête terrain en cours
  "Enquête terminée",            // Enquête complémentaire soumise
  "En comité",                   // Soumis au comité de décision
  "Approuvée",                   // Comité approuve la réévaluation
  "Rejetée définitivement",      // Comité rejette définitivement
  "Annulée",                     // Annulée par le demandeur
]);

export const typeElementNouveauEnum = pgEnum("type_element_nouveau_enum", [
  "Garantie supplémentaire",
  "Co-emprunteur",
  "Justificatif de revenus",
  "Réduction montant demandé",
  "Ajustement durée",
  "Amélioration situation",
  "Document manquant",
  "Autre",
]);

export const typeRevenuEnum = pgEnum("type_revenu_enum", [
  "Mensuel",
  "Journalier",
]);

export const typeCreditEnum = pgEnum("type_credit_enum", [
  "Personnel",
  "Immobilier",
  "Commercial",
]);

export const methodePaiementEnum = pgEnum("methode_paiement_enum", [
  "Espèces",
  "Mobile Money",
  "Virement",
  "Carte",
  "Chèque",
  "Autre",
]);


export const statutCreditEnum = pgEnum("statut_credit_enum", [
  "En attente",
  "Actif",
  "En retard",
  "Soldé",
  "Clôturé",
  "Annulé",
]);

export const typeTransactionEpargneEnum = pgEnum("type_transaction_epargne_enum", [
  "Dépôt",
  "Retrait",
  "Intérêt",
  "Frais",
  "Ajustement",
]);

export const statutTransactionEnum = pgEnum("statut_transaction_enum", [
  "Pending",
  "Posté",
  "Annulé",
  "Reversé",
]);

export const statutSessionCaisseEnum = pgEnum("statut_session_caisse_enum", [
  "Ouverte",
  "Fermée",
  "Suspendue",
]);

export const typeOperationCaisseEnum = pgEnum("type_operation_caisse", [
  "Dépôt épargne",
  "Retrait épargne",
  "Décaissement crédit",
  "Remboursement crédit",
  "Frais Engagement",
  "Frais",
  "Ajustement",
  "Transfert caisse",
  "Approvisionnement coffre",
  "Versement coffre",
  // Added for CaissePaiementModal compatibility
  "Versement Épargne",
  "Versement Courant",
  "Retrait Courant",
  "Versement Bloqué",
  "Retrait Bloqué",
  "Encaissement Divers",
  "Décaissement Divers",
  "Frais Bancaires",
  // Tontine specific (often handled separately but good to have)
  "Cotisation Tontine",
  "Retrait Tontine",
  // Aliases for robustness
  "Remboursement Prêt",
  "Décaissement Prêt",
  "Retrait Épargne"
]);

export const statutTransfertCaisseEnum = pgEnum("statut_transfert_caisse_enum", [
  "En attente",
  "Validé",
  "Rejeté",
  "Annulé",
  "Reçu",
]);

export const interestRateTypeEnum = pgEnum("interest_rate_type_enum", [
  "credit",
  "epargne",
  "autre",
]);

export const sensMouvementEnum = pgEnum("sens_mouvement_enum", ["Débit", "Crédit"]);

export const sourceModuleEnum = pgEnum("source_module_enum", [
  "CAISSE",
  "EPARGNE",
  "CREDIT",
  "TONTINE",
  "TERRAIN",
  "TRANSFERT",
  "SYSTEME",
  "CAISSE_AGENT", // Nouveau module pour les opérations de caisse agent
]);

export const typeEvenementEnum = pgEnum("type_evenement_enum", [
  "MOUVEMENT_CREE",
  "MOUVEMENT_STATUT_CHANGE",
  "SOLDE_COMPTE_CHANGE",
  "CREDIT_SOLDE_CHANGE",
  "SESSION_CAISSE_CHANGE",
  "TRANSFERT_CAISSE_CHANGE",
  // Compte-specific events
  "COMPTE_CREE",
  "COMPTE_BLOQUE",
  "COMPTE_DEBLOQUE",
  "COMPTE_TRANSFERE_AGENCE",
  // Caisse Agent events
  "CAISSE_AGENT_SOLDE_CHANGE",
  "OPERATION_TERRAIN_SUBMITTED",
  "OPERATION_TERRAIN_APPROVED",
  "OPERATION_TERRAIN_REJECTED",
]);

export const typeTauxInteretEnum = pgEnum("type_taux_interet_enum", [
  "credit",
  "epargne",
  "autre",
]);

export const typePaiementTerrainEnum = pgEnum("type_paiement_terrain_enum", [
  // Dépôts (par type de compte)
  "Dépôt Épargne",
  "Dépôt Courant",
  "Dépôt Bloqué",

  // Retraits (par type de compte)
  "Retrait Épargne",
  "Retrait Courant",
  "Retrait Bloqué",

  // Crédit
  "Remboursement Crédit",
  "Frais Engagement",
  "Décaissement Crédit",

  // Tontine
  "Versement Tontine",
  "Retrait Tontine",

  // Coffre
  "Approvisionnement coffre",
]);

export const typeCompteEnum = pgEnum("type_compte_enum", [
  "Épargne",
  "Courant",
  "Bloqué",
]);

export const statutCompteEnum = pgEnum("statut_compte_enum", [
  "Actif",
  "Suspendu",
  "Clôturé",
]);

export const motifBlocageEnum = pgEnum("motif_blocage_enum", [
  "Garantie crédit",
  "Garantie tontine",
  "Épargne forcée",
  "Décision interne",
  "Litige",
  "Autre",
]);

// ========== CAISSE AGENT ENUMS ==========

export const statutCaisseAgentEnum = pgEnum("statut_caisse_agent_enum", [
  "Active",
  "Suspendue",
  "Clôturée",
]);

export const typeOperationTerrainEnum = pgEnum("type_operation_terrain_enum", [
  "COLLECT_CASH",      // Agent collecte cash d'un client
  "SETTLEMENT_CASH",   // Agent remet cash à l'agence/coffre
]);

export const statutOperationTerrainEnum = pgEnum("statut_operation_terrain_enum", [
  "SUBMITTED",   // Soumise, en attente de validation
  "APPROVED",    // Approuvée, écritures postées
  "REJECTED",    // Rejetée, aucune écriture
  "CANCELLED",   // Annulée par l'agent/admin
]);
