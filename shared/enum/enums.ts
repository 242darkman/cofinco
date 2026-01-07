import { pgEnum } from "drizzle-orm/pg-core";

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
  "En attente",
  "En cours",
  "Approuvée",
  "Rejetée",
  "Annulée",
  "Décaissée",
  "Clôturée",
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

export const typeOperationCaisseEnum = pgEnum("type_operation_caisse_enum", [
  "Dépôt épargne",
  "Retrait épargne",
  "Décaissement crédit",
  "Remboursement crédit",
  "Frais",
  "Ajustement",
  "Transfert caisse",
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