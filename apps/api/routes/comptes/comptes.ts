/**
 * Routes comptes — segment /comptes (partie comptes).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/stats
 *   POST   /api/comptes
 *   GET    /api/comptes
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import comptesService, { CompteError, suspendCompte, unsuspendCompte } from "../../services/comptes";
import {
  approveOpeningRequest,
  rejectOpeningRequest,
  getPendingOpeningRequests,
  getOpeningRequest,
  getOpeningFeeForCompte,
} from "../../services/account-opening-validation";
import { storage } from "../../storage";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage, SuspensionReason } from "@shared/enum/status-constants";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { logger, createCompteSchema } from "./shared";

export function registerComptesRoutes(app: Express) {
  // ============================================================================
  // CREATE COMPTE
  // ============================================================================

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * GET /api/comptes/stats - Statistiques globales des comptes
   */
  /**
   * GET /api/comptes/stats
   */
  app.get(
    "/api/comptes/stats",
    requireAuth,
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const agenceId = req.selectedAgenceId;
        
        const conditions = [eq(comptes.statut, StatutCompte.ACTIVE)];
        
        if (agenceId) {
           conditions.push(eq(comptes.agenceId, agenceId));
        }
        
        const whereClause = and(...conditions);

        const allStats = await db.select({
            typeCompte: comptes.typeCompte,
            count: sql<number>`count(*)`.mapWith(Number),
            totalSolde: sql<number>`sum(${comptes.soldeCourant})`.mapWith(Number)
        })
        .from(comptes)
        .where(whereClause)
        .groupBy(comptes.typeCompte);

        const tauxStats = await db.select({
          typeCompte: comptes.typeCompte,
          tauxMoyen: sql<number>`avg(coalesce(${produitsCompte.tauxInteret}, 0))`.mapWith(Number),
        })
        .from(comptes)
        .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
        .where(whereClause)
        .groupBy(comptes.typeCompte);

        const tauxByType = Object.fromEntries(
          tauxStats.map((stat) => [stat.typeCompte, Number(stat.tauxMoyen || 0)])
        );

        // Format for frontend
        const totalAccounts = allStats.reduce((sum, s) => sum + s.count, 0);
        const tauxMoyenGlobal =
          totalAccounts > 0
            ? allStats.reduce((sum, s) => sum + (tauxByType[s.typeCompte] || 0) * s.count, 0) / totalAccounts
            : 0;

        const result = {
          total: allStats.reduce((sum, s) => sum + s.count, 0),
          epargne: allStats.find(s => s.typeCompte === TypeCompte.SAVINGS)?.count || 0,
          courant: allStats.find(s => s.typeCompte === TypeCompte.CURRENT)?.count || 0,
          bloque: allStats.find(s => s.typeCompte === TypeCompte.BLOCKED)?.count || 0,
          totalSolde: allStats.reduce((sum, s) => sum + (s.totalSolde || 0), 0),
          tauxMoyenGlobal,
          tauxMoyenEpargne: tauxByType[TypeCompte.SAVINGS] || 0,
          tauxMoyenCourant: tauxByType[TypeCompte.CURRENT] || 0,
          tauxMoyenBloque: tauxByType[TypeCompte.BLOCKED] || 0,
        };

        res.json(result);
      } catch (error) {
        logger.error({ err: error }, 'Error fetching account stats');
        res.status(500).json({ message: "Erreur lors du chargement des statistiques" });
      }
    }
  );

  /**
   * POST /api/comptes - Créer un nouveau compte
   * Validation: Un client ne peut avoir qu'un seul compte par type
   */
  /**
   * POST /api/comptes
   */
  app.post(
    "/api/comptes",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;

        // Force l'agenceId du client si non spécifié ou pour garantir la cohérence
        if (data.clientId) {
          const client = await storage.getClient(data.clientId);
          if (!client) {
            return res.status(404).json({ message: "Client non trouvé" });
          }
          data.agenceId = client.agenceId;
        }

        const parsed = createCompteSchema.parse(data);

        // Appel au nouveau service qui gère la création conditionnelle
        const result = await comptesService.createCompteWithInitialDeposit(
          {
            clientId: parsed.clientId,
            typeCompte: parsed.typeCompte,
            agenceId: parsed.agenceId,
            produitId: parsed.produitId,
            montantInitial: parsed.soldeInitial,
            modePaiement: parsed.modePaiement,
            compteSourceId: parsed.compteSourceId,
            operateurMobile: parsed.operateurMobile,
            telephoneMobileMoney: parsed.telephoneMobileMoney,
            referenceTransaction: parsed.referenceTransaction,
            blocageActif: parsed.blocageActif,
            blocageMotif: parsed.blocageMotif,
            blocageReference: parsed.blocageReference,
            blocageFin: parsed.blocageFin,
          },
          user?.id!
        );

        // Traiter la configuration de versement automatique si activée (sur le compte créé)
        if (data.versementAutoActif && result.compte) {
          const { calculateNextTransferDate } = await import("../../services/automatic-transfers-service");
          
          const prochainVersement = calculateNextTransferDate(
            data.versementAutoFrequence || 'MONTHLY',
            data.versementAutoJour || 28
          );
          
          await db.update(comptes)
            .set({
              versementAutoActif: true,
              versementAutoMontant: data.versementAutoMontant,
              versementAutoFrequence: data.versementAutoFrequence,
              versementAutoJour: data.versementAutoJour,
              compteSourceId: data.compteSourceId,
              prochainVersementAuto: prochainVersement,
            })
            .where(eq(comptes.id, result.compte.id));
        }

        await logAudit(
          req,
          "CREATE_COMPTE",
          "compte",
          result.compte.id,
          { 
            statut: result.compte.statut, 
            montantInitial: parsed.soldeInitial,
            modePaiement: parsed.modePaiement 
          },
          "success",
          "medium"
        );

        // Domain event: account created
        dispatchDomainEvent({
          type: "ACCOUNT_CREATED",
          data: {
            compteId: result.compte.id,
            numeroCompte: result.compte.numeroCompte,
            typeCompte: result.compte.typeCompte,
            clientId: parsed.clientId,
            montantInitial: parsed.soldeInitial,
            modePaiement: parsed.modePaiement,
            agenceId: parsed.agenceId,
            createdByUserId: user?.id,
          },
          timestamp: new Date(),
          agenceId: parsed.agenceId,
        });

        // Create caisse payment request for accounts that go directly to PENDING_PAYMENT
        // (no approval needed). Accounts needing approval (PENDING_PAYMENT_AND_APPROVAL)
        // will get their caisse request created at approval time in approveOpeningRequest().
        if (
          result.compte.statut === StatutCompte.PENDING_PAYMENT &&
          parsed.modePaiement === 'CASH' &&
          parsed.soldeInitial > 0
        ) {
          try {
            const { createCaisseRequest } = await import("../../services/caisse-queue-service");
            const client = await storage.getClient(parsed.clientId);

            await createCaisseRequest({
              category: "ACCOUNT_ACTIVATION",
              direction: "IN",
              agenceId: parsed.agenceId,
              sourceType: "compte",
              sourceId: result.compte.id,
              clientId: parsed.clientId,
              montant: parsed.soldeInitial,
              label: `Activation compte ${result.compte.numeroCompte}`,
              description: client
                ? `Frais ouverture + dépôt initial — ${client.nom} ${client.prenom || ''}`.trim()
                : undefined,
              metadata: {
                compteId: result.compte.id,
                numeroCompte: result.compte.numeroCompte,
                typeCompte: result.compte.typeCompte,
                montantTotal: parsed.soldeInitial,
                methodePaiement: parsed.modePaiement,
                operateurMobile: parsed.operateurMobile,
                compteSourceId: parsed.compteSourceId,
                clientNom: client?.nom,
                clientPrenom: client?.prenom,
              },
              createdBy: user?.id,
            });
          } catch (err) {
            // Non-blocking: account is still created
            logger.error({ err }, "Failed to create caisse request for account activation");
          }
        }

        // Broadcast pour mise à jour UI
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "DASHBOARD_UPDATE",
            payload: {},
          });

          if (result.facture) {
             // Notifier la facture disponible
          }
        }

        res.status(201).json(result);
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.name === "ZodError") {
          return res.status(400).json({
            message: "Données invalides",
            details: error.errors,
          });
        }
        logger.error({ err: error }, 'Error creating compte');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // LIST & GET COMPTES
  // ============================================================================

  /**
   * GET /api/comptes - Lister les comptes avec clients, recherche et pagination
   * Query params: search, page, limit, typeCompte
   */
  /**
   * GET /api/comptes
   */
  app.get(
    "/api/comptes",
    requireAuth,
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        const filter = agenceFilter?.agenceId ? { agenceId: agenceFilter.agenceId } : {};

        // Parse query parameters
        const options = {
          search: req.query.search as string | undefined,
          page: req.query.page ? parseInt(req.query.page as string) : 1,
          limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
          typeCompte: req.query.typeCompte as string | undefined,
          statut: req.query.statut as string | undefined,
        };

        const result = await storage.getAllComptesWithClients(filter, options);
        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error listing comptes');
        res.status(500).json({ message: error.message });
      }
    }
  );
}
