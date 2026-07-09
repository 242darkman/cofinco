/**
 * Routes comptes — segment /comptes (partie comptes-detail).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/:id
 *   POST   /api/comptes/:id/depot
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
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { currencySymbol } from "@shared/config/currency";
import { logger, depotRetraitSchema } from "./shared";

export function registerComptesDetailRoutes(app: Express) {
  /**
   * GET /api/comptes/:id - Détails d'un compte avec permissions et données client
   */
  /**
   * GET /api/comptes/:id
   */
  app.get("/api/comptes/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTE), async (req, res) => {
    try {
      const compte = await storage.getCompte(req.params.id);
      if (!compte) {
        return res.status(404).json({ message: "Compte non trouvé" });
      }

      // Filtre multi-agence : vérifier que le compte appartient à l'agence de l'utilisateur
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      if (!isGlobalAdmin) {
        const userAgenceId = req.session.user?.agenceId;
        if (compte.agenceId && userAgenceId && compte.agenceId !== userAgenceId) {
          return res.status(403).json({ message: "Accès interdit: compte d'une autre agence" });
        }
      }

      // Récupérer les données du client associé (compte peut avoir clientId ou client_id)
      // Note: Les données d'identité (nom, prénom, téléphone, email) sont dans la table users
      const clientId = compte.clientId || (compte as any).client_id;
      let clientData = null;
      if (clientId) {
        const [result] = await db
          .select({
            clientId: clients.id,
            userId: clients.userId,
            nom: users.nom,
            prenom: users.prenom,
            telephone: users.telephone,
            email: users.email,
          })
          .from(clients)
          .leftJoin(users, eq(clients.userId, users.id))
          .where(eq(clients.id, clientId))
          .limit(1);

        if (result) {
          clientData = {
            id: result.clientId,
            nom: result.nom,
            prenom: result.prenom,
            telephone: result.telephone,
            phone: result.telephone,
            email: result.email,
          };
        }
      }

      logger.debug({ clientId, clientData, compteId: compte.id }, 'Fetched client data for compte');

      // Ajouter les informations de permission de retrait
      const withdrawalCheck = comptesService.canWithdraw(compte);
      const depositCheck = comptesService.canDeposit(compte);

      res.json(
        {
          ...compte,
          clients: clientData,
          permissions: {
            canWithdraw: withdrawalCheck.allowed,
            withdrawalBlockedReason: withdrawalCheck.reason,
            canDeposit: depositCheck.allowed,
            depositBlockedReason: depositCheck.reason,
          },
        }
      );
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting compte');
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // DEPOT / RETRAIT
  // ============================================================================

  /**
   * POST /api/comptes/:id/depot - Effectuer un dépôt
   * Les dépôts sont toujours autorisés (même sur compte bloqué)
   */
  /**
   * POST /api/comptes/:id/depot
   */
  app.post(
    "/api/comptes/:id/depot",
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

        const result = await comptesService.deposerSurCompte(
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
          "DEPOT_COMPTE",
          "compte",
          req.params.id,
          { montant: parsed.montant },
          "success",
          "medium"
        );

        // Domain event: deposit
        {
          const compteInfo = await storage.getCompte(req.params.id);
          if (compteInfo) {
            dispatchDomainEvent({
              type: "ACCOUNT_DEPOSIT",
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

            // Score event: EPARGNE_DEPOT (direct deposit path)
            try {
              const { recordScoreEvent } = await import('../../services/scoring-engine');
              await recordScoreEvent({
                clientId: compteInfo.clientId,
                agenceId: compteInfo.agenceId || undefined,
                eventType: 'EPARGNE_DEPOT',
                refId: `depot-${result.mouvement.id}`,
                refType: 'mouvement_financier',
                montant: parsed.montant,
                createdBy: user?.id,
              });
            } catch (scoreErr) {
              logger.warn({ err: scoreErr, compteId: req.params.id }, 'Score event EPARGNE_DEPOT failed (non-blocking)');
            }
          }
        }

        // Broadcast temps réel (outbox worker gère le reste)
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Dépôt: ${parsed.montant.toLocaleString()} ${currencySymbol()}`,
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
            type: "CAISSE_UPDATE",
            payload: { action: "DEPOT", montant: parsed.montant },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "COMPTE_UPDATE",
            payload: { compteId: req.params.id, action: "DEPOT" },
          });
        }

        res.json(
          {
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            facture: result.facture || null,
            message: "Dépôt effectué avec succès",
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
        logger.error({ err: error }, 'Error depot');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );
}
