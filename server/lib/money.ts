import Decimal from 'decimal.js';
import { getActiveCurrency } from '@shared/config/currency';

// Configure Decimal for financial use: 20 digits of precision, half-up rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Convert string|number|null to Decimal. Default: 0 */
export function D(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

/**
 * Round to the active currency's decimal places, return string for DB.
 * For FCFA/XAF (0 decimals) this rounds to integer.
 * For EUR/USD (2 decimals) this rounds to cents.
 * @deprecated Use roundCurrency() for new code — roundFCFA kept for backward compat.
 */
export function roundFCFA(value: Decimal): string {
  return roundCurrency(value);
}

/** Round to the active currency's decimal places, return string for DB */
export function roundCurrency(value: Decimal): string {
  const decimals = getActiveCurrency().decimals;
  return value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals);
}

/** Round to 2 decimal places (for DB numeric(15,2) compatibility), return string */
export function roundMoney(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Round rate/percentage to 4 decimal places, return string */
export function roundRate(value: Decimal): string {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

/** Check if an amount is effectively zero (absolute value < 0.01) */
export function isEffectivelyZero(value: Decimal): boolean {
  return value.abs().lt(0.01);
}

/** Split a total into N equal parts; last part absorbs the rounding remainder */
export function splitEvenly(total: Decimal, parts: number): Decimal[] {
  const part = total.div(parts).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const remainder = total.minus(part.times(parts));
  const result = Array.from({ length: parts }, () => new Decimal(part));
  result[parts - 1] = result[parts - 1].plus(remainder);
  return result;
}

export { Decimal };
