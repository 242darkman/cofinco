/**
 * Routes comptes — segment /comptes (partie comptes-detail-5).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/:id/closure-fee
 *   GET    /api/comptes/:id/closure-request
 *   GET    /api/comptes/:id/opening-fee
 *   GET    /api/comptes/:id/opening-request
 *   GET    /api/comptes/transferts/historique
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import {
  initiateClosureCompte,
  approveClosureCompte,
  cancelClosureCompte,
  getClosureRequest,
  getPendingClosureRequests,
  getClosureFeeForCompte,
  createClosureMoMoPayout,
} from "../../services/compte-closure";
import {
  approveOpeningRequest,
  rejectOpeningRequest,
  getPendingOpeningRequests,
  getOpeningRequest,
  getOpeningFeeForCompte,
} from "../../services/account-opening-validation";
import { mouvementsFinanciers, operationsCaisse, transactionsCompte } from "@shared/schema/finance";
import { aliasedTable, and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import type {
  TypeCompteDz,
  SuspensionReasonDz,
  ClosurePayoutMethodDz,
  StatutTransactionDz,
} from "@shared/enum/enums";
import { logger } from "./shared";

export function registerComptesDetail5Routes(app: Express) {
  /**
   * GET /api/comptes/:id/closure-fee - Frais de clôture configurés pour ce compte (via produit)
   */
  /**
   * GET /api/comptes/:id/closure-fee
   */
  app.get(
    "/api/comptes/:id/closure-fee",
    requireAuth,
    async (req, res) => {
      try {
        const result = await getClosureFeeForCompte(req.params.id);
        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error getting closure fee');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/closure-request - Demande de clôture active d'un compte
   */
  /**
   * GET /api/comptes/:id/closure-request
   */
  app.get(
    "/api/comptes/:id/closure-request",
    requireAuth,
    async (req, res) => {
      try {
        const request = await getClosureRequest(req.params.id);
        res.json(request);
      } catch (error: any) {
        logger.error({ err: error }, 'Error getting closure request');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/opening-fee - Frais d'ouverture + dépôt min depuis le produit
   */
  /**
   * GET /api/comptes/:id/opening-fee
   */
  app.get(
    "/api/comptes/:id/opening-fee",
    requireAuth,
    async (req, res) => {
      try {
        const result = await getOpeningFeeForCompte(req.params.id);
        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error getting opening fee');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/opening-request - Demande d'ouverture active d'un compte
   */
  /**
   * GET /api/comptes/:id/opening-request
   */
  app.get(
    "/api/comptes/:id/opening-request",
    requireAuth,
    async (req, res) => {
      try {
        const request = await getOpeningRequest(req.params.id);
        res.json(request);
      } catch (error: any) {
        logger.error({ err: error }, 'Error getting opening request');
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // TRANSFER HISTORY (instant transfers)
  // ============================================================================

  /**
   * GET /api/comptes/transferts/historique - Historique des virements instantanés
   * Queries mouvementsFinanciers WHERE methode_paiement='TRANSFER' + JOINs
   */
  /**
   * GET /api/comptes/transferts/historique
   */
  app.get(
    "/api/comptes/transferts/historique",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const page = Math.max(parseInt(req.query.page as string) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || "").trim();
        const statut = req.query.statut as string | undefined;
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;

        // Aliased tables for source and destination accounts
        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");
        const sourceClient = aliasedTable(clients, "source_client");
        const destClient = aliasedTable(clients, "dest_client");
        const sourceUser = aliasedTable(users, "source_user");
        const destUser = aliasedTable(users, "dest_user");
        const creatorUser = aliasedTable(users, "creator_user");

        // We need to find pairs: for each mouvement with methode_paiement='TRANSFER',
        // get the TRANSFER_OUT transaction (source) and TRANSFER_IN transaction (dest)
        const txOut = aliasedTable(transactionsCompte, "tx_out");
        const txIn = aliasedTable(transactionsCompte, "tx_in");

        const conditions: any[] = [
          eq(mouvementsFinanciers.methodePaiement, "TRANSFER"),
        ];

        // Agence filter: source or dest account belongs to this agence
        if (req.selectedAgenceId) {
          conditions.push(
            or(
              eq(sourceCompte.agenceId, req.selectedAgenceId),
              eq(destCompte.agenceId, req.selectedAgenceId)
            )
          );
        }

        if (statut) {
          conditions.push(eq(mouvementsFinanciers.statut, statut as StatutTransactionDz));
        }

        if (from) {
          conditions.push(gte(mouvementsFinanciers.dateOperation, new Date(from)));
        }
        if (to) {
          // Add 1 day to include the end date
          const toDate = new Date(to);
          toDate.setDate(toDate.getDate() + 1);
          conditions.push(lte(mouvementsFinanciers.dateOperation, toDate));
        }

        if (search) {
          const pattern = `%${search}%`;
          conditions.push(or(
            ilike(mouvementsFinanciers.reference, pattern),
            ilike(sourceCompte.numeroCompte, pattern),
            ilike(destCompte.numeroCompte, pattern),
            ilike(sql`COALESCE(${sourceUser.nom}, '')`, pattern),
            ilike(sql`COALESCE(${sourceUser.prenom}, '')`, pattern),
            ilike(sql`COALESCE(${destUser.nom}, '')`, pattern),
            ilike(sql`COALESCE(${destUser.prenom}, '')`, pattern),
          ));
        }

        const whereClause = and(...conditions);

        // Base query with JOINs
        const baseQuery = db
          .select()
          .from(mouvementsFinanciers)
          .leftJoin(txOut, and(
            eq(txOut.mouvementId, mouvementsFinanciers.id),
            eq(txOut.typePaiement, "TRANSFER_OUT"),
          ))
          .leftJoin(txIn, and(
            eq(txIn.mouvementId, mouvementsFinanciers.id),
            eq(txIn.typePaiement, "TRANSFER_IN"),
          ))
          .leftJoin(sourceCompte, eq(txOut.compteId, sourceCompte.id))
          .leftJoin(destCompte, eq(txIn.compteId, destCompte.id))
          .leftJoin(sourceClient, eq(sourceCompte.clientId, sourceClient.id))
          .leftJoin(destClient, eq(destCompte.clientId, destClient.id))
          .leftJoin(sourceUser, eq(sourceClient.userId, sourceUser.id))
          .leftJoin(destUser, eq(destClient.userId, destUser.id));

        // Count query
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(mouvementsFinanciers)
          .leftJoin(txOut, and(
            eq(txOut.mouvementId, mouvementsFinanciers.id),
            eq(txOut.typePaiement, "TRANSFER_OUT"),
          ))
          .leftJoin(txIn, and(
            eq(txIn.mouvementId, mouvementsFinanciers.id),
            eq(txIn.typePaiement, "TRANSFER_IN"),
          ))
          .leftJoin(sourceCompte, eq(txOut.compteId, sourceCompte.id))
          .leftJoin(destCompte, eq(txIn.compteId, destCompte.id))
          .leftJoin(sourceClient, eq(sourceCompte.clientId, sourceClient.id))
          .leftJoin(destClient, eq(destCompte.clientId, destClient.id))
          .leftJoin(sourceUser, eq(sourceClient.userId, sourceUser.id))
          .leftJoin(destUser, eq(destClient.userId, destUser.id))
          .where(whereClause);

        const total = countResult?.count || 0;

        // Data query
        const rows = await db
          .select({
            // Mouvement data
            id: mouvementsFinanciers.id,
            reference: mouvementsFinanciers.reference,
            montant: mouvementsFinanciers.montant,
            statut: mouvementsFinanciers.statut,
            dateOperation: mouvementsFinanciers.dateOperation,
            createdAt: mouvementsFinanciers.createdAt,
            metadata: mouvementsFinanciers.metadata,
            reversalOfId: mouvementsFinanciers.reversalOfId,
            // Source account
            sourceCompteId: sourceCompte.id,
            sourceNumero: sourceCompte.numeroCompte,
            sourceType: sourceCompte.typeCompte,
            sourceSoldeApres: txOut.soldeApres,
            // Destination account
            destCompteId: destCompte.id,
            destNumero: destCompte.numeroCompte,
            destType: destCompte.typeCompte,
            destSoldeApres: txIn.soldeApres,
            // Source client/user
            sourceUserNom: sourceUser.nom,
            sourceUserPrenom: sourceUser.prenom,
            // Dest client/user
            destUserNom: destUser.nom,
            destUserPrenom: destUser.prenom,
            // Creator
            createdBy: mouvementsFinanciers.createdBy,
          })
          .from(mouvementsFinanciers)
          .leftJoin(txOut, and(
            eq(txOut.mouvementId, mouvementsFinanciers.id),
            eq(txOut.typePaiement, "TRANSFER_OUT"),
          ))
          .leftJoin(txIn, and(
            eq(txIn.mouvementId, mouvementsFinanciers.id),
            eq(txIn.typePaiement, "TRANSFER_IN"),
          ))
          .leftJoin(sourceCompte, eq(txOut.compteId, sourceCompte.id))
          .leftJoin(destCompte, eq(txIn.compteId, destCompte.id))
          .leftJoin(sourceClient, eq(sourceCompte.clientId, sourceClient.id))
          .leftJoin(destClient, eq(destCompte.clientId, destClient.id))
          .leftJoin(sourceUser, eq(sourceClient.userId, sourceUser.id))
          .leftJoin(destUser, eq(destClient.userId, destUser.id))
          .where(whereClause)
          .orderBy(desc(mouvementsFinanciers.dateOperation))
          .limit(limit)
          .offset(offset);

        res.json({
          data: rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching transfer history');
        res.status(500).json({ message: "Erreur lors du chargement de l'historique" });
      }
    }
  );
}
