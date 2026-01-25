import type { EmailProvider, SendResult } from "./provider.interface";
import { db } from "../../../db";
import { emailProviderSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * SMTP Email provider using nodemailer.
 * Loads configuration from `email_provider_settings` table (isPrimary + isActive).
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";

  async send(
    to: string,
    subject: string,
    html: string,
    text: string,
    options?: { fromEmail?: string; fromName?: string; replyTo?: string }
  ): Promise<SendResult> {
    // Load SMTP settings from DB
    const [settings] = await db
      .select()
      .from(emailProviderSettings)
      .where(
        and(
          eq(emailProviderSettings.isActive, true),
          eq(emailProviderSettings.isPrimary, true)
        )
      )
      .limit(1);

    if (!settings) {
      return { success: false, error: "No email provider configured or active" };
    }

    if (!settings.host || !settings.port) {
      return { success: false, error: "Email provider SMTP host/port not configured" };
    }

    try {
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth:
          settings.username && settings.password
            ? {
                user: settings.username,
                pass: settings.password,
              }
            : undefined,
      });

      const from = `"${options?.fromName || settings.fromName}" <${options?.fromEmail || settings.fromEmail}>`;

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
        replyTo: options?.replyTo,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      console.error("[EmailProvider] Send failed:", error.message);
      return {
        success: false,
        error: error.message || "Email send failed",
      };
    }
  }
}
