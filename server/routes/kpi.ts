/**
 * KPI Routes — REST endpoints for KPI module
 */
import type { Express } from "express";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility, hasAbility, Actions, Subjects } from "../authorization";
import { requireAgenceIdAccess } from "../middleware";
import { createLogger } from "../lib/logger";
import { getSnapshot, upsertSnapshot, listSnapshotPeriods } from "../services/kpi/kpi-store";
import { computeKpiPayload } from "../services/kpi/kpi-engine";
import { db } from "../db";
import { agences } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { KpiPeriodType, KpiScopeType } from "@shared/schema/kpi";

const logger = createLogger('Routes:KPI');

export function registerKpiRoutes(app: Express) {

  // ============================================
  // GET /api/kpi — Retrieve KPI snapshot
  // ============================================
  app.get("/api/kpi",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.KPI),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const periodType = (req.query.periodType as string || 'MONTH') as KpiPeriodType;
        const periodKey = req.query.periodKey as string;

        if (!periodKey) {
          return res.status(400).json({ message: "Le paramètre periodKey est requis" });
        }

        // Validate period format
        if (periodType === 'MONTH' && !/^\d{4}-\d{2}$/.test(periodKey)) {
          return res.status(400).json({ message: "Format periodKey invalide. Attendu: YYYY-MM" });
        }
        if (periodType === 'YEAR' && !/^\d{4}$/.test(periodKey)) {
          return res.status(400).json({ message: "Format periodKey invalide. Attendu: YYYY" });
        }

        const isAdmin = req.agenceFilter === null;
        const requestedScope = req.query.scope as string;
        const agencyId = req.selectedAgenceId;

        // Determine scope
        let scopeType: KpiScopeType;
        let scopeAgencyId: string | null;

        if (requestedScope === 'CONSOLIDATED') {
          if (!isAdmin) {
            return res.status(403).json({ error: 'Accès refusé', message: 'La vue consolidée est réservée aux administrateurs' });
          }
          scopeType = 'CONSOLIDATED';
          scopeAgencyId = null;
        } else {
          scopeType = 'AGENCY';
          if (isAdmin && agencyId) {
            scopeAgencyId = agencyId;
          } else if (!isAdmin && req.agenceFilter?.agenceId) {
            scopeAgencyId = req.agenceFilter.agenceId;
          } else if (isAdmin) {
            // Admin without specific agency = consolidated
            scopeType = 'CONSOLIDATED';
            scopeAgencyId = null;
          } else {
            return res.status(400).json({ message: "Impossible de déterminer l'agence" });
          }
        }

        const snapshot = await getSnapshot(periodType, periodKey, scopeType, scopeAgencyId);

        if (!snapshot) {
          return res.json({
            data: null,
            message: 'Aucun snapshot disponible pour cette période. Cliquez sur "Recalculer" pour générer les KPI.',
          });
        }

        res.json({ data: snapshot });
      } catch (error) {
        logger.error({ err: error }, 'Error fetching KPI snapshot');
        res.status(500).json({ message: "Erreur lors de la récupération des KPI" });
      }
    }
  );

  // ============================================
  // GET /api/kpi/periods — List available periods
  // ============================================
  app.get("/api/kpi/periods",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.KPI),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const isAdmin = req.agenceFilter === null;
        const agencyId = req.selectedAgenceId || req.agenceFilter?.agenceId;

        let scopeType: KpiScopeType = 'AGENCY';
        if (isAdmin && !agencyId) scopeType = 'CONSOLIDATED';

        const periods = await listSnapshotPeriods(scopeType, agencyId || null);
        res.json({ data: periods });
      } catch (error) {
        logger.error({ err: error }, 'Error listing KPI periods');
        res.status(500).json({ message: "Erreur lors de la récupération des périodes" });
      }
    }
  );

  // ============================================
  // POST /api/kpi/recalculate — Admin-only recalculation
  // ============================================
  app.post("/api/kpi/recalculate",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.KPI),
    async (req, res) => {
      try {
        const { periodType, periodKey, agencyId } = req.body;
        const userId = req.session?.user?.id;

        if (!periodType || !periodKey) {
          return res.status(400).json({ message: "periodType et periodKey sont requis" });
        }

        logger.info({ periodType, periodKey, agencyId, userId }, 'KPI recalculation triggered');

        if (agencyId) {
          // Single agency calculation
          const { payload, metadata } = await computeKpiPayload({
            periodType, periodKey, agencyId, generatedBy: userId,
          });

          const snapshot = await upsertSnapshot({
            periodType, periodKey,
            scopeType: 'AGENCY',
            agencyId,
            payload,
            generatedBy: userId,
            metadata,
          });

          return res.json({ data: snapshot, message: 'KPI recalculé avec succès pour cette agence' });
        }

        // All agencies + consolidated
        const allAgencies = await db
          .select({ id: agences.id, nom: agences.nom })
          .from(agences)
          .where(eq(agences.statut, 'ACTIVE'));

        const results = [];

        // Compute per agency in sequence to avoid overwhelming DB
        for (const agency of allAgencies) {
          const { payload, metadata } = await computeKpiPayload({
            periodType, periodKey, agencyId: agency.id, generatedBy: userId,
          });
          const snapshot = await upsertSnapshot({
            periodType, periodKey,
            scopeType: 'AGENCY',
            agencyId: agency.id,
            payload,
            generatedBy: userId,
            metadata,
          });
          results.push({ agencyId: agency.id, agencyName: agency.nom, version: (snapshot as any).version });
        }

        // Compute consolidated (no agency filter)
        const { payload: consolidatedPayload, metadata: consolidatedMeta } = await computeKpiPayload({
          periodType, periodKey, agencyId: null, generatedBy: userId,
        });
        await upsertSnapshot({
          periodType, periodKey,
          scopeType: 'CONSOLIDATED',
          agencyId: null,
          payload: consolidatedPayload,
          generatedBy: userId,
          metadata: consolidatedMeta,
        });

        res.json({
          data: { agencies: results, consolidated: true },
          message: `KPI recalculé pour ${allAgencies.length} agence(s) + vue consolidée`,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error recalculating KPI');
        res.status(500).json({ message: "Erreur lors du recalcul des KPI" });
      }
    }
  );
}
