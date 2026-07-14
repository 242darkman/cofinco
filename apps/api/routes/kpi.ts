/**
 * KPI Routes — REST endpoints for KPI module
 */
import type { Express } from "express";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility, hasAbility, Actions, Subjects } from "../authorization";
import { requireAgenceIdAccess } from "../middleware";
import { createLogger } from "../lib/logger";
import { getSnapshot, listSnapshotPeriods, listSnapshotSeries } from "../services/kpi/kpi-store";
import { buildSeriesPoints } from "../services/kpi/kpi-series";
import { refreshAgencyScope, refreshAllScopes } from "../services/kpi/kpi-refresh-service";
import type { KpiPayload, KpiPeriodType, KpiScopeType } from "@shared/schema/kpi";

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
  // GET /api/kpi/series — Séries temporelles compactes (sparklines)
  // ============================================
  app.get("/api/kpi/series",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.KPI),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const periodType = (req.query.periodType as string || 'MONTH') as KpiPeriodType;
        if (periodType !== 'MONTH' && periodType !== 'YEAR') {
          return res.status(400).json({ message: "periodType invalide. Attendu: MONTH ou YEAR" });
        }

        // Nombre de périodes borné : 12 par défaut, 24 maximum
        const requestedLimit = Number.parseInt(req.query.limit as string, 10);
        const limit = Number.isFinite(requestedLimit)
          ? Math.min(24, Math.max(2, requestedLimit))
          : 12;

        // Résolution de scope identique à GET /api/kpi
        const isAdmin = req.agenceFilter === null;
        const agencyId = req.selectedAgenceId;

        let scopeType: KpiScopeType;
        let scopeAgencyId: string | null;
        if (isAdmin && agencyId) {
          scopeType = 'AGENCY';
          scopeAgencyId = agencyId;
        } else if (!isAdmin && req.agenceFilter?.agenceId) {
          scopeType = 'AGENCY';
          scopeAgencyId = req.agenceFilter.agenceId;
        } else if (isAdmin) {
          scopeType = 'CONSOLIDATED';
          scopeAgencyId = null;
        } else {
          return res.status(400).json({ message: "Impossible de déterminer l'agence" });
        }

        const rows = await listSnapshotSeries(periodType, scopeType, scopeAgencyId, limit);
        const points = buildSeriesPoints(
          rows.map((r) => ({ periodKey: r.periodKey, generatedAt: r.generatedAt, payload: r.payload as KpiPayload })),
        );

        res.json({ data: points });
      } catch (error) {
        logger.error({ err: error }, 'Error fetching KPI series');
        res.status(500).json({ message: "Erreur lors de la récupération des séries KPI" });
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
          const snapshot = await refreshAgencyScope({
            periodType, periodKey, agencyId, generatedBy: userId, source: 'manual',
          });
          return res.json({ data: snapshot, message: 'KPI recalculé avec succès pour cette agence' });
        }

        // All agencies + consolidated, avec contrôle consolidé = somme des agences
        const result = await refreshAllScopes({
          periodType, periodKey, generatedBy: userId, source: 'manual',
        });

        res.json({
          data: { agencies: result.agencies, consolidated: true, warnings: result.consolidated.warnings },
          message: `KPI recalculé pour ${result.agencies.length} agence(s) + vue consolidée`,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error recalculating KPI');
        res.status(500).json({ message: "Erreur lors du recalcul des KPI" });
      }
    }
  );
}
