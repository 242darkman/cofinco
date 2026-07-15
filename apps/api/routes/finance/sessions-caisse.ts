/**
 * Routes finance — segment /sessions-caisse (partie sessions-caisse).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/sessions-caisse/active
 *   GET    /api/sessions-caisse/my-caisses
 *   GET    /api/sessions-caisse
 *   GET    /api/sessions-caisse/closing
 *   GET    /api/sessions-caisse/pending
 *   GET    /api/sessions-caisse/risky
 *   GET    /api/sessions-caisse/ecarts
 *   POST   /api/sessions-caisse/close-expired
 *   GET    /api/sessions-caisse/:id
 *   GET    /api/sessions-caisse/caissier/:id
 *   POST   /api/sessions-caisse/:id/close
 *   POST   /api/sessions-caisse/:id/heartbeat
 *   POST   /api/sessions-caisse/:id/force-close
 *   GET    /api/sessions-caisse/:id/mouvements
 */
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import * as sessionService from "../../services/caisse/session-service";
import { getPendingSession } from "../../services/caisse/session-opening-queries";
import { getClosingSessionsForAgence } from "../../services/caisse/session-closing-queries";
import { isIncomingOperation, isOutgoingOperation, getOperationDelta, CAISSE_IN_OPERATIONS } from "@shared/config/caisse-operations";
import { logger } from "./shared";

