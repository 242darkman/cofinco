/**
 * @module routes/payments/payout
 * Routes API pour les décaissements (retraits) Mobile Money.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { initiatePayout } from "../../services/mobile-money/payment-service";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";

const logger = createLogger('Routes:Payments:Payout');

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
  feeOption: z.enum(["CLIENT_PAYS", "FEES_DEDUCTED"]).optional(),
});

export function registerPaymentsPayoutRoutes(app: Express): void {
  app.post("/api/payments/payout", requireAuth, attachAbility, requireAbility(Actions.WITHDRAW, Subjects.CAISSE), async (req, res) => {
    try {
      const parsed = payoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.errors,
        });
      }

      if (!parsed.data.agenceId && req.session?.user?.agenceId) {
        parsed.data.agenceId = req.session.user.agenceId;
      }

      const intent = await initiatePayout(
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
}
