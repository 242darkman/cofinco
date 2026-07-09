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
  /** If true, this error is permanent (e.g. provider not configured) — skip retries */
  permanent?: boolean;
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

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  /** Content-ID for inline images (e.g. "company-logo" → <img src="cid:company-logo">) */
  cid?: string;
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
      attachments?: EmailAttachment[];
    }
  ): Promise<SendResult>;
}
