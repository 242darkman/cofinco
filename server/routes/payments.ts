/**
 * Payment Routes
 * Routes API pour les paiements Mobile Money via pawaPay
 *
 * Webhook sécurisé par:
 * - Vérification signature RFC 9421 (pawaPay)
 * - Whitelist IP en production
 * - Rate limiting
 */

import { Router, Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:Payments');
import { z } from "zod";
import { paymentService } from "../services/mobile-money/payment-service";
import { initializeProviders, providerRegistry } from "../services/mobile-money/provider-registry";
import {
  getReconciliationReports,
  markReportReviewed,
  markReportResolved,
  generateReconciliationReport,
} from "../cron/mm-reconciliation-report";
import { db } from "../db";
import { mmReconciliationReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import { PAWAPAY_CALLBACK_IPS, resolveOperatorFromPhone, loadPawaPayConfig } from "../services/mobile-money/providers/pawapay/pawapay-config";
import type { PawaPayProvider } from "../services/mobile-money/providers/pawapay/pawapay-provider";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";

export const paymentsRouter = Router();
export const webhooksRouter = Router();

// ============================================
// WEBHOOK SECURITY MIDDLEWARE
// ============================================

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
 * Vérifie si une IP est dans la whitelist pawaPay
 */
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
 * Middleware de validation IP pour les webhooks pawaPay
 */
function pawaPayIpValidator(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);

  if (!isPawaPayIpAllowed(clientIp)) {
    logger.warn({ clientIp }, 'pawaPay webhook rejected: unauthorized IP');
    return res.status(200).json({ received: true });
  }

  (req as any).webhookClientIp = clientIp;
  next();
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
  type: z.string().optional(),
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
  tontineId: z.string().uuid().optional(),
  type: z.string().optional(),
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
// PAWAPAY WEBHOOK (Public, secured by signature + IP)
// ============================================

/**
 * POST /api/webhooks/pawapay
 * Callback webhook pawaPay (deposits + payouts)
 */
async function handlePawaPayWebhook(req: Request, res: Response) {
  const startTime = Date.now();
  const clientIp = (req as any).webhookClientIp || getClientIp(req);

  // Utiliser le rawBody (Buffer) pour la vérification de signature, sinon fallback JSON
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const bodyForSignature = rawBody ? rawBody.toString("utf-8") : JSON.stringify(req.body);

  logger.info({ clientIp, bodySize: bodyForSignature.length }, 'pawaPay webhook received');

  try {
    const signature = (req.headers["signature"] as string) ||
                      (req.headers["signature-input"] as string) || "";
    const headers = req.headers as Record<string, string>;

    await paymentService.handleWebhook(req.body, bodyForSignature, signature, headers);

    logger.info({ processingTimeMs: Date.now() - startTime }, 'pawaPay webhook processed');

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error, processingTimeMs: Date.now() - startTime }, 'pawaPay webhook error');
    res.status(200).json({ received: true, error: "Processing failed" });
  }
}

// Webhook routes
webhooksRouter.post("/pawapay", pawaPayIpValidator, handlePawaPayWebhook);
paymentsRouter.post("/webhooks/pawapay", pawaPayIpValidator, handlePawaPayWebhook);

// ============================================
// API AUTHENTIFIÉE
// ============================================

/**
 * POST /api/payments/collect
 */
paymentsRouter.post("/collect", requireAuth, attachAbility, requireAbility(Actions.COLLECT, Subjects.CAISSE), async (req, res) => {
  try {
    const parsed = collectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.errors,
      });
    }

    const intent = await paymentService.initiateCollection(
      parsed.data,
      req.session!.user!.id
    );

    res.status(201).json(intent);
  } catch (error) {
    logger.error({ err: error }, 'Payments collection error');
    res.status(500).json({
      error: "Erreur lors de l'initiation de la collection",
      message: error instanceof Error ? error.message : "Erreur interne du serveur",
    });
  }
});

/**
 * POST /api/payments/payout
 */
paymentsRouter.post("/payout", requireAuth, attachAbility, requireAbility(Actions.WITHDRAW, Subjects.CAISSE), async (req, res) => {
  try {
    const parsed = payoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Données invalides",
        details: parsed.error.errors,
      });
    }

    const intent = await paymentService.initiatePayout(
      parsed.data,
      req.session!.user!.id
    );

    res.status(201).json(intent);
  } catch (error) {
    logger.error({ err: error }, 'Payments payout error');
    res.status(500).json({
      error: "Erreur lors de l'initiation du payout",
      message: error instanceof Error ? error.message : "Erreur interne du serveur",
    });
  }
});

/**
 * GET /api/payments/sandbox-info
 */
