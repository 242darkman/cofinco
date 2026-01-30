/**
 * MTN MoMo Provider - Production Ready
 *
 * Implémentation complète de l'API MTN Mobile Money:
 * - Collection (RequestToPay) pour les dépôts/remboursements
 * - Disbursement (Transfer) pour les décaissements/retraits
 * - Gestion OAuth avec cache token
 * - Subscription Keys séparées par produit
 * - Webhook verification HMAC-SHA256
 * - Retry avec backoff exponentiel
 * - Logs structurés sans secrets
 */

import * as crypto from "crypto";
import type {
  IMobileMoneyProvider,
  CollectRequest,
  CollectResponse,
  PayoutRequest,
  PayoutResponse,
  StatusResponse,
  WebhookPayload,
  ProviderBalanceResponse,
} from "../../types";
import { ProviderApiError } from "../../types";
import { MtnAuthService } from "./mtn-auth-service";
import {
  loadMtnConfigFromEnv,
  validateMtnConfig,
  maskMtnConfig,
  type MtnProviderConfig,
} from "./mtn-config";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger('MtnProvider');

// Types internes MTN
interface MtnRequestToPayBody {
  amount: string;
  currency: string;
  externalId: string;
  payer: {
    partyIdType: "MSISDN";
    partyId: string;
  };
  payerMessage: string;
  payeeNote: string;
}

interface MtnTransferBody {
  amount: string;
  currency: string;
  externalId: string;
  payee: {
    partyIdType: "MSISDN";
    partyId: string;
  };
  payerMessage: string;
  payeeNote: string;
}

interface MtnTransactionStatus {
  amount: string;
  currency: string;
  financialTransactionId?: string;
  externalId: string;
  payer?: { partyIdType: string; partyId: string };
  payee?: { partyIdType: string; partyId: string };
  payerMessage?: string;
  payeeNote?: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  reason?: { code: string; message: string };
}

export class MtnProvider implements IMobileMoneyProvider {
  readonly name = "MTN Mobile Money";
  readonly code = "MTN" as const;

  private config: MtnProviderConfig;
  private authService: MtnAuthService;

  constructor(config?: Partial<MtnProviderConfig>) {
    // Charger config depuis env et merger avec les overrides
    const envConfig = loadMtnConfigFromEnv();
    this.config = { ...envConfig, ...config };

    // Valider la configuration
    const errors = validateMtnConfig(this.config);
    if (errors.length > 0 && this.config.environment === "production") {
      throw new Error(`[MTN Provider] Configuration errors: ${errors.join(", ")}`);
    }

    // Initialiser le service d'authentification
    // On utilise la subscription key de collection par défaut pour le refresh proactif
    this.authService = new MtnAuthService({
      baseUrl: this.config.baseUrl,
      apiUserId: this.config.apiUserId,
      apiKey: this.config.apiKey,
      subscriptionKey: this.config.subscriptionKeys.collection,
      environment: this.config.environment,
    });

    // Log de configuration (masquée)
    logger.info({ config: maskMtnConfig(this.config) }, 'MTN Provider initialized');
  }

  // ============================================
  // COLLECTION (RequestToPay)
  // ============================================

