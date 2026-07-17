/**
 * pawaPay Provider
 * Implémentation unique de l'agrégateur pawaPay pour MTN MoMo et Airtel Money
 *
 * pawaPay est asynchrone: toute transaction retourne un statut ACCEPTED/REJECTED,
 * puis le statut final (COMPLETED/FAILED) arrive via callback ou polling.
 *
 * Particularités:
 * - depositId / payoutId = UUIDv4 fourni par nous (= externalRef)
 * - correspondent = identifiant de l'opérateur (MTN_MOMO_COG, AIRTEL_COG)
 * - Signature webhook = RFC 9421 + Content-Digest
 * - Bearer token (JWT) depuis le dashboard
 * - Pas d'OAuth: le token est statique et dure longtemps
 */

import type {
  IMobileMoneyProvider,
  CollectRequest,
  CollectResponse,
  PayoutRequest,
  PayoutResponse,
  RefundRequest,
  RefundResponse,
  StatusResponse,
  WebhookPayload,
  ProviderBalanceResponse,
} from "../../types";
import { ProviderApiError, MobileMoneyError } from "../../types";
import { loadPawaPayConfig, correspondentToOperator, resolveOperatorFromPhone, type PawaPayProviderConfig } from "./pawapay-config";
import { verifyPawaPaySignature } from "./pawapay-signature";
import { CircuitBreaker } from "../../circuit-breaker";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger('PawaPayProvider');

export class PawaPayProvider implements IMobileMoneyProvider {
  readonly name = "pawaPay";
  readonly code = "PAWAPAY" as any;
  private config: PawaPayProviderConfig;
  private circuitBreaker: CircuitBreaker;

  constructor(config?: Partial<PawaPayProviderConfig>) {
    const defaultConfig = loadPawaPayConfig();
    this.config = { ...defaultConfig, ...config };
    this.circuitBreaker = new CircuitBreaker({
      name: "pawaPay",
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });
  }

  /**
   * Indique si le provider dispose des identifiants requis pour appeler l'API
   * (token présent). En dev/local sans token, on l'utilise pour dégrader
   * proprement au lieu de laisser l'appel réseau échouer en 500.
   */
  isConfigured(): boolean {
    return this.config.apiToken.trim().length > 0;
  }

  // ============================================
  // COLLECT (Deposit - argent entrant)
  // ============================================

