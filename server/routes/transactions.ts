import { Router } from "express";
import { createLogger } from "../lib/logger";
import { GlobalTransactionService } from "../services/global-transaction-service";
import { z } from "zod";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization/middleware";
import { Actions, Subjects } from "@shared/ability";

const logger = createLogger('Routes:Transactions');

export const transactionsRouter = Router();

// Schema de validation de la payload

// Schema de validation de la payload
const transactionSchema = z.object({
  clientId: z.string().uuid("ID Client invalide"),
  amount: z.number().positive("Le montant doit être positif"),
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "TRANSFER"]),
  natureOperation: z.string(),
  
  // Champs optionnels selon le type
  targetId: z.string().optional(),
  tontineId: z.string().optional(),
  membreId: z.string().optional(),
  compteId: z.string().optional(),
  creditId: z.string().optional(),
  
  description: z.string().optional(),
  referenceExterne: z.string().optional(),
  numeroTransaction: z.string().optional(),
  numeroTelephone: z.string().optional()
});

transactionsRouter.post(
  "/process",
  requireAuth,
  attachAbility,
  requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
  async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    // Validation Zod
    const payload = transactionSchema.parse(req.body);

    const result = await GlobalTransactionService.process(req.user.id, payload);

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Global Transaction Error');
    
    // Distinction des erreurs
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Données invalides", 
        details: error.errors 
      });
    }

    // Erreurs métier connues (ex: "Fonds insuffisants")
    const message = error.message || "Erreur lors du traitement de la transaction";
    const status = message.includes("introuvable") || message.includes("requis") ? 404 : 400;

    res.status(status).json({ error: message });
  }
});
