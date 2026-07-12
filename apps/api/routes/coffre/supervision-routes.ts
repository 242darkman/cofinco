import { Router } from "express";
import { createLogger } from "../../lib/logger";
import { TransfertCoffreService } from "../../services/coffre/transfert-service";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { z } from "zod";
import { db } from "../../db";
import { configCoffreFort, transfertsInterCoffres, coffresForts, agences } from "@shared/schema";
import { eq, and, sql, desc, inArray, gte, lte } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage } from "../../storage";

import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { handleInsufficientFundsError } from "../../middleware/financial-validation";
import { getSnapshotHistory, getSnapshotDateRange } from "../../services/coffre/snapshot-service";

import { sessionOpeningService } from "../../services/caisse/session-opening-service";
export const supervisionCoffreRouter = Router();
const logger = createLogger('Routes:Coffre:supervision-routes');
const service = new TransfertCoffreService();

// Apply authentication middleware to all routes in this router
supervisionCoffreRouter.use(requireAuth);

supervisionCoffreRouter.get("/supervision", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
  try {
    // 1. Get all safes with Agency Info
    const allCoffres = await db.select({
        id: schema.coffresForts.id,
        nom: schema.coffresForts.nom,
        solde: schema.coffresForts.solde,
        agenceId: schema.coffresForts.ownerId,
        agenceNom: schema.agences.nom,
        ville: schema.villes.nom,
    })
    .from(schema.coffresForts)
    .leftJoin(schema.agences, eq(schema.coffresForts.ownerId, schema.agences.id))
    .leftJoin(schema.villes, eq(schema.agences.villeId, schema.villes.id));

    // 2. Calculate Global Stats
    const totalSolde = allCoffres.reduce((acc, c) => acc + Number(c.solde), 0);

    // 3. Breakdown by Agency
    const breakdown = allCoffres.map(c => ({
        agenceId: c.agenceId,
        agenceNom: c.agenceNom,
        ville: c.ville,
        solde: Number(c.solde)
    })).sort((a, b) => b.solde - a.solde);

    // 4. History - Supports period: "today" | "7d" | "30d" | "1y" (default: "30d")
    // Supports "historyFor" query param to fetch history for specific agencies (comma separated IDs)
    const historyFor = (req.query.historyFor as string)?.split(',').filter(Boolean);
    const period = (req.query.period as string) || '30d';
    const includeRanking = req.query.includeRanking === 'true';
    const includePreviousPeriod = req.query.includePreviousPeriod === 'true';

    // Calculate date range based on period
    const sinceDate = new Date();
    let bucketCount: number;
    let bucketType: 'hour' | 'day' | 'month';

    switch (period) {
      case 'today':
        sinceDate.setHours(0, 0, 0, 0);
        bucketCount = 24;
        bucketType = 'hour';
        break;
      case '7d':
        sinceDate.setDate(sinceDate.getDate() - 7);
        bucketCount = 7;
        bucketType = 'day';
        break;
      case '1y':
        sinceDate.setFullYear(sinceDate.getFullYear() - 1);
        bucketCount = 12;
        bucketType = 'month';
        break;
      default: // '30d'
        sinceDate.setDate(sinceDate.getDate() - 30);
        bucketCount = 30;
        bucketType = 'day';
        break;
    }

    // If specific agencies requested, filter coffreIds. Otherwise use all.
    let targetCoffreIds = allCoffres.map(c => c.id);
    if (historyFor && historyFor.length > 0) {
       targetCoffreIds = allCoffres.filter(c => historyFor.includes(c.agenceId!)).map(c => c.id);
    }

    // Safety check: if no coffres, return empty history
    let history: any[] = [];
    let historySource: 'snapshots' | 'movements' = 'movements';

    if (targetCoffreIds.length > 0) {
        // ── Strategy: prefer snapshots for day/month buckets ──────────────
        // For 'today' (hourly), always use movement reconstruction.
        // For 7d/30d/1y, try snapshots first, fall back to movements.

        const targetAgencyIds = historyFor && historyFor.length > 0
          ? historyFor
          : [...new Set(allCoffres.map(c => c.agenceId!).filter(Boolean))];

        let snapshotHistory: any[] | null = null;

        if (bucketType !== 'hour') {
          try {
            const fromDate = sinceDate.toISOString().split('T')[0];
            const toDate = new Date().toISOString().split('T')[0];
            const snapshots = await getSnapshotHistory(fromDate, toDate, targetAgencyIds);

            // Use snapshots only if we have enough coverage (at least 50% of expected buckets)
            const minRequired = Math.floor(bucketCount * 0.5);
            if (snapshots.length >= minRequired) {
              // For monthly buckets, group snapshots by month (take last day of each month)
              if (bucketType === 'month') {
                const byMonth: Record<string, any> = {};
                for (const sp of snapshots) {
                  const monthKey = sp.date.slice(0, 7); // "2026-02"
                  byMonth[monthKey] = sp; // last snapshot of the month wins
                }
                snapshotHistory = Object.entries(byMonth)
                  .map(([monthKey, data]) => ({ ...data, date: monthKey }))
                  .sort((a, b) => a.date.localeCompare(b.date));
              } else {
                snapshotHistory = snapshots;
              }
              historySource = 'snapshots';
            }
          } catch (snapErr) {
            logger.warn({ err: snapErr }, 'Snapshot query failed, falling back to movements');
          }
        }

        if (snapshotHistory) {
          history = snapshotHistory;
        } else {
          // ── Fallback: reconstruct from movements (original algorithm) ───
          const movements = await db.select({
              date: schema.mouvementsFinanciers.dateOperation,
              montant: schema.mouvementsFinanciers.montant,
              sens: schema.mouvementsFinanciers.sens,
              sourceId: schema.mouvementsFinanciers.sourceId,
              metadata: schema.mouvementsFinanciers.metadata
          })
          .from(schema.mouvementsFinanciers)
          .where(
              and(
                  sql`${schema.mouvementsFinanciers.dateOperation} >= ${sinceDate}`,
                  sql`(${schema.mouvementsFinanciers.sourceId} IN ${targetCoffreIds} OR ${schema.mouvementsFinanciers.metadata}->>'destinationId' IN ${targetCoffreIds})`
              )
          )
          .orderBy(desc(schema.mouvementsFinanciers.dateOperation));

          const coffreToAgence = allCoffres.reduce((acc, c) => {
              acc[c.id] = c.agenceId!;
              return acc;
          }, {} as Record<string, string>);

          const getBucketKey = (d: Date): string => {
              if (bucketType === 'hour') return d.toISOString().slice(0, 13);
              if (bucketType === 'month') return d.toISOString().slice(0, 7);
              return d.toISOString().split('T')[0];
          };

          const bucketAgencyChange: Record<string, Record<string, number>> = {};

          movements.forEach(m => {
              const bucketKey = getBucketKey(new Date(m.date!));
              const amount = Number(m.montant);
              if (!bucketAgencyChange[bucketKey]) bucketAgencyChange[bucketKey] = {};
              const destId = (m.metadata as any)?.destinationId;
              const srcId = m.sourceId;
              if (targetCoffreIds.includes(destId)) {
                  const agId = coffreToAgence[destId];
                  bucketAgencyChange[bucketKey][agId] = (bucketAgencyChange[bucketKey][agId] || 0) + amount;
              }
              if (targetCoffreIds.includes(srcId as string)) {
                  const agId = coffreToAgence[srcId as string];
                  bucketAgencyChange[bucketKey][agId] = (bucketAgencyChange[bucketKey][agId] || 0) - amount;
              }
          });

          const currentBalances = allCoffres
              .filter(c => targetCoffreIds.includes(c.id))
              .reduce((acc, c) => {
                  acc[c.agenceId!] = (acc[c.agenceId!] || 0) + Number(c.solde);
                  return acc;
              }, {} as Record<string, number>);

          const now = new Date();
          const runningBalances = { ...currentBalances };
          const relevantAgIds = Object.keys(currentBalances);

          for (let i = 0; i < bucketCount; i++) {
              const bucketDate = new Date(now);
              if (bucketType === 'hour') {
                  bucketDate.setHours(now.getHours() - i, 0, 0, 0);
              } else if (bucketType === 'month') {
                  bucketDate.setMonth(now.getMonth() - i);
                  bucketDate.setDate(1);
              } else {
                  bucketDate.setDate(now.getDate() - i);
              }
              const bucketKey = getBucketKey(bucketDate);
              const totalBalance = Object.values(runningBalances).reduce((a, b) => a + b, 0);

              history.push({
                  date: bucketType === 'hour' ? bucketDate.toISOString() : bucketKey,
                  balance: totalBalance,
                  ...runningBalances
              });

              const changes = bucketAgencyChange[bucketKey] || {};
              relevantAgIds.forEach(id => {
                  runningBalances[id] -= (changes[id] || 0);
              });
          }

          history.reverse();
        }
    }

    // Build response (backward-compatible: new fields only added when requested)
    const response: Record<string, any> = {
        globalBalance: totalSolde,
        breakdown,
        history,
        historySource,
    };

    // Ranking: enriched breakdown with rank, share, delta, deltaPercent
    if (includeRanking && history.length > 0) {
      const startPoint = history[0]; // earliest bucket = start of period
      const sorted = [...breakdown].sort((a, b) => b.solde - a.solde);
      response.ranking = sorted.map((agency, idx) => {
        const prevSolde = Number(startPoint[agency.agenceId!] ?? agency.solde);
        const delta = agency.solde - prevSolde;
        const deltaPercent = prevSolde !== 0 ? (delta / Math.abs(prevSolde)) * 100 : 0;
        return {
          agenceId: agency.agenceId,
          agenceNom: agency.agenceNom,
          ville: agency.ville,
          solde: agency.solde,
          rank: idx + 1,
          share: totalSolde > 0 ? Math.round((agency.solde / totalSolde) * 10000) / 100 : 0,
          delta: Math.round(delta),
          deltaPercent: Math.round(deltaPercent * 100) / 100,
        };
      });
    }

    // Previous period: balances at start of current period
    if (includePreviousPeriod && history.length > 0) {
      const startPoint = history[0];
      response.previousPeriod = {
        globalBalance: Number(startPoint.balance) || 0,
        breakdown: breakdown.map(a => ({
          agenceId: a.agenceId,
          solde: Number(startPoint[a.agenceId!] ?? 0),
        })),
      };
    }

    res.json(response);

  } catch (e: any) {
    logger.error({ err: e }, 'Supervision Error');
    res.status(500).json({ error: e.message });
  }
});

