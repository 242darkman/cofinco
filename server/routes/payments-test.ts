/**
 * Payment Test Routes (Development Only)
 * Endpoints pour tester le flux Mobile Money pawaPay en sandbox
 */

import { Router } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:PaymentsTest');
import * as storage from "../storage/mobile-money";
import { paymentService } from "../services/mobile-money/payment-service";
import { operatorToCorrespondent, resolveOperatorFromPhone } from "../services/mobile-money/providers/pawapay/pawapay-config";

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
 * Simule un webhook pawaPay (SUCCESS, FAILED, EXPIRED)
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

    // Résoudre le correspondent pawaPay
    const operator = (intent as any).operator || intent.provider || "MTN";
    const correspondent = (intent as any).correspondent || operatorToCorrespondent(operator as "MTN" | "AIRTEL");

    // Simuler le payload webhook au format pawaPay
    const isDeposit = intent.type === "COLLECTION";
    const webhookPayload = isDeposit
      ? {
          // Format pawaPay deposit callback
          depositId: intent.externalRef,
          status: status === "SUCCESS" ? "COMPLETED" : status === "FAILED" ? "FAILED" : "EXPIRED",
          amount: intent.amount,
          currency: intent.currency || "XAF",
          correspondent,
          country: "COG",
          payer: { type: "MSISDN", address: { value: intent.phone } },
          financialTransactionId: providerTxnId || `SIM-${Date.now()}`,
          depositFee: status === "SUCCESS" ? Math.round(parseFloat(intent.amount) * 0.01) : undefined,
          correspondentFee: status === "SUCCESS" ? Math.round(parseFloat(intent.amount) * 0.005) : undefined,
          created: new Date().toISOString(),
          respondedByPayer: new Date().toISOString(),
          reason: status !== "SUCCESS" ? `Simulated ${status}` : undefined,
        }
      : {
          // Format pawaPay payout callback
          payoutId: intent.externalRef,
          status: status === "SUCCESS" ? "COMPLETED" : status === "FAILED" ? "FAILED" : "EXPIRED",
          amount: intent.amount,
          currency: intent.currency || "XAF",
          correspondent,
          country: "COG",
          recipient: { type: "MSISDN", address: { value: intent.phone } },
          financialTransactionId: providerTxnId || `SIM-${Date.now()}`,
          payoutFee: status === "SUCCESS" ? Math.round(parseFloat(intent.amount) * 0.01) : undefined,
          created: new Date().toISOString(),
          reason: status !== "SUCCESS" ? `Simulated ${status}` : undefined,
        };

    // Traiter comme un vrai webhook pawaPay (sans vérification de signature en sandbox)
    await paymentService.handleWebhook(
      webhookPayload,
      JSON.stringify(webhookPayload),
      "simulated-signature",
      {}
    );

    // Récupérer l'intent mis à jour
    const updatedIntent = await storage.getPaymentIntent(paymentIntentId);

    res.json({
      message: `Webhook pawaPay ${status} simulé avec succès`,
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
 * Crée un payment intent de test sans appeler pawaPay
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

    // Résoudre l'opérateur et le correspondent
    const operator = provider as "MTN" | "AIRTEL";
    const correspondent = operatorToCorrespondent(operator);

    const intent = await storage.createPaymentIntent({
      provider: operator,
      gateway: "PAWAPAY",
      operator,
      correspondent,
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
      message: "Mock payment intent créé (pawaPay sandbox)",
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
        gateway: (i as any).gateway,
        operator: (i as any).operator,
        correspondent: (i as any).correspondent,
        type: i.type,
        amount: i.amount,
        phone: i.phone,
        status: i.status,
        externalRef: i.externalRef,
        createdAt: i.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Erreur" });
  }
});

/**
 * GET /api/payments-test/health
 * Vérifie que pawaPay est initialisé
 */
paymentsTestRouter.get("/health", async (req, res) => {
  try {
    const { providerRegistry } = await import("../services/mobile-money/provider-registry");

    const providers = providerRegistry.getCodes();
    const status = {
      initialized: providers.length > 0,
      gateway: "PAWAPAY",
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
