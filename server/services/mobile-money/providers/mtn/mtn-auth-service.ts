/**
 * MTN MoMo Authentication Service
 * Gère l'authentification OAuth2 avec cache token et refresh automatique
 *
 * MTN utilise Basic Auth (userId:apiKey) pour obtenir un Bearer token
 * Le token est caché en mémoire avec refresh automatique avant expiration
 */

import * as crypto from "crypto";

export interface MtnTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
}

export interface MtnAuthConfig {
  baseUrl: string;
  apiUserId: string;
  apiKey: string;
  environment: "sandbox" | "production";
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // timestamp ms
  product: string;
}

// Cache en mémoire des tokens par produit
const tokenCache = new Map<string, CachedToken>();

// Buffer de sécurité avant expiration (2 minutes)
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;

export class MtnAuthService {
  private config: MtnAuthConfig;

  constructor(config: MtnAuthConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Valide la configuration au démarrage
   */
  private validateConfig(): void {
    if (!this.config.apiUserId) {
      throw new Error("[MTN Auth] apiUserId is required");
    }
    if (!this.config.apiKey) {
      throw new Error("[MTN Auth] apiKey is required");
    }
    if (!this.config.baseUrl) {
      throw new Error("[MTN Auth] baseUrl is required");
    }
    if (this.config.environment === "production") {
      if (!this.config.baseUrl.startsWith("https://")) {
        throw new Error("[MTN Auth] Production requires HTTPS baseUrl");
      }
    }
  }

  /**
   * Génère la clé de cache unique pour un produit
   */
  private getCacheKey(product: "collection" | "disbursement" | "remittance"): string {
    return `mtn_${this.config.apiUserId}_${product}`;
  }

  /**
   * Obtient un token valide pour un produit MTN
   * Utilise le cache si disponible et non expiré
   */
  async getAccessToken(
    product: "collection" | "disbursement" | "remittance",
    subscriptionKey: string
  ): Promise<string> {
    const cacheKey = this.getCacheKey(product);
    const cached = tokenCache.get(cacheKey);

    // Vérifier si le token est encore valide
    if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    // Sinon, obtenir un nouveau token
    return this.refreshToken(product, subscriptionKey);
  }

  /**
   * Rafraîchit le token auprès de MTN
   */
  private async refreshToken(
    product: "collection" | "disbursement" | "remittance",
    subscriptionKey: string
  ): Promise<string> {
    const tokenEndpoint = this.getTokenEndpoint(product);

    console.log(`[MTN Auth] Requesting new token for ${product}...`);

    // Basic Auth: base64(apiUserId:apiKey)
    const credentials = Buffer.from(
      `${this.config.apiUserId}:${this.config.apiKey}`
    ).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.config.baseUrl}${tokenEndpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
          "Content-Length": "0", // Requis par MTN pour les POST sans body
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MTN Auth] Token request failed: ${response.status}`, {
          product,
          status: response.status,
          // Ne pas logger le message d'erreur complet qui pourrait contenir des secrets
          hasError: !!errorText,
        });
        throw new Error(`MTN_AUTH_FAILED: HTTP ${response.status}`);
      }

      const data: MtnTokenResponse = await response.json();

      // Calculer l'expiration
      const expiresAt = Date.now() + data.expires_in * 1000;

      // Mettre en cache
      const cacheKey = this.getCacheKey(product);
      tokenCache.set(cacheKey, {
        accessToken: data.access_token,
        expiresAt,
        product,
      });

      console.log(`[MTN Auth] Token obtained for ${product}, expires in ${data.expires_in}s`);

      return data.access_token;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("MTN_AUTH_TIMEOUT: Request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Retourne l'endpoint token selon le produit
   */
  private getTokenEndpoint(product: "collection" | "disbursement" | "remittance"): string {
    switch (product) {
      case "collection":
        return "/collection/token/";
      case "disbursement":
        return "/disbursement/token/";
      case "remittance":
        return "/remittance/token/";
      default:
        throw new Error(`Unknown MTN product: ${product}`);
    }
  }

  /**
   * Invalide le cache pour un produit spécifique
   * Utile si le token est refusé par l'API
   */
  invalidateToken(product: "collection" | "disbursement" | "remittance"): void {
    const cacheKey = this.getCacheKey(product);
    tokenCache.delete(cacheKey);
    console.log(`[MTN Auth] Token invalidated for ${product}`);
  }

  /**
   * Invalide tous les tokens en cache
   */
  invalidateAllTokens(): void {
    tokenCache.clear();
    console.log("[MTN Auth] All tokens invalidated");
  }

  /**
   * Vérifie si un token est actuellement en cache et valide
   */
  hasValidToken(product: "collection" | "disbursement" | "remittance"): boolean {
    const cacheKey = this.getCacheKey(product);
    const cached = tokenCache.get(cacheKey);
    return !!cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Génère un UUID v4 pour les X-Reference-Id MTN
   */
  static generateReferenceId(): string {
    return crypto.randomUUID();
  }

  /**
   * Génère un callback token pour la vérification des webhooks
   */
  static generateCallbackToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}

export default MtnAuthService;
