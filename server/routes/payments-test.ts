/**
 * Payment Test Routes (Development Only)
 * Endpoints pour tester le flux Mobile Money sans vrais providers
 */

import { Router } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:PaymentsTest');
import * as storage from "../storage/mobile-money";
import { paymentService } from "../services/mobile-money/payment-service";

export const paymentsTestRouter = Router();

// Bloquer en production
paymentsTestRouter.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Test endpoints disabled in production" });
  }
  next();
});

/**
 * POST /api/payments-test/simulate-webhook
 * Simule un webhook de confirmation (SUCCESS ou FAILED)
 */
paymentsTestRouter.post("/simulate-webhook", async (req, res) => {
  try {
    const { paymentIntentId, status, providerTxnId } = req.body;

    if (!paymentIntentId || !status) {
      return res.status(400).json({
        error: "paymentIntentId et status requis",
        example: {
          paymentIntentId: "uuid",
          status: "SUCCESS | FAILED | EXPIRED",
          providerTxnId: "optional-provider-transaction-id",
        },
      });
    }

    // Récupérer l'intent
    const intent = await storage.getPaymentIntent(paymentIntentId);
    if (!intent) {
      return res.status(404).json({ error: "Payment intent non trouvé" });
    }

    // Simuler le payload webhook selon le provider
    const webhookPayload = intent.provider === "MTN"
      ? {
          // Format MTN MoMo
          referenceId: intent.providerRef,
          externalId: intent.externalRef,
          status: status === "SUCCESS" ? "SUCCESSFUL" : status === "FAILED" ? "FAILED" : "EXPIRED",
          financialTransactionId: providerTxnId || `SIM-${Date.now()}`,
          reason: status !== "SUCCESS" ? `Simulated ${status}` : undefined,
        }
      : {
          // Format Airtel
          transaction: {
            id: intent.providerRef || intent.externalRef,
            partner_id: intent.externalRef,
            status_code: status === "SUCCESS" ? "TS" : status === "FAILED" ? "TF" : "TE",
            airtel_money_id: providerTxnId || `SIM-${Date.now()}`,
            message: `Simulated ${status} webhook`,
          },
        };

    // Traiter comme un vrai webhook
    await paymentService.handleWebhook(
      intent.provider as "MTN" | "AIRTEL",
      webhookPayload,
      "simulated-signature",
      {}
    );

    // Récupérer l'intent mis à jour
    const updatedIntent = await storage.getPaymentIntent(paymentIntentId);

    res.json({
      message: `Webhook ${status} simulé avec succès`,
      intent: updatedIntent,
    });
  } catch (error) {
    logger.error({ err: error }, 'Test - Simulate webhook error');
    res.status(500).json({
      error: "Erreur lors de la simulation",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

/**
 * POST /api/payments-test/create-mock-intent
 * Crée un payment intent de test sans appeler le provider
 */
paymentsTestRouter.post("/create-mock-intent", async (req, res) => {
  try {
    const {
      provider = "MTN",
      type = "COLLECTION",
      amount = 1000,
      phone = "242064000000",
      clientId,
      compteId,
      creditId,
    } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: "clientId requis" });
    }

    const intent = await storage.createPaymentIntent({
      provider,
      type,
      amount: amount.toString(),
      currency: "XAF",
      phone,
      clientId,
      compteId,
      creditId,
      status: "PENDING",
      providerRef: `MOCK-${Date.now()}`,
      initiatedAt: new Date(),
      expireAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      createdBy: req.session?.user?.id,
    });

    res.status(201).json({
      message: "Mock payment intent créé",
      intent,
      nextStep: `POST /api/payments-test/simulate-webhook avec paymentIntentId: ${intent.id}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Test - Create mock intent error');
    res.status(500).json({
      error: "Erreur lors de la création",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

/**
 * GET /api/payments-test/pending
 * Liste les intents PENDING pour les tests
 */
paymentsTestRouter.get("/pending", async (req, res) => {
  try {
    const intents = await storage.listPaymentIntents({
      status: "PENDING",
      limit: 20,
    });

    res.json({
      count: intents.data.length,
      intents: intents.data.map((i) => ({
        id: i.id,
        provider: i.provider,
        type: i.type,
        amount: i.amount,
        phone: i.phone,
        status: i.status,
        providerRef: i.providerRef,
        createdAt: i.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Erreur" });
  }
});

/**
 * GET /api/payments-test/health
 * Vérifie que les providers sont initialisés
 */
paymentsTestRouter.get("/health", async (req, res) => {
  try {
    const { providerRegistry } = await import("../services/mobile-money/provider-registry");

    const providers = providerRegistry.getCodes();
    const status = {
      initialized: providers.length > 0,
      providers: providers.map((code) => ({
        code,
        name: providerRegistry.get(code)?.name,
      })),
      database: "checking...",
    };

    // Vérifier la connexion DB
    try {
      await storage.listPaymentIntents({ limit: 1 });
      status.database = "connected";
    } catch {
      status.database = "error - tables may not exist";
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({
      initialized: false,
      error: error instanceof Error ? error.message : "Erreur",
    });
  }
});

export default paymentsTestRouter;
