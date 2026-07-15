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

export function registerClientStatsRoutes(app: Express) {

  // ============================================
  // STATISTIQUES AGRÉGÉES (Endpoint Optimisé)
  // DOIT ÊTRE ENREGISTRÉ AVANT LA ROUTE /:id POUR ÉVITER LES COLLISIONS
  // ============================================
  app.get("/api/clients/stats", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      const filter = agenceFilter || {};

      const stats = await getClientStats(filter);
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching client stats');
      res.status(500).json({ message: "Erreur lors de la récupération des statistiques" });
    }
  });


  // Agency score stats (segment distribution, averages) — scoped by agency for non-admins
  app.get("/api/scoring/agency-stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.LOYALTY), async (req, res) => {
      try {
        let agenceId = req.query.agenceId as string | undefined;

        // Non-admin users are restricted to their own agency
        if (!req.ability?.can(Actions.MANAGE, 'all')) {
          agenceId = req.session.user?.agenceId || agenceId;
        }

        const stats = await getAgencyScoreStats(agenceId);
        res.json(stats);
      } catch (error) {
          logger.error({ err: error }, 'Agency score stats error');
          res.status(500).json({ message: "Failed to fetch agency score stats" });
      }
  });


  // Analytics Real-Time
  app.get("/api/clients/:id/analytics", requireAuth, async (req, res) => {
      try {
        const clientId = req.params.id;
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });

        // 1. Fetch all financial data in parallel
        const [accounts, credits, membresTontineData, transactionsMonth] = await Promise.all([
            getComptesByClient(clientId),
            getCreditsByClient(clientId),
            db.select().from(membresTontine).where(eq(membresTontine.clientId, clientId)),
            storage.getMouvementsByClientAndDateRange(
                clientId, 
                new Date(new Date().getFullYear(), new Date().getMonth(), 1), 
                new Date()
            )
        ]);

        // 2. Aggregate Data
        
        // Savings (Courant + Epargne + Tontine Contributions)
        const compteCourantTotal = accounts
            .filter(a => a.typeCompte === TypeCompte.CURRENT && (a.statut === StatutCompte.ACTIVE ))
            .reduce((sum, a) => sum + Number(a.soldeCourant), 0);

        const compteEpargneTotal = accounts
            .filter(a => a.typeCompte === TypeCompte.SAVINGS && (a.statut === StatutCompte.ACTIVE ))
            .reduce((sum, a) => sum + Number(a.soldeCourant), 0);

        const tontineContributionTotal = membresTontineData
            .filter(m => m.statut === StatutCompte.ACTIVE )
            .reduce((sum, m) => sum + Number(m.totalCotisations), 0);

        const totalSavings = compteCourantTotal + compteEpargneTotal + tontineContributionTotal;

        // Credits (Active Due)
        const activeCreditStatuses = [StatutCredit.ACTIVE, StatutCredit.LATE] as string[];
        const activeCredits = credits.filter(c => activeCreditStatuses.includes(c.statut));
        const totalCreditDue = activeCredits.reduce((sum, c) => sum + Number(c.soldeRestant), 0);

        // 3. Trends (Growth this month)
        // Simple logic: Sum of "Dépôt" operations this month vs "Retrait"
        const depositsMonth = transactionsMonth
            .filter(t => t.sens === 'CREDIT')
            .reduce((sum, t) => sum + Number(t.montant), 0);
            
        // Calculate newly requested counters
        const savingsAccountsCount = accounts.filter(a =>
            [TypeCompte.SAVINGS, TypeCompte.BLOCKED].includes(a.typeCompte as any) && a.statut === StatutCompte.ACTIVE
        ).length;

        const activeTontinesCount = membresTontineData.filter(m => m.statut === StatutCompte.ACTIVE ).length;

        // 4. Construct Response
        const response = {
            summary: {
                total_savings: totalSavings,
                total_credit_due: totalCreditDue,
                active_loans_count: activeCredits.length,
                savings_accounts_count: savingsAccountsCount,
                active_tontines_count: activeTontinesCount,
                fidelity_points: client.pointsFidelite || 0,
                repayment_rate: Number(client.tauxRemboursement) || 0
            },
            distribution: [
                { label: "Compte Courant", value: compteCourantTotal, color: "#10B981" }, // Emerald 500
                { label: "Épargne", value: compteEpargneTotal, color: "#3B82F6" },      // Blue 500
                { label: "Tontine", value: tontineContributionTotal, color: "#F59E0B" } // Amber 500
            ].filter(d => d.value > 0), // Only show non-zero segments
            monthly_trend: {
                savings_growth: depositsMonth > 0 ? `+${(depositsMonth / (totalSavings || 1) * 100).toFixed(1)}%` : "0%",
                credit_evolution: "0%" // Placeholder for now
            }
        };

        res.json(response);
      } catch (error) {
          logger.error({ err: error }, 'Analytics error');
          res.status(500).json({ message: "Failed to generate analytics" });
      }
  });


  // Client Analytics - Period Comparison
  app.get("/api/clients/:id/analytics/compare", requireAuth, async (req, res) => {
    try {
      const clientId = req.params.id;
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const preset = req.query.preset as string | undefined;
      let pAStart: Date, pAEnd: Date, pBStart: Date, pBEnd: Date;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      if (preset === 'quarter') {
        const currentQStart = new Date(year, Math.floor(month / 3) * 3, 1);
        const prevQStart = new Date(year, Math.floor(month / 3) * 3 - 3, 1);
        const prevQEnd = new Date(currentQStart.getTime() - 86400000);
        pAStart = prevQStart; pAEnd = prevQEnd;
        pBStart = currentQStart; pBEnd = now;
      } else if (preset === 'year') {
        pBStart = new Date(year, 0, 1); pBEnd = now;
        pAStart = new Date(year - 1, 0, 1); pAEnd = new Date(year - 1, 11, 31);
      } else {
        // Default: month (current vs previous)
        pBStart = new Date(year, month, 1); pBEnd = now;
        pAStart = new Date(year, month - 1, 1); pAEnd = new Date(year, month, 0);
      }

      // Fetch mouvements for both periods + credits
      const [mouvA, mouvB, allCredits] = await Promise.all([
        storage.getMouvementsByClientAndDateRange(clientId, pAStart, pAEnd),
        storage.getMouvementsByClientAndDateRange(clientId, pBStart, pBEnd),
        getCreditsByClient(clientId),
      ]);

      const computeMetrics = (mouvements: any[], periodStart: Date, periodEnd: Date) => {
        const deposits = mouvements
          .filter(t => t.sens === 'CREDIT')
          .reduce((sum, t) => sum + Number(t.montant), 0);
        const withdrawals = mouvements
          .filter(t => t.sens === 'DEBIT')
          .reduce((sum, t) => sum + Number(t.montant), 0);
        const creditsInPeriod = allCredits.filter(c => {
          const d = c.createdAt ? new Date(c.createdAt) : null;
          return d && d >= periodStart && d <= periodEnd;
        });
        return {
          depots: deposits,
          retraits: withdrawals,
          fluxNet: deposits - withdrawals,
          nombreTransactions: mouvements.length,
          nombreCredits: creditsInPeriod.length,
          montantCredits: creditsInPeriod.reduce((s, c) => s + Number(c.montant), 0),
        };
      };

      const metricsA = computeMetrics(mouvA, pAStart, pAEnd);
      const metricsB = computeMetrics(mouvB, pBStart, pBEnd);

      const variations: Record<string, { periodA: number; periodB: number; change: number; changePercent: number }> = {};
      for (const key of Object.keys(metricsA) as Array<keyof typeof metricsA>) {
        const a = metricsA[key];
        const b = metricsB[key];
        variations[key] = {
          periodA: a,
          periodB: b,
          change: b - a,
          changePercent: a !== 0 ? Math.round(((b - a) / a) * 10000) / 100 : (b > 0 ? 100 : 0),
        };
      }

      res.json({
        periodA: { start: pAStart.toISOString(), end: pAEnd.toISOString(), metrics: metricsA },
        periodB: { start: pBStart.toISOString(), end: pBEnd.toISOString(), metrics: metricsB },
        variations,
      });
    } catch (error) {
      logger.error({ err: error }, 'Client comparison error');
      res.status(500).json({ message: "Failed to generate comparison" });
    }
  });


  // ============================================
  // GLOBAL HISTORY ENDPOINT
  // ============================================
  app.get("/api/clients/:id/global-history", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
        const clientId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        
        // Verify access to client
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé" });
          }
        }

        // Fetch from mouvementsFinanciers (the source of truth)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        

        
        // Get all movements for this client, with account/credit/tontine info
        const movements = await db.select({
            mouvement: mouvementsFinanciers,
            numeroCompte: comptes.numeroCompte,
            typeCompte: comptes.typeCompte,
            numeroCredit: credits.numeroCredit,
            typeCredit: credits.typeCredit,
            nomTontine: tontines.nom,
        })
            .from(mouvementsFinanciers)
            .leftJoin(comptes, eq(mouvementsFinanciers.compteId, comptes.id))
            .leftJoin(credits, eq(mouvementsFinanciers.creditId, credits.id))
            .leftJoin(tontines, eq(mouvementsFinanciers.tontineId, tontines.id))
            .where(and(
                eq(mouvementsFinanciers.clientId, clientId),
                gte(mouvementsFinanciers.dateOperation, oneYearAgo)
            ))
            .orderBy(desc(mouvementsFinanciers.dateOperation))
            .limit(limit)
            .offset((page - 1) * limit);

        // Transform to unified history format with enriched descriptions
        const history = movements.map((row: any) => {
            const m = row.mouvement;
            const meta = (m.metadata as Record<string, unknown>) || {};
            // Build metadata for label generation, preferring live JOINed data
            const labelMeta = {
                numeroCredit: row.numeroCredit || (meta.numeroCredit as string) || undefined,
                tontineName: row.nomTontine || (meta.tontineName as string) || undefined,
                compteDestNumero: (meta.compteDestNumero as string) || undefined,
                compteSourceNumero: (meta.compteSourceNumero as string) || undefined,
            };
            const description = getTransactionLabel(m.typePaiement, labelMeta);

            return {
                id: m.id,
                date: m.dateOperation,
                type: m.typePaiement || m.sourceModule,
                description,
                sens: m.sens,
                montant: Number(m.montant),
                sourceModule: m.sourceModule,
                reference: m.reference,
                referenceExterne: m.referenceExterne,
                statut: m.statut,
                numeroCompte: row.numeroCompte || null,
                typeCompte: row.typeCompte || null,
                numeroCredit: row.numeroCredit || null,
                typeCredit: row.typeCredit || null,
                nomTontine: row.nomTontine || null,
                icon: getTransactionIcon(m.sourceModule, m.typePaiement),
            };
        });

        // Count total for pagination
        const [countResult] = await db.select({ count: sql`count(*)` })
            .from(mouvementsFinanciers)
            .where(and(
                eq(mouvementsFinanciers.clientId, clientId),
                gte(mouvementsFinanciers.dateOperation, oneYearAgo)
            ));
        
        const total = Number(countResult?.count) || 0;

        res.json({
            data: history,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Global history error');
        res.status(500).json({ message: "Erreur lors de la récupération de l'historique" });
    }
  });
}
