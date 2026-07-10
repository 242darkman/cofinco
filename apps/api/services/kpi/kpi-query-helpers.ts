/**
 * KPI Query Helpers — shared building blocks for KPI domain queries.
 *
 * - `KpiDb` : exécuteur SQL minimal (db ou transaction Drizzle) pour permettre
 *   au moteur KPI d'exécuter toutes les requêtes dans une même transaction
 *   REPEATABLE READ (vue point-in-time cohérente).
 * - Conversions numériques via Decimal (pas d'arithmétique flottante JS
 *   sur des montants — règle AGENTS.md §9).
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { D, Decimal } from "../../lib/money";

/**
 * Exécuteur SQL minimal accepté par les requêtes KPI.
 * Compatible avec `db` et avec une transaction Drizzle (`tx`).
 */
export type KpiDb = Pick<typeof db, "execute">;

/** Filtre agence sur la colonne `agence_id` d'un alias de table. */
export function agencyFilter(alias: string, agencyId?: string) {
  return agencyId ? sql`AND ${sql.raw(alias)}.agence_id = ${agencyId}` : sql``;
}

/** Filtre agence sur la colonne `owner_id` (coffres-forts). */
export function agencyFilterOwner(alias: string, agencyId?: string) {
  return agencyId ? sql`AND ${sql.raw(alias)}.owner_id = ${agencyId}` : sql``;
}

/**
 * Convertit une valeur SQL (string NUMERIC) en nombre arrondi à 2 décimales
 * via Decimal — aucun arrondi flottant JS.
 */
export function toNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  try {
    return D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
}

/**
 * Ratio en pourcentage (numérateur / dénominateur × 100), 2 décimales,
 * calculé en Decimal. Retourne 0 si le dénominateur est nul.
 */
export function ratioPercent(
  numerator: string | number | null | undefined,
  denominator: string | number | null | undefined,
): number {
  const den = D(denominator ?? 0);
  if (den.isZero()) return 0;
  return D(numerator ?? 0)
    .div(den)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Division simple à 2 décimales en Decimal. Retourne 0 si dénominateur nul. */
export function safeDiv(
  numerator: string | number | null | undefined,
  denominator: string | number | null | undefined,
): number {
  const den = D(denominator ?? 0);
  if (den.isZero()) return 0;
  return D(numerator ?? 0)
    .div(den)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Somme Decimal de valeurs hétérogènes, résultat à 2 décimales. */
export function sumNum(...values: Array<string | number | null | undefined>): number {
  let acc = D(0);
  for (const v of values) acc = acc.plus(D(v ?? 0));
  return acc.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** Différence a - b en Decimal, 2 décimales. */
export function subNum(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  return D(a ?? 0).minus(D(b ?? 0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
