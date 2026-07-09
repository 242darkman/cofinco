/**
 * Routes finance — segment /credits (partie credits-pending-disbursements).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/credits/pending-disbursements
 *   POST   /api/credits/:id/caisse-payout
 *   POST   /api/credits/:id/cancel-disbursement
 */
import type { Express } from "express";
import { credits } from "@shared/schema";
import { storage } from "../../storage";
import { DecaissementInsufficientFundsError, InsufficientFundsError } from "../../storage/errors";
import { isCoffreCaisseError } from "../../services/coffre/coffre-errors";
import { StatutCredit, StatutDemande } from "@shared/enum/status-constants";
import type {
  StatutCreditDz,
  StatutDemandeDz,
  DisbursementStatusDz,
  DisbursementChannelDz,
  StatutEnqueteCreditDz,
} from "@shared/enum/enums";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import * as sessionService from "../../services/caisse/session-service";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerCreditsPendingDisbursementsRoutes(app: Express) {
  // =====================================================
  // DÉCAISSEMENT CAISSE - Endpoints pour le workflow asynchrone
  // =====================================================

  /**
   * GET /api/credits/pending-disbursements
   * Liste les crédits en attente de décaissement physique à la caisse
   */
  /**
   * GET /api/credits/pending-disbursements
   */
  app.get("/api/credits/pending-disbursements", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const caisseId = req.query.caisseId as string | undefined;
      const pendingDisbursements = await storage.getPendingLoanDisbursements(agenceFilter?.agenceId, caisseId);

      res.json({
        success: true,
        data: pendingDisbursements.map(item => ({
          ...(item.credit as Record<string, unknown>),
          client: item.client
        })),
        count: pendingDisbursements.length
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération décaissements en attente');
      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors de la récupération des décaissements en attente"
      });
    }
  });

  /**
   * POST /api/credits/:id/caisse-payout
   * Exécute le décaissement physique par le caissier
   * C'est ce bouton "Décaisser" qui sort l'argent et active le prêt
   */
  /**
   * POST /api/credits/:id/caisse-payout
   */
  app.post("/api/credits/:id/caisse-payout", requireAuth, attachAbility, requireAbility(Actions.DISBURSE_CASH, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const { id: creditId } = req.params;
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      if (!user?.id) {
        return res.status(401).json({ message: "Utilisateur non authentifié" });
      }

      // Vérifier que le caissier a une session ouverte
      if (!data.sessionCaisseId) {
        return res.status(400).json({ message: "L'ID de la session de caisse est requis" });
      }

      // Exécuter le décaissement
      const result = await storage.processLoanCashPayout({
        creditId,
        sessionCaisseId: data.sessionCaisseId,
        paymentReference: data.paymentReference || data.receiptNumber
      }, user.id);

      const shouldAutoCloseSession = Boolean(data.closeSessionAfterDisbursement);
      if (shouldAutoCloseSession) {
        try {
          await sessionService.closeSessionTemporarily({
            sessionId: data.sessionCaisseId,
            closedBy: user.id,
            observation: "Fermeture automatique après décaissement crédit urgent",
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          });
        } catch (closeError: any) {
          logger.error({ err: closeError, sessionId: data.sessionCaisseId }, 'Auto-clôture session après décaissement crédit échouée');
        }
      }

      // Log audit
      await logAudit(
        req,
        "DECAISSEMENT_CAISSE_EXECUTE",
        "credit",
        creditId,
        {
          sessionCaisseId: data.sessionCaisseId,
          paymentReference: data.paymentReference,
          montant: result.credit.montant,
          numeroCredit: result.credit.numeroCredit
        },
        "success",
        "high"
      );

      // Broadcast updates
      const wsInstance = getWsInstance();
      const userAgence = user?.agence;
      if (wsInstance) {
        // Notification globale pour la caisse
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: {
            subtype: 'LOAN_DISBURSEMENT_COMPLETED',
            creditId,
            numeroCredit: result.credit.numeroCredit,
            montant: result.credit.montant,
            timestamp: new Date().toISOString()
          }
        });

        // Notification crédit
        if (userAgence) {
          wsInstance.broadcastToAgency(userAgence, {
            type: "CREDIT_UPDATE",
            payload: {
              type: 'credit_activated',
              id: creditId
            }
          });
          wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
          wsInstance.broadcastToAgency(userAgence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Décaissement espèces effectué: ${parseFloat(result.credit.montant).toLocaleString()} ${currencySymbol()} - Crédit ${result.credit.numeroCredit} activé`,
              user: user?.nom || 'Caissier',
              type: 'credit',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({
        success: true,
        credit: result.credit,
        mouvement: result.mouvement,
        echeances: result.echeances,
        message: `Crédit ${result.credit.numeroCredit} décaissé et activé avec succès.`
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Erreur décaissement caisse');

      if (error instanceof InsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.toJSON(),
        });
      }

      if (error instanceof DecaissementInsufficientFundsError) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      if (isCoffreCaisseError(error)) {
        return res.status(error.httpStatus).json({
          success: false,
          error: error.data,
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors du décaissement caisse"
      });
    }
  });

  /**
   * POST /api/credits/:id/cancel-disbursement
   * Annule un décaissement en attente (si le client ne se présente pas)
   */
  /**
   * POST /api/credits/:id/cancel-disbursement
   */
  app.post("/api/credits/:id/cancel-disbursement", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
    try {
      const { id: creditId } = req.params;
      const data = normalizeKeysDeep(req.body) as any;
      const user = req.session.user;

      const credit = await storage.getCredit(creditId);
      if (!credit) {
        return res.status(404).json({ message: "Crédit non trouvé" });
      }

      if (credit.statut !== 'WAITING_DISBURSEMENT') {
        return res.status(400).json({
          message: `Impossible d'annuler: le crédit n'est pas en attente de décaissement (statut: ${credit.statut})`
        });
      }

      // Mettre à jour le crédit
      const updatedCredit = await storage.updateCredit(creditId, {
        statut: StatutCredit.CANCELLED,
        disbursementStatus: 'COMPLETED' as DisbursementStatusDz // Completed = processed (even if cancelled)
      });

      // Mettre à jour la demande associée si elle existe
      if (credit.demandeId) {
        await storage.updateDemandeCredit(credit.demandeId, {
          statut: StatutDemande.REJECTED,
          motifRejet: 'Décaissement annulé',
          dateRejet: new Date()
        });
      }

      // Log audit
      await logAudit(
        req,
        "DECAISSEMENT_ANNULE",
        "credit",
        creditId,
        {
          raison: data.raison || "Client non présenté",
          numeroCredit: credit.numeroCredit
        },
        "success",
        "medium"
      );

      // Broadcast
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CAISSE_UPDATE",
          payload: {
            subtype: 'LOAN_DISBURSEMENT_CANCELLED',
            creditId,
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        credit: updatedCredit,
        message: `Décaissement du crédit ${credit.numeroCredit} annulé.`
      });

    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation décaissement');
      res.status(500).json({
        success: false,
        message: error.message || "Erreur lors de l'annulation"
      });
    }
  });
}
