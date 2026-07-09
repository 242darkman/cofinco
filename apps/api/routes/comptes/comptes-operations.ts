/**
 * Routes comptes — segment /comptes (partie comptes-operations).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/comptes/operations/:id/cancel
 *   GET    /api/comptes/operations/:id/chain
 *   POST   /api/comptes/operations/:id/send-receipt
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import { z } from "zod";
import { reverseOperation, canReverseOperation, ReversalError } from "../../services/caisse/transaction-reversal-service";
import { enqueueNotification } from "../../services/notifications/notification-service";
import { mouvementsFinanciers, operationsCaisse, transactionsCompte } from "@shared/schema/finance";
import { storage } from "../../storage";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { logger } from "./shared";

export function registerComptesOperationsRoutes(app: Express) {
  /**
   * POST /api/comptes/operations/:id/cancel
   * Reverse/cancel a caisse operation by creating compensating entries.
   * Requires RBAC permission on CAISSE_OPERATION + EDIT action.
   */
  /**
   * POST /api/comptes/operations/:id/cancel
   */
  app.post(
    "/api/comptes/operations/:id/cancel",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.CAISSE_OPERATION),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user) {
          return res.status(401).json({ message: "Non authentifie" });
        }

        const cancelSchema = z.object({
          reason: z.string().min(3, "Le motif doit contenir au moins 3 caracteres"),
          sessionCaisseId: z.string().uuid().optional(),
        });

        const data = normalizeKeysDeep(req.body);
        const parsed = cancelSchema.parse(data);

        const result = await reverseOperation({
          operationId: req.params.id,
          reason: parsed.reason,
          userId: user.id,
          sessionCaisseId: parsed.sessionCaisseId,
        });

        await logAudit(
          req,
          "ANNULATION_OPERATION_CAISSE",
          "operation_caisse",
          req.params.id,
          {
            reversalId: result.reversalOperation.id,
            reason: parsed.reason,
            montant: result.reversalOperation.montant,
          },
          "success",
          "critical"
        );

        // Broadcast real-time update
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "CAISSE_UPDATE",
            payload: {
              type: "operation_reversed",
              operationId: req.params.id,
              reversalId: result.reversalOperation.id,
              sessionId: result.reversalOperation.sessionId,
            },
          });
        }

        res.json({
          success: true,
          reversal: result.reversalOperation,
          original: result.originalOperation,
          message: "Operation annulee avec succes",
        });
      } catch (error: unknown) {
        if (error instanceof ReversalError) {
          return res.status(error.httpStatus).json({
            success: false,
            code: error.code,
            message: error.message,
          });
        }
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            code: "VALIDATION_ERROR",
            message: error.errors.map((e) => e.message).join(", "),
          });
        }
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, 'Error reversing operation');
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ================================================================
  // OPERATION CHAIN (LINKED OPERATIONS)
  // ================================================================

  /**
   * GET /api/comptes/operations/:id/chain
   * Returns a chain of linked operations (original + reversals) for traceability.
   */
  /**
   * GET /api/comptes/operations/:id/chain
   */
  app.get(
    "/api/comptes/operations/:id/chain",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CAISSE_OPERATION),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Load the requested operation
        const [operation] = await db
          .select()
          .from(operationsCaisse)
          .where(eq(operationsCaisse.id, id));

        if (!operation) {
          return res.status(404).json({ message: "Opération introuvable" });
        }

        // Determine the root operation ID
        const rootId = operation.reversalOfId || operation.id;

        // Fetch the original and all its reversals
        const chain = await db
          .select()
          .from(operationsCaisse)
          .where(
            or(
              eq(operationsCaisse.id, rootId),
              eq(operationsCaisse.reversalOfId, rootId)
            )
          )
          .orderBy(operationsCaisse.createdAt);

        res.json(chain);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, 'Error fetching operation chain');
        res.status(500).json({ message });
      }
    }
  );

  // ================================================================
  // SEND RECEIPT VIA EMAIL/SMS
  // ================================================================

  /**
   * POST /api/comptes/operations/:id/send-receipt
   * Enqueue a receipt notification (SMS or Email) for a caisse operation.
   */
  /**
   * POST /api/comptes/operations/:id/send-receipt
   */
  app.post(
    "/api/comptes/operations/:id/send-receipt",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CAISSE_OPERATION),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user) {
          return res.status(401).json({ message: "Non authentifie" });
        }

        const sendReceiptSchema = z.object({
          channel: z.enum(["SMS", "EMAIL"]),
          recipient: z.string().min(1, "Destinataire requis"),
        });

        const parsed = sendReceiptSchema.parse(normalizeKeysDeep(req.body));

        // Load the operation with its mouvement
        const [operation] = await db
          .select()
          .from(operationsCaisse)
          .where(eq(operationsCaisse.id, req.params.id));

        if (!operation) {
          return res.status(404).json({ message: "Operation introuvable" });
        }

        // Load linked mouvement for details
        let montant = operation.montant;
        let reference = operation.reference;
        let clientName = "Client";
        let accountNumber = "";
        let balance = "";

        if (operation.mouvementId) {
          const [mvt] = await db
            .select()
            .from(mouvementsFinanciers)
            .where(eq(mouvementsFinanciers.id, operation.mouvementId));

          if (mvt?.compteId) {
            const compte = await storage.getCompte(mvt.compteId);
            if (compte) {
              accountNumber = compte.numeroCompte;
              balance = compte.soldeCourant;
            }
          }

          if (mvt?.clientId) {
            const client = await storage.getClient(mvt.clientId);
            if (client) {
              clientName = `${client.prenom || ""} ${client.nom || ""}`.trim() || "Client";
            }
          }
        }

        // Determine template based on operation type
        const isDeposit = ["DEPOSIT", "DEPOT", "DEPOSIT_SAVINGS", "DEPOSIT_CURRENT"].some(
          (t) => operation.typeOperation.toUpperCase().includes(t)
        );
        const templateCode = isDeposit ? "RECEIPT_DEPOSIT" : "RECEIPT_WITHDRAWAL";

        const correlationId = await enqueueNotification({
          channel: parsed.channel,
          templateCode,
          recipient: parsed.recipient,
          payload: {
            clientName,
            accountNumber,
            amount: montant,
            balance,
            reference,
            date: new Date(operation.createdAt).toLocaleDateString("fr-FR"),
            agentName: user.nom || "Agent",
          },
          userId: user.id,
          agenceId: (user as any).agence || undefined,
        });

        await logAudit(
          req,
          "SEND_RECEIPT",
          "operation_caisse",
          req.params.id,
          {
            channel: parsed.channel,
            recipient: parsed.recipient,
            correlationId,
          },
          "success",
          "low"
        );

        res.json({
          success: true,
          message: `Recu envoye par ${parsed.channel}`,
          correlationId,
        });
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            message: error.errors.map((e) => e.message).join(", "),
          });
        }
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, 'Error sending receipt');
        res.status(500).json({ success: false, message });
      }
    }
  );
}
