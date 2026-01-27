/**
 * Payment Routes
 * Routes API pour les paiements Mobile Money et webhooks
 *
 * Webhooks sont publics mais protégés par:
 * - Validation de signature HMAC-SHA256
 * - Whitelist IP en production (optionnel)
 * - Rate limiting
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { paymentService } from "../services/mobile-money/payment-service";
import { initializeProviders } from "../services/mobile-money/provider-registry";
import {
  getReconciliationReports,
  markReportReviewed,
  markReportResolved,
  generateReconciliationReport,
} from "../cron/mm-reconciliation-report";
import { db } from "../db";
import { mmReconciliationReports } from "@shared/schema";
import { eq } from "drizzle-orm";

export const paymentsRouter = Router();
export const webhooksRouter = Router();

// ============================================
// WEBHOOK SECURITY MIDDLEWARE
// ============================================

/**
 * IP Whitelist pour les webhooks (en production)
 * Ces IPs sont les serveurs MTN et Airtel autorisés
 */
const WEBHOOK_IP_WHITELIST = {
  MTN: [
    // MTN MoMo Production IPs (à mettre à jour selon documentation MTN)
    "196.201.214.0/24",  // MTN Africa range (exemple)
    "41.202.219.0/24",   // MTN Congo range (exemple)
    // Sandbox IPs
    "20.0.0.0/8",        // Azure (sandbox)
  ],
  AIRTEL: [
    // Airtel Money Production IPs
    "41.222.0.0/16",     // Airtel Africa range (exemple)
  ],
};

/**
 * Vérifie si une IP est dans une plage CIDR
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const mask = ~(Math.pow(2, 32 - parseInt(bits, 10)) - 1);

  const ipNum = ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  const rangeNum = range.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Vérifie si une IP est dans la whitelist d'un provider
 */
function isIpAllowed(ip: string, provider: "MTN" | "AIRTEL"): boolean {
  // Bypass en développement
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // Si pas de whitelist configurée, autoriser
  if (process.env.WEBHOOK_IP_VALIDATION !== "true") {
    return true;
  }

  const whitelist = WEBHOOK_IP_WHITELIST[provider] || [];

  // Gérer localhost/loopback
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
    return process.env.NODE_ENV !== "production";
  }

  return whitelist.some(cidr => {
    if (cidr.includes("/")) {
      return isIpInCidr(ip, cidr);
    }
    return ip === cidr;
  });
}

/**
 * Extrait l'IP réelle de la requête (derrière proxy)
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

/**
 * Middleware de validation IP pour les webhooks
 */
function webhookIpValidator(provider: "MTN" | "AIRTEL") {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = getClientIp(req);

    if (!isIpAllowed(clientIp, provider)) {
      console.warn(`[Webhook ${provider}] Rejected request from unauthorized IP: ${clientIp}`);
      // Retourner 200 pour ne pas révéler la protection
      return res.status(200).json({ received: true });
    }

    // Ajouter l'IP au contexte pour les logs
    (req as any).webhookClientIp = clientIp;
    next();
  };
}

/**
 * Structure pour les logs webhook
 */
