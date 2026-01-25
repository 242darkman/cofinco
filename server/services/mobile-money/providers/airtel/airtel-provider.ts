/**
 * Airtel Money Congo Provider (Production-Ready)
 * Implémentation complète de l'API Airtel Money pour le Congo
 *
 * APIs Implémentées:
 * - OAuth2 Authentication (via AirtelAuthService)
 * - Collection V1 (Cash-In) - POST /standard/v1/cashin/
 * - Disbursement V3 (Cash-Out) - POST /standard/v3/disbursements
 * - Transactions Summary - GET /merchant/v1/transactions (pour réconciliation)
 * - Balance Enquiry - GET /standard/v2/users/balance
 *
 * Base URLs:
 * - Staging/UAT: https://openapiuat.airtel.cg
 * - Production: https://openapi.airtel.cg
 */

import type {
  IMobileMoneyProvider,
  CollectRequest,
  CollectResponse,
  PayoutRequest,
  PayoutResponse,
  StatusResponse,
  WebhookPayload,
} from "../../types";
import { ProviderApiError } from "../../types";
import { AirtelEncryptionService } from "./encryption";
import { AirtelAuthService } from "./airtel-auth-service";
import {
  loadAirtelConfigFromEnv,
  maskAirtelConfig,
  type AirtelProviderConfig,
} from "./airtel-config";

// Interfaces pour les réponses Airtel
interface AirtelApiResponse<T = unknown> {
  status: {
    code: string;
    message: string;
    success: boolean;
    result_code?: string;
  };
  data: T;
}

interface AirtelTransactionData {
  transaction?: {
    id: string;
    status?: string;
    status_code?: string;
    airtel_money_id?: string;
    message?: string;
  };
}

interface AirtelTransactionSummary {
  id: string;
  transaction_id: string;
  airtel_money_id: string;
  transaction_type: string;
  status: string;
  amount: string;
  currency: string;
  msisdn: string;
  date: string;
  reference?: string;
}

interface AirtelTransactionsSummaryResponse {
  transactions: AirtelTransactionSummary[];
  total_count: number;
  page: number;
  page_size: number;
}

interface AirtelBalanceData {
  balance: string;
  currency: string;
  account_status: string;
}

export class AirtelProvider implements IMobileMoneyProvider {
  readonly name = "Airtel Money Congo";
  readonly code = "AIRTEL" as const;

  private config: AirtelProviderConfig;
  private authService: AirtelAuthService;
  private encryption: AirtelEncryptionService;

  constructor(config?: Partial<AirtelProviderConfig>) {
    // Charger la config depuis l'environnement, fusionnée avec les overrides
    const envConfig = loadAirtelConfigFromEnv();
    this.config = { ...envConfig, ...config };

    // Initialiser les services
    this.authService = new AirtelAuthService(this.config);
    this.encryption = new AirtelEncryptionService(
      this.config.baseUrl,
      this.config.country,
      this.config.currency,
      this.config.encryptionKeyCacheTtl
    );

    // Log de configuration (secrets masqués)
    console.log("[Airtel Provider] Initialized:", maskAirtelConfig(this.config));
  }

