import type { EmailProvider, SendResult } from "./provider.interface";
import { db } from "../../../db";
import { emailProviderSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * SMTP configuration resolved from DB or env vars.
 */
interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
}

/**
 * SMTP Email provider using nodemailer.
 * Loads configuration from `email_provider_settings` table (isPrimary + isActive).
 * Falls back to SMTP_* environment variables if no DB config is found.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";

  private async resolveConfig(): Promise<SmtpConfig | null> {
    // 1. Try DB settings first
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

    if (settings?.host && settings?.port) {
      return {
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        username: settings.username ?? undefined,
        password: settings.password ?? undefined,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
      };
    }

    // 2. Fallback to env vars
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const username = process.env.SMTP_USERNAME;
    const password = process.env.SMTP_PASSWORD;

    if (host && username && password) {
      return {
        host,
        port,
        secure: process.env.SMTP_SECURE === "true",
        username,
        password,
        fromEmail: process.env.SMTP_FROM_EMAIL || username,
        fromName: process.env.SMTP_FROM_NAME || "COFIN&CO-M",
      };
    }

    return null;
  }

  async send(
    to: string,
    subject: string,
    html: string,
    text: string,
    options?: { fromEmail?: string; fromName?: string; replyTo?: string }
  ): Promise<SendResult> {
    const config = await this.resolveConfig();

    if (!config) {
      return { success: false, error: "No email provider configured (DB or env)" };
    }

    try {
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth:
          config.username && config.password
            ? {
                user: config.username,
                pass: config.password,
              }
            : undefined,
      });

      const from = `"${options?.fromName || config.fromName}" <${options?.fromEmail || config.fromEmail}>`;

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

  /**
   * Verify SMTP connection at startup.
   * Returns a human-readable status string for logging.
   */
  async verify(): Promise<{ ok: boolean; message: string }> {
    const config = await this.resolveConfig();

    if (!config) {
      return { ok: false, message: "No SMTP configuration found (DB or env)" };
    }

    try {
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth:
          config.username && config.password
            ? { user: config.username, pass: config.password }
            : undefined,
        connectionTimeout: 10_000,
      });

      await transporter.verify();

      return {
        ok: true,
        message: `SMTP OK — ${config.host}:${config.port} (from: ${config.fromEmail})`,
      };
    } catch (error: any) {
      return {
        ok: false,
        message: `SMTP FAILED — ${config.host}:${config.port} — ${error.message}`,
      };
    }
  }
}
