/**
 * pawaPay Configuration
 * Configuration centralisée pour l'agrégateur pawaPay
 *
 * Supports sandbox et production via PAWAPAY_ENVIRONMENT
 */

import { createLogger } from "../../../../lib/logger";

const logger = createLogger('PawaPayConfig');

export interface PawaPayProviderConfig {
  environment: "sandbox" | "production";
  baseUrl: string;
  apiToken: string;
  callbackUrl: string;
  webhookPublicKeys: string[]; // PEM-encoded RSA public keys for signature verification
  statementPrefix: string;
  currency: string;
  country: string; // ISO 3166-1 alpha-3
  requestTimeout: number; // ms
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Correspondants pawaPay pour le Congo-Brazzaville
 */
export const PAWAPAY_CORRESPONDENTS = {
  MTN: "MTN_MOMO_COG",
  AIRTEL: "AIRTEL_COG",
} as const;

export type PawaPayCorrespondent = typeof PAWAPAY_CORRESPONDENTS[keyof typeof PAWAPAY_CORRESPONDENTS];

/**
 * Résout le correspondant pawaPay à partir de l'opérateur
 */
export function operatorToCorrespondent(operator: "MTN" | "AIRTEL"): PawaPayCorrespondent {
  return PAWAPAY_CORRESPONDENTS[operator];
}

/**
 * Résout l'opérateur à partir du correspondant pawaPay
 */
export function correspondentToOperator(correspondent: string): "MTN" | "AIRTEL" {
  if (correspondent.startsWith("MTN")) return "MTN";
  if (correspondent.startsWith("AIRTEL")) return "AIRTEL";
  // Fallback: essayer de matcher par inclusion
  const upper = correspondent.toUpperCase();
  if (upper.includes("MTN") || upper.includes("MOMO")) return "MTN";
  return "AIRTEL";
}

/**
 * Résout l'opérateur à partir du préfixe téléphonique (Congo-Brazzaville)
 *
 * Préfixes Congo:
 *   MTN:    05, 06
 *   Airtel: 04
 */
export function resolveOperatorFromPhone(phone: string): "MTN" | "AIRTEL" | null {
  // Nettoyer: garder uniquement les chiffres
  const digits = phone.replace(/[^\d]/g, "");

  // Extraire les 2 chiffres significatifs après le code pays
  let localDigits: string;
  if (digits.startsWith("242")) {
    localDigits = digits.substring(3);
  } else if (digits.startsWith("0")) {
    localDigits = digits.substring(1);
  } else {
    localDigits = digits;
  }

  const prefix = localDigits.substring(0, 1);

  // 05x, 06x → MTN
  if (prefix === "5" || prefix === "6") return "MTN";
  // 04x → Airtel
  if (prefix === "4") return "AIRTEL";

  return null;
}

/**
 * IPs de callback pawaPay (pour whitelist)
 */
export const PAWAPAY_CALLBACK_IPS = {
  sandbox: [
    "3.64.89.224/32",
  ],
  production: [
    "18.157.182.137/32",
    "18.195.251.156/32",
    "3.71.1.156/32",
    "3.74.198.254/32",
    "52.59.106.49/32",
    "3.126.133.28/32",
  ],
} as const;

/**
 * Charge la configuration pawaPay depuis les variables d'environnement
 */
export function loadPawaPayConfig(): PawaPayProviderConfig {
  const environment = (process.env.PAWAPAY_ENVIRONMENT || "sandbox") as "sandbox" | "production";
  const isProduction = environment === "production";

  const config: PawaPayProviderConfig = {
    environment,
    baseUrl: process.env.PAWAPAY_BASE_URL || (
      isProduction
        ? "https://api.pawapay.io"
        : "https://api.sandbox.pawapay.io"
    ),
    apiToken: process.env.PAWAPAY_API_TOKEN || "",
    callbackUrl: process.env.PAWAPAY_CALLBACK_URL || `${process.env.APP_URL || "http://localhost:5000"}/api/webhooks/pawapay`,
    webhookPublicKeys: parsePublicKeys(process.env.PAWAPAY_WEBHOOK_PUBLIC_KEYS || ""),
    statementPrefix: process.env.PAWAPAY_STATEMENT_PREFIX || "MicroFlex",
    currency: "XAF",
    country: "COG",
    requestTimeout: parseInt(process.env.PAWAPAY_REQUEST_TIMEOUT || (isProduction ? "60000" : "30000"), 10),
    maxRetries: parseInt(process.env.PAWAPAY_MAX_RETRIES || "3", 10),
    retryDelayMs: parseInt(process.env.PAWAPAY_RETRY_DELAY_MS || "1000", 10),
  };

  // Validation
  if (isProduction && !config.apiToken) {
    throw new Error("PAWAPAY_API_TOKEN is required in production");
  }
  if (isProduction && !config.callbackUrl.startsWith("https://")) {
    throw new Error("PAWAPAY_CALLBACK_URL must use HTTPS in production");
  }
  if (isProduction && config.webhookPublicKeys.length === 0) {
    logger.warn("PAWAPAY_WEBHOOK_PUBLIC_KEYS not set - webhook signature verification will be disabled");
  }

  // Log (masquer les secrets)
  logger.info({
    environment: config.environment,
    baseUrl: config.baseUrl,
    callbackUrl: config.callbackUrl,
    hasApiToken: !!config.apiToken,
    hasPublicKeys: config.webhookPublicKeys.length > 0,
    currency: config.currency,
    country: config.country,
  }, "pawaPay config loaded");

  return config;
}

/**
 * Parse les clés publiques depuis la variable d'environnement
 * Supporte multiple clés séparées par "|||"
 */
function parsePublicKeys(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split("|||").map(k => k.trim()).filter(Boolean);
}

export default {
  loadPawaPayConfig,
  operatorToCorrespondent,
  correspondentToOperator,
  resolveOperatorFromPhone,
  PAWAPAY_CORRESPONDENTS,
  PAWAPAY_CALLBACK_IPS,
};
