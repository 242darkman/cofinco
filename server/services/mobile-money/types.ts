/**
 * Mobile Money Provider Types
 * Interfaces et types pour l'intégration MTN/Airtel
 */

// ============================================
// REQUEST TYPES
// ============================================

export interface CollectRequest {
  amount: number;
  phone: string;
  externalRef: string;      // Notre UUID unique
  callbackUrl: string;
  currency?: string;        // Default XAF
  description?: string;
  payerMessage?: string;    // Message affiché au payeur
}

export interface PayoutRequest {
  amount: number;
  phone: string;
  externalRef: string;
  currency?: string;
  description?: string;
  payeeNote?: string;       // Note pour le bénéficiaire
}

// ============================================
// RESPONSE TYPES
// ============================================

export interface CollectResponse {
  providerRef: string;      // Référence initiale du provider
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  message?: string;
}

export interface PayoutResponse {
  providerRef: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  message?: string;
}

export interface StatusResponse {
  status: "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
  providerTxnId?: string;   // ID final de transaction
  errorCode?: string;
  errorMessage?: string;
  financialTransactionId?: string;
}

// ============================================
// WEBHOOK TYPES
// ============================================

export interface WebhookPayload {
  providerRef?: string;
  externalRef?: string;
  status: string;
  financialTransactionId?: string;
  reason?: string;
  [key: string]: unknown;   // Autres champs spécifiques au provider
}

// ============================================
// PROVIDER INTERFACE
// ============================================

export interface IMobileMoneyProvider {
  /**
   * Nom du provider (pour logs et affichage)
   */
  readonly name: string;

  /**
   * Code du provider (MTN ou AIRTEL)
   */
  readonly code: "MTN" | "AIRTEL";

  /**
   * Initie une collection (argent entrant)
   * Dépôt, remboursement, cotisation tontine
   */
  collect(request: CollectRequest): Promise<CollectResponse>;

  /**
   * Initie un payout (argent sortant)
   * Décaissement crédit, retrait, remboursement frais
   */
  payout(request: PayoutRequest): Promise<PayoutResponse>;

  /**
   * Récupère le statut d'une transaction
   * Utilisé pour la réconciliation
   */
  getStatus(providerRef: string): Promise<StatusResponse>;

  /**
   * Vérifie la signature d'un webhook
   * @returns true si valide, false sinon
   */
  verifyWebhook(
    payload: unknown,
    signature: string,
    headers: Record<string, string>
  ): boolean;

  /**
   * Parse le payload d'un webhook pour extraire les infos pertinentes
   */
  parseWebhookPayload(payload: unknown): WebhookPayload;

  /**
   * Normalise le statut du provider vers nos statuts internes
   */
  normalizeStatus(providerStatus: string): "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

  /**
   * Récupère le solde du compte provider (optionnel)
   */
  getBalance?(): Promise<ProviderBalanceResponse>;
}

export interface ProviderBalanceResponse {
  balance: string;
  currency: string;
  accountStatus: string;
}

// ============================================
// PAYMENT SERVICE TYPES
// ============================================

export interface InitiateCollectionParams {
  provider: "MTN" | "AIRTEL";
  amount: number;
  phone: string;
  clientId: string;
  compteId?: string;
  creditId?: string;
  tontineId?: string;
  description?: string;
  idempotencyKey?: string;
  agenceId?: string;
  metadata?: Record<string, unknown>;
}

export interface InitiatePayoutParams {
  provider: "MTN" | "AIRTEL";
  amount: number;
  phone: string;
  clientId: string;
  compteId?: string;
  creditId?: string;
  description?: string;
  idempotencyKey?: string;
  agenceId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentIntentFilter {
  agenceId?: string;
  status?: string;
  provider?: string;
  type?: string;
  clientId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

// ============================================
// ERROR TYPES
// ============================================

export class MobileMoneyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = "MobileMoneyError";
  }
}

export class ProviderApiError extends MobileMoneyError {
  constructor(
    message: string,
    code: string,
    provider: string,
    public readonly httpStatus?: number,
    public readonly providerResponse?: unknown
  ) {
    super(message, code, provider, httpStatus === 429 || (httpStatus !== undefined && httpStatus >= 500));
    this.name = "ProviderApiError";
  }
}

export class WebhookVerificationError extends MobileMoneyError {
  constructor(provider: string, reason: string) {
    super(`Webhook verification failed: ${reason}`, "WEBHOOK_VERIFICATION_FAILED", provider, false);
    this.name = "WebhookVerificationError";
  }
}