  /**
   * Initie une collection (argent entrant)
   * MTN envoie une demande de paiement sur le téléphone du client
   */
  async collect(request: CollectRequest): Promise<CollectResponse> {
    const { amount, phone, externalRef, description } = request;

    // Générer le X-Reference-Id (UUID unique pour cette transaction)
    const referenceId = MtnAuthService.generateReferenceId();

    // Obtenir le token d'authentification
    const accessToken = await this.authService.getAccessToken(
      "collection",
      this.config.subscriptionKeys.collection
    );

    // Préparer le payload
    const payload: MtnRequestToPayBody = {
      amount: amount.toString(),
      currency: this.config.currency,
      externalId: externalRef,
      payer: {
        partyIdType: "MSISDN",
        partyId: this.normalizePhone(phone),
      },
      payerMessage: description || "Paiement Cofinco",
      payeeNote: `Collection ${externalRef}`,
    };

    logger.info({
      referenceId,
      externalRef,
      amount,
      currency: this.config.currency,
      phoneLastDigits: phone.slice(-4),
    }, 'Initiating collection');

    try {
      const response = await this.makeRequest(
        "POST",
        "/collection/v1_0/requesttopay",
        payload,
        {
          Authorization: `Bearer ${accessToken}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": this.config.targetEnvironment,
          "Ocp-Apim-Subscription-Key": this.config.subscriptionKeys.collection,
          ...(this.config.callbackUrl && { "X-Callback-Url": this.config.callbackUrl }),
        }
      );

      // MTN retourne 202 Accepted pour les requêtes async réussies
      if (response.status === 202) {
        logger.info({ referenceId, externalRef }, 'Collection accepted');

        return {
          providerRef: referenceId,
          status: "PENDING",
          message: "Collection request accepted",
        };
      }

      // Autre statut = erreur
      const errorData = await response.text();
      throw new ProviderApiError(
        `Unexpected status ${response.status}: ${errorData}`,
        "UNEXPECTED_STATUS",
        this.code,
        response.status
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      logger.error({
        referenceId,
        externalRef,
        err,
      }, 'Collection failed');

      throw new ProviderApiError(
        `MTN collection failed: ${err.message}`,
        "COLLECTION_ERROR",
        this.code
      );
    }
  }

  // ============================================
  // DISBURSEMENT (Transfer)
  // ============================================

  /**
   * Initie un payout (argent sortant)
   * MTN envoie de l'argent sur le téléphone du client
   */
  async payout(request: PayoutRequest): Promise<PayoutResponse> {
    const { amount, phone, externalRef, description } = request;

    // Générer le X-Reference-Id
    const referenceId = MtnAuthService.generateReferenceId();

    // Obtenir le token pour disbursement
    const accessToken = await this.authService.getAccessToken(
      "disbursement",
      this.config.subscriptionKeys.disbursement
    );

    // Préparer le payload
    const payload: MtnTransferBody = {
      amount: amount.toString(),
      currency: this.config.currency,
      externalId: externalRef,
      payee: {
        partyIdType: "MSISDN",
        partyId: this.normalizePhone(phone),
      },
      payerMessage: description || "Versement Cofinco",
      payeeNote: `Transfer ${externalRef}`,
    };

    logger.info({
      referenceId,
      externalRef,
      amount,
      currency: this.config.currency,
      phoneLastDigits: phone.slice(-4),
    }, 'Initiating disbursement');

    try {
      const response = await this.makeRequest(
        "POST",
        "/disbursement/v1_0/transfer",
        payload,
        {
          Authorization: `Bearer ${accessToken}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": this.config.targetEnvironment,
          "Ocp-Apim-Subscription-Key": this.config.subscriptionKeys.disbursement,
          ...(this.config.callbackUrl && { "X-Callback-Url": this.config.callbackUrl }),
        }
      );

      if (response.status === 202) {
        logger.info({ referenceId, externalRef }, 'Disbursement accepted');

        return {
          providerRef: referenceId,
          status: "PENDING",
          message: "Transfer request accepted",
        };
      }

      const errorData = await response.text();
      throw new ProviderApiError(
        `Unexpected status ${response.status}: ${errorData}`,
        "UNEXPECTED_STATUS",
        this.code,
        response.status
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      logger.error({
        referenceId,
        externalRef,
        err,
      }, 'Disbursement failed');

      throw new ProviderApiError(
        `MTN disbursement failed: ${err.message}`,
        "DISBURSEMENT_ERROR",
        this.code
      );
    }
  }

  // ============================================
  // STATUS CHECK
  // ============================================

  /**
   * Vérifie le statut d'une transaction
   * Utilisé par la réconciliation et le polling
   */
  async getStatus(providerRef: string, type?: "collection" | "disbursement"): Promise<StatusResponse> {
    // Essayer d'abord collection si type non spécifié
    const typesToTry = type ? [type] : ["collection", "disbursement"] as const;

    for (const txType of typesToTry) {
      try {
        const result = await this.getTransactionStatus(providerRef, txType);
        if (result) return result;
      } catch (error) {
        // Si c'est une 404, essayer l'autre type
        if (error instanceof ProviderApiError && error.httpStatus === 404) {
          continue;
        }
        throw error;
      }
    }

    // Transaction non trouvée
    logger.info({ providerRef }, 'Transaction not found');
    return { status: "PENDING" }; // On garde PENDING pour la réconciliation
  }

  /**
   * Récupère le statut d'une transaction spécifique
   */
  private async getTransactionStatus(
    referenceId: string,
    type: "collection" | "disbursement"
  ): Promise<StatusResponse | null> {
    const endpoint =
      type === "collection"
        ? `/collection/v1_0/requesttopay/${referenceId}`
        : `/disbursement/v1_0/transfer/${referenceId}`;

    const subscriptionKey =
      type === "collection"
        ? this.config.subscriptionKeys.collection
        : this.config.subscriptionKeys.disbursement;

    const accessToken = await this.authService.getAccessToken(type, subscriptionKey);

    try {
      const response = await this.makeRequest("GET", endpoint, undefined, {
        Authorization: `Bearer ${accessToken}`,
        "X-Target-Environment": this.config.targetEnvironment,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new ProviderApiError(
          `Status check failed: HTTP ${response.status}`,
          "STATUS_CHECK_FAILED",
          this.code,
          response.status
        );
      }

      const data: MtnTransactionStatus = await response.json();

      return {
        status: this.normalizeStatus(data.status),
        providerTxnId: data.financialTransactionId,
        errorCode: data.reason?.code,
        errorMessage: data.reason?.message,
      };
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      logger.error({
        referenceId,
        type,
        err: error,
      }, 'Status check error');

      return null;
    }
  }

  // ============================================
  // BALANCE CHECK
  // ============================================

  /**
   * Récupère le solde du compte MTN MoMo (collection)
   * Endpoint: GET /collection/v1_0/account/balance
   */
  async getBalance(): Promise<ProviderBalanceResponse> {
    const accessToken = await this.authService.getAccessToken(
      "collection",
      this.config.subscriptionKeys.collection
    );

    try {
      logger.info('Fetching account balance');

      const response = await this.makeRequest("GET", "/collection/v1_0/account/balance", undefined, {
        Authorization: `Bearer ${accessToken}`,
        "X-Target-Environment": this.config.targetEnvironment,
        "Ocp-Apim-Subscription-Key": this.config.subscriptionKeys.collection,
      });

      if (!response.ok) {
        throw new ProviderApiError(
          `Balance check failed: HTTP ${response.status}`,
          "BALANCE_CHECK_FAILED",
          this.code,
          response.status
        );
      }

      const data = await response.json() as { availableBalance: string; currency: string };

      return {
        balance: data.availableBalance || "0",
        currency: data.currency || this.config.currency,
        accountStatus: "ACTIVE",
      };
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      throw new ProviderApiError(
        `MTN balance enquiry failed: ${err.message}`,
        "BALANCE_ERROR",
        this.code
      );
    }
  }

  // ============================================
  // WEBHOOK VERIFICATION
  // ============================================

  /**
   * Vérifie l'authenticité d'un webhook MTN
   * MTN utilise HMAC-SHA256 avec le callback token
   */
  verifyWebhook(
    payload: unknown,
    signature: string,
    headers: Record<string, string>
  ): boolean {
    // En sandbox, on peut bypasser la vérification
    if (this.config.environment === "sandbox") {
      logger.info('Sandbox mode: skipping webhook verification');
      return true;
    }

    // En production, la signature est obligatoire
    if (!signature) {
      logger.warn('Missing webhook signature');
      return false;
    }

    // Vérifier si on a un callback token configuré
    if (!this.config.callbackToken) {
      logger.warn('No callback token configured, cannot verify webhook');
      // En production sans token, on refuse par sécurité
      return false;
    }

    try {
      const hmac = crypto.createHmac("sha256", this.config.callbackToken);
      const expectedSignature = hmac
        .update(typeof payload === "string" ? payload : JSON.stringify(payload))
        .digest("base64");

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        logger.warn('Invalid webhook signature');
      }

      return isValid;
    } catch (error) {
      logger.error({ err: error }, 'Webhook verification error');
      return false;
    }
  }

  // ============================================
  // WEBHOOK PARSING
  // ============================================

  /**
   * Parse le payload d'un webhook MTN
   */
  parseWebhookPayload(payload: unknown): WebhookPayload {
    const data = payload as Record<string, unknown>;

    // MTN peut envoyer différents formats selon l'événement
    // Format standard: { referenceId, externalId, status, financialTransactionId, ... }

    return {
      providerRef: (data.referenceId as string) || undefined,
      externalRef: (data.externalId as string) || undefined,
      status: this.normalizeStatus((data.status as string) || "UNKNOWN"),
      financialTransactionId: (data.financialTransactionId as string) || undefined,
      reason:
        data.reason && typeof data.reason === "object"
          ? ((data.reason as Record<string, string>).message as string)
          : undefined,
      ...data,
    };
  }

  // ============================================
  // STATUS NORMALIZATION
  // ============================================

  /**
   * Normalise les statuts MTN vers nos statuts internes
   * MTN: PENDING, SUCCESSFUL, FAILED
   */
  normalizeStatus(
    providerStatus: string
  ): "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" {
    if (!providerStatus) return "PENDING";

    const status = providerStatus.toUpperCase();

    switch (status) {
      case "SUCCESSFUL":
        return "SUCCESS";

      case "FAILED":
      case "REJECTED":
      case "CANCELLED":
        return "FAILED";

      case "EXPIRED":
      case "TIMEOUT":
        return "EXPIRED";

      case "PENDING":
      default:
        return "PENDING";
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Effectue une requête HTTP avec retry et timeout
   */
  private async makeRequest(
    method: "GET" | "POST",
    endpoint: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.requestTimeout
      );

      try {
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Si succès ou erreur client (4xx sauf 429), retourner
        if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
          return response;
        }

        // Rate limit ou erreur serveur: retry
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`HTTP ${response.status}`);

          if (attempt < this.config.maxRetries) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
            logger.info({ status: response.status, attempt, endpoint, delayMs: delay }, 'Request failed, retrying');
            await this.sleep(delay);
            continue;
          }
        }

