/**
 * Types Treasury — Encaisse Canonique
 *
 * Types partagés entre client et serveur pour l'API Treasury v2.
 * L'encaisse est TOUJOURS calculée depuis le Grand Livre (GL).
 */

import { z } from "zod";

// ============================================================================
// ENCAISSE BREAKDOWN
// ============================================================================

export const encaisseBreakdownSchema = z.object({
  caisseGuichet: z.number(), // Comptes 521xxx
  coffreCentral: z.number(), // Comptes 531xxx
  mobileMoney: z.number(), // Comptes 573xxx
  banque: z.number(), // Comptes 512xxx
  fondsEnTransit: z.number(), // Comptes 581xxx (informatif)
  reservesBloques: z.number(), // Fonds bloqués (si applicable)
});

export type EncaisseBreakdown = z.infer<typeof encaisseBreakdownSchema>;

// ============================================================================
// ENCAISSE META
// ============================================================================

export const encaisseMetaSchema = z.object({
  computedAt: z.string(), // ISO timestamp
  source: z.literal("GL"), // Toujours 'GL'
  agenceId: z.string().nullable(),
  lastEcritureId: z.string().optional(),
  lastPostingAt: z.string().optional(),
});

export type EncaisseMeta = z.infer<typeof encaisseMetaSchema>;

// ============================================================================
// RECONCILIATION STATUS
// ============================================================================

export const reconciliationStatusValues = ["OK", "MINOR", "MAJOR", "CRITICAL"] as const;
export type ReconciliationStatusValue = (typeof reconciliationStatusValues)[number];

export const reconciliationStatusSchema = z.object({
  operationalTotal: z.number(), // Depuis caches opérationnels
  glTotal: z.number(), // Depuis GL
  ecart: z.number(), // Différence (operational - GL)
  status: z.enum(reconciliationStatusValues),
  details: z
    .object({
      coffresOperational: z.number(),
      caissesOperational: z.number(),
      coffresGL: z.number(),
      caissesGL: z.number(),
    })
    .optional(),
});

export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;

// ============================================================================
// ENCAISSE CANONIQUE (Réponse principale)
// ============================================================================

export const encaisseCanonictSchema = z.object({
  totalDisponible: z.number(),
  breakdown: encaisseBreakdownSchema,
  meta: encaisseMetaSchema,
  reconciliation: reconciliationStatusSchema.optional(),
});

export type EncaisseCanonique = z.infer<typeof encaisseCanonictSchema>;

// ============================================================================
// BREAKDOWN DETAILED (Réponse détaillée par compte)
// ============================================================================

export const encaisseBreakdownDetailedSchema = z.object({
  accounts: z.array(
    z.object({
      numeroCompte: z.string(),
      intitule: z.string(),
      solde: z.number(),
      categorie: z.string(),
    })
  ),
  totals: z.record(z.string(), z.number()),
  grandTotal: z.number(),
  meta: z.object({
    computedAt: z.string(),
    agenceId: z.string().nullable(),
  }),
});

export type EncaisseBreakdownDetailed = z.infer<typeof encaisseBreakdownDetailedSchema>;

// ============================================================================
// COMPTES GL DE LIQUIDITE (Plan OHADA)
// ============================================================================

/**
 * Préfixes de comptes GL de liquidité (classe 5 OHADA)
 * Utilisés pour calculer l'encaisse disponible
 */
export const GL_LIQUIDITY_PREFIXES = {
  /** Caisse centrale et guichets */
  CAISSE_GUICHET: ["521"],
  /** Coffres-forts */
  COFFRE_CENTRAL: ["531"],
  /** Mobile Money (MTN, Airtel) */
  MOBILE_MONEY: ["573"],
  /** Comptes bancaires */
  BANQUE: ["512"],
  /** Virements internes (informatif uniquement) */
  TRANSIT: ["581"],
} as const;

/**
 * Labels français pour les catégories de liquidité
 */
export const LIQUIDITY_CATEGORY_LABELS: Record<string, string> = {
  CAISSE_GUICHET: "Caisse Guichet",
  COFFRE_CENTRAL: "Coffre-Fort",
  MOBILE_MONEY: "Mobile Money",
  BANQUE: "Banque",
  TRANSIT: "Fonds en Transit",
};

// ============================================================================
// SEUILS DE RECONCILIATION
// ============================================================================

/**
 * Seuils de réconciliation en FCFA
 */
export const RECONCILIATION_THRESHOLDS = {
  /** Écart < 500 FCFA = OK */
  OK: 500,
  /** Écart < 50k FCFA = MINOR */
  MINOR: 50_000,
  /** Écart < 500k FCFA = MAJOR */
  MAJOR: 500_000,
  /** Écart >= 500k FCFA = CRITICAL */
};

/**
 * Détermine le statut de réconciliation basé sur l'écart
 */
export function getReconciliationStatus(ecart: number): ReconciliationStatusValue {
  const absEcart = Math.abs(ecart);
  if (absEcart >= RECONCILIATION_THRESHOLDS.MAJOR) return "CRITICAL";
  if (absEcart >= RECONCILIATION_THRESHOLDS.MINOR) return "MAJOR";
  if (absEcart >= RECONCILIATION_THRESHOLDS.OK) return "MINOR";
  return "OK";
}
