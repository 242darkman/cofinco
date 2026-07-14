import { Actions, Subjects } from "@shared/ability";
import { sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminClosuresRoutes(router: Router) {

  /**
   * GET /api/caisses/agency/:agenceId/closure-status
   * Vérifie si l'agence est prête pour la clôture journalière
   */
  router.get(
    "/agency/:agenceId/closure-status",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { agenceId } = req.params;
        const date = req.query.date ? new Date(req.query.date as string) : undefined;
  
        const { agencyClosureService } = await import("../../services/caisse/agency-closure-service");
  
        const status = await agencyClosureService.checkClosureReadiness(agenceId, date);
  
        res.json(status);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur vérification clôture agence');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/agency/:agenceId/finalize-closure
   * Finalise la clôture journalière de l'agence
   */
  router.post(
    "/agency/:agenceId/finalize-closure",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { agenceId } = req.params;
        const { observations } = req.body;
        const closedBy = req.session.user!.id;
  
        const { agencyClosureService } = await import("../../services/caisse/agency-closure-service");
  
        const result = await agencyClosureService.finalizeClosure({
          agenceId,
          closedBy,
          observations,
          ipAddress: req.ip,
        });
  
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
  
        res.json({
          message: 'Clôture agence finalisée',
          closure: result.closure,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur finalisation clôture agence');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/agency/:agenceId/closures/history
   * Historique des clôtures d'une agence
   */
  router.get(
    "/agency/:agenceId/closures/history",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { agenceId } = req.params;
        const limit = parseInt(req.query.limit as string) || 30;
  
        const { agencyClosureService } = await import("../../services/caisse/agency-closure-service");
  
        const history = await agencyClosureService.getClosureHistory(agenceId, limit);
  
        res.json(history);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération historique clôtures');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - SUGGESTION BILLETAGE PRÉDICTIF
  // ============================================================================
  
  const billetageSuggestionSchema = z.object({
    caisseId: z.string().uuid(),
    targetAmount: z.number().positive(),
    prioritizeSmallDenominations: z.boolean().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    isEndOfMonth: z.boolean().optional(),
  });
  
  const saveTemplateSchema = z.object({
    nom: z.string().min(1).max(100),
    description: z.string().optional(),
    billetage: z.record(z.string(), z.number().int().min(0)),
    agenceId: z.string().uuid().optional(),
    caisseId: z.string().uuid().optional(),
  });
  

  /**
   * POST /api/caisses/sessions/auto-close-expired
   * Ferme automatiquement les sessions inactives au-delà du timeout.
   * Appelle la fonction SQL close_expired_sessions() qui calcule le solde théorique
   * et ferme les sessions avec closed_reason = 'timeout'.
   */
  router.post(
    "/sessions/auto-close-expired",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const timeoutHours = req.body.timeoutHours ?? 12;
  
        if (typeof timeoutHours !== 'number' || timeoutHours < 1 || timeoutHours > 72) {
          return res.status(400).json({ error: "timeoutHours doit être entre 1 et 72" });
        }
  
        const result = await db.execute(
          sql`SELECT * FROM close_expired_sessions(${timeoutHours})`
        );
  
        const closedSessions = result.rows || [];
  
        logger.info(
          { count: closedSessions.length, timeoutHours },
          `Auto-fermeture: ${closedSessions.length} session(s) expirée(s) fermée(s)`
        );
  
        res.json({
          success: true,
          closedCount: closedSessions.length,
          sessions: closedSessions,
        });
      } catch (error: any) {
        logger.error({ err: error }, "Erreur auto-fermeture sessions expirées");
        res.status(500).json({ error: error.message || "Erreur lors de l'auto-fermeture" });
      }
    }
  );
  
  // ============================================================================
  // GET RISKY SESSIONS (via SQL function get_risky_sessions)
  // ============================================================================
  

  /**
   * GET /api/caisses/sessions/risky
   * Retourne les sessions ouvertes à risque (inactives depuis warning_hours).
   * Classifie chaque session comme WARNING ou CRITICAL et calcule le solde courant.
   */
  router.get(
    "/sessions/risky",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const warningHours = parseInt(req.query.warningHours as string) || 6;
        const criticalHours = parseInt(req.query.criticalHours as string) || 10;
  
        if (warningHours < 1 || criticalHours < warningHours) {
          return res.status(400).json({
            error: "warningHours doit être >= 1 et criticalHours >= warningHours"
          });
        }
  
        const result = await db.execute(
          sql`SELECT * FROM get_risky_sessions(${warningHours}, ${criticalHours})`
        );
  
        const sessions = (result.rows || []).map((row: any) => ({
          sessionId: row.session_id,
          caisseNom: row.caisse_nom,
          caissierNom: row.caissier_nom,
          hoursInactive: parseFloat(row.hours_inactive),
          riskLevel: row.risk_level,
          soldeCurrent: parseFloat(row.solde_current),
        }));
  
        res.json({
          total: sessions.length,
          warning: sessions.filter((s: any) => s.riskLevel === 'WARNING').length,
          critical: sessions.filter((s: any) => s.riskLevel === 'CRITICAL').length,
          sessions,
        });
      } catch (error: any) {
        logger.error({ err: error }, "Erreur récupération sessions à risque");
        res.status(500).json({ error: error.message || "Erreur lors de la récupération" });
      }
    }
  );
  
}
