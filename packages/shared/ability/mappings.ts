/**
 * Permission Code Mappings — façade (compatibilité).
 *
 * Maps database permission codes ("module.action") to CASL action/subject pairs.
 * Le contenu est modularisé par domaine dans ./mappings/* ; ce fichier assemble
 * les fragments et expose l'API historique. Importer via '@shared/ability'.
 *
 * ⚠️ SOURCE UNIQUE DE VÉRITÉ — NE PAS DUPLIQUER AILLEURS ⚠️
 */

import type { Action } from './actions';
import type { Subject } from './subjects';
import type { PermissionMapping } from './mappings-parts/types';
import { permDivers } from "./mappings-parts/permissions/divers";
import { permGeneral } from "./mappings-parts/permissions/general";
import { permClients } from "./mappings-parts/permissions/clients";
import { permCredits } from "./mappings-parts/permissions/credits";
import { permComptes } from "./mappings-parts/permissions/comptes";
import { permTontines } from "./mappings-parts/permissions/tontines";
import { permCartesPointage } from "./mappings-parts/permissions/cartes-pointage";
import { permCaisse } from "./mappings-parts/permissions/caisse";
import { permRh } from "./mappings-parts/permissions/rh";
import { permCoffre } from "./mappings-parts/permissions/coffre";
import { permComptabilite } from "./mappings-parts/permissions/comptabilite";
import { permRapports } from "./mappings-parts/permissions/rapports";
import { permTerrain } from "./mappings-parts/permissions/terrain";
import { permAdmin } from "./mappings-parts/permissions/admin";
import { permCommunications } from "./mappings-parts/permissions/communications";
import { permTransferts } from "./mappings-parts/permissions/transferts";
import { permKpi } from "./mappings-parts/permissions/kpi";
import { bundleGeneral } from "./mappings-parts/bundles/general";
import { bundleCredits } from "./mappings-parts/bundles/credits";
import { bundleClients } from "./mappings-parts/bundles/clients";
import { bundleComptes } from "./mappings-parts/bundles/comptes";
import { bundleTontines } from "./mappings-parts/bundles/tontines";
import { bundleCartesPointage } from "./mappings-parts/bundles/cartes-pointage";
import { bundleCaisse } from "./mappings-parts/bundles/caisse";
import { bundleCoffre } from "./mappings-parts/bundles/coffre";
import { bundleComptabilite } from "./mappings-parts/bundles/comptabilite";
import { bundleTerrain } from "./mappings-parts/bundles/terrain";
import { bundleTransferts } from "./mappings-parts/bundles/transferts";
import { bundleRh } from "./mappings-parts/bundles/rh";
import { bundleDivers } from "./mappings-parts/bundles/divers";
import { bundleCommunications } from "./mappings-parts/bundles/communications";
import { bundleKpi } from "./mappings-parts/bundles/kpi";

export type { PermissionMapping } from './mappings-parts/types';

/**
 * Master mapping permission → CASL (assemblé depuis les fragments par domaine).
 */
export const PERMISSION_MAPPINGS: Record<string, PermissionMapping> = {
  // Ordre calqué sur l'organisation d'origine (fragments « divers » — modules
  // transverses type paramètres/fidélité — placés en fin, après coffre, afin de
  // préserver le comportement des reverse-lookups sur sujets ambigus).
  ...permGeneral,
  ...permClients,
  ...permCredits,
  ...permComptes,
  ...permTontines,
  ...permCartesPointage,
  ...permCaisse,
  ...permRh,
  ...permCoffre,
  ...permComptabilite,
  ...permRapports,
  ...permTerrain,
  ...permAdmin,
  ...permCommunications,
  ...permTransferts,
  ...permDivers,
  ...permKpi,
};

/**
 * Get CASL mapping for a permission code
 */
export function getPermissionMapping(code: string): PermissionMapping | null {
  return PERMISSION_MAPPINGS[code.toLowerCase()] || null;
}

/**
 * Get permission code from action and subject
 */
export function getPermissionCode(action: Action, subject: Subject): string | null {
  for (const [code, mapping] of Object.entries(PERMISSION_MAPPINGS)) {
    if (mapping.action === action && mapping.subject === subject) {
      return code;
    }
  }
  return null;
}

/**
 * Normalize a permission code to lowercase
 */
export function normalizePermissionCode(code: string): string {
  return code.toLowerCase().trim();
}

/**
 * Parse a permission code into module and action parts
 * Example: "credits.disburse" -> { module: "credits", action: "disburse" }
 */
export function parsePermissionCode(code: string): { module: string; action: string } | null {
  const normalized = normalizePermissionCode(code);
  const parts = normalized.split('.');
  if (parts.length < 2) return null;

  // Handle nested codes like "credits.reevaluations.view"
  const action = parts[parts.length - 1];
  const module = parts.slice(0, -1).join('.');

  return { module, action };
}

/**
 * Get all permission codes for a given subject
 */
export function getPermissionCodesForSubject(subject: Subject): string[] {
  return Object.entries(PERMISSION_MAPPINGS)
    .filter(([_, mapping]) => mapping.subject === subject)
    .map(([code]) => code);
}

/**
 * Get all permission codes for a given action
 */
export function getPermissionCodesForAction(action: Action): string[] {
  return Object.entries(PERMISSION_MAPPINGS)
    .filter(([_, mapping]) => mapping.action === action)
    .map(([code]) => code);
}

/**
 * MODULE_PERMISSION_BUNDLES — bundles par module (assemblés depuis ./mappings/bundles/*).
 * Chaque code DOIT exister dans PERMISSION_MAPPINGS.
 */
export const MODULE_PERMISSION_BUNDLES: Record<string, string[]> = {
  ...bundleGeneral,
  ...bundleCredits,
  ...bundleClients,
  ...bundleComptes,
  ...bundleTontines,
  ...bundleCartesPointage,
  ...bundleCaisse,
  ...bundleCoffre,
  ...bundleComptabilite,
  ...bundleTerrain,
  ...bundleTransferts,
  ...bundleRh,
  ...bundleDivers,
  ...bundleCommunications,
  ...bundleKpi,
};

/**
 * Get all permission codes for a module
 */
export function getModulePermissionBundle(moduleName: string): string[] {
  return MODULE_PERMISSION_BUNDLES[moduleName] || [];
}

/**
 * Get all module names that have permission bundles
 */
export function getAllModulesWithBundles(): string[] {
  return Object.keys(MODULE_PERMISSION_BUNDLES);
}

/**
 * Validate that all bundle codes exist in PERMISSION_MAPPINGS
 * Use in tests or startup to catch configuration errors
 */
export function validateModuleBundles(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [moduleName, codes] of Object.entries(MODULE_PERMISSION_BUNDLES)) {
    for (const code of codes) {
      if (!PERMISSION_MAPPINGS[code]) {
        errors.push(`Module "${moduleName}": code "${code}" not found in PERMISSION_MAPPINGS`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
