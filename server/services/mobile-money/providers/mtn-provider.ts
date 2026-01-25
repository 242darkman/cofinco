/**
 * MTN MoMo Provider
 * Implémentation de l'API MTN Mobile Money (Sandbox/Production)
 */

import { v4 as uuidv4 } from "uuid";
import type {
  IMobileMoneyProvider,
  CollectRequest,
  CollectResponse,
  PayoutRequest,
  PayoutResponse,
  StatusResponse,
  WebhookPayload
} from "../types";
import { ProviderApiError, WebhookVerificationError } from "../types";

// Configuration MTN depuis les variables d'environnement
const MTN_CONFIG = {
  apiUrl: process.env.MTN_MOMO_API_URL || "https://sandbox.momodeveloper.mtn.com",
  apiKey: process.env.MTN_MOMO_API_KEY || "",
  userId: process.env.MTN_MOMO_USER_ID || "",
  primaryKey: process.env.MTN_MOMO_PRIMARY_KEY || "",
  callbackUrl: process.env.MTN_MOMO_CALLBACK_URL || "",
  environment: process.env.MTN_MOMO_ENVIRONMENT || "sandbox",
};

// Types spécifiques MTN
interface MTNToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface MTNRequestToPayBody {
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

interface MTNTransferBody {
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

interface MTNTransactionStatus {
  amount: string;
  currency: string;
  financialTransactionId?: string;
  externalId: string;
  payer?: { partyIdType: string; partyId: string };
  payee?: { partyIdType: string; partyId: string };
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  reason?: { code: string; message: string };
}

export class MTNProvider implements IMobileMoneyProvider {
  readonly name = "MTN Mobile Money";
  readonly code = "MTN" as const;

  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /**
   * Récupère un token d'accès OAuth2
   */
  private async getAccessToken(): Promise<string> {
    // Vérifier si le token est encore valide (avec marge de 60 secondes)
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${MTN_CONFIG.userId}:${MTN_CONFIG.apiKey}`).toString("base64");

    try {
      const response = await fetch(`${MTN_CONFIG.apiUrl}/collection/token/`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.primaryKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ProviderApiError(
          `Failed to get MTN access token: ${errorText}`,
          "TOKEN_ERROR",
          this.code,
          response.status,
          errorText
        );
      }

      const data = (await response.json()) as MTNToken;
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;

      return this.accessToken;
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      throw new ProviderApiError(
        `MTN token request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "TOKEN_ERROR",
        this.code
      );
    }
  }

  /**
   * Initie une collection (RequestToPay)
   */
  async collect(request: CollectRequest): Promise<CollectResponse> {
    const token = await this.getAccessToken();
    const referenceId = uuidv4();

    const body: MTNRequestToPayBody = {
      amount: request.amount.toString(),
      currency: request.currency || "XAF",
      externalId: request.externalRef,
      payer: {
        partyIdType: "MSISDN",
        partyId: this.normalizePhone(request.phone),
      },
      payerMessage: request.payerMessage || request.description || "Payment request",
      payeeNote: request.description || "Payment",
    };

    try {
      const response = await fetch(`${MTN_CONFIG.apiUrl}/collection/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": MTN_CONFIG.environment,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.primaryKey,
          "X-Callback-Url": request.callbackUrl || MTN_CONFIG.callbackUrl,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 202) {
        // Accepted - Request is being processed
        return {
          providerRef: referenceId,
          status: "PENDING",
          message: "Request to pay initiated successfully",
        };
      }

      if (response.status === 200) {
        return {
          providerRef: referenceId,
          status: "ACCEPTED",
        };
      }

      const errorText = await response.text();
      throw new ProviderApiError(
        `MTN RequestToPay failed: ${errorText}`,
        "COLLECT_FAILED",
        this.code,
        response.status,
        errorText
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      throw new ProviderApiError(
        `MTN collect request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "COLLECT_ERROR",
        this.code
      );
    }
  }

  /**
   * Initie un payout (Transfer/Disbursement)
   */
  async payout(request: PayoutRequest): Promise<PayoutResponse> {
    const token = await this.getAccessToken();
    const referenceId = uuidv4();

    const body: MTNTransferBody = {
      amount: request.amount.toString(),
      currency: request.currency || "XAF",
      externalId: request.externalRef,
      payee: {
        partyIdType: "MSISDN",
        partyId: this.normalizePhone(request.phone),
      },
      payerMessage: request.description || "Transfer",
      payeeNote: request.payeeNote || request.description || "Transfer received",
    };

    try {
      // Note: Disbursement API endpoint - requires separate subscription
      const response = await fetch(`${MTN_CONFIG.apiUrl}/disbursement/v1_0/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": MTN_CONFIG.environment,
          "Ocp-Apim-Subscription-Key": MTN_CONFIG.primaryKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 202) {
        return {
          providerRef: referenceId,
          status: "PENDING",
          message: "Transfer initiated successfully",
        };
      }

      if (response.status === 200) {
        return {
          providerRef: referenceId,
          status: "ACCEPTED",
        };
      }

      const errorText = await response.text();
      throw new ProviderApiError(
        `MTN Transfer failed: ${errorText}`,
        "PAYOUT_FAILED",
        this.code,
        response.status,
        errorText
      );
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      throw new ProviderApiError(
        `MTN payout request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYOUT_ERROR",
        this.code
      );
    }
  }

