/**
 * Enums Drizzle — domaine « epargne ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// PLAN EPARGNE
// ============================================

export const statutPlanEpargneEnum = pgEnum("statut_plan_epargne_enum", [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

// ============================================
// OBJECTIF EPARGNE
// ============================================

export const statutObjectifEpargneEnum = pgEnum("statut_objectif_epargne_enum", [
  "IN_PROGRESS",
  "ACHIEVED",
  "ABANDONED",
]);
