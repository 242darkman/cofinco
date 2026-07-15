/**
 * Period Utils — logique pure du sélecteur de période KPI.
 *
 * Module sans dépendance React : testable unitairement.
 * Les clés de période suivent le format serveur : 'YYYY-MM' (mois) et
 * 'YYYY' (année).
 */

export const MONTH_SHORT_LABELS = [
  'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc',
] as const;

export interface ParsedMonthKey {
  year: number;
  /** 1-12 */
  month: number;
}

/** Parse une clé mensuelle 'YYYY-MM'. Retourne null si invalide. */
export function parseMonthKey(periodKey: string): ParsedMonthKey | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Formate une clé mensuelle 'YYYY-MM'. */
export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Libellé lisible d'une période ('Juillet 2026' / '2026').
 * Tolérant : retourne la clé brute si le format est inattendu.
 */
export function formatPeriodLabel(periodType: 'monthly' | 'yearly', periodKey: string): string {
  if (periodType === 'yearly') return periodKey;
  const parsed = parseMonthKey(periodKey);
  if (!parsed) return periodKey;
  const label = new Date(parsed.year, parsed.month - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface AvailablePeriod {
  periodType: string;
  periodKey: string;
}

/**
 * Ensemble des clés de période disposant d'un snapshot, filtré par type.
 * Alimente les pastilles « données disponibles » du sélecteur.
 */
export function availablePeriodKeys(
  periods: AvailablePeriod[] | undefined,
  periodType: 'monthly' | 'yearly',
): Set<string> {
  const apiType = periodType === 'yearly' ? 'YEAR' : 'MONTH';
  return new Set(
    (periods ?? [])
      .filter((p) => p.periodType === apiType)
      .map((p) => p.periodKey),
  );
}

/**
 * Bornes de navigation du sélecteur : de la plus ancienne période connue
 * (snapshots existants) à l'année courante, avec un plancher de `minSpan`
 * années pour rester utilisable sur une instance neuve.
 */
export function buildYearBounds(
  periods: AvailablePeriod[] | undefined,
  currentYear: number,
  minSpan = 5,
): { minYear: number; maxYear: number } {
  let minYear = currentYear - (minSpan - 1);
  for (const p of periods ?? []) {
    const year = Number(p.periodKey.slice(0, 4));
    if (Number.isFinite(year) && year >= 1970 && year < minYear) {
      minYear = year;
    }
  }
  return { minYear, maxYear: currentYear };
}

/** Liste descendante des années navigables. */
export function buildYearList(minYear: number, maxYear: number): number[] {
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);
  return years;
}

/** true si (year, month) est strictement dans le futur vs maintenant. */
export function isFutureMonth(year: number, month: number, now = new Date()): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year > currentYear || (year === currentYear && month > currentMonth);
}
