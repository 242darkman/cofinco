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
const SALT = new TextEncoder().encode('microflex-offline-v1');

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

// ========== ECDSA P-256 DEVICE KEY MANAGEMENT ==========

/**
 * ECDSA P-256 key pair management for offline journal signing.
 *
 * Each device/agent pair generates a non-extractable private key stored
 * in the browser's CryptoKey store (via IndexedDB). The public key is
 * exported as JWK and registered with the server.
 *
 * This provides:
 * - Non-repudiation: only this device could have signed the entry
 * - Tamper detection: modified entries fail signature verification
 * - Key rotation: 90-day rotation with graceful fallback
 */

const ECDSA_PARAMS: EcKeyGenParams = {
  name: 'ECDSA',
  namedCurve: 'P-256',
};

const ECDSA_SIGN_PARAMS: EcdsaParams = {
  name: 'ECDSA',
  hash: 'SHA-256',
};

let activeSigningKey: CryptoKey | null = null;
let activeKeyId: string | null = null;

/**
 * Generate a new ECDSA P-256 key pair.
 * The private key is non-extractable (cannot be read from JS).
 * Returns the public key as JWK and a CryptoKeyPair for signing.
 */
export async function generateDeviceKeyPair(): Promise<{
  keyId: string;
  publicKeyJwk: JsonWebKey;
  keyPair: CryptoKeyPair;
}> {
  const keyPair = await crypto.subtle.generateKey(
    ECDSA_PARAMS,
    false, // Private key NOT extractable
    ['sign', 'verify']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  // Key ID = SHA-256 fingerprint of the public key JWK
  const keyId = await computeSha256(JSON.stringify(publicKeyJwk));

  return { keyId, publicKeyJwk, keyPair };
}

/**
 * Set the active signing key (loaded from IndexedDB on app start).
 */
export function setActiveSigningKey(privateKey: CryptoKey, keyId: string): void {
  activeSigningKey = privateKey;
  activeKeyId = keyId;
}

/**
 * Get the current active key ID.
 */
export function getActiveKeyId(): string | null {
  return activeKeyId;
}

/**
 * Clear the active signing key (on logout or key rotation).
 */
export function clearSigningKey(): void {
  activeSigningKey = null;
  activeKeyId = null;
}

/**
 * Check if a signing key is available.
 */
export function hasSigningKey(): boolean {
  return activeSigningKey !== null;
}

/**
 * Sign a message (hash string) using the active ECDSA private key.
 * Returns a base64-encoded signature.
 */
export async function signData(data: string): Promise<string> {
  if (!activeSigningKey) {
    throw new Error('No active signing key. Device key not initialized.');
  }

  const encoded = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign(
    ECDSA_SIGN_PARAMS,
    activeSigningKey,
    encoded
  );

  return arrayBufferToBase64(signature);
}

/**
 * Verify an ECDSA signature against a public key (JWK).
 * Used for local chain verification and server-side validation.
 */
export async function verifySignature(
  data: string,
  signatureBase64: string,
  publicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      ECDSA_PARAMS,
      false,
      ['verify']
    );

    const encoded = new TextEncoder().encode(data);
    const signature = base64ToArrayBuffer(signatureBase64);

    return await crypto.subtle.verify(
      ECDSA_SIGN_PARAMS,
      publicKey,
      signature,
      encoded
    );
  } catch {
    return false;
  }
}

// NOTE : l'ancienne vérification HMAC des limites offline a été supprimée.
// Un secret HMAC partagé ne peut pas être embarqué dans un bundle public
// (forgeable), et la clé n'était de toute façon jamais initialisée : toutes
// les mises à jour de limites étaient rejetées. L'application réelle des
// plafonds est désormais faite côté serveur au rejeu du journal
// (apps/api/routes/sync-journal/journal.ts).

// ========== HASHING UTILITIES ==========

/**
 * Compute SHA-256 hash of a string. Returns hex-encoded hash.
 */
export async function computeSha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ========== BINARY CONVERSION UTILITIES ==========

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
