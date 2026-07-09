/**
 * Routes comptes — segment /closure-requests (partie closure-requests).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/closure-requests/:id/approve
 *   POST   /api/closure-requests/:id/cancel
 *   GET    /api/closure-requests/pending
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import {
  initiateClosureCompte,
  approveClosureCompte,
  cancelClosureCompte,
  getClosureRequest,
  getPendingClosureRequests,
  getClosureFeeForCompte,
  createClosureMoMoPayout,
} from "../../services/compte-closure";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { logger, cancelClosureSchema } from "./shared";

export function registerClosureRequestsRoutes(app: Express) {
  /**
   * POST /api/closure-requests/:id/approve - Approuver une demande de clôture (checker)
   */
  /**
   * POST /api/closure-requests/:id/approve
   */
  app.post(
    "/api/closure-requests/:id/approve",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CLOSE_APPROVE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const user = req.session.user;

        const request = await approveClosureCompte(
          req.params.id,
          user!.id
        );

        await logAudit(
          req,
          "APPROVE_CLOSURE",
          "compte",
          request.compteId,
          { requestId: request.id, payoutMethod: request.payoutMethod },
          "success",
          "critical"
        );

        dispatchDomainEvent({
          type: "CLOSURE_APPROVED",
          data: {
            compteId: request.compteId,
            requestId: request.id,
            approvedBy: user!.id,
          },
          timestamp: new Date(),
        });

        // For MOBILE_MONEY payouts, initiate the payout after TX commit
        if (request.payoutMethod === "MOBILE_MONEY" && request.payoutStatus === "PROCESSING") {
          createClosureMoMoPayout(request).catch((err) => {
            logger.error({ err, requestId: request.id }, "Failed to initiate MoMo closure payout");
          });
        }

        const message = request.payoutMethod === "MOBILE_MONEY"
          ? "Clôture approuvée. Paiement Mobile Money en cours."
          : "Clôture approuvée et paiement effectué.";

        res.json({ ...request, message });
      } catch (error: any) {
        if (error instanceof CompteError) {
          const statusCode = error.code === "SAME_USER_APPROVAL" ? 403 : 400;
          return res.status(statusCode).json({ message: error.message, code: error.code });
        }
        logger.error({ err: error }, 'Error approving closure');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/closure-requests/:id/cancel - Annuler une demande de clôture
   */
  /**
   * POST /api/closure-requests/:id/cancel
   */
  app.post(
    "/api/closure-requests/:id/cancel",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CLOSE_CANCEL, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = cancelClosureSchema.parse(data);
        const user = req.session.user;

        const request = await cancelClosureCompte(
          req.params.id,
          parsed.cancelReason,
          user!.id
        );

        await logAudit(
          req,
          "CANCEL_CLOSURE",
          "compte",
          request.compteId,
          { requestId: request.id, cancelReason: parsed.cancelReason },
          "success",
          "high"
        );

        res.json({
          ...request,
          message: "Demande de clôture annulée.",
        });
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({ message: error.message, code: error.code });
        }
        logger.error({ err: error }, 'Error cancelling closure');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/closure-requests/pending - Lister les demandes en attente
   */
  /**
   * GET /api/closure-requests/pending
   */
  app.get(
    "/api/closure-requests/pending",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CLOSE_APPROVE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const user = req.session.user;
        const isAdmin = req.ability?.can(Actions.MANAGE, Subjects.ALL);
        // Admin → toujours toutes agences ; sinon filtre par agence
        const effectiveAgenceId = isAdmin ? undefined : (req.query.agenceId as string | undefined) || user?.agenceId;
        const requests = await getPendingClosureRequests(effectiveAgenceId);
        res.json(requests);
      } catch (error: any) {
        logger.error({ err: error }, 'Error listing pending closures');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );
}