paymentsRouter.get("/sandbox-info", requireAuth, async (req, res) => {
  try {
    const config = loadPawaPayConfig();

    res.json({
      gateway: "PAWAPAY",
      environment: config.environment,
      isSandbox: config.environment === "sandbox",
      currency: config.currency,
      country: config.country,
      correspondents: {
        MTN: "MTN_MOMO_COG",
        AIRTEL: "AIRTEL_COG",
      },
      testInfo: config.environment === "sandbox" ? {
        note: "En sandbox pawaPay, tous les numéros sont acceptés. Le résultat dépend du montant.",
      } : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, 'Sandbox info error');
    res.status(500).json({ error: "Erreur lors de la récupération des informations sandbox" });
  }
});

/**
 * POST /api/payments/validate-phone
 */
paymentsRouter.post("/validate-phone", requireAuth, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Numéro requis" });
    }

    const operator = resolveOperatorFromPhone(phone);

    res.json({
      isValid: !!operator,
      operator,
      message: operator
        ? `Numéro ${operator} détecté (Congo-Brazzaville)`
        : "Impossible de détecter l'opérateur. Vérifiez le numéro.",
    });
  } catch (error) {
    logger.error({ err: error }, 'Phone validation error');
    res.status(500).json({ error: "Erreur lors de la validation du numéro" });
  }
});

/**
 * GET /api/payments
 */
paymentsRouter.get("/", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
  try {
    const parsed = listFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Paramètres invalides",
        details: parsed.error.errors,
      });
    }

    const filter = {
      ...parsed.data,
      agenceId: (req as any).agenceFilter?.agenceId || parsed.data.agenceId,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    };

    const result = await paymentService.listPaymentIntents(filter as any);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Payments list error');
    res.status(500).json({ error: "Erreur lors de la récupération des paiements" });
  }
});

// ============================================
// PROVIDER BALANCE CHECK (pawaPay)
// Registered BEFORE /:id to avoid route shadowing
// ============================================

paymentsRouter.get("/provider-balances", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.TREASURY), async (req, res) => {
  try {
    const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
    const checkedAt = new Date().toISOString();

    if (typeof pawaPayProvider.getBalancePerCorrespondent === "function") {
      const balances = await pawaPayProvider.getBalancePerCorrespondent();
      // Map to format expected by ProviderBalanceWidget
      const providers = balances.map(b => ({
        provider: b.operator,
        code: b.operator,
        balance: b.balance,
        currency: b.currency,
        accountStatus: "ACTIVE",
        shared: b.shared, // true = wallet partagé, solde = total MTN+Airtel
        error: null,
        checkedAt,
      }));
      res.json({ success: true, gateway: "PAWAPAY", providers, checkedAt });
    } else if (typeof pawaPayProvider.getBalance === "function") {
      const balance = await pawaPayProvider.getBalance();
      res.json({
        success: true,
        gateway: "PAWAPAY",
        providers: [{ provider: "PAWAPAY", code: "PAWAPAY", balance: balance.balance, currency: balance.currency, accountStatus: balance.accountStatus, error: null, checkedAt }],
        checkedAt,
      });
    } else {
      res.json({ success: true, gateway: "PAWAPAY", providers: [], checkedAt });
    }
  } catch (error) {
    logger.error({ err: error }, 'Provider balance check error');
    res.status(500).json({ error: "Erreur lors de la vérification des soldes" });
  }
});

// ============================================
// RECONCILIATION API (Admin only - MANAGE CAISSE)
// Registered BEFORE /:id to avoid route shadowing
// ============================================

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

paymentsRouter.get("/reconciliation/reports", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
  try {
    const parsed = reconciliationReportsFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", details: parsed.error.errors });
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
    logger.error({ err: error }, 'Reconciliation reports list error');
    res.status(500).json({ error: "Erreur lors de la récupération des rapports" });
  }
});

paymentsRouter.get("/reconciliation/reports/:id", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
  try {
    const [report] = await db.select().from(mmReconciliationReports).where(eq(mmReconciliationReports.id, req.params.id));

    if (!report) {
      return res.status(404).json({ error: "Rapport non trouvé" });
    }

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, 'Reconciliation report detail error');
    res.status(500).json({ error: "Erreur lors de la récupération du rapport" });
  }
});

paymentsRouter.post("/reconciliation/reports/:id/review", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
  try {
    const parsed = reviewReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Données invalides", details: parsed.error.errors });
    }

    await markReportReviewed(req.params.id, req.session!.user!.id, parsed.data.notes);
    res.json({ success: true, message: "Rapport marqué comme reviewé" });
  } catch (error) {
    logger.error({ err: error }, 'Review report error');
    res.status(500).json({ error: "Erreur lors du marquage du rapport" });
  }
});

paymentsRouter.post("/reconciliation/reports/:id/resolve", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
  try {
    await markReportResolved(req.params.id, req.session!.user!.id);
    res.json({ success: true, message: "Rapport marqué comme résolu" });
  } catch (error) {
    logger.error({ err: error }, 'Resolve report error');
    res.status(500).json({ error: "Erreur lors de la résolution du rapport" });
  }
});

