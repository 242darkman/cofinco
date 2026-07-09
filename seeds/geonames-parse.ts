import { villesReference } from "@shared/schema";

/** Nombre minimal de colonnes d'une ligne GeoNames (table "geoname", TSV). */
export const GEONAMES_MIN_FIELDS = 18;

/** Borne de la colonne `population` (integer PostgreSQL signé 32 bits). */
const MAX_INT32 = 2147483647;

/**
 * Mappe une ligne GeoNames (allCountries / cities5000, déjà splittée par
 * tabulation) vers une insertion `villes_reference`, ou `null` si la ligne doit
 * être ignorée : colonnes insuffisantes, hors « populated place » (feature
 * class ≠ P) ou geonameId non numérique.
 *
 * Fonction PURE (aucun accès base) → testable unitairement. Le module n'importe
 * que la définition de table (pas `db`), ce qui évite l'échec d'import sans
 * DATABASE_URL dans les tests unitaires.
 *
 * Colonnes utilisées : [0] geonameId · [1] name · [2] asciiname · [4] lat ·
 * [5] lng · [6] feature class · [7] feature code · [8] country code (ISO2) ·
 * [10] admin1 · [14] population · [17] timezone.
 */
export function mapCityLine(
  f: string[],
  paysByIso2: Map<string, string>,
): typeof villesReference.$inferInsert | null {
  if (f.length < GEONAMES_MIN_FIELDS) return null;
  if (f[6] !== "P") return null; // populated places uniquement
  const geonameId = parseInt(f[0], 10);
  if (Number.isNaN(geonameId)) return null;

  const countryCode = f[8] || null;
  return {
    geonameId,
    nom: f[1] || "inconnu",
    nomAscii: f[2] || f[1] || null,
    paysId: countryCode ? paysByIso2.get(countryCode) ?? null : null,
    countryCode,
    admin1Code: f[10] || null,
    population: Math.min(parseInt(f[14], 10) || 0, MAX_INT32),
    featureCode: f[7] || null,
    latitude: f[4] || null,
    longitude: f[5] || null,
    timezone: f[17] || null,
  };
}
