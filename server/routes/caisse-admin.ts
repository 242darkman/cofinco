/**
 * Routes additionnelles pour la gestion avancée des caisses
 * Force close, liquidation intelligente, historique global, et clôture flexible
 */

import { Router } from "express";
import { z } from "zod";
import { caisseAdminService } from "../services/caisse-admin-service";
import { caisseLiquidationService } from "../services/caisse-liquidation-service";
import { getCaisseHistorique, getCaisseHistoriqueSummary } from "../services/caisse/session-service";
import { requireAuth, requireRole } from "../auth";
import { SystemRole } from "@shared/types/roles";

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
  requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE),
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
  requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE),
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
  requireRole(SystemRole.ADMIN),
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

/**
 * GET /api/caisses/:id/historique
 * Récupère l'historique global des opérations d'une caisse (toutes sessions confondues)
 *
 * Query params:
 * - limit: nombre d'opérations à retourner (max 100, default 50)
 * - offset: décalage pour pagination
 * - startDate: date de début (ISO string)
 * - endDate: date de fin (ISO string)
 * - typeOperation: filtre par type d'opération
 * - methodePaiement: filtre par méthode de paiement
 *
 * Retourne:
 * - operations: liste des opérations enrichies (client, caissier, session)
 * - total: nombre total d'opérations
 * - totalPages: nombre total de pages
 * - currentPage: page courante
 * - limit: nombre d'éléments par page
 */
caisseAdminRouter.get(
  "/:id/historique",
  requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.CAISSIER, SystemRole.SUPERVISEUR),
  async (req, res) => {
    try {
      const caisseId = req.params.id;

      const parsed = historiqueQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Paramètres invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await getCaisseHistorique({
        caisseId,
        ...parsed.data,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Erreur récupération historique caisse:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisses/:id/historique/summary
 * Récupère un résumé statistique de l'historique d'une caisse
 *
 * Retourne:
 * - totalOperations: nombre total d'opérations
 * - totalEntrees: nombre d'opérations d'entrée
 * - totalSorties: nombre d'opérations de sortie
 * - montantEntrees: somme des entrées
 * - montantSorties: somme des sorties
 * - soldeNet: différence entrées - sorties
 * - dernierOperation: date de la dernière opération
 */
caisseAdminRouter.get(
  "/:id/historique/summary",
  requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.CAISSIER, SystemRole.SUPERVISEUR),
  async (req, res) => {
    try {
      const caisseId = req.params.id;

      const summary = await getCaisseHistoriqueSummary(caisseId);

      res.json(summary);
    } catch (error: any) {
      console.error("Erreur récupération summary historique caisse:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - DIGITAL CAISSES SUMMARY (TRESORERIE)
// ============================================================================

/**
 * GET /api/caisses/digital-summary
 * Récupère un résumé des caisses digitales (MTN et Airtel) pour la trésorerie
 *
 * Query params:
 * - agenceId: (optional) filtrer par agence
 *
 * Retourne:
 * - mtn: { totalSolde, caisseCount, caisses: [...] }
 * - airtel: { totalSolde, caisseCount, caisses: [...] }
 */
caisseAdminRouter.get(
  "/digital-summary",
  requireRole(SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.SUPERVISEUR, SystemRole.CAISSIER),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string | undefined;

      // Import dynamically to avoid circular dependencies
      const { getDigitalCaisseSummary } = await import("../services/mobile-money/mm-caisse-service");

      const summary = await getDigitalCaisseSummary(agenceId);

      res.json(summary);
    } catch (error: any) {
      console.error("Erreur récupération digital caisses summary:", error);
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

export default caisseAdminRouter;