  /**
   * Récupère le statut d'une transaction
   */
  async getStatus(providerRef: string): Promise<StatusResponse> {
    const token = await this.getAccessToken();

    try {
      // Essayer d'abord avec l'API collection
      const response = await fetch(
        `${MTN_CONFIG.apiUrl}/collection/v1_0/requesttopay/${providerRef}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": MTN_CONFIG.environment,
            "Ocp-Apim-Subscription-Key": MTN_CONFIG.primaryKey,
          },
        }
      );

      if (!response.ok) {
        // Essayer avec l'API disbursement
        const disbResponse = await fetch(
          `${MTN_CONFIG.apiUrl}/disbursement/v1_0/transfer/${providerRef}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Target-Environment": MTN_CONFIG.environment,
              "Ocp-Apim-Subscription-Key": MTN_CONFIG.primaryKey,
            },
          }
        );

        if (!disbResponse.ok) {
          throw new ProviderApiError(
            "Transaction not found",
            "NOT_FOUND",
            this.code,
            response.status
          );
        }

        const disbData = (await disbResponse.json()) as MTNTransactionStatus;
        return this.mapStatusResponse(disbData);
      }

      const data = (await response.json()) as MTNTransactionStatus;
      return this.mapStatusResponse(data);
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      throw new ProviderApiError(
        `MTN status check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "STATUS_ERROR",
        this.code
      );
    }
  }

  /**
   * Mappe la réponse MTN vers notre format StatusResponse
   */
  private mapStatusResponse(data: MTNTransactionStatus): StatusResponse {
    return {
      status: this.normalizeStatus(data.status),
      providerTxnId: data.financialTransactionId,
      errorCode: data.reason?.code,
      errorMessage: data.reason?.message,
      financialTransactionId: data.financialTransactionId,
    };
  }

  /**
   * Vérifie la signature d'un webhook MTN
   */
  verifyWebhook(payload: unknown, signature: string, headers: Record<string, string>): boolean {
    // MTN utilise HMAC-SHA256 pour signer les callbacks
    // En sandbox, la vérification peut être désactivée
    if (MTN_CONFIG.environment === "sandbox") {
      console.log("[MTN] Sandbox mode: skipping webhook signature verification");
      return true;
    }

    if (!signature) {
      console.warn("[MTN] No signature provided in webhook");
      return false;
    }

    try {
      const crypto = require("crypto");
      const hmac = crypto.createHmac("sha256", MTN_CONFIG.apiKey);
      hmac.update(JSON.stringify(payload));
      const expectedSignature = hmac.digest("hex");

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        console.warn("[MTN] Webhook signature mismatch");
      }

      return isValid;
    } catch (error) {
      console.error("[MTN] Webhook verification error:", error);
      return false;
    }
  }

  /**
   * Parse le payload d'un webhook MTN
   */
  parseWebhookPayload(payload: unknown): WebhookPayload {
    const data = payload as Record<string, unknown>;

    return {
      providerRef: data.referenceId as string | undefined,
      externalRef: data.externalId as string | undefined,
      status: (data.status as string) || "UNKNOWN",
      financialTransactionId: data.financialTransactionId as string | undefined,
      reason: data.reason as string | undefined,
      ...data,
    };
  }

  /**
   * Normalise le statut MTN vers nos statuts internes
   */
  normalizeStatus(providerStatus: string): "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" {
    switch (providerStatus.toUpperCase()) {
      case "SUCCESSFUL":
        return "SUCCESS";
      case "FAILED":
      case "REJECTED":
        return "FAILED";
      case "EXPIRED":
      case "TIMEOUT":
        return "EXPIRED";
      case "PENDING":
      default:
        return "PENDING";
    }
  }

  /**
   * Normalise le numéro de téléphone au format MSISDN
   */
  private normalizePhone(phone: string): string {
    // Retirer tous les caractères non numériques sauf le +
    let cleaned = phone.replace(/[^\d+]/g, "");

    // Si commence par +, retirer le +
    if (cleaned.startsWith("+")) {
      cleaned = cleaned.substring(1);
    }

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
