/**
 * Enums Drizzle — domaine « coffre ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// TRANSFERT COFFRE
// ============================================

export const statutTransfertCoffreEnum = pgEnum("statut_transfert_coffre_enum", [
  "REQUESTED",
  "VALIDATED",
  "EXECUTED",
  "REJECTED",
  "CANCELLED",
]);

export const typeTransfertCoffreEnum = pgEnum("type_transfert_coffre_enum", [
  "COFFRE_VERS_CAISSE",
  "CAISSE_VERS_COFFRE",
]);

// ============================================
// EVACUATION DE COFFRE (Vide de Coffre)
// ============================================

export const statutEvacuationCoffreEnum = pgEnum("statut_evacuation_coffre_enum", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PREPARED",
  "IN_TRANSIT",
  "DEPOSITED",
  "RECONCILED",
  "DISCREPANCY",
  "REJECTED",
  "CANCELLED",
]);

export const typeDestinationEvacuationEnum = pgEnum("type_destination_evacuation_enum", [
  "BANQUE",
  "COFFRE_CENTRAL",
  "TRANSPORTEUR",
]);

export const motifEvacuationEnum = pgEnum("motif_evacuation_enum", [
  "EXCEDENT_ENCAISSE",
  "FIN_EXERCICE",
  "SECURITE",
  "FERMETURE_AGENCE",
  "APPROVISIONNEMENT_SIEGE",
  "TRANSFERT_BANCAIRE",
  "AUTRE",
]);

export const actionAuditEvacuationEnum = pgEnum("action_audit_evacuation_enum", [
  "CREATED",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PREPARED",
  "DISPATCHED",
  "DEPOSITED",
  "RECONCILED",
  "DISCREPANCY_FLAGGED",
  "CANCELLED",
]);
