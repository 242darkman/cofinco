/**
 * Routes comptes — segment /comptes (partie comptes-detail-3).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/comptes/:id/retrait
 *   POST   /api/comptes/:id/bloquer
 *   POST   /api/comptes/:id/debloquer
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import { duplicateDetection } from "../../middleware/duplicate-detection";
import { storage } from "../../storage";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { currencySymbol } from "@shared/config/currency";
import { logger, depotRetraitSchema, blocageSchema, deblocageSchema } from "./shared";

export function registerComptesDetail3Routes(app: Express) {
  /**
   * POST /api/comptes/:id/retrait - Effectuer un retrait
   * CRITIQUE: Vérifie les règles de blocage pour les comptes bloqués
   */
  /**
   * POST /api/comptes/:id/retrait
   */
  app.post(
    "/api/comptes/:id/retrait",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
    duplicateDetection({ windowSeconds: 300 }),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = depotRetraitSchema.parse(data);
        const user = req.session.user;

        // Si pas de sessionCaisseId fourni, essayer de récupérer la session active
        let sessionCaisseId = parsed.sessionCaisseId;
        if (!sessionCaisseId && user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }

        const result = await comptesService.retirerDuCompte(
          {
            compteId: req.params.id,
            montant: parsed.montant,
            methodePaiement: parsed.methodePaiement,
            sessionCaisseId,
            observations: parsed.observations,
            idempotencyKey: parsed.idempotencyKey,
          },
          user?.id
        );

        await logAudit(
          req,
          "RETRAIT_COMPTE",
          "compte",
          req.params.id,
          { montant: parsed.montant },
          "success",
          "high"
        );

        // Domain event: withdrawal
        {
          const compteInfo = await storage.getCompte(req.params.id);
          if (compteInfo) {
            dispatchDomainEvent({
              type: "ACCOUNT_WITHDRAWAL",
              data: {
                compteId: req.params.id,
                numeroCompte: compteInfo.numeroCompte,
                typeCompte: compteInfo.typeCompte,
                clientId: compteInfo.clientId,
                montant: parsed.montant,
                nouveauSolde: result.transaction.soldeApres || compteInfo.soldeCourant,
                agenceId: compteInfo.agenceId || undefined,
              },
              timestamp: new Date(),
              agenceId: compteInfo.agenceId || undefined,
            });
          }
        }

        // Broadcast temps réel
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Retrait de ${parsed.montant.toLocaleString()} ${currencySymbol()} effectué`,
              targetRole: "admin",
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Retrait: ${parsed.montant.toLocaleString()} ${currencySymbol()}`,
              user: user.nom || "Système",
              type: "payment",
              timestamp: new Date().toISOString(),
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "CAISSE_UPDATE",
            payload: { action: "RETRAIT", montant: parsed.montant },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "COMPTE_UPDATE",
            payload: { compteId: req.params.id, action: "RETRAIT" },
          });
        }

        res.json(
          {
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            facture: result.facture || null,
            message: "Retrait effectué avec succès",
          }
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          // Codes spécifiques pour le frontend
          const statusCode =
            error.code === "WITHDRAWAL_NOT_ALLOWED" ||
            error.code === "INSUFFICIENT_BALANCE"
              ? 403
              : 400;
          return res.status(statusCode).json({
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
        logger.error({ err: error }, 'Error retrait');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // BLOCAGE / DEBLOCAGE
  // ============================================================================

  /**
   * POST /api/comptes/:id/bloquer - Bloquer un compte
   */
  /**
   * POST /api/comptes/:id/bloquer
   */
  app.post(
    "/api/comptes/:id/bloquer",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = blocageSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.bloquerCompte(
          req.params.id,
          parsed.motif,
          parsed.reference,
          parsed.dateFin ? new Date(parsed.dateFin) : undefined,
          user?.id
        );

        await logAudit(
          req,
          "BLOQUER_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        // Domain event: account blocked
        dispatchDomainEvent({
          type: "ACCOUNT_BLOCKED",
          data: {
            compteId: compte.id,
            numeroCompte: compte.numeroCompte,
            typeCompte: compte.typeCompte,
            clientId: compte.clientId,
            motif: parsed.motif,
            dateFin: parsed.dateFin || undefined,
            agenceId: compte.agenceId || undefined,
          },
          timestamp: new Date(),
          agenceId: compte.agenceId || undefined,
        });

        // Score event: account blocked
        try {
          const { recordScoreEvent } = await import('../../services/scoring-engine');
          await recordScoreEvent({
            clientId: compte.clientId,
            agenceId: compte.agenceId || undefined,
            eventType: 'COMPTE_BLOQUE',
            refId: `blocage-${compte.id}-${new Date().toISOString().slice(0, 10)}`,
            refType: 'compte',
            reason: parsed.motif,
            createdBy: user?.id,
          });
        } catch (scoreErr) {
          logger.error({ err: scoreErr }, 'Scoring event error (account blocked)');
        }

        res.json(
          {
            ...compte,
            message: "Compte bloqué avec succès",
          }
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        logger.error({ err: error }, 'Error bloquer compte');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/debloquer - Débloquer un compte
   * CRITIQUE: Tracé et événement temps réel obligatoire
   */
  /**
   * POST /api/comptes/:id/debloquer
   */
  app.post(
    "/api/comptes/:id/debloquer",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = deblocageSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.debloquerCompte(
          {
            compteId: req.params.id,
            motif: parsed.motif,
          },
          user?.id
        );

        await logAudit(
          req,
          "DEBLOQUER_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        // Domain event: account unblocked
        dispatchDomainEvent({
          type: "ACCOUNT_UNBLOCKED",
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

        // Notification explicite (en plus de l'outbox)
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Compte ${compte.numeroCompte} débloqué`,
              type: "success",
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "COMPTE_UPDATE",
            payload: { compteId: req.params.id, action: "DEBLOQUAGE" },
          });
        }

        res.json(
          {
            ...compte,
            message: "Compte débloqué avec succès",
          }
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        logger.error({ err: error }, 'Error debloquer compte');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );
}
