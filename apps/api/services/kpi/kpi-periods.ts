/**
 * KPI Periods — helpers purs de périodes et de deltas.
 *
 * Module sans dépendance base de données : testable unitairement.
 * Les deltas sont calculés en Decimal (règle AGENTS.md §9 : pas
 * d'arithmétique flottante JS sur des montants).
 */
import { D, Decimal } from "../../lib/money";
import type { KpiDelta, KpiPeriodType } from "@shared/schema/kpi";

export function parsePeriodRange(periodType: KpiPeriodType, periodKey: string): { start: Date; end: Date } {
  if (periodType === 'MONTH') {
    // periodKey = '2026-02'
    const [year, month] = periodKey.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // First day of next month
    return { start, end };
  }
  // YEAR — periodKey = '2026'
  const year = Number(periodKey);
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
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

/** Clés de la période courante (mois + année) au moment de l'appel. */
export function currentPeriodKeys(now = new Date()): { monthKey: string; yearKey: string } {
  return {
    monthKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    yearKey: String(now.getFullYear()),
  };
}
