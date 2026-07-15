/**
 * Routes finance — segment /sessions-caisse (partie sessions-caisse-detail).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/sessions-caisse/:id/submit-count
 *   POST   /api/sessions-caisse/:id/finalize-close
 *   POST   /api/sessions-caisse/:id/cancel-close
 *   POST   /api/sessions-caisse/:id/submit-verification
 *   GET    /api/sessions-caisse/:id/counts
 *   GET    /api/sessions-caisse/:id/suggest-count
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { getSessionCounts, submitCount, submitVerificationCount } from "../../services/caisse/session-closing-count";
import { cancelClose } from "../../services/caisse/session-closing-initiate";
import { finalizeClose } from "../../services/caisse/session-closing-finalize";
import { countSuggestionService } from "../../services/caisse/count-suggestion-service";
import { logger } from "./shared";

export function registerSessionsCaisseDetailRoutes(app: Express) {
  /**
   * POST /api/sessions-caisse/:id/submit-count
   * Phase B: Soumission du comptage à l'aveugle (blind count)
   */
  /**
   * POST /api/sessions-caisse/:id/submit-count
   */
  app.post("/api/sessions-caisse/:id/submit-count", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (!data.billetageFermeture || typeof data.billetageFermeture !== 'object') {
      return res.status(400).json({ message: "Le billetage est obligatoire" });
    }

    const result = await submitCount({
      sessionId: id,
      caissierId: user.id,
      billetageFermeture: data.billetageFermeture,
      ecartJustification: data.ecartJustification,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        MISSING_JUSTIFICATION: 400,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({
        message: result.error,
        errorCode: result.errorCode,
        soldeTheorique: result.soldeTheorique,
        montantPhysique: result.montantPhysique,
        ecart: result.ecart,
      });
    }

    await logAudit(
      req,
      "SESSION_COUNT_SUBMITTED",
      "session_caisse",
      id,
      {
        soldeTheorique: result.soldeTheorique,
        montantPhysique: result.montantPhysique,
        ecart: result.ecart,
      },
      "success",
      "medium"
    );

    res.json({
      session: result.session,
      soldeTheorique: result.soldeTheorique,
      montantPhysique: result.montantPhysique,
      ecart: result.ecart,
    });
  });

  /**
   * POST /api/sessions-caisse/:id/finalize-close
   * Phase C: Finalisation - Décision de trésorerie et clôture définitive
   */
  /**
   * POST /api/sessions-caisse/:id/finalize-close
   */
  app.post("/api/sessions-caisse/:id/finalize-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    // Validation basique
    if (typeof data.montantVersCoffre !== 'number' || typeof data.montantReporte !== 'number') {
      return res.status(400).json({ message: "Les montants de transfert et report sont obligatoires" });
    }

    if (data.montantVersCoffre < 0 || data.montantReporte < 0) {
      return res.status(400).json({ message: "Les montants ne peuvent pas être négatifs" });
    }

    const result = await finalizeClose({
      sessionId: id,
      caissierId: user.id,
      montantVersCoffre: data.montantVersCoffre,
      montantReporte: data.montantReporte,
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
        AMOUNT_MISMATCH: 400,
        COFFRE_NOT_FOUND: 500,
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
      wsInstance.broadcast({
        type: "CAISSE_UPDATE",
        payload: {
          sessionId: id,
          statut: "CLOSED",
          hasPendingTransfer: !!result.transfert,
        }
      });
    }

    await logAudit(
      req,
      "SESSION_CLOSED",
      "session_caisse",
      id,
      {
        montantVersCoffre: data.montantVersCoffre,
        montantReporte: data.montantReporte,
        closingTransfertId: result.transfert?.id,
      },
      "success",
      "high"
    );

    res.json({
      session: result.session,
      transfert: result.transfert,
    });
  });

  /**
   * POST /api/sessions-caisse/:id/cancel-close
   * Annule le processus de fermeture (uniquement en phase CLOSING_COUNT)
   */
  /**
   * POST /api/sessions-caisse/:id/cancel-close
   */
  app.post("/api/sessions-caisse/:id/cancel-close", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await cancelClose({
      sessionId: id,
      caissierId: user.id,
      reason: data.reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        NOT_YOUR_SESSION: 403,
        INVALID_STATUS: 409,
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
      "SESSION_CLOSING_CANCELLED",
      "session_caisse",
      id,
      { reason: data.reason },
      "success",
      "medium"
    );

    res.json(result.session);
  });

  /**
   * POST /api/sessions-caisse/:id/submit-verification
   * Soumettre un comptage de vérification par un second utilisateur (superviseur)
   */
  /**
   * POST /api/sessions-caisse/:id/submit-verification
   */
  app.post("/api/sessions-caisse/:id/submit-verification", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;
    const data = normalizeKeysDeep(req.body) as any;

    const result = await submitVerificationCount({
      sessionId: id,
      verifierId: user.id,
      billetage: data.billetage || data.billetageFermeture || {},
      observations: data.observations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        INVALID_STATUS: 409,
        SAME_USER: 403,
        ALREADY_VERIFIED: 409,
        DB_ERROR: 500,
      };
      const status = statusMap[result.errorCode || 'DB_ERROR'] || 500;
      return res.status(status).json({ message: result.error, errorCode: result.errorCode });
    }

    await logAudit(req, "VERIFICATION_COUNT_SUBMITTED", "session_caisse", id, {
      verificationTotal: result.verificationTotal,
      primaryTotal: result.primaryTotal,
      ecartVerification: result.ecartVerification,
      matched: result.matched,
    }, "success", "medium");

    res.json(result);
  });

  /**
   * GET /api/sessions-caisse/:id/counts
   * Récupérer les comptages primaire et de vérification d'une session
   */
  /**
   * GET /api/sessions-caisse/:id/counts
   */
  app.get("/api/sessions-caisse/:id/counts", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const counts = await getSessionCounts(id);
      res.json(counts);
    } catch (error) {
      logger.error({ err: error }, 'Session counts error');
      res.status(500).json({ error: "Erreur lors de la récupération des comptages" });
    }
  });

  /**
   * GET /api/sessions-caisse/:id/suggest-count
   * Suggère un billetage basé sur les opérations du jour
   */
  /**
   * GET /api/sessions-caisse/:id/suggest-count
   */
  app.get("/api/sessions-caisse/:id/suggest-count", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const suggestion = await countSuggestionService.suggestDenominations(id);
      res.json(suggestion);
    } catch (error: any) {
      logger.error({ err: error }, 'Count suggestion error');
      res.status(500).json({ error: error.message || "Erreur lors de la suggestion du billetage" });
    }
  });
}
