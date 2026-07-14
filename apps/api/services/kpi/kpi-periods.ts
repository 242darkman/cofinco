/**
 * KPI Periods — helpers purs de périodes et de deltas.
 *
 * Module sans dépendance base de données : testable unitairement.
 *
 * Timezone : les bornes de période sont calculées dans la timezone MÉTIER
 * (par défaut Africa/Brazzaville, comme les crons), pas dans celle du
 * serveur. Un serveur en UTC ne décale donc plus les opérations de fin de
 * mois dans la mauvaise période. Surchargeable via KPI_TIMEZONE.
 *
 * Les deltas sont calculés en Decimal (règle AGENTS.md §9 : pas
 * d'arithmétique flottante JS sur des montants).
 */
import { createLogger } from "../../lib/logger";
import { D, Decimal } from "../../lib/money";
import type { KpiDelta, KpiPeriodType } from "@shared/schema/kpi";

const logger = createLogger('KpiPeriods');

// =====================
// Timezone métier
// =====================

const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Brazzaville';

let warnedInvalidTz = false;

/**
 * Timezone métier des périodes KPI.
 * KPI_TIMEZONE si valide, sinon repli sûr sur Africa/Brazzaville.
 */
export function resolveBusinessTimeZone(): string {
  const tz = process.env.KPI_TIMEZONE;
  if (!tz) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    // Valide l'identifiant IANA (lève RangeError si invalide)
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    if (!warnedInvalidTz) {
      warnedInvalidTz = true;
      logger.warn({ tz }, `KPI_TIMEZONE invalide — repli sur ${DEFAULT_BUSINESS_TIMEZONE}`);
    }
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

/** Décalage (ms) entre la timezone donnée et UTC à l'instant donné. */
function zoneOffsetMs(timeZone: string, utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUtc - utcDate.getTime();
}

/**
 * Instant UTC correspondant à minuit le 1er du mois donné dans la timezone
 * donnée. `monthIndex` peut déborder (12 = janvier suivant), Date.UTC gère.
 */
function zonedMonthStart(year: number, monthIndex: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, monthIndex, 1));
  const offset = zoneOffsetMs(timeZone, guess);
  let result = new Date(guess.getTime() - offset);
  // Second passage pour les zones à décalage variable (DST) en bord de bascule
  const offset2 = zoneOffsetMs(timeZone, result);
  if (offset2 !== offset) result = new Date(guess.getTime() - offset2);
  return result;
}

// =====================
// Period helpers
// =====================

export function parsePeriodRange(
  periodType: KpiPeriodType,
  periodKey: string,
  timeZone: string = resolveBusinessTimeZone(),
): { start: Date; end: Date } {
  if (periodType === 'MONTH') {
    // periodKey = '2026-02'
    const [year, month] = periodKey.split('-').map(Number);
    return {
      start: zonedMonthStart(year, month - 1, timeZone),
      end: zonedMonthStart(year, month, timeZone), // 1er du mois suivant
    };
  }
  // YEAR — periodKey = '2026'
  const year = Number(periodKey);
  return {
    start: zonedMonthStart(year, 0, timeZone),
    end: zonedMonthStart(year + 1, 0, timeZone),
  };
}

export function getPreviousPeriodKey(periodType: KpiPeriodType, periodKey: string): string {
  if (periodType === 'MONTH') {
    const [year, month] = periodKey.split('-').map(Number);
    if (month === 1) return `${year - 1}-12`;
    return `${year}-${String(month - 1).padStart(2, '0')}`;
  }
  return String(Number(periodKey) - 1);
}

/**
 * Clés de période (mois + année) de l'instant donné, vues depuis la
 * timezone métier. Ex. : le 30/06 à 23h30 UTC est déjà le 01/07 à Brazzaville.
 */
export function currentPeriodKeys(
  now = new Date(),
  timeZone: string = resolveBusinessTimeZone(),
): { monthKey: string; yearKey: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit',
  }).formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    monthKey: `${parts.year}-${parts.month}`,
    yearKey: parts.year,
  };
}

// =====================
// Delta computation (Decimal — pas de flottants JS)
// =====================

/** Delta valeur + pourcentage entre deux périodes, calculé en Decimal. */
export function computeDelta(current: number, previous: number): KpiDelta {
  const diff = D(current).minus(D(previous));
  const prev = D(previous);
  return {
    value: diff.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    percent: prev.isZero()
      ? 0
      : diff.div(prev.abs()).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
  };
}
