/**
 * Common interfaces for notification providers (SMS, Email).
 */

export interface SendResult {
  success: boolean;
  messageId?: string;
  /** MTN-specific: request ID for delivery status tracking */
  requestId?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface SmsProvider {
  readonly name: string;
  send(
    to: string,
    message: string,
    options?: {
      correlationId?: string;
      senderAddress?: string;
    }
  ): Promise<SendResult>;
  checkDeliveryStatus?(
    requestId: string,
    senderAddress: string
  ): Promise<{ status: string; rawResponse: unknown }>;
}

export interface EmailProvider {
  readonly name: string;
  send(
    to: string,
    subject: string,
    html: string,
    text: string,
    options?: {
      fromEmail?: string;
      fromName?: string;
      replyTo?: string;
    }
  ): Promise<SendResult>;
}
