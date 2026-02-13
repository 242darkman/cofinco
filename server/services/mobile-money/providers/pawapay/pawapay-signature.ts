/**
 * pawaPay Webhook Signature Verification
 *
 * pawaPay signe ses callbacks en utilisant:
 * 1. Content-Digest: SHA-256 hash du body (RFC 3230)
 * 2. Signature: RSA-PSS-SHA512 signature (RFC 9421)
 *
 * Flux de vérification:
 * 1. Vérifier que le Content-Digest matche le hash du body
 * 2. Reconstruire le message de signature à partir du Signature-Input
 * 3. Vérifier la signature RSA avec la clé publique pawaPay
 */

import * as crypto from "crypto";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger('PawaPaySignature');

/**
 * Vérifie la signature d'un callback pawaPay
 *
 * @param body - Le body brut du webhook (string)
 * @param headers - Les headers HTTP du webhook
 * @param publicKeys - Les clés publiques PEM de pawaPay
 * @returns true si la signature est valide
 */
export function verifyPawaPaySignature(
  body: string,
  headers: Record<string, string>,
  publicKeys: string[]
): boolean {
  try {
    // 1. Vérifier Content-Digest
    const contentDigest = headers["content-digest"] || headers["Content-Digest"];
    if (!contentDigest) {
      logger.warn("Missing Content-Digest header");
      return false;
    }

    if (!verifyContentDigest(body, contentDigest)) {
      logger.warn("Content-Digest mismatch");
      return false;
    }

    // 2. Vérifier la signature
    const signature = headers["signature"] || headers["Signature"];
    const signatureInput = headers["signature-input"] || headers["Signature-Input"];

    if (!signature || !signatureInput) {
      logger.warn("Missing Signature or Signature-Input header");
      return false;
    }

    // Si pas de clé publique configurée, on ne peut pas vérifier la signature
    // mais le Content-Digest est déjà vérifié
    if (publicKeys.length === 0) {
      logger.warn("No public keys configured, skipping RSA signature verification (Content-Digest OK)");
      return true;
    }

    // 3. Construire le message de signature et vérifier
    const sigMessage = buildSignatureBase(headers, signatureInput);
    if (!sigMessage) {
      logger.warn("Could not build signature base");
      return false;
    }

    // Extraire la signature brute (format: sig1=:base64:)
    const sigValue = extractSignatureValue(signature);
    if (!sigValue) {
      logger.warn("Could not extract signature value");
      return false;
    }

    // Essayer chaque clé publique (rotation de clés)
    for (const pubKey of publicKeys) {
      try {
        const verifier = crypto.createVerify("RSA-SHA512");
        verifier.update(sigMessage);
        const isValid = verifier.verify(
          { key: pubKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
          Buffer.from(sigValue, "base64")
        );
        if (isValid) return true;
      } catch {
        // Essayer la clé suivante
        continue;
      }
    }

    logger.warn("Signature verification failed with all public keys");
    return false;
  } catch (error) {
    logger.error({ err: error }, "Signature verification error");
    return false;
  }
}

/**
 * Vérifie le Content-Digest header
 * Format attendu: sha-256=:base64hash:
 */
function verifyContentDigest(body: string, contentDigest: string): boolean {
  // Parse le format "sha-256=:base64hash:" ou "sha-512=:base64hash:"
  const match = contentDigest.match(/^(sha-256|sha-512)=:([A-Za-z0-9+/=]+):$/);
  if (!match) {
    // Format alternatif: "SHA-256=base64hash"
    const altMatch = contentDigest.match(/^(SHA-256|SHA-512)=(.+)$/);
    if (!altMatch) return false;

    const algo = altMatch[1] === "SHA-256" ? "sha256" : "sha512";
    const expected = altMatch[2];
    const actual = crypto.createHash(algo).update(body).digest("base64");
    return actual === expected;
  }

  const algo = match[1] === "sha-256" ? "sha256" : "sha512";
  const expected = match[2];
  const actual = crypto.createHash(algo).update(body).digest("base64");
  return actual === expected;
}

/**
 * Construit le message de signature selon RFC 9421
 * Le Signature-Input définit les composants à inclure dans le message
 */
function buildSignatureBase(
  headers: Record<string, string>,
  signatureInput: string
): string | null {
  try {
    // Parse signature-input, format: sig1=("content-digest" "content-type" ...);created=...;keyid=...
    const inputMatch = signatureInput.match(/^sig1=\(([^)]*)\);?(.*)$/);
    if (!inputMatch) return null;

    const components = inputMatch[1].split(/\s+/).map(c => c.replace(/"/g, ""));
    const params = inputMatch[2] || "";

    // Construire le message de signature
    const lines: string[] = [];
    for (const component of components) {
      if (!component) continue;
      const headerValue = headers[component] || headers[component.toLowerCase()] || "";
      lines.push(`"${component}": ${headerValue}`);
    }

    // Ajouter les paramètres de signature
    lines.push(`"@signature-params": (${components.map(c => `"${c}"`).join(" ")});${params}`);

    return lines.join("\n");
  } catch (error) {
    logger.error({ err: error }, "Error building signature base");
    return null;
  }
}

/**
 * Extrait la valeur de signature du header Signature
 * Format: sig1=:base64value:
 */
function extractSignatureValue(signature: string): string | null {
  const match = signature.match(/^sig1=:([A-Za-z0-9+/=]+):$/);
  if (match) return match[1];

  // Format alternatif sans les colons
  const altMatch = signature.match(/^sig1=([A-Za-z0-9+/=]+)$/);
  if (altMatch) return altMatch[1];

  return null;
}

/**
 * Génère un Content-Digest pour les requêtes sortantes (optionnel)
 */
export function generateContentDigest(body: string): string {
  const hash = crypto.createHash("sha256").update(body).digest("base64");
  return `sha-256=:${hash}:`;
}

export default {
  verifyPawaPaySignature,
  generateContentDigest,
};
