/**
 * Routes finance — segment /sessions-caisse (partie sessions-caisse-request-opening).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/sessions-caisse/request-opening
 *   POST   /api/sessions-caisse/open-direct
 *   POST   /api/sessions-caisse/:id/receive-funds
 *   POST   /api/sessions-caisse/:id/cancel-request
 *   POST   /api/sessions-caisse/:id/initiate-close
 */
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { requestSessionOpening } from "../../services/caisse/session-opening-request";
import { openDirectWithExistingFunds } from "../../services/caisse/session-opening-direct";
import { receiveFundsAndOpen } from "../../services/caisse/session-opening-receipt";
import { cancelOpeningRequest } from "../../services/caisse/session-opening-cancel";
import { sessionClosingService } from "../../services/caisse/session-closing-service";
import { accessControlService } from "../../services/caisse/access-control-service";
import { D, roundMoney } from "../../lib/money";

export function registerSessionsCaisseRequestOpeningRoutes(app: Express) {
  // ============================================================================
  // WORKFLOW SECURISE D'OUVERTURE DE CAISSE (Coffre → Caisse)
  // ============================================================================
  // Règle d'Or: L'argent ne doit jamais apparaître "magiquement".
  // Le solde d'ouverture = solde veille + transfert coffre (tous deux auditables)
  // ============================================================================

  /**
   * POST /api/sessions-caisse/request-opening
   * Phase A: Le caissier demande l'ouverture de sa caisse avec un montant souhaité
   */
  /**
   * POST /api/sessions-caisse/request-opening
   */
  app.post("/api/sessions-caisse/request-opening", requireAuth, attachAbility, async (req, res) => {
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.caisseId) {
      return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
    }
    if (!data.montantDemande || Number(data.montantDemande) <= 0) {
      return res.status(400).json({ message: "Le montant demandé doit être positif." });
    }

    // Vérifier l'assignation si pas manager (ou si override superviseur valide)
    const isManager = req.ability?.can(Actions.MANAGE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, 'all');

    if (!isManager) {
      let hasOverride = false;
      if (data.supervisorOverride) {
        const authStatus = await accessControlService.checkUserAuthorization(user.id, data.caisseId, data.agenceId || user.agenceId);
        hasOverride = authStatus.authorized;
      }
      if (!hasOverride) {
        const assignments = await storage.getCaisseAssignments(data.caisseId);
        const isAssigned = assignments.some(a => a.userId === user.id);
        if (!isAssigned) {
          return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
        }
      }
    }

    const result = await requestSessionOpening({
      caissierId: user.id,
      caisseId: data.caisseId,
      agenceId: data.agenceId || user.agenceId,
      montantDemande: Number(data.montantDemande),
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CAISSE_OCCUPIED: 409,
        USER_HAS_SESSION: 409,
        INVALID_AMOUNT: 400,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "OPENING_REQUEST_CREATED", payload: { agenceId: data.agenceId || user.agenceId } });
    }

    await logAudit(
      req,
      "SESSION_OPENING_REQUESTED",
      "session_caisse",
      result.session!.id,
      { caisseId: data.caisseId, montantDemande: data.montantDemande },
      "success",
      "low"
    );

    res.status(201).json({
      session: result.session,
      transfert: result.transfert,
    });
  });

  /**
   * POST /api/sessions-caisse/open-direct
   * Ouverture directe sans passer par le workflow coffre.
   * Cas d'usage:
   * - Le caissier a un fonds de roulement reporté de la veille
   * - Le caissier souhaite ouvrir sa caisse à 0 FCFA (sans approvisionnement)
   */
  /**
   * POST /api/sessions-caisse/open-direct
   */
  app.post("/api/sessions-caisse/open-direct", requireAuth, attachAbility, async (req, res) => {
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.caisseId) {
      return res.status(400).json({ message: "Vous devez sélectionner une caisse physique." });
    }

    // Vérifier l'assignation si pas manager (ou si override superviseur valide)
    const isManager = req.ability?.can(Actions.MANAGE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, 'all');

    if (!isManager) {
      let hasOverride = false;
      if (data.supervisorOverride) {
        const authStatus = await accessControlService.checkUserAuthorization(user.id, data.caisseId, data.agenceId || user.agenceId);
        hasOverride = authStatus.authorized;
      }
      if (!hasOverride) {
        const assignments = await storage.getCaisseAssignments(data.caisseId);
        const isAssigned = assignments.some(a => a.userId === user.id);
        if (!isAssigned) {
          return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas assigné à cette caisse." });
        }
      }
    }

    const result = await openDirectWithExistingFunds({
      caissierId: user.id,
      caisseId: data.caisseId,
      agenceId: data.agenceId || user.agenceId,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CAISSE_NOT_FOUND: 404,
        CAISSE_OCCUPIED: 409,
        USER_HAS_SESSION: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { agenceId: data.agenceId || user.agenceId } });
      wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
    }

    await logAudit(
      req,
      "SESSION_DIRECT_OPEN",
      "session_caisse",
      result.session!.id,
      { caisseId: data.caisseId, type: "FONDS_REPORTE" },
      "success",
      "low"
    );

    res.status(201).json({
      session: result.session,
    });
  });

  /**
   * POST /api/sessions-caisse/:id/receive-funds
   * Phase C: Le caissier confirme la réception des fonds et ouvre la session
   */
  /**
   * POST /api/sessions-caisse/:id/receive-funds
   */
  app.post("/api/sessions-caisse/:id/receive-funds", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    if (!data.billetageReception || Object.keys(data.billetageReception).length === 0) {
      return res.status(400).json({ message: "Le billetage de réception est obligatoire." });
    }

    const result = await receiveFundsAndOpen({
      sessionId: id,
      caissierId: user.id,
      billetageReception: data.billetageReception,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATE: 409,
        PERMISSION_DENIED: 403,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Notifier via WebSocket
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "CAISSE_UPDATE", payload: { caisseId: result.session!.caisseId } });
      wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
    }

    await logAudit(
      req,
      "SESSION_OPENED_WITH_FUNDS",
      "session_caisse",
      id,
      { soldeOuverture: result.session!.montantOuverture },
      "success",
      "low"
    );

    res.json(result.session);
  });

  /**
   * POST /api/sessions-caisse/:id/cancel-request
   * Annule une demande d'ouverture (uniquement si REQUESTING_FUNDS)
   */
  /**
   * POST /api/sessions-caisse/:id/cancel-request
   */
  app.post("/api/sessions-caisse/:id/cancel-request", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await cancelOpeningRequest({
      sessionId: id,
      userId: user.id,
      reason: data.reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATE: 409,
        PERMISSION_DENIED: 403,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    await logAudit(
      req,
      "SESSION_OPENING_CANCELLED",
      "session_caisse",
      id,
      { reason: data.reason },
      "success",
      "low"
    );

    res.json({ success: true });
  });

  // ============================================================================
  // WORKFLOW SECURISE DE FERMETURE DE CAISSE (Caisse → Coffre)
  // ============================================================================
  // Règle d'Or: L'argent compté physiquement doit correspondre à:
  // MontantVersCoffre + MontantReporte = TotalPhysique
  // ============================================================================

  /**
   * POST /api/sessions-caisse/:id/initiate-close
   * Phase A: Gel de la session - Le caissier initie la fermeture
   */
  /**
   * POST /api/sessions-caisse/:id/initiate-close
   */
  app.post("/api/sessions-caisse/:id/initiate-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    const result = await sessionClosingService.initiateClose({
      sessionId: id,
      caissierId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        PENDING_TRANSACTIONS: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode
      });
    }

    // Log pending offline ops count if provided (for audit trail)
    const pendingOfflineOpsCount = Number(req.body?.pendingOfflineOpsCount) || 0;

    await logAudit(
      req,
      "SESSION_CLOSING_INITIATED",
      "session_caisse",
      id,
      { statut: "CLOSING_COUNT", ...(pendingOfflineOpsCount > 0 ? { pendingOfflineOpsCount } : {}) },
      "success",
      "medium"
    );

    res.json(result.session);
  });
}
