/**
 * Routes comptes — segment /comptes (partie comptes-detail-4).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/comptes/:id/transfert-agence
 *   GET    /api/comptes/:id/historique-agences
 *   GET    /api/comptes/:id/transactions
 *   POST   /api/comptes/:id/cloturer
 *   POST   /api/comptes/:id/crediter-interets
 *   GET    /api/comptes/:id/stats
 *   GET    /api/comptes/operations/:id/can-reverse
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import { z } from "zod";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import { reverseOperation, canReverseOperation, ReversalError } from "../../services/caisse/transaction-reversal-service";
import { storage } from "../../storage";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { currencySymbol } from "@shared/config/currency";
import { logger, transfertAgenceSchema } from "./shared";

export function registerComptesDetail4Routes(app: Express) {
  // ============================================================================
  // TRANSFERT INTER-AGENCE
  // ============================================================================

  /**
   * POST /api/comptes/:id/transfert-agence - Transférer vers une autre agence
   * Historisé via compte_agences_historique
   */
  /**
   * POST /api/comptes/:id/transfert-agence
   */
  app.post(
    "/api/comptes/:id/transfert-agence",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = transfertAgenceSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.transfererCompteAgence(
          {
            compteId: req.params.id,
            nouvelleAgenceId: parsed.nouvelleAgenceId,
            motif: parsed.motif,
          },
          user?.id
        );

        await logAudit(
          req,
          "TRANSFERT_COMPTE_AGENCE",
          "compte",
          req.params.id,
          { nouvelleAgenceId: parsed.nouvelleAgenceId },
          "success",
          "high"
        );

        res.json(
          {
            ...compte,
            message: "Compte transféré avec succès",
          }
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        logger.error({ err: error }, 'Error transfert agence');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/historique-agences - Historique des transferts d'agence
   */
  /**
   * GET /api/comptes/:id/historique-agences
   */
  app.get(
    "/api/comptes/:id/historique-agences",
    requireAuth,
    async (req, res) => {
      try {
        const historique = await comptesService.getCompteAgenceHistorique(
          req.params.id
        );
        res.json(historique);
      } catch (error: any) {
        logger.error({ err: error }, 'Error getting historique agences');
        res.status(500).json({ message: error.message });
      }
    }
  );

  // ============================================================================
  // TRANSACTIONS & PORTFOLIO
  // ============================================================================

  /**
   * GET /api/comptes/:id/transactions - Transactions du compte
   */
  /**
   * GET /api/comptes/:id/transactions
   */
  app.get("/api/comptes/:id/transactions", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTE), async (req, res) => {
    try {
      // Filtre multi-agence
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      if (!isGlobalAdmin) {
        const compteCheck = await storage.getCompte(req.params.id);
        const userAgenceId = req.session.user?.agenceId;
        if (compteCheck?.agenceId && userAgenceId && compteCheck.agenceId !== userAgenceId) {
          return res.status(403).json({ message: "Accès interdit: compte d'une autre agence" });
        }
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const cursor = req.query.cursor as string | undefined;
      const result = await comptesService.getCompteTransactions(
        req.params.id,
        limit,
        cursor
      );
      res.json({
        data: result.data,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting transactions');
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // STATS & CLOTURE
  // ============================================================================

  /**
   * POST /api/comptes/:id/cloturer - Clôturer un compte définitivement
   */
  /**
   * POST /api/comptes/:id/cloturer
   */
  app.post(
    "/api/comptes/:id/cloturer",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const user = req.session.user;
        const compte = await comptesService.cloturerCompte(
          req.params.id,
          user?.id
        );

        await logAudit(
          req,
          "CLOTURER_COMPTE",
          "compte",
          req.params.id,
          undefined,
          "success",
          "critical"
        );

        // Domain event: account closed
        dispatchDomainEvent({
          type: "ACCOUNT_CLOSED",
          data: {
            compteId: compte.id,
            numeroCompte: compte.numeroCompte,
            typeCompte: compte.typeCompte,
            clientId: compte.clientId,
            agenceId: compte.agenceId || undefined,
          },
          timestamp: new Date(),
          agenceId: compte.agenceId || undefined,
        });

        res.json(
          {
            ...compte,
            message: "Compte clôturé avec succès",
          }
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          // Specific error codes to help frontend (BALANCE_NOT_ZERO, PENDING_TRANSACTIONS...)
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        logger.error({ err: error }, 'Error cloturer compte');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/crediter-interets - Créditer des intérêts (atomique)
   * Crée un mouvement financier + écriture GL + transaction compte en une seule TX.
   */
  /**
   * POST /api/comptes/:id/crediter-interets
   */
  app.post(
    "/api/comptes/:id/crediter-interets",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const user = req.session.user;

        const parsed = z.object({
          montant: z.number().positive(),
          periode: z.string().min(1),
          tauxInteret: z.number().min(0),
          observations: z.string().optional(),
        }).parse(data);

        const result = await comptesService.crediterInterets(
          {
            compteId: req.params.id,
            montant: parsed.montant,
            periode: parsed.periode,
            tauxInteret: parsed.tauxInteret,
            observations: parsed.observations,
          },
          user?.id
        );

        await logAudit(
          req,
          "CREDITER_INTERETS",
          "compte",
          req.params.id,
          { montant: parsed.montant, periode: parsed.periode, tauxInteret: parsed.tauxInteret },
          "success",
          "medium"
        );

        // Domain event
        {
          const compteInfo = await storage.getCompte(req.params.id);
          if (compteInfo) {
            dispatchDomainEvent({
              type: "INTEREST_CAPITALIZED",
              data: {
                compteId: req.params.id,
                numeroCompte: compteInfo.numeroCompte,
                clientId: compteInfo.clientId,
                montantInteret: parsed.montant,
                nouveauSolde: result.transaction.soldeApres,
                agenceId: compteInfo.agenceId || undefined,
              },
              timestamp: new Date(),
              agenceId: compteInfo.agenceId || undefined,
            });
          }
        }

        // WebSocket broadcast
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Intérêts crédités: ${parsed.montant.toLocaleString()} ${currencySymbol()}`,
              user: user.nom || "Système",
              type: "savings",
              timestamp: new Date().toISOString(),
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "COMPTE_UPDATE",
            payload: { compteId: req.params.id, action: "INTERETS" },
          });
        }

        res.json(
          {
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            message: "Intérêts crédités avec succès",
          }
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.message?.includes("Duplicate idempotency")) {
          return res.status(409).json({
            message: "Opération déjà effectuée (doublon détecté)",
            code: "DUPLICATE_OPERATION",
          });
        }
        logger.error({ err: error }, 'Error crediter interets');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/stats - Statistiques d'évolution du solde
   * Query: period (1M, 3M, 6M, 1Y)
   */
  /**
   * GET /api/comptes/:id/stats
   */
  app.get("/api/comptes/:id/stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTE), async (req, res) => {
    try {
      // Filtre multi-agence
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      if (!isGlobalAdmin) {
        const compteCheck = await storage.getCompte(req.params.id);
        const userAgenceId = req.session.user?.agenceId;
        if (compteCheck?.agenceId && userAgenceId && compteCheck.agenceId !== userAgenceId) {
          return res.status(403).json({ message: "Accès interdit: compte d'une autre agence" });
        }
      }

      const period = (req.query.period as '1M' | '3M' | '6M' | '1Y') || '1M';
      // Basic validation of period
      if (!['1M', '3M', '6M', '1Y'].includes(period)) {
        return res.status(400).json({ message: "Période invalide" });
      }

      const stats = await comptesService.getCompteStats(req.params.id, period);
      res.json(stats); // Already JSON structure
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting stats');
      res.status(500).json({ message: error.message });
    }
  });

  // ================================================================
  // TRANSACTION REVERSAL / CANCELLATION
  // ================================================================

  /**
   * GET /api/comptes/operations/:id/can-reverse
   * Check if an operation can be reversed (for UI button visibility)
   */
  /**
   * GET /api/comptes/operations/:id/can-reverse
   */
  app.get(
    "/api/comptes/operations/:id/can-reverse",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.CAISSE_OPERATION),
    async (req, res) => {
      try {
        const result = await canReverseOperation(req.params.id);
        res.json(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, 'Error checking reversibility');
        res.status(500).json({ message });
      }
    }
  );
}
