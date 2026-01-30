/**
 * MTN MoMo Authentication Service
 * Gère l'authentification OAuth2 avec cache token et refresh automatique
 *
 * MTN utilise Basic Auth (userId:apiKey) pour obtenir un Bearer token
 * Le token est caché en mémoire avec refresh automatique avant expiration
 *
 * Token Expiration:
 * - Access Token: 3600 secondes (1 heure)
 * - API User/Key: Pas d'expiration
 * - Subscription Key: Pas d'expiration
 */

import * as crypto from "crypto";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger('MtnAuth');

export interface MtnTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
}

export interface MtnAuthConfig {
  baseUrl: string;
  apiUserId: string;
  apiKey: string;
  subscriptionKey: string; // Added for auto-refresh
  environment: "sandbox" | "production";
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // timestamp ms
  product: string;
  createdAt: number; // timestamp ms - when token was generated
  refreshCount: number; // number of times this token was refreshed
}

// Cache en mémoire des tokens par produit
const tokenCache = new Map<string, CachedToken>();

// Buffer de sécurité avant expiration (5 minutes avant)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Intervalle de vérification pour le refresh proactif (toutes les 50 minutes)
const PROACTIVE_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

// Registre des instances pour le refresh automatique
const authInstances = new Map<string, MtnAuthService>();

// Timer global pour le refresh proactif
let proactiveRefreshTimer: NodeJS.Timeout | null = null;

export class MtnAuthService {
  private config: MtnAuthConfig;
  private instanceId: string;

  constructor(config: MtnAuthConfig) {
    this.config = config;
    this.instanceId = `${config.apiUserId}_${config.environment}`;
    this.validateConfig();

    // Enregistrer cette instance pour le refresh automatique
    authInstances.set(this.instanceId, this);

    // Démarrer le refresh proactif si pas déjà actif
    MtnAuthService.startProactiveRefresh();

    logger.info({
      environment: config.environment,
      instanceId: this.instanceId,
    }, 'MTN Auth Service initialized');
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
    subscriptionKey: string,
    isProactive: boolean = false
  ): Promise<string> {
    const tokenEndpoint = this.getTokenEndpoint(product);
    const cacheKey = this.getCacheKey(product);
    const existingToken = tokenCache.get(cacheKey);
    const refreshCount = (existingToken?.refreshCount || 0) + 1;
    const now = Date.now();

    logger.info({
      product,
      environment: this.config.environment,
      isProactiveRefresh: isProactive,
      refreshCount,
      previousTokenAge: existingToken ? Math.round((now - existingToken.createdAt) / 1000 / 60) : null,
    }, '🔄 MTN Token refresh initiated');

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
        logger.error({
          product,
          status: response.status,
          environment: this.config.environment,
          isProactiveRefresh: isProactive,
          errorPreview: errorText.substring(0, 200),
        }, '❌ MTN Token request failed');
        throw new Error(`MTN_AUTH_FAILED: HTTP ${response.status}`);
      }

      const data: MtnTokenResponse = await response.json();

      // Calculer l'expiration
      const expiresAt = now + data.expires_in * 1000;
      const expiresAtDate = new Date(expiresAt);

      // Mettre en cache avec métadonnées
      tokenCache.set(cacheKey, {
        accessToken: data.access_token,
        expiresAt,
        product,
        createdAt: now,
        refreshCount,
      });

      logger.info({
        product,
        environment: this.config.environment,
        expiresInSeconds: data.expires_in,
        expiresAt: expiresAtDate.toISOString(),
        nextRefreshAt: new Date(expiresAt - TOKEN_REFRESH_BUFFER_MS).toISOString(),
        refreshCount,
        isProactiveRefresh: isProactive,
      }, '✅ MTN Token obtained successfully');

