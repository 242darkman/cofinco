/**
 * @module routes/payments/management
 * Routes API pour la gestion des paiements Mobile Money (listes, annulations, remboursements, infos).
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { providerRegistry } from "../../services/mobile-money/provider-registry";
import { resolveOperatorFromPhone, loadPawaPayConfig } from "../../services/mobile-money/providers/pawapay/pawapay-config";
import type { PawaPayProvider } from "../../services/mobile-money/providers/pawapay/pawapay-provider";
import { listPaymentIntents, getPaymentIntent, cancelPayment, initiateRefund, manualReconcile } from "../../services/mobile-money/payment-service";
import { calculateFee } from "../../services/mobile-money/fee-calculator";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { currencySymbol } from "@shared/config/currency";

const logger = createLogger('Routes:Payments:Management');

const feeEstimateSchema = z.object({
  amount: z.coerce.number().positive(),
  provider: z.enum(["MTN", "AIRTEL"]),
  direction: z.enum(["COLLECTION", "PAYOUT"]),
  feeOption: z.enum(["CLIENT_PAYS", "FEES_DEDUCTED"]),
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

const manualReconcileSchema = z.object({
  decision: z.enum(["SUCCESS", "FAILED"]),
  providerTxnId: z.string().optional(),
  notes: z.string().optional(),
});

export function registerPaymentsManagementRoutes(app: Express): void {
  app.get("/api/payments/sandbox-info", requireAuth, async (req, res) => {
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

  app.post("/api/payments/validate-phone", requireAuth, async (req, res) => {
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

  app.get("/api/payments", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
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

      const result = await listPaymentIntents(filter as any);

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Payments list error');
      res.status(500).json({ error: "Erreur lors de la récupération des paiements" });
    }
  });

  app.get("/api/payments/provider-balances", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.TREASURY), async (req, res) => {
    try {
      const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
      const checkedAt = new Date().toISOString();

      // Provider non configuré (dev/local sans token) : dégradation propre
      // plutôt qu'un 500 réseau bruyant côté console.
      if (typeof pawaPayProvider.isConfigured === "function" && !pawaPayProvider.isConfigured()) {
        res.json({ success: true, gateway: "PAWAPAY", configured: false, providers: [], checkedAt });
        return;
      }

      if (typeof pawaPayProvider.getBalancePerCorrespondent === "function") {
        const balances = await pawaPayProvider.getBalancePerCorrespondent();
        const providers = balances.map(b => ({
          provider: b.operator,
          code: b.operator,
          balance: b.balance,
          currency: b.currency,
          accountStatus: "ACTIVE",
          shared: b.shared,
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

  app.get("/api/payments/circuit-breaker", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.ALL), async (req, res) => {
    try {
      const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
      const stats = pawaPayProvider.getCircuitBreakerStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de la récupération du statut circuit breaker" });
    }
  });

  app.post("/api/payments/circuit-breaker/reset", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.ALL), async (req, res) => {
    try {
      const pawaPayProvider = providerRegistry.getPawaPay() as PawaPayProvider;
      pawaPayProvider.resetCircuitBreaker();
      res.json({ success: true, message: "Circuit breaker réinitialisé" });
    } catch (error) {
      res.status(500).json({ error: "Erreur lors du reset du circuit breaker" });
    }
  });

  app.get("/api/payments/fee-estimate", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = feeEstimateSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Paramètres invalides",
          details: parsed.error.errors,
        });
      }

      const { amount, provider, direction, feeOption } = parsed.data;
      const estimate = await calculateFee(amount, provider, direction, feeOption);

      res.json(estimate);
    } catch (error) {
      logger.error({ err: error }, 'Fee estimate error');
      res.status(500).json({ error: "Erreur lors du calcul des frais" });
    }
  });

  app.get("/api/payments/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE), async (req, res) => {
    try {
      const intent = await getPaymentIntent(req.params.id);

      if (!intent) {
        return res.status(404).json({ error: "Paiement non trouvé" });
      }

      res.json(intent);
    } catch (error) {
      logger.error({ err: error }, 'Payments get error');
      res.status(500).json({ error: "Erreur lors de la récupération du paiement" });
    }
  });

  app.post("/api/payments/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.CAISSE), async (req, res) => {
    try {
      const intent = await cancelPayment(
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

  app.post("/api/payments/:id/refund", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const { amount } = req.body;

      if (amount != null && (typeof amount !== "number" || amount <= 0)) {
        return res.status(400).json({ error: "Le montant doit être un nombre positif" });
      }

      const intent = await initiateRefund(
        req.params.id,
        amount,
        req.session!.user!.id
      );

      res.status(201).json({
        success: true,
        message: amount ? `Remboursement partiel de ${amount} ${currencySymbol()} initié` : "Remboursement total initié",
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

  app.post("/api/payments/:id/fail-enqueued", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.CAISSE), async (req, res) => {
    try {
      const intent = await getPaymentIntent(req.params.id);

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

      const updated = await cancelPayment(req.params.id, req.session!.user!.id);

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

  app.post("/api/payments/:id/manual-reconcile", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
    try {
      const parsed = manualReconcileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Données invalides", details: parsed.error.errors });
      }

      const intent = await manualReconcile(
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
}
