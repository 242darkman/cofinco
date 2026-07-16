/**
 * Enums Drizzle — domaine « scoring ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// SCORING EVENTS
// ============================================

export const scoreEventTypeEnum = pgEnum("score_event_type_enum", [
  // Positive events
  "EPARGNE_DEPOT",
  "CREDIT_REMBOURSEMENT",
  "CREDIT_SOLDE",
  "TONTINE_CONTRIBUTION",
  "KYC_VERIFIED",
  "PROFILE_COMPLETED",
  // Negative events
  "INCIDENT_RETARD",
  "INCIDENT_DEFAUT",
  "TONTINE_PENALITE",
  "COMPTE_BLOQUE",
  // Manual adjustments
  "BONUS_MANUEL",
  "MALUS_MANUEL",
  // Lifecycle
  "INITIAL_SCORE",
  "RECALCUL_COMPLET",
]);