// 5. Lister les transferts (Filtres)

supervisionCoffreRouter.get("/stats", attachAbility, requireAbility(Actions.VIEW, Subjects.COFFRE), async (req, res) => {
  try {
    const agenceId = req.query.agenceId as string;
    if (!agenceId) return res.status(400).json({ error: "Missing agenceId" });

    // Récupérer le coffre-fort de l'agence depuis la nouvelle table unifiée
    const [coffre] = await db.select()
      .from(schema.coffresForts)
      .where(eq(schema.coffresForts.ownerId, agenceId));

    if (!coffre) {
      // Essayer de trouver le coffre du siège si c'est le siège
      const [coffreSiege] = await db.select()
        .from(schema.coffresForts)
        .where(eq(schema.coffresForts.ownerType, "SIEGE"));

      if (coffreSiege) {
        return res.json({ solde: Number(coffreSiege.solde), coffreId: coffreSiege.id, code: coffreSiege.code });
      }
      return res.json({ solde: 0 });
    }

    res.json({ solde: Number(coffre.solde), coffreId: coffre.id, code: coffre.code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Récupérer la configuration

supervisionCoffreRouter.get(
  "/pending-opening-requests",
  attachAbility,
  requireAbility(Actions.CREATE, Subjects.COFFRE_TRANSFERT),
  async (req, res) => {
    try {
      const user = req.user;
      const agenceId = (req.query.agenceId as string) || user?.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "agenceId requis" });
      }

      const requests = await sessionOpeningService.getPendingOpeningRequests(agenceId);
      res.json(requests);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

/**
 * POST /coffre/transferts/:id/validate-opening
 * Phase B: Le responsable coffre valide ou rejette une demande d'ouverture
 */

