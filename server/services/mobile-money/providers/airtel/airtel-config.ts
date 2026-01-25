/**
 * Airtel Money Configuration
 * Configuration centralisée avec validation et masquage des secrets
 *
 * Basé sur la documentation Airtel Congo :
 * - Staging: https://openapiuat.airtel.cg
 * - Production: https://openapi.airtel.cg
 */

export interface AirtelProviderConfig {
  // Environnement
  environment: "uat" | "staging" | "production";
  baseUrl: string;

  // OAuth2 Credentials
  clientId: string;
  clientSecret: string;

  // PIN pour transactions (chiffré RSA avant envoi)
  pin: string;

  // Localisation
  country: string;
  currency: string;

  // Callback / Webhook
  callbackUrl?: string;
  callbackHmacSecret?: string; // Pour vérifier les webhooks entrants

  // Options de sécurité
  signingEnabled: boolean; // Activer x-signature/x-key pour V3

  // Timeouts (ms)
  requestTimeout: number;
  tokenRefreshBuffer: number; // Buffer avant expiration token (ms)

  // Retry
  maxRetries: number;
  retryDelayMs: number;

  // Cache
  encryptionKeyCacheTtl: number; // TTL cache clé RSA (ms)
}

/**
 * Charge la configuration Airtel depuis les variables d'environnement
 */
export function loadAirtelConfigFromEnv(): AirtelProviderConfig {
  const environment = (process.env.AIRTEL_ENV || "uat") as "uat" | "staging" | "production";

  // Déterminer l'URL de base selon l'environnement
  let defaultBaseUrl: string;
  switch (environment) {
    case "production":
      defaultBaseUrl = "https://openapi.airtel.cg";
      break;
    case "staging":
    case "uat":
    default:
      defaultBaseUrl = "https://openapiuat.airtel.cg";
      break;
  }

  const baseUrl = process.env.AIRTEL_BASE_URL || defaultBaseUrl;

  // Validation HTTPS en production
  if (environment === "production") {
    if (!baseUrl.startsWith("https://")) {
      throw new Error("[Airtel Config] Production requires HTTPS base URL");
    }
  }

  // Callback URL
  const callbackUrl = process.env.AIRTEL_CALLBACK_URL;
  if (environment === "production" && callbackUrl && !callbackUrl.startsWith("https://")) {
    throw new Error("[Airtel Config] Production requires HTTPS callback URL");
  }

  const config: AirtelProviderConfig = {
    environment,
    baseUrl,

    // OAuth2 Credentials
    clientId: process.env.AIRTEL_CLIENT_ID || "",
    clientSecret: process.env.AIRTEL_CLIENT_SECRET || "",

    // PIN
    pin: process.env.AIRTEL_PIN || "",

    // Localisation Congo
    country: process.env.AIRTEL_COUNTRY || "CG",
    currency: process.env.AIRTEL_CURRENCY || "XAF",

    // Callback
    callbackUrl,
    callbackHmacSecret: process.env.AIRTEL_CALLBACK_HMAC_SECRET,

    // Signing (activer pour V3 disbursements)
    signingEnabled: process.env.AIRTEL_SIGNING_ENABLED === "true",

    // Timeouts
    requestTimeout: parseInt(process.env.AIRTEL_REQUEST_TIMEOUT || "30000", 10),
    tokenRefreshBuffer: parseInt(process.env.AIRTEL_TOKEN_REFRESH_BUFFER || "60000", 10),

    // Retry
    maxRetries: parseInt(process.env.AIRTEL_MAX_RETRIES || "3", 10),
    retryDelayMs: parseInt(process.env.AIRTEL_RETRY_DELAY_MS || "1000", 10),

    // Cache
    encryptionKeyCacheTtl: parseInt(process.env.AIRTEL_ENCRYPTION_KEY_CACHE_TTL || "86400000", 10), // 24h default
  };

  return config;
}

/**
 * Valide la configuration Airtel
 * Retourne un tableau d'erreurs (vide si valide)
 */
export function validateAirtelConfig(config: AirtelProviderConfig): string[] {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push("AIRTEL_CLIENT_ID is required");
  }

  if (!config.clientSecret) {
    errors.push("AIRTEL_CLIENT_SECRET is required");
  }

  if (!config.pin) {
    errors.push("AIRTEL_PIN is required");
  }

  if (!config.country) {
    errors.push("AIRTEL_COUNTRY is required");
  }

  if (!config.currency) {
    errors.push("AIRTEL_CURRENCY is required");
  }

  // Validations production
  if (config.environment === "production") {
    if (!config.callbackUrl) {
      errors.push("AIRTEL_CALLBACK_URL is required in production");
    }

    if (!config.callbackHmacSecret) {
      errors.push("AIRTEL_CALLBACK_HMAC_SECRET is required in production for webhook verification");
    }

    if (!config.baseUrl.startsWith("https://")) {
      errors.push("Base URL must use HTTPS in production");
    }
  }

  return errors;
}

/**
 * Masque les secrets pour les logs (ne jamais exposer en clair)
 */
export function maskAirtelConfig(config: AirtelProviderConfig): Record<string, unknown> {
  const mask = (s: string | undefined) => (s ? `${s.substring(0, 4)}****` : "NOT_SET");
  const maskFull = (s: string | undefined) => (s ? "****" : "NOT_SET");

  return {
    environment: config.environment,
    baseUrl: config.baseUrl,
    clientId: mask(config.clientId),
    clientSecret: maskFull(config.clientSecret), // Secret complet masqué
    pin: maskFull(config.pin), // PIN complet masqué
    country: config.country,
    currency: config.currency,
    callbackUrl: config.callbackUrl || "NOT_SET",
    callbackHmacSecret: config.callbackHmacSecret ? "SET" : "NOT_SET",
    signingEnabled: config.signingEnabled,
    requestTimeout: config.requestTimeout,
    maxRetries: config.maxRetries,
  };
}

/**
 * Configuration par défaut pour l'environnement UAT/Staging
 */
export const DEFAULT_UAT_CONFIG: Partial<AirtelProviderConfig> = {
  environment: "uat",
  baseUrl: "https://openapiuat.airtel.cg",
  country: "CG",
  currency: "XAF",
  signingEnabled: false,
  requestTimeout: 30000,
  tokenRefreshBuffer: 60000,
  maxRetries: 3,
  retryDelayMs: 1000,
  encryptionKeyCacheTtl: 86400000, // 24h
};

/**
 * Configuration par défaut pour la production Congo
 */
export const DEFAULT_PRODUCTION_CONFIG: Partial<AirtelProviderConfig> = {
  environment: "production",
  baseUrl: "https://openapi.airtel.cg",
  country: "CG",
  currency: "XAF",
  signingEnabled: true, // Obligatoire en prod
  requestTimeout: 60000, // Plus long en prod
  tokenRefreshBuffer: 120000, // 2 min buffer
  maxRetries: 3,
  retryDelayMs: 2000,
  encryptionKeyCacheTtl: 43200000, // 12h (refresh plus fréquent en prod)
};