        return response;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error as Error;

        if ((error as Error).name === "AbortError") {
          lastError = new Error("Request timeout");
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          logger.info({
            attempt,
            endpoint,
            error: lastError.message,
            delayMs: delay,
          }, 'Request error, retrying');
          await this.sleep(delay);
        }
      }
    }

    throw new ProviderApiError(
      `Request failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      "REQUEST_FAILED",
      this.code
    );
  }

  /**
   * Normalise le numéro de téléphone au format MSISDN
   * Enlève le + et ajoute l'indicatif pays si nécessaire
   */
  private normalizePhone(phone: string): string {
    // Enlever tous les caractères non numériques sauf +
    let cleaned = phone.replace(/[^\d+]/g, "");

    // Enlever le + initial
    if (cleaned.startsWith("+")) {
      cleaned = cleaned.substring(1);
    }

    // Pour le Congo, ajouter 242 si pas d'indicatif
    if (this.config.country === "CG" && !cleaned.startsWith("242")) {
      // Enlever le 0 initial si présent
      if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
      }
      cleaned = "242" + cleaned;
    }

    return cleaned;
  }

  /**
   * Sleep helper pour les delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retourne la configuration (masquée) pour le debug
   */
  getConfig(): Record<string, unknown> {
    return maskMtnConfig(this.config);
  }

  /**
   * Invalide le cache de tokens (utile en cas d'erreur 401)
   */
  invalidateAuthCache(): void {
    this.authService.invalidateAllTokens();
  }
}

export default MtnProvider;
