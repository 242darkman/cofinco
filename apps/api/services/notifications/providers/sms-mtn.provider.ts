import type { SmsProvider, SendResult } from "./provider.interface";
import { db } from "../../../db";
import { smsProviderSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../../../lib/logger";

const logger = createLogger('MtnSms');

// ============================================================================
// Token Cache (module-level singleton)
// ============================================================================

let cachedToken: { token: string; expiresAt: number } | null = null;

interface MtnSettings {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  smsBaseUrl: string;
}

// ============================================================================
// MTN SMS Provider
// ============================================================================

/**
 * MTN SMS API v2 provider.
 *
 * Specs:
 * - Host: https://api.mtn.com
 * - OAuth2 client_credentials: POST /v1/oauth/access_token/accesstoken?grant_type=client_credentials
 * - Send SMS: POST /v2/messages/sms/outbound
 *   Body: { senderAddress, receiverAddress[], message (max 160), clientCorrelator (<=36) }
 * - Delivery status: GET /v2/messages/sms/outbound/{senderAddress}/{requestId}/deliveryStatus
 *
 * Features:
 * - Token caching with TTL (auto-refresh on expiry)
 * - Auto-retry on 401 (token expired)
 * - Idempotence via clientCorrelator = correlationId
 * - PII minimisation in logs (no phone numbers in error messages)
 */
export class MtnSmsProvider implements SmsProvider {
  readonly name = "mtn";

  private settings: MtnSettings | null = null;

  /**
   * Load MTN provider settings from DB.
   * Caches in memory after first load.
   */
  private async loadSettings(): Promise<MtnSettings> {
    if (this.settings) return this.settings;

    const [provider] = await db
      .select()
      .from(smsProviderSettings)
      .where(eq(smsProviderSettings.providerName, "mtn"))
      .limit(1);

    if (!provider || !provider.settings) {
      throw new Error("MTN SMS provider not configured in sms_provider_settings");
    }

    const raw = provider.settings as Record<string, string>;
    if (!raw.clientId || !raw.clientSecret || !raw.tokenUrl || !raw.smsBaseUrl) {
      throw new Error("MTN SMS provider settings incomplete (clientId, clientSecret, tokenUrl, smsBaseUrl required)");
    }

    this.settings = raw as unknown as MtnSettings;
    return this.settings;
  }

  /**
   * Get a valid OAuth2 access token, using cache when possible.
   * Refreshes 60 seconds before expiry to avoid edge-case failures.
   */
  private async getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
      return cachedToken.token;
    }

    const settings = await this.loadSettings();

    const response = await fetch(settings.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString(
            "base64"
          ),
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `MTN OAuth2 token request failed: HTTP ${response.status} - ${text.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      token_type?: string;
    };

    const expiresIn = data.expires_in || 3600; // Default 1 hour

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    logger.info({ expiresIn }, 'Token acquired');

    return cachedToken.token;
  }

  /**
   * Send an SMS via MTN API.
   *
   * @param to - Recipient phone number (any format, will be normalized to tel:+242...)
   * @param message - Message body (max 160 chars, truncated if longer)
   * @param options - correlationId for idempotent delivery, senderAddress override
   */
  async send(
    to: string,
    message: string,
    options?: { correlationId?: string; senderAddress?: string }
  ): Promise<SendResult> {
    try {
      const settings = await this.loadSettings();
      let token = await this.getAccessToken();

      const senderAddress =
        options?.senderAddress || "tel:+242COFIN";
      const clientCorrelator = (options?.correlationId || "").substring(0, 36);

      const body = {
        senderAddress,
        receiverAddress: [formatMtnPhone(to)],
        message: message.substring(0, 160),
        clientCorrelator,
      };

      let response = await fetch(settings.smsBaseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      // Auto-refresh token on 401 (expired token)
      if (response.status === 401) {
        logger.info('Token expired, refreshing');
        cachedToken = null;
        token = await this.getAccessToken();

        response = await fetch(settings.smsBaseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      }

      const data = await response.json();

      if (response.ok) {
        const requestId =
          data.requestId || data.resourceReference?.resourceURL || clientCorrelator;

        logger.info({ correlator: clientCorrelator }, 'SMS sent successfully');

        return {
          success: true,
          messageId: data.resourceReference?.resourceURL,
          requestId,
          rawResponse: data,
        };
      }

      // MTN error format: { serviceException: { messageId, text, variables } }
      const errorMsg =
        data.serviceException?.text ||
        data.policyException?.text ||
        data.message ||
        `MTN error HTTP ${response.status}`;

      logger.error({ correlator: clientCorrelator, error: errorMsg }, 'SMS send failed');

      return {
        success: false,
        error: errorMsg,
        rawResponse: data,
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Unexpected error');
      return {
        success: false,
        error: error.message || "MTN send failed",
      };
    }
  }

  /**
   * Check delivery status for a previously sent SMS.
   *
   * GET /v2/messages/sms/outbound/{senderAddress}/{requestId}/deliveryStatus
   */
  async checkDeliveryStatus(
    requestId: string,
    senderAddress: string
  ): Promise<{ status: string; rawResponse: unknown }> {
    const settings = await this.loadSettings();
    const token = await this.getAccessToken();

    const url = `${settings.smsBaseUrl}/${encodeURIComponent(senderAddress)}/${encodeURIComponent(requestId)}/deliveryStatus`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    const deliveryStatus =
      data.deliveryInfoList?.deliveryInfo?.[0]?.deliveryStatus || "UNKNOWN";

    return {
      status: deliveryStatus,
      rawResponse: data,
    };
  }

  /**
   * Invalidate the cached settings (call after admin updates MTN config).
   */
  invalidateSettings(): void {
    this.settings = null;
    cachedToken = null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize a phone number to MTN's required format: tel:+242XXXXXXXXX
 */
function formatMtnPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");

  if (!cleaned.startsWith("242")) {
    if (cleaned.startsWith("0")) {
      cleaned = "242" + cleaned.substring(1);
    } else {
      cleaned = "242" + cleaned;
    }
  }

  return "tel:+" + cleaned;
}
