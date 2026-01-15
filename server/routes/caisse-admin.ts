/**
 * Routes additionnelles pour la gestion avancée des caisses
 * Force close, liquidation intelligente, et clôture flexible
 */

import { Router } from "express";
import { z } from "zod";
import { caisseAdminService } from "../services/caisse-admin-service";
import { caisseLiquidationService } from "../services/caisse-liquidation-service";
import { requireAuth, requireRole } from "../auth";

export const caisseAdminRouter = Router();

// Middleware d'authentification
caisseAdminRouter.use(requireAuth);

// ============================================================================
// SCHÉMAS DE VALIDATION
// ============================================================================

const forceCloseSessionSchema = z.object({
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères"),
  keepFunds: z.boolean().optional().default(false),
});

const executeLiquidationSchema = z.object({
  destinationType: z.enum(['COFFRE', 'CAISSE']),
  destinationId: z.string().uuid(),
  motif: z.string().optional(),
});

// ============================================================================
// ROUTES - FORCE CLOSE
// ============================================================================

/**
 * POST /api/caisses/sessions/:id/force-close
 * Force la fermeture d'une session de caisse (ADMIN/CHEF uniquement)
 */
caisseAdminRouter.post(
  "/sessions/:id/force-close",
  requireRole('admin', 'chef'),
  async (req, res) => {
    try {
      const sessionId = req.params.id;
      const userId = (req as any).session?.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = forceCloseSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await caisseAdminService.forceCloseSession({
        sessionId,
        closedBy: userId,
        motif: parsed.data.motif,
        keepFunds: parsed.data.keepFunds,
      });

      if (!result.success) {
        const status = result.errorCode === "SESSION_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        session: result.session,
      });
    } catch (error: any) {
      console.error("Erreur force close session:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - LIQUIDATION INTELLIGENTE
// ============================================================================

/**
 * GET /api/caisses/:id/liquidation/check
 * Vérifie si une caisse peut être supprimée et retourne les destinations disponibles
 */
caisseAdminRouter.get(
  "/:id/liquidation/check",
  requireRole('admin', 'chef'),
  async (req, res) => {
    try {
      const caisseId = req.params.id;

      const result = await caisseLiquidationService.checkCaisseLiquidation(caisseId);

      if (result.error) {
        const status = result.errorCode === "CAISSE_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        canDelete: result.canDelete,
        soldeActuel: result.soldeActuel,
        hasOpenSession: result.hasOpenSession,
        availableDestinations: result.availableDestinations,
      });
    } catch (error: any) {
      console.error("Erreur check liquidation:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisses/:id/liquidation/execute
 * Exécute le transfert atomique des fonds et supprime la caisse
 */
caisseAdminRouter.post(
  "/:id/liquidation/execute",
  requireRole('admin'),
  async (req, res) => {
    try {
      const caisseId = req.params.id;
      const userId = (req as any).session?.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = executeLiquidationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await caisseLiquidationService.executeLiquidation({
        caisseId,
        destinationType: parsed.data.destinationType,
        destinationId: parsed.data.destinationId,
        executedBy: userId,
        motif: parsed.data.motif,
      });

      if (!result.success) {
        const status = result.errorCode === "CAISSE_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        caisse: result.caisse,
        montantTransfere: result.montantTransfere,
      });
    } catch (error: any) {
      console.error("Erreur execute liquidation:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

export default caisseAdminRouter;