      return data.access_token;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.error({ product, environment: this.config.environment }, '⏱️ MTN Token request timeout');
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
    logger.info({ product }, 'Token invalidated');
  }

  /**
   * Invalide tous les tokens en cache
   */
  invalidateAllTokens(): void {
    tokenCache.clear();
    logger.info('All tokens invalidated');
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

  /**
   * Rafraîchit proactivement un token pour un produit donné
   * Utilisé par le scheduler automatique
   */
  async proactiveRefresh(product: "collection" | "disbursement" | "remittance"): Promise<void> {
    const cacheKey = this.getCacheKey(product);
    const cached = tokenCache.get(cacheKey);

    if (!cached) {
      logger.debug({ product }, 'No cached token to refresh proactively');
      return;
    }

    const now = Date.now();
    const timeUntilExpiry = cached.expiresAt - now;
    const tokenAgeMinutes = Math.round((now - cached.createdAt) / 1000 / 60);

    // Si le token expire dans moins de 10 minutes, le rafraîchir
    if (timeUntilExpiry < TOKEN_REFRESH_BUFFER_MS + (5 * 60 * 1000)) {
      logger.info({
        product,
        tokenAgeMinutes,
        timeUntilExpiryMinutes: Math.round(timeUntilExpiry / 1000 / 60),
      }, '🔄 Proactive token refresh triggered');

      try {
        await this.refreshToken(product, this.config.subscriptionKey, true);
      } catch (error) {
        logger.error({
          product,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, '❌ Proactive token refresh failed');
      }
    }
  }

  /**
   * Démarre le refresh proactif global
   * Vérifie tous les tokens toutes les 50 minutes et les rafraîchit si nécessaire
   */
  static startProactiveRefresh(): void {
    if (proactiveRefreshTimer) {
      return; // Déjà actif
    }

    logger.info({
      intervalMinutes: PROACTIVE_REFRESH_INTERVAL_MS / 1000 / 60,
    }, '🚀 MTN Proactive token refresh scheduler started');

    proactiveRefreshTimer = setInterval(async () => {
      const now = new Date();
      logger.info({
        timestamp: now.toISOString(),
        instanceCount: authInstances.size,
        cachedTokenCount: tokenCache.size,
      }, '⏰ MTN Proactive refresh cycle started');

      // Parcourir toutes les instances et rafraîchir leurs tokens
      for (const [instanceId, instance] of authInstances) {
        for (const product of ['collection', 'disbursement', 'remittance'] as const) {
          try {
            await instance.proactiveRefresh(product);
          } catch (error) {
            logger.error({
              instanceId,
              product,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Proactive refresh error for instance/product');
          }
        }
      }

      logger.info({
        timestamp: new Date().toISOString(),
      }, '✅ MTN Proactive refresh cycle completed');
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    // Ne pas bloquer le processus
    proactiveRefreshTimer.unref();
  }

  /**
   * Arrête le refresh proactif global
   */
  static stopProactiveRefresh(): void {
    if (proactiveRefreshTimer) {
      clearInterval(proactiveRefreshTimer);
      proactiveRefreshTimer = null;
      logger.info('🛑 MTN Proactive token refresh scheduler stopped');
    }
  }

  /**
   * Retourne les statistiques des tokens en cache
   */
  static getTokenStats(): Array<{
    product: string;
    createdAt: string;
    expiresAt: string;
    ageMinutes: number;
    timeUntilExpiryMinutes: number;
    refreshCount: number;
  }> {
    const now = Date.now();
    const stats: Array<{
      product: string;
      createdAt: string;
      expiresAt: string;
      ageMinutes: number;
      timeUntilExpiryMinutes: number;
      refreshCount: number;
    }> = [];

    for (const [_key, token] of tokenCache) {
      stats.push({
        product: token.product,
        createdAt: new Date(token.createdAt).toISOString(),
        expiresAt: new Date(token.expiresAt).toISOString(),
        ageMinutes: Math.round((now - token.createdAt) / 1000 / 60),
        timeUntilExpiryMinutes: Math.round((token.expiresAt - now) / 1000 / 60),
        refreshCount: token.refreshCount,
      });
    }

    return stats;
  }

  /**
   * Nettoie les ressources de cette instance
   */
  destroy(): void {
    authInstances.delete(this.instanceId);
    logger.info({ instanceId: this.instanceId }, 'MTN Auth Service instance destroyed');

    // Si plus aucune instance, arrêter le scheduler
    if (authInstances.size === 0) {
      MtnAuthService.stopProactiveRefresh();
    }
  }
}

export default MtnAuthService;
