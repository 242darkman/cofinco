/**
 * @module routes/payments/webhooks
 * Routes API pour les webhooks Mobile Money.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../../lib/logger";
import { handleWebhook } from "../../services/mobile-money/payment-service";
import { PAWAPAY_CALLBACK_IPS } from "../../services/mobile-money/providers/pawapay/pawapay-config";

const logger = createLogger('Routes:Payments:Webhooks');

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const mask = ~(Math.pow(2, 32 - parseInt(bits, 10)) - 1);

  const ipNum = ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  const rangeNum = range.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);

  return (ipNum & mask) === (rangeNum & mask);
}

function isPawaPayIpAllowed(ip: string): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  if (process.env.WEBHOOK_IP_VALIDATION !== "true") {
    return true;
  }

  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
    return false;
  }

  const environment = (process.env.PAWAPAY_ENVIRONMENT || "sandbox") as "sandbox" | "production";
  const whitelist = PAWAPAY_CALLBACK_IPS[environment];

  return whitelist.some(cidr => {
    if (cidr.includes("/")) {
      return isIpInCidr(ip, cidr);
    }
    return ip === cidr;
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function pawaPayIpValidator(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);

  if (!isPawaPayIpAllowed(clientIp)) {
    logger.warn({ clientIp }, 'pawaPay webhook rejected: unauthorized IP');
    return res.status(200).json({ received: true });
  }

  (req as any).webhookClientIp = clientIp;
  next();
}

async function handlePawaPayWebhook(req: Request, res: Response) {
  const startTime = Date.now();
  const clientIp = (req as any).webhookClientIp || getClientIp(req);

  const rawBody = (req as any).rawBody as Buffer | undefined;
  const bodyForSignature = rawBody ? rawBody.toString("utf-8") : JSON.stringify(req.body);

  logger.info({ clientIp, bodySize: bodyForSignature.length }, 'pawaPay webhook received');

  try {
    const signature = (req.headers["signature"] as string) ||
                      (req.headers["signature-input"] as string) || "";
    const headers = req.headers as Record<string, string>;

    await handleWebhook(req.body, bodyForSignature, signature, headers);

    logger.info({ processingTimeMs: Date.now() - startTime }, 'pawaPay webhook processed');

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error, processingTimeMs: Date.now() - startTime }, 'pawaPay webhook error');
    res.status(200).json({ received: true, error: "Processing failed" });
  }
}

export function registerPaymentsWebhooksRoutes(app: Express): void {
  app.post("/api/webhooks/pawapay", pawaPayIpValidator, handlePawaPayWebhook);
  app.post("/api/payments/webhooks/pawapay", pawaPayIpValidator, handlePawaPayWebhook);
}
