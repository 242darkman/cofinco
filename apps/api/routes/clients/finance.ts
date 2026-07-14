import type { Express, Request } from "express";

import { createLogger } from "../../lib/logger";

import { insertTagSchema, insertClientTagSchema, insertClientActivitySchema, clientTags, clientActivities, users, clients, agences, professions, membresTontine, mouvementsFinanciers, comptes, credits, tontines, remboursements, contributionsTontine, clientDocumentSchema, clientDocumentsArraySchema, enquetesCredit, demandesCredit, creditPlans, type ClientDocument } from "@shared/schema";

import { getTransactionLabel } from "@shared/config/transaction-labels";

const logger = createLogger('Routes:Clients');

import {
  StatutCompte,
  StatutCredit,
  StatutDemande,
  StatutClient,
  SegmentClient,
  TypeCompte,
  MethodePaiement,
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";

import { StorageService } from '../../services/storage-service';

import { storage } from "../../storage";

import { getClientTags, addClientTag, removeClientTag, createTag, deleteTag, getAllTags, logClientActivity, getClientActivities, getClientByUserId, getClientWithUser, getClientStats, createClientApiSchema, updateClientApiSchema, type ClientFull } from "../../storage/clients";

import { requireAuth, hashPassword } from "../../auth";

import { attachAbility, requireAbility, requireAnyAbility } from "../../authorization";

import { Actions, Subjects } from "@shared/ability";

import { SystemRole } from "@shared/types/roles";

import { requireAgenceAccess, validateAgenceAction, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";

import { logAudit } from "../../audit";

import { normalizeKeysDeep, coerceValueToSchema, parsePagination, paginateResponse } from "../utils";

import { recalculateClientScore, recordScoreEvent, getScoreHistory, getScoreState, getScoreTrend, getAgencyScoreStats, getScorePercentile } from "../../services/scoring-engine";

import { z } from "zod";

import { db } from "../../db";

import { eq, sql, or, isNull, and, gte, lte, desc } from "drizzle-orm";

import { getComptesByClient, getCreditsByClient, getDemandesByClient } from "../../storage/finance";

import { autoCreateCourantAccount } from "../../services/comptes";

import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";

import { evaluateClientAlerts, resolveClientAlert, resolveAllClientAlerts, snoozeClientAlert, getAlertsSummary, getAlertsSummaryPaginated, KNOWN_ALERT_TYPES } from "../../services/client-alerts";

import { normalizePhone } from "@shared/utils/phone";

function getTransactionIcon(sourceModule: string, typePaiement?: string): string {
    const type = (typePaiement || sourceModule || '').toLowerCase();
    if (type.includes('crédit') || type.includes('credit')) return 'credit-card';
    if (type.includes('épargne') || type.includes('epargne')) return 'piggy-bank';
    if (type.includes('tontine')) return 'users';
    if (type.includes('retrait')) return 'arrow-up-right';
    if (type.includes('dépôt') || type.includes('depot') || type.includes('versement')) return 'arrow-down-left';
    if (type.includes('remboursement')) return 'refresh-cw';
    if (type.includes('décaissement') || type.includes('decaissement')) return 'banknote';
    return 'activity';
}

export function registerClientFinanceRoutes(app: Express) {


  // CLIENTS ÉLIGIBLES AU CRÉDIT: Clients actifs avec un compte courant dans l'agence
  // DOIT ÊTRE ENREGISTRÉ AVANT LA ROUTE /:id POUR ÉVITER LES COLLISIONS
  // OPTIMISÉ : Requête SQL unique avec pagination côté serveur (P1.5)
  app.get("/api/clients/eligible-credit", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      const { page, perPage, offset } = parsePagination(req.query);

      // Construire la condition d'agence pour le compte courant
      const agenceCondition = agenceFilter?.agenceId
        ? sql`AND co.agence_id = ${agenceFilter.agenceId}`
        : sql``;

      const clientAgenceCondition = agenceFilter?.agenceId
        ? sql`AND c.agence_id = ${agenceFilter.agenceId}`
        : sql``;

      // P1.5: Server-side pagination with COUNT(*) OVER() window function
      // This avoids fetching all 500 results and slicing in memory
      const results = await db.execute(sql`
        SELECT
          c.id,
          c.agence_id,
          c.numero_piece,
          p.nom as profession,
          c.segment,
          c.created_at,
          u.nom,
          u.prenom,
          u.email,
          u.telephone,
          u.photo_profile,
          u.statut,
          a.nom as agence_nom,
          co.id as compte_courant_id,
          co.numero_compte as compte_courant_numero,
          co.solde_courant as compte_courant_solde,
          c.revenu_mensuel,
          c.revenu_journalier,
          c.type_revenu,
          COUNT(*) OVER() as total_count
        FROM clients c
        INNER JOIN users u ON c.user_id = u.id
        LEFT JOIN agences a ON c.agence_id = a.id
        LEFT JOIN professions p ON c.profession_id = p.id
        -- Join with active current account (ensures client has one)
        INNER JOIN comptes co ON co.client_id = c.id
          AND co.type_compte = ${TypeCompte.CURRENT}
          AND co.statut = ${StatutCompte.ACTIVE}
          ${agenceCondition}
        WHERE u.statut = ${StatutClient.ACTIVE}
          ${clientAgenceCondition}
          -- Exclude clients with active credits
          AND NOT EXISTS (
            SELECT 1 FROM credits cr
            WHERE cr.client_id = c.id
              AND cr.statut IN (${StatutCredit.ACTIVE}, ${StatutCredit.LATE})
          )
          -- Exclude clients with pending demandes
          AND NOT EXISTS (
            SELECT 1 FROM demandes_credit dc
            WHERE dc.client_id = c.id
              AND dc.statut IN (${StatutDemande.PENDING_FEES}, ${StatutDemande.READY_FOR_INVESTIGATION}, ${StatutDemande.UNDER_INVESTIGATION}, ${StatutDemande.APPROVED})
          )
        ORDER BY u.nom, u.prenom
        LIMIT ${perPage}
        OFFSET ${offset}
      `);

      // Récupérer le total depuis la fonction de fenêtrage (all rows have same total_count)
      const total = results.rows.length > 0 ? Number((results.rows[0] as any).total_count) : 0;

      // Transformer les résultats pour correspondre au format attendu
      const eligibleClients = results.rows.map((row: any) => ({
        id: row.id,
        agenceId: row.agence_id,
        numeroPiece: row.numero_piece,
        profession: row.profession,
        segment: row.segment,
        createdAt: row.created_at,
        nom: row.nom,
        prenom: row.prenom,
        email: row.email,
        telephone: row.telephone,
        photoProfile: row.photo_profile,
        statut: row.statut,
        agence_nom: row.agence_nom,
        compteCourantId: row.compte_courant_id,
        compteCourantNumero: row.compte_courant_numero,
        compteCourantSolde: row.compte_courant_solde,
        revenuMensuel: row.revenu_mensuel,
        revenuJournalier: row.revenu_journalier,
        typeRevenu: row.type_revenu,
      }));

      logger.debug({ total, page, perPage }, 'Eligible clients fetched (SQL pagination)');

      res.json(
        paginateResponse(eligibleClients as unknown[], total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          filters: agenceFilter || {},
        })
      );
    } catch (error) {
      logger.error({ err: error }, 'Error fetching eligible clients');
      res.status(500).json({ message: "Erreur lors de la récupération des clients éligibles" });
    }
  });


  // GET Client Comptes - For account type selector
  app.get("/api/clients/:id/comptes", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // Validate UUID
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      // Verify client exists and access
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }

      // Get all accounts for this client
      const comptes = await getComptesByClient(req.params.id);
      
      res.json(comptes);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client comptes');
      res.status(500).json({ message: "Erreur lors de la récupération des comptes" });
    }
  });


  // GET Client Credits — Liste des crédits d'un client
  app.get("/api/clients/:id/credits", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }

      const credits = await getCreditsByClient(req.params.id);
      res.json(credits);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client credits');
      res.status(500).json({ message: "Erreur lors de la récupération des crédits" });
    }
  });


  // GET Client Enquêtes — Historique des enquêtes de crédit
  app.get("/api/clients/:id/enquetes", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }

      const enquetes = await db.select({
        id: enquetesCredit.id,
        statut: enquetesCredit.statut,
        montantDemande: enquetesCredit.montantDemande,
        objetCredit: enquetesCredit.objetCredit,
        agentRecommendation: enquetesCredit.agentRecommendation,
        recommendedAmount: enquetesCredit.recommendedAmount,
        riskLevel: enquetesCredit.riskLevel,
        scoreGlobal: enquetesCredit.scoreGlobal,
        assignedAt: enquetesCredit.assignedAt,
        submittedAt: enquetesCredit.submittedAt,
        reviewedAt: enquetesCredit.reviewedAt,
        createdAt: enquetesCredit.createdAt,
        supervisorNotes: enquetesCredit.supervisorNotes,
        numeroDemande: demandesCredit.numeroDemande,
        creditPlanName: creditPlans.nom,
        agentNom: users.nom,
        agentPrenom: users.prenom,
      })
        .from(enquetesCredit)
        .leftJoin(demandesCredit, eq(enquetesCredit.demandeId, demandesCredit.id))
        .leftJoin(creditPlans, eq(enquetesCredit.creditPlanId, creditPlans.id))
        .leftJoin(users, eq(enquetesCredit.assignedAgentId, users.id))
        .where(and(
          eq(enquetesCredit.clientId, req.params.id),
          isNull(enquetesCredit.deletedAt)
        ))
        .orderBy(desc(enquetesCredit.createdAt));

      res.json(enquetes);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client enquêtes');
      res.status(500).json({ message: "Erreur lors de la récupération des enquêtes" });
    }
  });


  // Les routes des comptes bancaires vivent dans finance-comptes.ts
}