interface WebhookLogEntry {
  timestamp: string;
  provider: string;
  clientIp: string;
  hasSignature: boolean;
  bodySize: number;
  processingTimeMs?: number;
  result: "success" | "invalid_signature" | "processing_error" | "not_found";
  intentId?: string;
  error?: string;
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

const collectSchema = z.object({
  provider: z.enum(["MTN", "AIRTEL"]),
  amount: z.number().positive(),
  phone: z.string().min(8),
  clientId: z.string().uuid(),
  compteId: z.string().uuid().optional(),
  creditId: z.string().uuid().optional(),
  tontineId: z.string().uuid().optional(),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
  agenceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const payoutSchema = z.object({
  provider: z.enum(["MTN", "AIRTEL"]),
  amount: z.number().positive(),
  phone: z.string().min(8),
  clientId: z.string().uuid(),
  compteId: z.string().uuid().optional(),
  creditId: z.string().uuid().optional(),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
  agenceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listFilterSchema = z.object({
  status: z.string().optional(),
  provider: z.enum(["MTN", "AIRTEL"]).optional(),
  type: z.enum(["COLLECTION", "PAYOUT"]).optional(),
  clientId: z.string().uuid().optional(),
  agenceId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ============================================
// WEBHOOKS (Sans Auth - Publics mais sécurisés)
// ============================================

/**
 * POST /api/webhooks/mtn
 * Callback webhook MTN MoMo
 *
 * Sécurité:
 * - Validation IP (optionnelle en prod)
 * - Signature HMAC-SHA256 vérifiée par le provider
 * - Logs structurés
 */
// Handlers webhook réutilisables (montés sur paymentsRouter ET webhooksRouter)
async function handleMtnWebhook(req: Request, res: Response) {
  console.log("📩 MTN WEBHOOK POST:", { headers: req.headers, body: req.body });
  const startTime = Date.now();
  const clientIp = (req as any).webhookClientIp || getClientIp(req);

  const logEntry: WebhookLogEntry = {
    timestamp: new Date().toISOString(),
    provider: "MTN",
    clientIp,
    hasSignature: !!req.headers["x-callback-signature"],
    bodySize: JSON.stringify(req.body).length,
    result: "success",
  };

  try {
    const signature = (req.headers["x-callback-signature"] as string) || "";
    const headers = req.headers as Record<string, string>;

    const bodyData = req.body as Record<string, unknown>;
    if (bodyData.externalId) {
      logEntry.intentId = bodyData.externalId as string;
    }

    await paymentService.handleWebhook("MTN", req.body, signature, headers);

    logEntry.processingTimeMs = Date.now() - startTime;
    console.log("[Webhook MTN] Processed successfully", logEntry);

    res.status(200).json({ received: true });
  } catch (error) {
    logEntry.processingTimeMs = Date.now() - startTime;
    logEntry.result = "processing_error";
    logEntry.error = error instanceof Error ? error.message : "Unknown error";

    console.error("[Webhook MTN] Processing error", logEntry);

    res.status(200).json({ received: true, error: "Processing failed" });
  }
}

async function handleAirtelWebhook(req: Request, res: Response) {
  const startTime = Date.now();
  const clientIp = (req as any).webhookClientIp || getClientIp(req);

  const logEntry: WebhookLogEntry = {
    timestamp: new Date().toISOString(),
    provider: "AIRTEL",
    clientIp,
    hasSignature: !!req.headers["x-airtel-signature"],
    bodySize: JSON.stringify(req.body).length,
    result: "success",
  };

  try {
    const signature = (req.headers["x-airtel-signature"] as string) || "";
    const headers = req.headers as Record<string, string>;

    const bodyData = req.body as Record<string, unknown>;
    const transaction = bodyData.transaction as Record<string, unknown> | undefined;
    if (transaction?.partner_id) {
      logEntry.intentId = transaction.partner_id as string;
    }

    await paymentService.handleWebhook("AIRTEL", req.body, signature, headers);

    logEntry.processingTimeMs = Date.now() - startTime;
    console.log("[Webhook Airtel] Processed successfully", logEntry);

    res.status(200).json({ received: true });
  } catch (error) {
    logEntry.processingTimeMs = Date.now() - startTime;
    logEntry.result = "processing_error";
    logEntry.error = error instanceof Error ? error.message : "Unknown error";

    console.error("[Webhook Airtel] Processing error", logEntry);

    res.status(200).json({ received: true, error: "Processing failed" });
  }
}

// Routes webhook sur paymentsRouter: /api/payments/webhooks/mtn
paymentsRouter.post("/webhooks/mtn", webhookIpValidator("MTN"), handleMtnWebhook);
paymentsRouter.post("/webhooks/airtel", webhookIpValidator("AIRTEL"), handleAirtelWebhook);

// Routes webhook sur webhooksRouter: /api/webhooks/mtn (path propre pour les providers)
webhooksRouter.post("/mtn", webhookIpValidator("MTN"), handleMtnWebhook);
webhooksRouter.post("/airtel", webhookIpValidator("AIRTEL"), handleAirtelWebhook);

// ============================================
// API AUTHENTIFIÉE
// ============================================

/**
 * POST /api/payments/collect
 * Initier une collection (dépôt, remboursement)
 */
paymentsRouter.post("/collect", async (req, res) => {
  try {
    // Vérifier l'authentification
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = collectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.errors,
      });
    }

    const intent = await paymentService.initiateCollection(
      parsed.data,
      req.session.user.id
    );

    res.status(201).json(intent);
  } catch (error) {
    console.error("[Payments] Collection error:", error);
    res.status(500).json({
      error: "Erreur lors de l'initiation de la collection",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

/**
 * POST /api/payments/payout
 * Initier un payout (décaissement, retrait)
 */
paymentsRouter.post("/payout", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = payoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.errors,
      });
    }

    const intent = await paymentService.initiatePayout(
      parsed.data,
      req.session.user.id
    );

    res.status(201).json(intent);
  } catch (error) {
    console.error("[Payments] Payout error:", error);
    res.status(500).json({
      error: "Erreur lors de l'initiation du payout",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

/**
 * GET /api/payments/:id
 * Récupérer le statut d'un paiement
 */
paymentsRouter.get("/:id", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const intent = await paymentService.getPaymentIntent(req.params.id);

    if (!intent) {
      return res.status(404).json({ error: "Paiement non trouvé" });
    }

    res.json(intent);
  } catch (error) {
    console.error("[Payments] Get error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération du paiement" });
  }
});

/**
 * GET /api/payments
 * Lister les paiements avec filtres
 */
paymentsRouter.get("/", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = listFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Paramètres invalides",
        details: parsed.error.errors,
      });
    }

    const filter = {
      ...parsed.data,
      // Appliquer le filtre d'agence si l'utilisateur n'est pas admin
      agenceId: (req as any).agenceFilter?.agenceId || parsed.data.agenceId,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    };

    const result = await paymentService.listPaymentIntents(filter as any);

    res.json(result);
  } catch (error) {
    console.error("[Payments] List error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des paiements" });
  }
});

