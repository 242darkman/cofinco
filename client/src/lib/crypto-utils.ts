/**
 * Cryptographically secure random utilities for the browser.
 * Uses Web Crypto API (crypto.getRandomValues) instead of Math.random().
 */

/**
 * Generate a cryptographically secure random integer in [0, max).
 * Uses rejection sampling to avoid modulo bias.
 */
export function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  const array = new Uint32Array(1);
  const limit = Math.floor(0xFFFFFFFF / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);
  return value % max;
}

/**
 * Generate a cryptographically secure random integer in [min, max).
 */
export function secureRandomIntRange(min: number, max: number): number {
  return min + secureRandomInt(max - min);
}

/**
 * Pick a random character from a string using crypto.getRandomValues.
 */
export function secureRandomChar(chars: string): string {
  return chars.charAt(secureRandomInt(chars.length));
}

/**
 * Generate a random string from a character set.
 */
export function secureRandomString(chars: string, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += secureRandomChar(chars);
  }
  return result;
}

/**
 * Cryptographically secure Fisher-Yates shuffle (in-place).
 */
export function secureShuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate a secure temporary password meeting complexity requirements.
 */
export function generateSecurePassword(minLength: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '@$!%*?&';

  const length = Math.max(minLength, 12);
  const allChars = lowercase + uppercase + numbers + special;

  // Guarantee at least one of each type
  let chars = [
    secureRandomChar(lowercase),
    secureRandomChar(uppercase),
    secureRandomChar(numbers),
    secureRandomChar(special),
  ];

  // Fill remaining with random characters
  while (chars.length < length) {
    chars.push(secureRandomChar(allChars));
  }

  // Secure shuffle
  secureShuffleArray(chars);
  return chars.join('');
}

/**
 * Generate a secure temporary password string (simple format: Temp + random + !1).
 */
export function generateTempPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `Temp${secureRandomString(chars, 8)}!1A`;
}
