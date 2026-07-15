import crypto from "node:crypto";

/**
 * Sign offline limits using server HMAC key.
 */
export function signLimits(limits: Record<string, unknown>): string {
  const hmacKey = process.env.OFFLINE_LIMITS_HMAC_KEY || 'microflex-offline-limits-v1';
  const data = JSON.stringify(limits);
  return crypto
    .createHmac('sha256', hmacKey)
    .update(data)
    .digest('base64');
}

/**
 * Compute SHA-256 hash of a journal entry (server-side).
 */
export function computeEntryHash(
  sequence: number,
  uuid: string,
  type: string,
  payloadHash: string,
  previousHash: string,
  localTimestamp: number
): string {
  const preimage = `${sequence}|${uuid}|${type}|${payloadHash}|${previousHash}|${localTimestamp}`;
  return crypto.createHash('sha256').update(preimage).digest('hex');
}

/**
 * Verify an ECDSA P-256 signature using Node.js crypto.
 */
export async function verifyEcdsaSignature(
  data: string,
  signatureBase64: string,
  publicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    const publicKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );

    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    const dataBuffer = new TextEncoder().encode(data);

    return await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      publicKey,
      signatureBuffer,
      dataBuffer
    );
  } catch (error) {
    return false;
  }
}
