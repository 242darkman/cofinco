/**
 * Airtel Money Authentication Service
 * Gère l'authentification OAuth2 avec cache token et refresh automatique
 *
 * Endpoint: POST /auth/oauth2/token
 * Grant Type: client_credentials
 *
 * Le token est caché en mémoire avec refresh automatique avant expiration
 */

import type { AirtelProviderConfig } from "./airtel-config";

export interface AirtelTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: string; // Airtel retourne une string
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // timestamp ms
  obtainedAt: number; // timestamp ms (pour debug)
}

// Cache en mémoire du token
let tokenCache: CachedToken | null = null;

export class AirtelAuthService {
  private config: AirtelProviderConfig;

  constructor(config: AirtelProviderConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Valide la configuration au démarrage
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error("[Airtel Auth] clientId is required");
    }
    if (!this.config.clientSecret) {
      throw new Error("[Airtel Auth] clientSecret is required");
    }
    if (!this.config.baseUrl) {
      throw new Error("[Airtel Auth] baseUrl is required");
    }
    if (this.config.environment === "production") {
      if (!this.config.baseUrl.startsWith("https://")) {
        throw new Error("[Airtel Auth] Production requires HTTPS baseUrl");
      }
    }
  }

  /**
   * Obtient un token valide
   * Utilise le cache si disponible et non expiré
   */
  async getAccessToken(): Promise<string> {
    // Vérifier si le token est encore valide (avec buffer de sécurité)
    if (tokenCache && Date.now() < tokenCache.expiresAt - this.config.tokenRefreshBuffer) {
      return tokenCache.accessToken;
    }

    // Sinon, obtenir un nouveau token
    return this.refreshToken();
  }

  /**
   * Rafraîchit le token auprès d'Airtel
   */
  private async refreshToken(): Promise<string> {
    console.log(`[Airtel Auth] Requesting new access token...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/auth/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "client_credentials",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Airtel Auth] Token request failed: ${response.status}`, {
          status: response.status,
          hasError: !!errorText,
        });
        throw new Error(`AIRTEL_AUTH_FAILED: HTTP ${response.status}`);
      }

      const data: AirtelTokenResponse = await response.json();

      // Calculer l'expiration (expires_in est en secondes, Airtel le retourne en string)
      const expiresInSeconds = parseInt(data.expires_in || "3600", 10);
      const now = Date.now();
      const expiresAt = now + expiresInSeconds * 1000;

      // Mettre en cache
      tokenCache = {
        accessToken: data.access_token,
        expiresAt,
        obtainedAt: now,
      };

      console.log(`[Airtel Auth] Token obtained, expires in ${expiresInSeconds}s`);

      return data.access_token;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AIRTEL_AUTH_TIMEOUT: Request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Invalide le token en cache
   * Utile si le token est refusé par l'API
   */
  invalidateToken(): void {
    tokenCache = null;
    console.log("[Airtel Auth] Token invalidated");
  }

  /**
   * Vérifie si un token est actuellement en cache et valide
   */
  hasValidToken(): boolean {
    return !!tokenCache && Date.now() < tokenCache.expiresAt - this.config.tokenRefreshBuffer;
  }

  /**
   * Retourne les infos du token en cache (pour debug/monitoring)
   */
  getTokenInfo(): { hasToken: boolean; expiresIn?: number; age?: number } | null {
    if (!tokenCache) {
      return { hasToken: false };
    }

    const now = Date.now();
    return {
      hasToken: true,
      expiresIn: Math.max(0, Math.floor((tokenCache.expiresAt - now) / 1000)),
      age: Math.floor((now - tokenCache.obtainedAt) / 1000),
    };
  }

  /**
   * Effectue une requête HTTP avec authentification automatique
   * Gère le retry sur erreur 401 (token expiré)
   */
  async authenticatedRequest<T>(
    method: "GET" | "POST",
    endpoint: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      retryOnAuthError?: boolean;
    }
  ): Promise<T> {
    const { body, headers = {}, retryOnAuthError = true } = options || {};

    const token = await this.getAccessToken();

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "*/*",
      "X-Country": this.config.country,
      "X-Currency": this.config.currency,
      Authorization: `Bearer ${token}`,
      ...headers,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      // Si 401 et retry activé, invalider le token et réessayer une fois
      if (response.status === 401 && retryOnAuthError) {
        console.log("[Airtel Auth] Got 401, refreshing token and retrying...");
        this.invalidateToken();
        return this.authenticatedRequest<T>(method, endpoint, {
          body,
          headers,
          retryOnAuthError: false, // Ne pas retenter indéfiniment
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw {
          message: `HTTP ${response.status}: ${JSON.stringify(data)}`,
          code: String(response.status),
          httpStatus: response.status,
          rawResponse: data,
        };
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AIRTEL_REQUEST_TIMEOUT: Request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Réinitialise le cache token (utile pour les tests)
 */
export function resetAirtelTokenCache(): void {
  tokenCache = null;
}

export default AirtelAuthService;