/**
 * POST /api/payments/:id/cancel
 * Annuler un paiement PENDING
 */
paymentsRouter.post("/:id/cancel", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const intent = await paymentService.cancelPayment(
      req.params.id,
      req.session.user.id
    );

    res.json(intent);
  } catch (error) {
    console.error("[Payments] Cancel error:", error);
    res.status(500).json({
      error: "Erreur lors de l'annulation du paiement",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

// ============================================
// RECONCILIATION API (Admin only)
// ============================================

/**
 * Validation schemas for reconciliation
 */
const reconciliationReportsFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  provider: z.enum(["MTN", "AIRTEL"]).optional(),
  statut: z.enum(["GENERATED", "REVIEWED", "RESOLVED"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const manualReconcileSchema = z.object({
  decision: z.enum(["SUCCESS", "FAILED"]),
  providerTxnId: z.string().optional(),
  notes: z.string().optional(),
});

const reviewReportSchema = z.object({
  notes: z.string().optional(),
});

/**
 * GET /api/payments/reconciliation/reports
 * List reconciliation reports with filters
 */
paymentsRouter.get("/reconciliation/reports", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    // TODO: Add admin role check
    // if (!req.session.user.roles?.includes("ADMIN")) {
    //   return res.status(403).json({ error: "Accès refusé" });
    // }

    const parsed = reconciliationReportsFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Paramètres invalides",
        details: parsed.error.errors,
      });
    }

    const reports = await getReconciliationReports({
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
      provider: parsed.data.provider,
      statut: parsed.data.statut,
      limit: parsed.data.limit,
    });

    res.json({ reports });
  } catch (error) {
    console.error("[Payments] Reconciliation reports list error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des rapports" });
  }
});

