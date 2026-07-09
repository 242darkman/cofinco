/**
 * Routes comptes — segment /opening-requests (partie opening-requests).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/opening-requests/pending
 *   POST   /api/opening-requests/:id/approve
 *   POST   /api/opening-requests/:id/reject
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import {
  approveOpeningRequest,
  rejectOpeningRequest,
  getPendingOpeningRequests,
  getOpeningRequest,
  getOpeningFeeForCompte,
} from "../../services/account-opening-validation";
import { logger } from "./shared";

export function registerOpeningRequestsRoutes(app: Express) {
  // ============================================================================
  // OPENING VALIDATION (Maker-Checker — Chef d'Agence)
  // ============================================================================

  /**
   * GET /api/opening-requests/pending - Liste des demandes d'ouverture en attente
   */
  /**
   * GET /api/opening-requests/pending
   */
  app.get(
    "/api/opening-requests/pending",
    requireAuth,
    attachAbility,
    async (req, res) => {
      try {
        const user = req.session.user;
        const isAdmin = req.ability?.can(Actions.MANAGE, Subjects.ALL);
        const effectiveAgenceId = isAdmin ? undefined : (req.query.agenceId as string | undefined) || user?.agenceId;
        const requests = await getPendingOpeningRequests(effectiveAgenceId);
        res.json(requests);
      } catch (error: any) {
        logger.error({ err: error }, 'Error listing pending opening requests');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/opening-requests/:id/approve - Approuver une ouverture (chef d'agence)
   */
  /**
   * POST /api/opening-requests/:id/approve
   */
  app.post(
    "/api/opening-requests/:id/approve",
    requireAuth,
    attachAbility,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        if (!userId) return res.status(401).json({ message: "Non authentifié" });

        const result = await approveOpeningRequest(req.params.id, userId);

        logAudit(req, "opening_request.approve", "COMPTE", req.params.id, {
          compteId: result.compteId,
          severity: "important",
        });

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error approving opening request');
        const status = error.code === "SAME_USER_APPROVAL" ? 403 : 400;
        res.status(status).json({ message: error.message || "Erreur" });
      }
    }
  );

  /**
   * POST /api/opening-requests/:id/reject - Rejeter une ouverture
   */
  /**
   * POST /api/opening-requests/:id/reject
   */
  app.post(
    "/api/opening-requests/:id/reject",
    requireAuth,
    attachAbility,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        if (!userId) return res.status(401).json({ message: "Non authentifié" });

        const { reason } = req.body;
        if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
          return res.status(400).json({ message: "Motif de rejet requis" });
        }

        const result = await rejectOpeningRequest(req.params.id, reason.trim(), userId);

        logAudit(req, "opening_request.reject", "COMPTE", req.params.id, {
          compteId: result.compteId,
          reason: reason.trim(),
          severity: "important",
        });

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error rejecting opening request');
        res.status(400).json({ message: error.message || "Erreur" });
      }
    }
  );
}