export function registerSessionsCaisseRoutes(app: Express) {
  /**
   * GET /api/sessions-caisse/active
   */
  app.get("/api/sessions-caisse/active", requireAuth, async (req, res) => {
      const user = req.session.user!;
      const session = await storage.getActiveSessionForUser(user.id);
      res.json(session || null);
  });

  /**
   * GET /api/sessions-caisse/my-caisses
   * Récupère les caisses assignées à l'utilisateur avec leur solde disponible
   * Utilisé par le dashboard pour afficher le solde quand aucune session n'est active
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  /**
   * GET /api/sessions-caisse/my-caisses
   */
  app.get("/api/sessions-caisse/my-caisses", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const caisses = await storage.getUserAssignedCaissesWithBalance(user.id);
    res.json(caisses);
  });

  /**
   * GET /api/sessions-caisse
   */
  app.get("/api/sessions-caisse", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), requireAgenceIdAccess(), async (req, res) => {
      // Use requireAgenceIdAccess for more robust agence filtering (uses UUIDs from userAgences)
      const agenceId = req.selectedAgenceId || req.query.agenceId as string;
      const requestedStatut = req.query.statut as string;

      const filter = { 
        agence: agenceId,
        statut: requestedStatut
      };
      
      const sessions = await storage.getAllSessionsCaisse(filter);
      res.json(sessions);
  });

  /**
   * GET /api/sessions-caisse/closing
   * Récupère les sessions en cours de fermeture pour l'agence (supervision)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  /**
   * GET /api/sessions-caisse/closing
   */
  app.get("/api/sessions-caisse/closing", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE_SESSION), async (req, res) => {
    const user = req.session.user!;
    const agenceId = (req.query.agenceId as string) || user.agenceId;

    if (!agenceId) {
      return res.status(400).json({ message: "L'agence est requise" });
    }

    const sessions = await getClosingSessionsForAgence(agenceId);
    res.json(sessions);
  });

  /**
   * GET /api/sessions-caisse/pending
   * Récupère la session en attente (REQUESTING_FUNDS ou FUNDS_DISPATCHED) de l'utilisateur
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  /**
   * GET /api/sessions-caisse/pending
   */
  app.get("/api/sessions-caisse/pending", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const session = await getPendingSession(user.id);
    res.json(session || null);
  });

  /**
   * Sessions à risque (inactives depuis trop longtemps)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  /**
   * GET /api/sessions-caisse/risky
   */
  app.get("/api/sessions-caisse/risky", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
          const agenceId = isGlobalAdmin ? undefined : req.session.user?.agenceId;
          const riskySessions = await sessionService.getRiskySessions(agenceId ?? undefined);
          res.json(riskySessions);
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur récupération sessions à risque');
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * Sessions avec écarts significatifs (monitoring)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  /**
   * GET /api/sessions-caisse/ecarts
   */
  app.get("/api/sessions-caisse/ecarts", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
          const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
          const agenceId = isGlobalAdmin ? undefined : req.session.user?.agenceId;
          const sessionsWithEcarts = await sessionService.getSessionsWithSignificantEcarts(threshold, agenceId ?? undefined);
          res.json(sessionsWithEcarts);
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur récupération écarts');
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * Fermer les sessions expirées (route admin pour déclencher manuellement ou via cron)
   * NOTE: This route MUST be defined BEFORE /api/sessions-caisse/:id to avoid route conflict
   */
  /**
   * POST /api/sessions-caisse/close-expired
   */
  app.post("/api/sessions-caisse/close-expired", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE_SESSION), async (req, res) => {
      try {
          const timeoutHours = req.body.timeoutHours ? Number(req.body.timeoutHours) : 12;
          const closedSessions = await sessionService.closeExpiredSessions(timeoutHours);

          // Notifier via WebSocket
          const wsInstance = getWsInstance();
          if (wsInstance && closedSessions.length > 0) {
              closedSessions.forEach(s => {
                  wsInstance.broadcast({
                      type: "SESSION_TIMEOUT",
                      payload: { sessionId: s.sessionId, caisseId: s.caisseId }
                  });
              });
              wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
          }

          res.json({
              success: true,
              closedCount: closedSessions.length,
              closedSessions
          });
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur fermeture sessions expirées');
          res.status(500).json({ message: error.message });
      }
  });

  /**
   * GET /api/sessions-caisse/:id
   */
  app.get("/api/sessions-caisse/:id", requireAuth, async (req, res) => {
      const session = await storage.getSessionCaisse(req.params.id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });
      
      const operations = await storage.getOperationsBySession(req.params.id);
      res.json({ ...session, operations });
  });

  /**
   * GET /api/sessions-caisse/caissier/:id
   */
  app.get("/api/sessions-caisse/caissier/:id", requireAuth, async (req, res) => {
      try {
          const sessions = await storage.getSessionsByCaissier(req.params.id);
          res.json(sessions);
      } catch (error: any) {
          res.status(500).json({ message: error.message });
      }
  });

  // Clôture de session
  /**
   * POST /api/sessions-caisse/:id/close
   */
  app.post("/api/sessions-caisse/:id/close", requireAuth, attachAbility, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;
      
      const session = await storage.getSessionCaisse(id);
      if (!session) return res.status(404).json({ message: "Session introuvable" });

      // Permission check: User must be the owner OR Admin/Chef
      const isManager = req.ability?.can(Actions.MANAGE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, 'all');
      if (session.caissierId !== user.id && !isManager) {
          return res.status(403).json({ message: "Vous n'avez pas l'autorisation de fermer cette session" });
      }

      const data = normalizeKeysDeep(req.body) as any;
      const billetageFermeture = data.billetageFermeture || {};
      const observations = data.observations;

      // 1. Calculate Real Balance from Billetage
      let soldeReel = 0;
      // Define values for cash counting (should ideally be shared constant)
      const VALUES: Record<string, number> = {
          'billets_10000': 10000, 'billets_5000': 5000, 'billets_1000': 1000, 'billets_500': 500,
          'billets_200': 200, 'billets_100': 100, 'billets_50': 50,
          'pieces_20': 20, 'pieces_10': 10, 'pieces_5': 5
      };

      for (const [key, count] of Object.entries(billetageFermeture)) {
          if (VALUES[key]) {
              soldeReel += (Number(count) || 0) * VALUES[key];
          }
      }

      // 2. Calculate Theoretical Balance (Initial + Ops)
      // This logic should be robust. For now, we trust the frontend 'soldeTheorique' if provided, BUT better to recalculate.
      // Let's recalculate for security.
      const ops = await storage.getOperationsBySession(id);
      let soldeTheorique = Number(session.montantOuverture);
      
      // Add Operations
      for (const op of ops) {
          const montant = Number(op.montant);

          // Use centralized helper functions from caisse-operations.ts
          const delta = getOperationDelta(op.typeOperation, montant, {
              reference: op.reference,
              description: op.description
          });
          soldeTheorique += delta;
      }

      // Add Transfers (IN/OUT)
      // Pending implementation of Transfer logic affecting session balance directly?
      // For MVP closure, we assume Ops cover most. If Transfers exist, they should generate Ops or be queried.
      // Let's assume for now Ops are the source of truth.

      // 3. Calculate Ecart
      const ecart = soldeReel - soldeTheorique;

      // 4. Update Session
      const closedSession = await storage.closeSessionCaisse(id, {
          soldeReel: soldeReel.toString(),
          ecart: ecart.toString(),
          billetageFermeture,
          observations
      });

      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(closedSession);
  });

  // ============================================================================
  // ROUTES DE MONITORING ET HEARTBEAT (Production)
  // ============================================================================

  // Heartbeat - mise à jour de l'activité de la session
  /**
   * POST /api/sessions-caisse/:id/heartbeat
   */
  app.post("/api/sessions-caisse/:id/heartbeat", requireAuth, async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;

      // Vérifier que l'utilisateur est propriétaire de la session
      const session = await storage.getSessionCaisse(id);
      if (!session) {
          return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.caissierId !== user.id) {
          return res.status(403).json({ message: "Non autorisé" });
      }

      const success = await sessionService.updateSessionHeartbeat(id);

      if (success) {
          res.json({ success: true, timestamp: new Date().toISOString() });
      } else {
          res.status(400).json({ success: false, message: "Session non active" });
      }
  });

  // Forcer la fermeture d'une session (admin)
  /**
   * POST /api/sessions-caisse/:id/force-close
   */
  app.post("/api/sessions-caisse/:id/force-close", requireAuth, attachAbility, requireAbility(Actions.CLOSE_SESSION, Subjects.CAISSE_SESSION), async (req, res) => {
      const { id } = req.params;
      const user = req.session.user!;

      const session = await storage.getSessionCaisse(id);
      if (!session) {
          return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.closedAt) {
          return res.status(400).json({ message: "Session déjà fermée" });
      }

      const result = await sessionService.closeSessionAtomic({
          sessionId: id,
          billetageFermeture: {},
          soldeReel: "0",
          observations: `Fermeture forcée par ${user.nom || user.username} - ${req.body.reason || 'Sans raison spécifiée'}`,
          closedBy: user.id,
          closedReason: "admin",
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
          return res.status(500).json({ message: result.error });
      }

      // Update UI real-time
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: session.caisseId } });
          wsInstance.broadcast({ type: "SESSION_FORCE_CLOSED", payload: { sessionId: id } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.json(result.session);
  });

  /**
   * GET /api/sessions-caisse/:id/mouvements - Movements for a cash session
   */
  /**
   * GET /api/sessions-caisse/:id/mouvements
   */
  app.get("/api/sessions-caisse/:id/mouvements", requireAuth, async (req, res) => {
    try {
      const mouvements = await storage.getMouvementsFinanciers({
        sessionCaisseId: req.params.id,
        limit: 100
      });
      res.json(mouvements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