/**
 * GET /api/payments/reconciliation/reports/:id
 * Get reconciliation report details with anomalies
 */
paymentsRouter.get("/reconciliation/reports/:id", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const [report] = await db
      .select()
      .from(mmReconciliationReports)
      .where(eq(mmReconciliationReports.id, req.params.id));

    if (!report) {
      return res.status(404).json({ error: "Rapport non trouvé" });
    }

    res.json(report);
  } catch (error) {
    console.error("[Payments] Reconciliation report detail error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération du rapport" });
  }
});

/**
 * POST /api/payments/reconciliation/reports/:id/review
 * Mark a report as reviewed
 */
paymentsRouter.post("/reconciliation/reports/:id/review", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const parsed = reviewReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.errors,
      });
    }

    await markReportReviewed(
      req.params.id,
      req.session.user.id,
      parsed.data.notes
    );

    res.json({ success: true, message: "Rapport marqué comme reviewé" });
  } catch (error) {
    console.error("[Payments] Review report error:", error);
    res.status(500).json({ error: "Erreur lors du marquage du rapport" });
  }
});

/**
 * POST /api/payments/reconciliation/reports/:id/resolve
 * Mark a report as resolved
 */
paymentsRouter.post("/reconciliation/reports/:id/resolve", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    await markReportResolved(req.params.id, req.session.user.id);

    res.json({ success: true, message: "Rapport marqué comme résolu" });
  } catch (error) {
    console.error("[Payments] Resolve report error:", error);
    res.status(500).json({ error: "Erreur lors de la résolution du rapport" });
  }
});

/**
 * POST /api/payments/reconciliation/generate
 * Manually trigger report generation for a specific date
 */
paymentsRouter.post("/reconciliation/generate", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { date, provider } = req.body;

    if (!provider || !["MTN", "AIRTEL"].includes(provider)) {
      return res.status(400).json({ error: "Provider invalide" });
    }

    const reportDate = date ? new Date(date) : new Date();
    reportDate.setDate(reportDate.getDate() - 1); // Default to yesterday

    const result = await generateReconciliationReport(reportDate, provider);

    res.json({
      success: true,
      report: {
        id: result.reportId,
        stats: result.stats,
        anomalyCount: result.anomalies.length,
      },
    });
  } catch (error) {
    console.error("[Payments] Generate report error:", error);
    res.status(500).json({ error: "Erreur lors de la génération du rapport" });
  }
});

/**
 * POST /api/payments/:id/manual-reconcile
 * Manually reconcile a payment intent (admin override)
 */
paymentsRouter.post("/:id/manual-reconcile", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    // TODO: Add admin role check
    // if (!req.session.user.roles?.includes("ADMIN")) {
    //   return res.status(403).json({ error: "Accès refusé - Admin requis" });
    // }

    const parsed = manualReconcileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.errors,
      });
    }

    const intent = await paymentService.manualReconcile(
      req.params.id,
      parsed.data.decision,
      parsed.data.providerTxnId,
      parsed.data.notes,
      req.session.user.id
    );

    res.json({
      success: true,
      message: `Paiement marqué comme ${parsed.data.decision}`,
      intent,
    });
  } catch (error) {
    console.error("[Payments] Manual reconcile error:", error);
    res.status(500).json({
      error: "Erreur lors de la réconciliation manuelle",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

// ============================================
// INITIALISATION
// ============================================

/**
 * Initialise les providers au chargement du module
 */
initializeProviders().catch((error) => {
  console.error("[Payments] Failed to initialize providers:", error);
});

export default paymentsRouter;
