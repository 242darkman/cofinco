/**
 * MTN MoMo Configuration
 * Configuration centralisée pour MTN avec support multi-tenant
 *
 * En production, ces valeurs peuvent être chargées depuis:
 * - Variables d'environnement (actuel)
 * - Base de données (tenant_provider_configs)
 * - Vault (HashiCorp, AWS Secrets Manager)
 */

export interface MtnSubscriptionKeys {
  collection: string;
  disbursement: string;
  remittance?: string;
  collectionWidget?: string;
}

export interface MtnProviderConfig {
  // Environnement
  environment: "sandbox" | "production";
  baseUrl: string;

  // Credentials API
  apiUserId: string;
  apiKey: string;

  // Subscription Keys par produit
  subscriptionKeys: MtnSubscriptionKeys;

  // Callback
  callbackUrl: string;
  callbackToken?: string; // Pour vérifier les webhooks

  // Options
  currency: string;
  country: string;
  targetEnvironment: string; // "sandbox" ou "mtncongo" etc.

  // Timeouts (ms)
  requestTimeout: number;
  tokenRefreshBuffer: number;

  // Retry
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Charge la configuration MTN depuis les variables d'environnement
 */
export function loadMtnConfigFromEnv(): MtnProviderConfig {
  const environment = (process.env.MTN_MOMO_ENVIRONMENT || "sandbox") as "sandbox" | "production";

  // Déterminer l'URL de base
  const defaultBaseUrl =
    environment === "production"
      ? "https://proxy.momoapi.mtn.com" // URL production MTN
      : "https://sandbox.momodeveloper.mtn.com";

  const baseUrl = process.env.MTN_MOMO_BASE_URL || defaultBaseUrl;

  // Validation HTTPS en production
  if (environment === "production" && !baseUrl.startsWith("https://")) {
    throw new Error("[MTN Config] Production requires HTTPS base URL");
  }

  // Callback URL
  const callbackUrl = process.env.MTN_MOMO_CALLBACK_URL || "";
  if (environment === "production" && callbackUrl && !callbackUrl.startsWith("https://")) {
    throw new Error("[MTN Config] Production requires HTTPS callback URL");
  }

  // Currency et country adaptés selon l'environnement
  // Sandbox utilise EUR/NL, Production utilise XAF/CG
  const defaultCurrency = environment === "sandbox" ? "EUR" : "XAF";
  const defaultCountry = environment === "sandbox" ? "NL" : "CG";

  const config: MtnProviderConfig = {
    environment,
    baseUrl,

    // Credentials
    apiUserId: process.env.MTN_MOMO_API_USER_ID || process.env.MTN_MOMO_USER_ID || "",
    apiKey: process.env.MTN_MOMO_API_KEY || "",

    // Subscription Keys (séparés par produit)
    subscriptionKeys: {
      collection:
        process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY ||
        process.env.MTN_MOMO_PRIMARY_KEY ||
        process.env.MTN_MOMO_SUBSCRIPTION_KEY ||
        "",
      disbursement:
        process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
        process.env.MTN_MOMO_PRIMARY_KEY ||
        process.env.MTN_MOMO_SUBSCRIPTION_KEY ||
        "",
      remittance: process.env.MTN_MOMO_REMITTANCE_SUBSCRIPTION_KEY,
      collectionWidget: process.env.MTN_MOMO_COLLECTION_WIDGET_KEY,
    },

    // Callback
    callbackUrl,
    callbackToken: process.env.MTN_MOMO_CALLBACK_TOKEN,

    // Currency et Country adaptés automatiquement selon environnement
    // Sandbox: EUR/NL, Production: XAF/CG (sauf override explicite)
    currency: process.env.MTN_MOMO_CURRENCY || defaultCurrency,
    country: process.env.MTN_MOMO_COUNTRY || defaultCountry,
    targetEnvironment: process.env.MTN_MOMO_TARGET_ENVIRONMENT || environment,

    // Timeouts
    requestTimeout: parseInt(process.env.MTN_MOMO_REQUEST_TIMEOUT || "30000", 10),
    tokenRefreshBuffer: parseInt(process.env.MTN_MOMO_TOKEN_REFRESH_BUFFER || "120000", 10),

    // Retry
    maxRetries: parseInt(process.env.MTN_MOMO_MAX_RETRIES || "3", 10),
    retryDelayMs: parseInt(process.env.MTN_MOMO_RETRY_DELAY_MS || "1000", 10),
  };

  return config;
}

/**
 * Valide la configuration MTN
 * Retourne un tableau d'erreurs (vide si valide)
 */
export function validateMtnConfig(config: MtnProviderConfig): string[] {
  const errors: string[] = [];

  if (!config.apiUserId) {
    errors.push("MTN_MOMO_API_USER_ID is required");
  }

  if (!config.apiKey) {
    errors.push("MTN_MOMO_API_KEY is required");
  }

  if (!config.subscriptionKeys.collection) {
    errors.push("MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY is required");
  }

  if (!config.subscriptionKeys.disbursement) {
    errors.push("MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY is required");
  }

  if (config.environment === "production") {
    if (!config.callbackUrl) {
      errors.push("MTN_MOMO_CALLBACK_URL is required in production");
    }
    if (config.callbackUrl && !config.callbackUrl.startsWith("https://")) {
      errors.push("Callback URL must use HTTPS in production");
    }
  }

  return errors;
}

/**
 * Masque les secrets pour les logs
 */
export function maskMtnConfig(config: MtnProviderConfig): Record<string, unknown> {
  const mask = (s: string | undefined) => (s ? `${s.substring(0, 4)}****` : "NOT_SET");

  return {
    environment: config.environment,
    baseUrl: config.baseUrl,
    apiUserId: mask(config.apiUserId),
    apiKey: mask(config.apiKey),
    subscriptionKeys: {
      collection: mask(config.subscriptionKeys.collection),
      disbursement: mask(config.subscriptionKeys.disbursement),
      remittance: mask(config.subscriptionKeys.remittance),
    },
    callbackUrl: config.callbackUrl || "NOT_SET",
    currency: config.currency,
    country: config.country,
    targetEnvironment: config.targetEnvironment,
  };
}

/**
 * Configuration par défaut pour le développement/sandbox
 */
export const DEFAULT_SANDBOX_CONFIG: Partial<MtnProviderConfig> = {
  environment: "sandbox",
  baseUrl: "https://sandbox.momodeveloper.mtn.com",
  currency: "EUR", // Sandbox utilise EUR
  country: "NL", // Sandbox simule Netherlands
  targetEnvironment: "sandbox",
  requestTimeout: 30000, // Timeout plus court en sandbox
  tokenRefreshBuffer: 120000,
  maxRetries: 2, // Moins de retries en sandbox
  retryDelayMs: 1000,
};

/**
 * Configuration par défaut pour la production Congo
 */
export const DEFAULT_PRODUCTION_CONGO_CONFIG: Partial<MtnProviderConfig> = {
  environment: "production",
  baseUrl: "https://proxy.momoapi.mtn.com",
  currency: "XAF",
  country: "CG",
  targetEnvironment: "mtncongo",
  requestTimeout: 60000, // Plus long en prod
  tokenRefreshBuffer: 300000, // 5 min buffer
  maxRetries: 3,
  retryDelayMs: 2000,
};