paymentsRouter.post("/reconciliation/generate", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
  try {
    const { date, provider } = req.body;

    if (!provider || !["MTN", "AIRTEL"].includes(provider)) {
      return res.status(400).json({ error: "Provider invalide (MTN ou AIRTEL)" });
    }

    const reportDate = date ? new Date(date) : new Date();
    reportDate.setDate(reportDate.getDate() - 1);

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
    logger.error({ err: error }, 'Generate report error');
    res.status(500).json({ error: "Erreur lors de la génération du rapport" });
  }
});

// ============================================
// CIRCUIT BREAKER STATUS (Admin)
// ============================================

paymentsRouter.get("/circuit-breaker", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.ALL), async (req, res) => {
  try {
    const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
    const stats = pawaPayProvider.getCircuitBreakerStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération du statut circuit breaker" });
  }
});

paymentsRouter.post("/circuit-breaker/reset", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.ALL), async (req, res) => {
  try {
    const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
    pawaPayProvider.resetCircuitBreaker();
    res.json({ success: true, message: "Circuit breaker réinitialisé" });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors du reset du circuit breaker" });
  }
});

// ============================================
// PARAMETERIZED ROUTES (/:id) - MUST be LAST to avoid shadowing named routes
// ============================================

/**
 * GET /api/payments/:id
 */
paymentsRouter.get("/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
  try {
    const intent = await paymentService.getPaymentIntent(req.params.id);

    if (!intent) {
      return res.status(404).json({ error: "Paiement non trouvé" });
    }

    res.json(intent);
  } catch (error) {
    logger.error({ err: error }, 'Payments get error');
    res.status(500).json({ error: "Erreur lors de la récupération du paiement" });
  }
});

/**
 * POST /api/payments/:id/cancel
 */
paymentsRouter.post("/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.CAISSE), async (req, res) => {
  try {
    const intent = await paymentService.cancelPayment(
      req.params.id,
      req.session!.user!.id
    );

    res.json(intent);
  } catch (error) {
    logger.error({ err: error }, 'Payments cancel error');
    res.status(500).json({
      error: "Erreur lors de l'annulation du paiement",
      message: "Erreur interne du serveur",
    });
  }
});

/**
 * POST /api/payments/:id/refund
 * Initie un remboursement total ou partiel d'une collection
 */
paymentsRouter.post("/:id/refund", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
  try {
    const { amount } = req.body; // optional: omit for full refund

    if (amount != null && (typeof amount !== "number" || amount <= 0)) {
      return res.status(400).json({ error: "Le montant doit être un nombre positif" });
    }

    const intent = await paymentService.initiateRefund(
      req.params.id,
      amount,
      req.session!.user!.id
    );

    res.status(201).json({
      success: true,
      message: amount ? `Remboursement partiel de ${amount} XAF initié` : "Remboursement total initié",
      intent,
    });
  } catch (error) {
    logger.error({ err: error }, 'Refund error');
    res.status(500).json({
      error: "Erreur lors du remboursement",
      message: error instanceof Error ? error.message : "Erreur interne",
    });
  }
});

/**
 * POST /api/payments/:id/fail-enqueued
 * Annule un payout en attente (ENQUEUED) sur pawaPay
 */
paymentsRouter.post("/:id/fail-enqueued", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.CAISSE), async (req, res) => {
  try {
    const intent = await paymentService.getPaymentIntent(req.params.id);

    if (!intent) {
      return res.status(404).json({ error: "Paiement non trouvé" });
    }

    if (intent.status !== "PENDING") {
      return res.status(400).json({ error: `Impossible d'annuler un paiement en statut: ${intent.status}` });
    }

    if (!intent.externalRef) {
      return res.status(400).json({ error: "Pas de référence externe pour ce paiement" });
    }

    const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
    await pawaPayProvider.failEnqueuedPayout(intent.externalRef);

    // Update intent status
    const updated = await paymentService.cancelPayment(req.params.id, req.session!.user!.id);

    res.json({
      success: true,
      message: "Payout en file d'attente annulé",
      intent: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Fail enqueued payout error');
    res.status(500).json({
      error: "Erreur lors de l'annulation du payout",
      message: error instanceof Error ? error.message : "Erreur interne",
    });
  }
});

paymentsRouter.post("/:id/manual-reconcile", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
  try {
    const parsed = manualReconcileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Données invalides", details: parsed.error.errors });
    }

    const intent = await paymentService.manualReconcile(
      req.params.id,
      parsed.data.decision,
      parsed.data.providerTxnId,
      parsed.data.notes,
      req.session!.user!.id
    );

    res.json({ success: true, message: `Paiement marqué comme ${parsed.data.decision}`, intent });
  } catch (error) {
    logger.error({ err: error }, 'Manual reconcile error');
    res.status(500).json({ error: "Erreur lors de la réconciliation manuelle" });
  }
});

// ============================================
// INITIALISATION
// ============================================

initializeProviders().catch((error) => {
  logger.error({ err: error }, 'Failed to initialize pawaPay provider');
});

export default paymentsRouter;
