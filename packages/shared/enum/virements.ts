/**
 * Enums Drizzle — domaine « virements ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// VERSEMENT AUTOMATIQUE
// ============================================

export const statutVersementAutoEnum = pgEnum("statut_versement_auto_enum", [
  "PENDING",
  "SUCCESS",
  "FAILED",
]);

// ============================================
// DECAISSEMENT PROGRAMME
// ============================================

export const statutDecaissementProgEnum = pgEnum("statut_decaissement_prog_enum", [
  "PENDING",
  "SUCCESS",
  "FAILED",
]);

// ============================================
// FREQUENCE VIREMENT PROGRAMME
// ============================================

export const frequenceVirementEnum = pgEnum("frequence_virement_enum", [
  "ONCE",
  "DAILY",
  "WEEKLY",
  "BI_MONTHLY",
  "MONTHLY",
  "QUARTERLY",
]);

// ============================================
// STATUT AUDIT VIREMENT
// ============================================

export const statutAuditVirementEnum = pgEnum("statut_audit_virement_enum", [
  "SUCCESS",
  "FAILED",
]);

// ============================================
// STATUT EXECUTION VIREMENT PROGRAMME
// ============================================

export const statutRunVirementEnum = pgEnum("statut_run_virement_enum", [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "SKIPPED",  // Deja execute (idempotence)
]);