  async collect(request: CollectRequest): Promise<CollectResponse> {
    const {
      amount,
      phone,
      externalRef,
      currency,
      description,
    } = request;

    // Le correspondent est passé dans la description ou comme champ étendu
    const correspondent = (request as any).correspondent as string;
    if (!correspondent) {
      throw new MobileMoneyError(
        "correspondent is required for pawaPay deposits",
        "MISSING_CORRESPONDENT",
        "PAWAPAY",
        false
      );
    }

    const depositId = externalRef;
    const normalizedPhone = this.normalizePhone(phone);
    const customerMsg = this.buildCustomerMessage(description);

    const payload: Record<string, unknown> = {
      depositId,
      amount: this.formatAmount(amount),
      currency: currency || this.config.currency,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: normalizedPhone,
          provider: correspondent,
        },
      },
    };

    if (customerMsg) {
      payload.customerMessage = customerMsg;
    }

    logger.info({ depositId, correspondent, amount, phone: normalizedPhone }, "Initiating deposit");

    const response = await this.makeRequest("POST", "/v2/deposits", payload);
    const data = await response.json() as Record<string, unknown>;

    if (response.status === 200 || response.status === 201) {
      const status = data.status as string;

      if (status === "REJECTED") {
        const failure = data.failureReason as Record<string, string> | undefined;
        throw new ProviderApiError(
          `Deposit rejected: ${failure?.failureCode || "UNKNOWN"}`,
          failure?.failureCode || "REJECTED",
          "PAWAPAY",
          response.status,
          data
        );
      }

      if (status === "DUPLICATE_IGNORED") {
        logger.info({ depositId }, "Duplicate deposit ignored by pawaPay");
      }

      return {
        providerRef: depositId, // pawaPay utilise notre depositId comme référence
        status: status === "ACCEPTED" ? "PENDING" : "PENDING",
        message: `Deposit ${status}`,
      };
    }

    // Erreur HTTP — v2 uses failureReason for all errors
    const fr = (data.failureReason || data) as { failureCode?: string; failureMessage?: string };
    throw new ProviderApiError(
      fr.failureMessage || `HTTP ${response.status}`,
      fr.failureCode || `HTTP_${response.status}`,
      "PAWAPAY",
      response.status,
      data
    );
  }

  // ============================================
  // PAYOUT (Payout - argent sortant)
  // ============================================

  async payout(request: PayoutRequest): Promise<PayoutResponse> {
    const {
      amount,
      phone,
      externalRef,
      currency,
      description,
    } = request;

    const correspondent = (request as any).correspondent as string;
    if (!correspondent) {
      throw new MobileMoneyError(
        "correspondent is required for pawaPay payouts",
        "MISSING_CORRESPONDENT",
        "PAWAPAY",
        false
      );
    }

    const payoutId = externalRef;
    const normalizedPhone = this.normalizePhone(phone);
    const customerMsg = this.buildCustomerMessage(description);

    const payload: Record<string, unknown> = {
      payoutId,
      amount: this.formatAmount(amount),
      currency: currency || this.config.currency,
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber: normalizedPhone,
          provider: correspondent,
        },
      },
    };

    if (customerMsg) {
      payload.customerMessage = customerMsg;
    }

    logger.info({ payoutId, correspondent, amount, phone: normalizedPhone }, "Initiating payout");

    const response = await this.makeRequest("POST", "/v2/payouts", payload);
    const data = await response.json() as Record<string, unknown>;

    if (response.status === 200 || response.status === 201) {
      const status = data.status as string;

      if (status === "REJECTED") {
        const failure = data.failureReason as Record<string, string> | undefined;
        throw new ProviderApiError(
          `Payout rejected: ${failure?.failureCode || "UNKNOWN"}`,
          failure?.failureCode || "REJECTED",
          "PAWAPAY",
          response.status,
          data
        );
      }

      if (status === "DUPLICATE_IGNORED") {
        logger.info({ payoutId }, "Duplicate payout ignored by pawaPay");
      }

      return {
        providerRef: payoutId,
        status: status === "ACCEPTED" || status === "ENQUEUED" ? "PENDING" : "PENDING",
        message: `Payout ${status}`,
      };
    }

    const fr = (data.failureReason || data) as { failureCode?: string; failureMessage?: string };
    throw new ProviderApiError(
      fr.failureMessage || `HTTP ${response.status}`,
      fr.failureCode || `HTTP_${response.status}`,
      "PAWAPAY",
      response.status,
      data
    );
  }

  // ============================================
  // REFUND (Remboursement total ou partiel)
  // ============================================

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const { refundId, depositId, amount, currency } = request;

    const payload = {
      refundId,
      depositId,
      amount: this.formatAmount(amount),
      currency: currency || this.config.currency,
    };

    logger.info({ refundId, depositId, amount }, "Initiating refund");

    const response = await this.makeRequest("POST", "/v2/refunds", payload);
    const data = await response.json() as Record<string, unknown>;

    if (response.status === 200 || response.status === 201 || response.status === 202) {
      const status = data.status as string;

      if (status === "REJECTED") {
        const failure = data.failureReason as Record<string, string> | undefined;
        return {
          refundId,
          status: "REJECTED",
          rejectionCode: failure?.failureCode,
          rejectionMessage: failure?.failureMessage,
        };
      }

      return {
        refundId,
        status: "ACCEPTED",
      };
    }

    const fr = (data.failureReason || data) as { failureCode?: string; failureMessage?: string };
    throw new ProviderApiError(
      fr.failureMessage || `HTTP ${response.status}`,
      fr.failureCode || `HTTP_${response.status}`,
      "PAWAPAY",
      response.status,
      data
    );
  }

  // ============================================
  // GET STATUS (Polling)
  // ============================================

  async getStatus(ref: string): Promise<StatusResponse> {
    // Tenter les deux endpoints: deposit puis payout
    const types = ["deposits", "payouts"] as const;

    for (const type of types) {
      try {
        const response = await this.makeRequest("GET", `/v2/${type}/${ref}`);

        if (response.status === 404) continue;

        if (response.ok) {
          // v2 API wraps response: { status: "FOUND"/"NOT_FOUND", data: { ...txn } }
          const result = await response.json() as {
            status: "FOUND" | "NOT_FOUND";
            data?: {
              status: string;
              providerTransactionId?: string;
              failureReason?: { failureCode?: string; failureMessage?: string };
            };
          };

          if (result.status === "NOT_FOUND") continue;

          const txn = result.data;
          if (!txn) continue;

          const txnStatus = txn.status;
          return {
            status: this.normalizeStatus(txnStatus),
            providerTxnId: txn.providerTransactionId || undefined,
            errorCode: txnStatus === "FAILED"
              ? (txn.failureReason?.failureCode || undefined)
              : undefined,
            errorMessage: txnStatus === "FAILED"
              ? (txn.failureReason?.failureMessage || undefined)
              : undefined,
          };
        }
      } catch (error) {
        // Si erreur réseau, essayer le type suivant
        if (error instanceof ProviderApiError && error.httpStatus === 404) {
          continue;
        }
        throw error;
      }
    }

    // Si introuvable dans les deux endpoints
    return { status: "PENDING" };
  }

  // ============================================
  // WEBHOOK VERIFICATION
  // ============================================

  verifyWebhook(
    payload: unknown,
    _signature: string,
    headers: Record<string, string>
  ): boolean {
    // En sandbox, skip la vérification
    if (this.config.environment === "sandbox") {
      return true;
    }

    const bodyStr = typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

    return verifyPawaPaySignature(bodyStr, headers, this.config.webhookPublicKeys);
  }

  // ============================================
  // PARSE WEBHOOK PAYLOAD
  // ============================================

  parseWebhookPayload(payload: unknown): WebhookPayload {
    const data = payload as Record<string, unknown>;

    // pawaPay envoie soit depositId, payoutId ou refundId
    const depositId = data.depositId as string | undefined;
    const payoutId = data.payoutId as string | undefined;
    const refundId = data.refundId as string | undefined;
    const externalRef = depositId || payoutId || refundId || undefined;

    const status = this.normalizeStatus(data.status as string || "UNKNOWN");

    // Extraire l'ID de transaction (v2: providerTransactionId, v1: correspondentIds.transaction)
    const providerTxnId = data.providerTransactionId as string | undefined;
    const correspondentIds = data.correspondentIds as Record<string, string> | undefined;
    const financialTransactionId = providerTxnId || correspondentIds?.transaction || undefined;

    // Extraire la raison d'échec
    const failureReason = data.failureReason as Record<string, string> | undefined;
    const reason = failureReason?.failureMessage || failureReason?.failureCode || undefined;

    return {
      providerRef: externalRef, // pawaPay utilise notre ID comme ref
      externalRef,
      status,
      financialTransactionId,
      reason,
      // Champs supplémentaires utiles
      correspondent: data.correspondent as string | undefined,
      depositedAmount: data.depositedAmount as string | undefined,
      amount: data.amount as string | undefined,
      currency: data.currency as string | undefined,
      created: data.created as string | undefined,
      completed: data.completed as string | undefined,
      metadata: data.metadata,
    };
  }

  // ============================================
  // NORMALIZE STATUS
  // ============================================

  normalizeStatus(providerStatus: string): "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" {
    if (!providerStatus) return "PENDING";

    const status = providerStatus.toUpperCase();

    switch (status) {
      case "COMPLETED":
        return "SUCCESS";
      case "FAILED":
        return "FAILED";
      case "ACCEPTED":
      case "SUBMITTED":
      case "ENQUEUED":
        return "PENDING";
      default:
        return "PENDING";
    }
  }

  // ============================================
  // GET BALANCE
  // ============================================

  async getBalance(): Promise<ProviderBalanceResponse> {
    try {
      const response = await this.makeRequest("GET", "/v2/wallet-balances");

      if (response.ok) {
        const data = await response.json() as {
          balances: Array<{
            country: string;
            balance: string;
            currency: string;
            provider: string;
          }>;
        };

        // Combiner les soldes pour le Congo
        let totalBalance = 0;
        for (const wallet of data.balances) {
          if (wallet.country === this.config.country) {
            totalBalance += parseFloat(wallet.balance || "0");
          }
        }

        return {
          balance: totalBalance.toString(),
          currency: this.config.currency,
          accountStatus: "ACTIVE",
        };
      }

      throw new ProviderApiError(
        "Failed to fetch wallet balances",
        "BALANCE_FETCH_FAILED",
        "PAWAPAY",
        response.status
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      throw new MobileMoneyError(
        `Balance check failed: ${(error as Error).message}`,
        "BALANCE_ERROR",
        "PAWAPAY",
        true
      );
    }
  }

  /**
   * Récupère les soldes par correspondant (MTN et Airtel séparément)
   * Si le wallet est partagé (provider=""), retourne les deux opérateurs
   * avec le solde total et un flag shared=true
   */
  async getBalancePerCorrespondent(): Promise<Array<{
    correspondent: string;
    operator: "MTN" | "AIRTEL";
    balance: string;
    currency: string;
    shared: boolean;
  }>> {
    const response = await this.makeRequest("GET", "/v2/wallet-balances");

    if (!response.ok) {
      throw new ProviderApiError(
        "Failed to fetch wallet balances",
        "BALANCE_FETCH_FAILED",
        "PAWAPAY",
        response.status
      );
    }

    const data = await response.json() as {
      balances: Array<{
        country: string;
        balance: string;
        currency: string;
        provider: string;
      }>;
    };

    const countryWallets = data.balances.filter(w => w.country === this.config.country);
    const results: Array<{
      correspondent: string;
      operator: "MTN" | "AIRTEL";
      balance: string;
      currency: string;
      shared: boolean;
    }> = [];

    for (const w of countryWallets) {
      if (w.provider) {
        // Per-provider wallet
        results.push({
          correspondent: w.provider,
          operator: correspondentToOperator(w.provider),
          balance: w.balance,
          currency: w.currency,
          shared: false,
        });
      } else {
        // Shared wallet — expand to both operators
        results.push(
          {
            correspondent: "MTN_MOMO_COG",
            operator: "MTN",
            balance: w.balance,
            currency: w.currency,
            shared: true,
          },
          {
            correspondent: "AIRTEL_COG",
            operator: "AIRTEL",
            balance: w.balance,
            currency: w.currency,
            shared: true,
          },
        );
      }
    }

    return results;
  }

  /**
   * Vérifie la disponibilité des correspondants
   */
  async checkAvailability(): Promise<Array<{
    correspondent: string;
    operator: "MTN" | "AIRTEL";
    depositsAvailable: boolean;
    payoutsAvailable: boolean;
  }>> {
    const response = await this.makeRequest("GET", "/v2/active-conf");

    if (!response.ok) {
      throw new ProviderApiError(
        "Failed to fetch active configuration",
        "CONFIG_FETCH_FAILED",
        "PAWAPAY",
        response.status
      );
    }

    const data = await response.json() as Array<{
      correspondent: string;
      country: string;
      currency: string;
      operationTypes: Array<{ operationType: string; status: string }>;
    }>;

    return data
      .filter(c => c.country === this.config.country)
      .map(c => ({
        correspondent: c.correspondent,
        operator: correspondentToOperator(c.correspondent),
        depositsAvailable: c.operationTypes.some(
          o => o.operationType === "DEPOSIT" && o.status === "ACTIVE"
        ),
        payoutsAvailable: c.operationTypes.some(
          o => o.operationType === "PAYOUT" && o.status === "ACTIVE"
        ),
      }));
  }

  /**
   * Demande le renvoi d'un callback
   */
  async resendCallback(id: string, type: "deposit" | "payout"): Promise<void> {
    const endpoint = type === "deposit"
      ? `/v2/deposits/resend-callback/${id}`
      : `/v2/payouts/resend-callback/${id}`;

    const response = await this.makeRequest("POST", endpoint);

    if (!response.ok) {
      throw new ProviderApiError(
        `Failed to resend callback for ${type} ${id}`,
        "RESEND_CALLBACK_FAILED",
        "PAWAPAY",
        response.status
      );
    }

    logger.info({ id, type }, "Callback resend requested");
  }

  // ============================================
  // FAIL ENQUEUED PAYOUT (Cancel queued payout)
  // ============================================

  async failEnqueuedPayout(payoutId: string): Promise<void> {
    const response = await this.makeRequest("POST", `/v2/payouts/fail-enqueued/${payoutId}`);

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      const fr = (data.failureReason || data) as Record<string, string>;
      throw new ProviderApiError(
        fr.failureMessage || `Failed to cancel enqueued payout ${payoutId}`,
        fr.failureCode || "FAIL_ENQUEUED_FAILED",
        "PAWAPAY",
        response.status,
        data
      );
    }

    logger.info({ payoutId }, "Enqueued payout failed/cancelled");
  }

  // ============================================
  // INTERNAL HELPERS
  // ============================================

  /**
   * Effectue une requête HTTP vers l'API pawaPay avec retry
   */
  private async makeRequest(
    method: "GET" | "POST",
    endpoint: string,
    body?: unknown
  ): Promise<Response> {
    return this.circuitBreaker.execute(async () => {
      const url = `${this.config.baseUrl}${endpoint}`;
      const maxRetries = this.config.maxRetries;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

        try {
          const headers: Record<string, string> = {
            "Authorization": `Bearer ${this.config.apiToken}`,
            "Accept": "application/json",
          };

          if (body) {
            headers["Content-Type"] = "application/json";
          }

          const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          // Succès ou erreur client (sauf 429) — retourner directement
          if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
            return response;
          }

          // Rate limit (429) ou erreur serveur (5xx) — retry
          if (response.status === 429 || response.status >= 500) {
            lastError = new Error(`HTTP ${response.status}`);
            if (attempt < maxRetries) {
              const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
              const jitter = Math.random() * 0.3 + 0.85;
              await this.sleep(delay * jitter);
              continue;
            }
            return response;
          }

          return response;
        } catch (error) {
          clearTimeout(timeout);
          lastError = error as Error;

          if (attempt < maxRetries) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
            await this.sleep(delay);
            continue;
          }
        }
      }

      throw new ProviderApiError(
        `Request failed after ${maxRetries} attempts: ${lastError?.message}`,
        "REQUEST_FAILED",
        "PAWAPAY",
        undefined,
        undefined
      );
    });
  }

  /**
   * Normalise le numéro de téléphone au format MSISDN pour le Congo
   */
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+")) {
      cleaned = cleaned.substring(1);
    }
    // Congo Brazzaville: assurer le préfixe 242
    if (!cleaned.startsWith("242")) {
      if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
      }
      cleaned = "242" + cleaned;
    }
    return cleaned;
  }

  /**
   * Formate le montant selon les contraintes pawaPay
   * XAF = pas de décimales
   */
  private formatAmount(amount: number): string {
    if (this.config.currency === "XAF") {
      return Math.round(amount).toString();
    }
    return amount.toString();
  }

  /**
   * Construit le statementDescription (4-22 chars alphanumériques)
   */
  private buildCustomerMessage(description?: string): string {
    const prefix = this.config.statementPrefix;
    if (!description) return prefix;

    // Nettoyer: garder uniquement alphanumériques et espaces
    const clean = `${prefix} ${description}`.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    // Tronquer à 22 chars
    return clean.substring(0, 22) || prefix;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // PREDICT CORRESPONDENT (Toolkit API)
  // ============================================

  /**
   * Prédit le correspondant à partir du numéro de téléphone.
   * Utilise l'API pawaPay Predict Correspondent en priorité, avec fallback
   * sur la résolution locale par préfixe si l'API est indisponible.
   *
   * @returns Le code correspondant (ex: MTN_MOMO_COG, AIRTEL_COG) ou null
   */
  async predictCorrespondent(msisdn: string): Promise<string | null> {
    const normalizedPhone = this.normalizePhone(msisdn);

    // 1. Essayer l'API pawaPay toolkit
    try {
      const response = await this.makeRequest(
        "GET",
        `/v1/toolkit/predict-correspondent?msisdn=${encodeURIComponent(normalizedPhone)}`
      );

      if (response.ok) {
        const data = await response.json() as {
          correspondent?: string;
          correspondents?: Array<{
            correspondent: string;
            operationTypes: Array<{ operationType: string; status: string }>;
          }>;
        };

        // L'API peut retourner un seul correspondent ou une liste
        if (data.correspondent) {
          logger.info({ msisdn: normalizedPhone, correspondent: data.correspondent }, "Predict correspondent: API match");
          return data.correspondent;
        }

        // Format alternatif: tableau de correspondents
        if (data.correspondents && data.correspondents.length > 0) {
          // Préférer un correspondant qui supporte PAYOUT
          const payoutCapable = data.correspondents.find(c =>
            c.operationTypes?.some(o => o.operationType === "PAYOUT" && o.status === "ACTIVE")
          );
          const chosen = payoutCapable || data.correspondents[0];
          logger.info({ msisdn: normalizedPhone, correspondent: chosen.correspondent }, "Predict correspondent: API match (from list)");
          return chosen.correspondent;
        }

        logger.warn({ msisdn: normalizedPhone }, "Predict correspondent: API returned no match");
        return null;
      }

      logger.warn({ msisdn: normalizedPhone, status: response.status }, "Predict correspondent: API error");
    } catch (error) {
      logger.warn({ msisdn: normalizedPhone, err: error }, "Predict correspondent: API indisponible");
    }

    // 2. Fallback sur résolution locale
    const operator = resolveOperatorFromPhone(normalizedPhone);
    if (operator) {
      const { operatorToCorrespondent } = await import("./pawapay-config");
      const fallbackCorrespondent = operatorToCorrespondent(operator);
      logger.info({ msisdn: normalizedPhone, operator, correspondent: fallbackCorrespondent }, "Predict correspondent: fallback local");
      return fallbackCorrespondent;
    }

    return null;
  }

  /**
   * Expose la config (pour les callbacks URL, etc.)
   */
  getConfig(): PawaPayProviderConfig {
    return this.config;
  }

  /**
   * Retourne l'état du circuit breaker
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset manuel du circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }
}

export default PawaPayProvider;
