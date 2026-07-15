import { Actions, Subjects } from "@shared/ability";
import { sessionsCaisse } from "@shared/schema/finance";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { caisseAdminService } from "../../services/caisse-admin-service";
import { caisseLiquidationService } from "../../services/caisse-liquidation-service";
import { executeLiquidationSchema, forceCloseSessionSchema } from "./caisse-admin-helpers";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminLiquidationRoutes(router: Router) {

  /**
   * POST /api/caisses/sessions/:id/force-close
   * Force la fermeture d'une session de caisse (ADMIN/CHEF uniquement)
   */
  router.post(
    "/sessions/:id/force-close",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const sessionId = req.params.id;
        const userId = req.session?.user?.id;
  
        if (!userId) {
          return res.status(401).json({ error: "Non authentifié" });
        }
  
        // Vérifier accès agence (seul un admin global peut force-close une session d'une autre agence)
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        if (!isGlobalAdmin) {
          const [sessionCheck] = await db
            .select({ agenceId: sessionsCaisse.agenceId })
            .from(sessionsCaisse)
            .where(eq(sessionsCaisse.id, sessionId));
          if (sessionCheck && sessionCheck.agenceId !== req.session.user?.agenceId) {
            return res.status(403).json({ error: "Accès interdit: session d'une autre agence" });
          }
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
        logger.error({ err: error }, 'Erreur force close session');
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
  router.get(
    "/:id/liquidation/check",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
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
        logger.error({ err: error }, 'Erreur check liquidation');
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
  router.post(
    "/:id/liquidation/execute",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const caisseId = req.params.id;
        const userId = req.session?.user?.id;
  
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
        logger.error({ err: error }, 'Erreur execute liquidation');
        res.status(500).json({
          error: error.message || "Erreur interne",
        });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - HISTORIQUE GLOBAL
  // ============================================================================
  
  const historiqueQuerySchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
    startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
    endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
    typeOperation: z.string().optional(),
    methodePaiement: z.string().optional(),
  });
  
}