  /**
   * COLLECTION (Cash-In V1) - Dépôt client vers Microfinance
   * Le client envoie de l'argent vers notre compte
   *
   * Endpoint: POST /standard/v1/cashin/
   */
  async collect(request: CollectRequest): Promise<CollectResponse> {
    const token = await this.authService.getAccessToken();
    const encryptedPin = await this.encryption.encryptPin(this.config.pin, token);

    // Normaliser le numéro de téléphone
    const msisdn = this.normalizePhone(request.phone);

    // Payload Standard V1 Cashin
    const payload = {
      subscriber: {
        msisdn,
      },
      transaction: {
        amount: request.amount.toString(),
        id: request.externalRef,
      },
      reference: `COL-${request.externalRef.substring(0, 20)}`,
      pin: encryptedPin,
    };

    try {
      console.log(
        `[Airtel] Initiating collection: ${request.externalRef} - ${request.amount} ${this.config.currency}`
      );

      const response = await this.makeRequest<AirtelApiResponse<AirtelTransactionData>>(
        "POST",
        "/standard/v1/cashin/",
        payload,
        token
      );

      const txData = response.data?.transaction;

      // Vérifier le statut de la réponse
      if (response.status?.code === "200" || response.status?.success === true) {
        console.log(`[Airtel] Collection initiated: ${txData?.id || request.externalRef}`);

        return {
          providerRef: txData?.id || request.externalRef,
          status: "PENDING",
          message: response.status?.message || "Collection request submitted",
        };
      }

      // Erreur métier
      throw new ProviderApiError(
        response.status?.message || "Collection failed",
        response.status?.code || "COLLECT_FAILED",
        this.code,
        undefined,
        response
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      throw new ProviderApiError(
        `Airtel collection failed: ${err.message}`,
        "COLLECT_ERROR",
        this.code
      );
    }
  }

  /**
   * PAYOUT (Disbursement V3) - Décaissement Microfinance vers Client
   * Utilise le chiffrement lourd (AES + RSA) via x-signature et x-key headers
   *
   * Endpoint: POST /standard/v3/disbursements
   */
  async payout(request: PayoutRequest): Promise<PayoutResponse> {
    const token = await this.authService.getAccessToken();
    const encryptedPin = await this.encryption.encryptPin(this.config.pin, token);

    // Normaliser le numéro de téléphone
    const msisdn = this.normalizePhone(request.phone);

    // Payload V3 Disbursement
    const payload = {
      payee: {
        msisdn,
        wallet_type: "NORMAL", // ou "SALARY" selon contrat
      },
      reference: `PAY-${request.externalRef.substring(0, 20)}`,
      pin: encryptedPin,
      transaction: {
        amount: request.amount,
        id: request.externalRef,
        type: "B2B",
      },
    };

    try {
      console.log(
        `[Airtel] Initiating payout: ${request.externalRef} - ${request.amount} ${this.config.currency}`
      );

      let response: AirtelApiResponse<AirtelTransactionData>;

      // Utiliser le chiffrement si activé (requis en production)
      if (this.config.signingEnabled) {
        const encryptionData = await this.encryption.encryptPayload(payload, token);

        response = await this.makeRequest<AirtelApiResponse<AirtelTransactionData>>(
          "POST",
          "/standard/v3/disbursements",
          payload,
          token,
          {
            "x-signature": encryptionData.encryptedBody,
            "x-key": encryptionData.encryptedKey,
          }
        );
      } else {
        // Mode UAT sans chiffrement payload
        response = await this.makeRequest<AirtelApiResponse<AirtelTransactionData>>(
          "POST",
          "/standard/v3/disbursements",
          payload,
          token
        );
      }

      const txData = response.data?.transaction;

      // Vérifier le statut de la réponse
      if (response.status?.code === "200" || response.status?.success === true) {
        console.log(`[Airtel] Payout initiated: ${txData?.id || request.externalRef}`);

        return {
          providerRef: txData?.id || request.externalRef,
          status: "PENDING",
          message: response.status?.message || "Payout request submitted",
        };
      }

      throw new ProviderApiError(
        response.status?.message || "Payout failed",
        response.status?.code || "PAYOUT_FAILED",
        this.code,
        undefined,
        response
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      throw new ProviderApiError(
        `Airtel payout failed: ${err.message}`,
        "PAYOUT_ERROR",
        this.code
      );
    }
  }

  /**
   * Vérification de statut d'une transaction
   * Endpoint: GET /standard/v1/payments/{id}
   *
   * Note: En cas d'échec, retourne PENDING pour forcer l'attente du webhook
   */
  async getStatus(providerRef: string): Promise<StatusResponse> {
    const token = await this.authService.getAccessToken();

    try {
      const response = await this.makeRequest<AirtelApiResponse<AirtelTransactionData>>(
        "GET",
        `/standard/v1/payments/${providerRef}`,
        undefined,
        token
      );

      const txData = response.data?.transaction;

      if (txData) {
        return {
          status: this.normalizeStatus(txData.status || txData.status_code || ""),
          providerTxnId: txData.airtel_money_id,
          errorCode: txData.status_code,
          errorMessage: txData.message,
        };
      }

      return { status: "PENDING" };
    } catch (error) {
      // Si l'endpoint n'existe pas ou retourne une erreur,
      // on retourne PENDING pour forcer le système à attendre le webhook
      console.log(`[Airtel] Status check failed for ${providerRef}, assuming PENDING`);
      return { status: "PENDING" };
    }
  }

  /**
   * Récupère le résumé des transactions (pour réconciliation)
   * Endpoint: GET /merchant/v1/transactions
   *
   * @param startDate - Date de début (format YYYY-MM-DD)
   * @param endDate - Date de fin (format YYYY-MM-DD)
   * @param page - Numéro de page (1-based)
   * @param pageSize - Taille de page (max 100)
   */
  async getTransactionsSummary(
    startDate: string,
    endDate: string,
    page: number = 1,
    pageSize: number = 100
  ): Promise<{
    transactions: AirtelTransactionSummary[];
    totalCount: number;
    page: number;
    pageSize: number;
  }> {
    const token = await this.authService.getAccessToken();

    try {
      console.log(`[Airtel] Fetching transactions summary: ${startDate} to ${endDate}`);

      const queryParams = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        page: page.toString(),
        page_size: Math.min(pageSize, 100).toString(),
      });

      const response = await this.makeRequest<
        AirtelApiResponse<AirtelTransactionsSummaryResponse>
      >("GET", `/merchant/v1/transactions?${queryParams.toString()}`, undefined, token);

      if (response.status?.success || response.status?.code === "200") {
        return {
          transactions: response.data?.transactions || [],
          totalCount: response.data?.total_count || 0,
          page: response.data?.page || page,
          pageSize: response.data?.page_size || pageSize,
        };
      }

      throw new ProviderApiError(
        response.status?.message || "Failed to fetch transactions summary",
        response.status?.code || "TRANSACTIONS_SUMMARY_FAILED",
        this.code
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      throw new ProviderApiError(
        `Airtel transactions summary failed: ${err.message}`,
        "TRANSACTIONS_SUMMARY_ERROR",
        this.code
      );
    }
  }

  /**
   * Récupère le solde du compte Airtel Money
   * Endpoint: GET /standard/v2/users/balance
   */
  async getBalance(): Promise<{
    balance: string;
    currency: string;
    accountStatus: string;
  }> {
    const token = await this.authService.getAccessToken();

    try {
      console.log("[Airtel] Fetching account balance...");

      const response = await this.makeRequest<AirtelApiResponse<AirtelBalanceData>>(
        "GET",
        "/standard/v2/users/balance",
        undefined,
        token
      );

      if (response.status?.success || response.status?.code === "200") {
        return {
          balance: response.data?.balance || "0",
          currency: response.data?.currency || this.config.currency,
          accountStatus: response.data?.account_status || "UNKNOWN",
        };
      }

      throw new ProviderApiError(
        response.status?.message || "Failed to fetch balance",
        response.status?.code || "BALANCE_FAILED",
        this.code
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;

      const err = error as Error;
      throw new ProviderApiError(
        `Airtel balance enquiry failed: ${err.message}`,
        "BALANCE_ERROR",
        this.code
      );
    }
  }

  /**
   * Vérification Webhook (HMAC-SHA256)
   * Airtel envoie un hash dans le header pour vérifier l'intégrité
   */
  verifyWebhook(
    payload: unknown,
    signature: string,
    _headers: Record<string, string>
  ): boolean {
    // En environnement UAT/sandbox, on peut bypasser si pas de secret configuré
    if (this.config.environment !== "production" && !this.config.callbackHmacSecret) {
      console.log("[Airtel] UAT mode: skipping webhook signature verification");
      return true;
    }

    // En production, le secret HMAC est obligatoire
    if (!this.config.callbackHmacSecret) {
      console.error("[Airtel] Production mode but no HMAC secret configured!");
      return false;
    }

    // Vérifier la signature
    return AirtelEncryptionService.verifyCallbackSignature(
      payload,
      signature,
      this.config.callbackHmacSecret
    );
  }

  /**
   * Parse le payload d'un webhook Airtel
   */
  parseWebhookPayload(payload: unknown): WebhookPayload {
    const data = payload as Record<string, unknown>;
    const tx = (data.transaction || data.txnRes || data) as Record<string, unknown>;

    return {
      providerRef: (tx.id as string) || (data.reference as string),
      externalRef: tx.partner_id as string | undefined,
      status: this.normalizeStatus(
        (tx.status_code || tx.processingStatus || tx.status) as string
      ),
      financialTransactionId: tx.airtel_money_id as string | undefined,
      reason: (tx.message || data.message) as string | undefined,
      ...data,
    };
  }

  /**
   * Normalise le statut Airtel vers nos statuts internes
   * Codes Airtel: TS (Success), TF (Failed), TIP (In Progress), TE (Expired)
   */
  normalizeStatus(providerStatus: string): "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" {
    if (!providerStatus) return "PENDING";

    const status = providerStatus.toUpperCase();

    if (["TS", "SUCCESS", "SUCCESSFUL", "PROCESSED", "COMPLETED"].includes(status)) {
      return "SUCCESS";
    }

    if (["TF", "FAILED", "REJECTED", "DECLINED", "CANCELLED"].includes(status)) {
      return "FAILED";
    }

    if (["TE", "EXPIRED", "TIMEOUT"].includes(status)) {
      return "EXPIRED";
    }

    // TIP = Transaction In Progress
    return "PENDING";
  }

  /**
   * Invalide le token en cache (utile après erreur 401)
   */
  invalidateToken(): void {
    this.authService.invalidateToken();
  }

  /**
   * Invalide le cache de la clé RSA (utile si erreur de chiffrement)
   */
  invalidateEncryptionKey(): void {
    this.encryption.invalidatePublicKey();
  }

  /**
   * Retourne les infos de monitoring (token, clé RSA)
   */
  getProviderStatus(): {
    token: { hasToken: boolean; expiresIn?: number; age?: number } | null;
    encryptionKey: { hasKey: boolean; expiresIn?: number; age?: number };
    config: Record<string, unknown>;
  } {
    return {
      token: this.authService.getTokenInfo(),
      encryptionKey: this.encryption.getKeyInfo(),
      config: maskAirtelConfig(this.config),
    };
  }

  /**
   * Helper pour les requêtes HTTP avec gestion des erreurs
   */
  private async makeRequest<T>(
    method: "GET" | "POST",
    endpoint: string,
    body?: unknown,
    token?: string,
    additionalHeaders?: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "*/*",
      "X-Country": this.config.country,
      "X-Currency": this.config.currency,
      ...additionalHeaders,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ProviderApiError(
          `HTTP ${response.status}: ${JSON.stringify(data)}`,
          String(response.status),
          this.code,
          response.status,
          data
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderApiError(
          "Request timed out",
          "TIMEOUT",
          this.code,
          408
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Normalise le numéro de téléphone au format MSISDN (sans +)
   * Congo Brazzaville: indicatif 242
   */
  private normalizePhone(phone: string): string {
    // Retirer tous les caractères non numériques
    let cleaned = phone.replace(/[^\d]/g, "");

    // Si ne commence pas par l'indicatif pays (242 pour Congo), l'ajouter
    if (!cleaned.startsWith("242")) {
      // Retirer le 0 initial si présent
      if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
      }
      cleaned = "242" + cleaned;
    }

    return cleaned;
  }
}
