/**
 * Offline Data Encryption Module
 *
 * Uses the Web Crypto API (SubtleCrypto) to encrypt sensitive
 * data stored in IndexedDB. The encryption key is derived from
 * the user's session ID using PBKDF2, so:
 *
 * - Data is only decryptable while the user is logged in
 * - Different users cannot read each other's offline data
 * - On logout, the key material is wiped
 *
 * Encrypts: client financial data (balances, amounts, IDs)
 * Does NOT encrypt: operation queue metadata, sync cursors
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT = new TextEncoder().encode('cofinco-offline-v1');

let cachedKey: CryptoKey | null = null;

/**
 * Derive an encryption key from a user-specific secret (session ID or user ID).
 * The key is cached in memory for the duration of the session.
 */
export async function initEncryptionKey(userSecret: string): Promise<void> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userSecret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Clear the encryption key from memory (call on logout).
 */
export function clearEncryptionKey(): void {
  cachedKey = null;
}

/**
 * Check if an encryption key is available.
 */
export function hasEncryptionKey(): boolean {
  return cachedKey !== null;
}

/**
 * Encrypt a string value. Returns a base64-encoded string containing IV + ciphertext.
 * Returns the original value if no key is available (graceful degradation).
 */
export async function encryptValue(plaintext: string): Promise<string> {
  if (!cachedKey) return plaintext;

  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      cachedKey,
      encoded
    );

    // Combine IV + ciphertext into a single buffer
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Prefix with 'enc:' to identify encrypted values
    return 'enc:' + btoa(String.fromCharCode(...combined));
  } catch {
    // Fallback: return plaintext if encryption fails
    return plaintext;
  }
}

/**
 * Decrypt a value. Handles both encrypted ('enc:' prefix) and plaintext values.
 */
export async function decryptValue(stored: string): Promise<string> {
  if (!stored.startsWith('enc:')) return stored;
  if (!cachedKey) return stored; // Can't decrypt without key

  try {
    const data = Uint8Array.from(atob(stored.slice(4)), c => c.charCodeAt(0));

    const iv = data.slice(0, IV_LENGTH);
    const ciphertext = data.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      cachedKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // Decryption failed (wrong key, corrupted data, etc.)
    return stored;
  }
}

/**
 * Encrypt a JSON-serializable object's sensitive fields.
 * Only encrypts specified field names, leaving the rest as plaintext.
 */
export async function encryptFields<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: string[]
): Promise<T> {
  if (!cachedKey) return obj;

  const result = { ...obj };
  for (const field of sensitiveFields) {
    if (field in result && result[field] != null) {
      const value = typeof result[field] === 'string'
        ? result[field]
        : JSON.stringify(result[field]);
      (result as any)[field] = await encryptValue(value);
    }
  }
  return result;
}

/**
 * Decrypt an object's sensitive fields.
 */
export async function decryptFields<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: string[]
): Promise<T> {
  if (!cachedKey) return obj;

  const result = { ...obj };
  for (const field of sensitiveFields) {
    if (field in result && typeof result[field] === 'string') {
      (result as any)[field] = await decryptValue(result[field]);
    }
  }
  return result;
}

/**
 * Sensitive field definitions per entity type.
 * Only these fields will be encrypted in IndexedDB.
 */
export const SENSITIVE_FIELDS: Record<string, string[]> = {
  clients: ['data'], // The full client JSON blob
  operations: ['payload'], // Operation payloads contain financial data
  sessions: ['data'], // Session data may contain auth info
};
