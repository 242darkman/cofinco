/**
 * Phone number normalization for Congo-Brazzaville (+242)
 *
 * National format: 06XXXXXXX (9 digits) → +24206XXXXXXX
 * International:   +24206XXXXXXX       → unchanged
 */

const COUNTRY_CODE = '242';

/**
 * Normalise un numéro de téléphone au format international Congo (+242...).
 *
 * - "061112233"      → "+242061112233"
 * - "+242061112233"  → "+242061112233"  (inchangé)
 * - "00242061112233" → "+242061112233"
 * - "242061112233"   → "+242061112233"
 * - Espaces/tirets/parenthèses sont retirés.
 *
 * Retourne null si l'entrée est vide.
 * Retourne la valeur nettoyée si le format n'est pas reconnu (numéros étrangers).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;

  // Strip whitespace, dashes, dots, parentheses
  let cleaned = phone.replace(/[\s\-().]/g, '');

  // Already international +242...
  if (cleaned.startsWith(`+${COUNTRY_CODE}`)) return cleaned;

  // 00242... → +242...
  if (cleaned.startsWith(`00${COUNTRY_CODE}`)) {
    return '+' + cleaned.substring(2);
  }

  // 242... without + (at least 12 digits: 242 + 9 digits)
  if (cleaned.startsWith(COUNTRY_CODE) && cleaned.length >= 12) {
    return '+' + cleaned;
  }

  // National format: 0[456]XXXXXXX (9 digits)
  if (/^0[456]\d{7}$/.test(cleaned)) {
    return `+${COUNTRY_CODE}${cleaned}`;
  }

  // 8 digits without leading 0: [456]XXXXXXX
  if (/^[456]\d{7}$/.test(cleaned)) {
    return `+${COUNTRY_CODE}0${cleaned}`;
  }

  // Unrecognized format — return trimmed original (foreign numbers, etc.)
  return phone.trim();
}

/**
 * Converts to MSISDN format (digits only, no +) for Mobile Money APIs.
 * "061112233" → "242061112233"
 */
export function toMsisdn(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return normalized.replace(/^\+/, '');
}
