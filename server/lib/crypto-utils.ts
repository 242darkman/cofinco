import crypto from 'crypto';

/**
 * Cryptographically secure random utilities for the server.
 * Replaces all Math.random() usage for ID/reference/token generation.
 */

/**
 * Generate a cryptographically secure random integer in [min, max).
 */
export function secureRandomInt(min: number, max: number): number {
  return crypto.randomInt(min, max);
}

/**
 * Pick a random character from a string using crypto.randomInt.
 */
export function secureRandomChar(chars: string): string {
  return chars.charAt(crypto.randomInt(0, chars.length));
}

/**
 * Generate a random alphanumeric string of given length (A-Z0-9).
 */
export function secureRandomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return result;
}

/**
 * Generate a random hex string of given byte length (output is 2x bytes in hex chars).
 */
export function secureRandomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a reference string with prefix, date, and random suffix.
 * Format: PREFIX-YYYYMMDD-RANDOM
 */
export function secureReference(prefix: string, randomLength: number = 6): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = secureRandomAlphanumeric(randomLength);
  return `${prefix}-${y}${m}${d}-${random}`;
}

/**
 * Generate a numeric-only random string of given length, zero-padded.
 */
export function secureRandomDigits(length: number): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
}

/**
 * Securely select a random element from an array.
 */
export function secureRandomPick<T>(array: T[]): T {
  if (array.length === 0) throw new Error('Cannot pick from empty array');
  return array[crypto.randomInt(0, array.length)];
}
