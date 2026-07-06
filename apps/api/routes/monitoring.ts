/**
 * Routes API pour le Monitoring Financier
 *
 * Endpoints:
 * - GET  /api/monitoring/dashboard     - Dashboard temps réel
 * - GET  /api/monitoring/alerts        - Liste des alertes actives
 * - POST /api/monitoring/alerts/:id/acknowledge - Acquitter une alerte
 * - POST /api/monitoring/alerts/:id/dismiss     - Rejeter une alerte
 * - GET  /api/monitoring/reconciliation         - Lancer une réconciliation
 * - POST /api/monitoring/reconciliation/fix     - Corriger les anomalies
 * - GET  /api/monitoring/health                 - Health check simple
 * - GET  /api/monitoring/pawapay-status         - Statut pawaPay
 */

import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../audit";
import { z } from "zod";

import {
  getDashboard,
  getActiveAlerts,
  acknowledgeAlert,
  dismissAlert,
  runMonitoringChecks,
  startMonitoring,
  stopMonitoring,
  DEFAULT_CONFIG,
} from "../services/financial-monitoring-service";

import {
  runReconciliation,
  type ReconciliationOptions,
} from "../services/transaction-integrity-service";

const logger = createLogger("Routes:Monitoring");

export function registerMonitoringRoutes(app: Express): void {
  // ============================================================================
  // DASHBOARD
  // ============================================================================

  /**
   * GET /api/monitoring/dashboard
   * Retourne le dashboard de monitoring avec métriques et alertes
   */
  app.get(
    "/api/monitoring/dashboard",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CAISSE), // Caissiers et admins peuvent voir
    async (req, res) => {
      try {
        const dashboard = await getDashboard();

        res.json({
          success: true,
          data: dashboard,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error fetching dashboard");
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ============================================================================
  // ALERTS
  // ============================================================================

  /**
   * GET /api/monitoring/alerts
   * Liste les alertes actives avec filtres
   */
  app.get(
    "/api/monitoring/alerts",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { severity, type, acknowledged } = req.query;

        let alerts = getActiveAlerts();

        // Apply filters
        if (severity) {
          alerts = alerts.filter(a => a.severity === severity);
        }
        if (type) {
          alerts = alerts.filter(a => a.type === type);
        }
        if (acknowledged !== undefined) {
          const ackFilter = acknowledged === "true";
          alerts = alerts.filter(a => a.acknowledged === ackFilter);
        }

        res.json({
          success: true,
          data: alerts,
          total: alerts.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error fetching alerts");
        res.status(500).json({ success: false, message });
      }
    }
  );

  /**
   * POST /api/monitoring/alerts/:id/acknowledge
   * Acquitte une alerte
   */
  app.post(
    "/api/monitoring/alerts/:id/acknowledge",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.user!;

        const success = acknowledgeAlert(id, user.id);

        if (!success) {
          return res.status(404).json({
            success: false,
            message: "Alerte non trouvée",
          });
        }

        await logAudit(
          req,
          "ACKNOWLEDGE_ALERT",
          "monitoring_alert",
          id,
          { alertId: id },
          "success",
          "low"
        );

        res.json({ success: true, message: "Alerte acquittée" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error acknowledging alert");
        res.status(500).json({ success: false, message });
      }
    }
  );

  /**
   * POST /api/monitoring/alerts/:id/dismiss
   * Rejette/ferme une alerte
   */
  app.post(
    "/api/monitoring/alerts/:id/dismiss",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;

        const success = dismissAlert(id);

        if (!success) {
          return res.status(404).json({
            success: false,
            message: "Alerte non trouvée",
          });
        }

        await logAudit(
          req,
          "DISMISS_ALERT",
          "monitoring_alert",
          id,
          { alertId: id },
          "success",
          "low"
        );

        res.json({ success: true, message: "Alerte fermée" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error dismissing alert");
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ============================================================================
  // RECONCILIATION
  // ============================================================================

  const reconciliationSchema = z.object({
    checks: z.array(z.string()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    compteId: z.string().uuid().optional(),
    limit: z.number().min(1).max(10000).optional(),
    fix: z.boolean().optional(),
  });

  /**
   * GET /api/monitoring/reconciliation
   * Lance une réconciliation et retourne les résultats
   */
  app.get(
    "/api/monitoring/reconciliation",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL), // Admin only
    async (req, res) => {
      try {
        const options: ReconciliationOptions = {
          checks: req.query.checks ? String(req.query.checks).split(",") : undefined,
          dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined,
          dateTo: req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined,
          compteId: req.query.compteId ? String(req.query.compteId) : undefined,
          limit: req.query.limit ? parseInt(String(req.query.limit)) : undefined,
          fix: req.query.fix === "true",
        };

        const result = await runReconciliation(options);

        await logAudit(
          req,
          "RUN_RECONCILIATION",
          "system",
          "reconciliation",
          {
            options,
            totalAnomalies: result.totalAnomalies,
            criticalCount: result.criticalCount,
            fixedCount: result.fixedCount,
          },
          "success",
          "medium"
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error running reconciliation");
        res.status(500).json({ success: false, message });
      }
    }
  );

  /**
   * POST /api/monitoring/reconciliation/fix
   * Corrige les anomalies auto-fixables
   */
  app.post(
    "/api/monitoring/reconciliation/fix",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL),
    async (req, res) => {
      try {
        const parsed = reconciliationSchema.parse(req.body);

        const options: ReconciliationOptions = {
          ...parsed,
          dateFrom: parsed.dateFrom ? new Date(parsed.dateFrom) : undefined,
          dateTo: parsed.dateTo ? new Date(parsed.dateTo) : undefined,
          fix: true,
        };

        const result = await runReconciliation(options);

        await logAudit(
          req,
          "FIX_RECONCILIATION",
          "system",
          "reconciliation",
          {
            options,
            totalAnomalies: result.totalAnomalies,
            fixedCount: result.fixedCount,
          },
          "success",
          "high"
        );

        res.json({
          success: true,
          data: result,
          message: `${result.fixedCount} anomalies corrigées`,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            message: error.errors.map(e => e.message).join(", "),
          });
        }
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error fixing reconciliation");
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ============================================================================
  // MONITORING CONTROL
  // ============================================================================

  /**
   * POST /api/monitoring/start
   * Démarre le monitoring automatique
   */
  app.post(
    "/api/monitoring/start",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL),
    async (req, res) => {
      try {
        const { intervalMinutes } = req.body;

        const config = {
          ...DEFAULT_CONFIG,
          checkIntervalMinutes: intervalMinutes || DEFAULT_CONFIG.checkIntervalMinutes,
        };

        startMonitoring(config);

        await logAudit(
          req,
          "START_MONITORING",
          "system",
          "monitoring",
          { config },
          "success",
          "medium"
        );

        res.json({
          success: true,
          message: `Monitoring démarré (intervalle: ${config.checkIntervalMinutes} minutes)`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error starting monitoring");
        res.status(500).json({ success: false, message });
      }
    }
  );

  /**
   * POST /api/monitoring/stop
   * Arrête le monitoring automatique
   */
  app.post(
    "/api/monitoring/stop",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL),
    async (req, res) => {
      try {
        stopMonitoring();

        await logAudit(
          req,
          "STOP_MONITORING",
          "system",
          "monitoring",
          {},
          "success",
          "medium"
        );

        res.json({ success: true, message: "Monitoring arrêté" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error stopping monitoring");
        res.status(500).json({ success: false, message });
      }
    }
  );

  /**
   * POST /api/monitoring/check
   * Exécute une vérification manuelle immédiate
   */
  app.post(
    "/api/monitoring/check",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        await runMonitoringChecks();
        const dashboard = await getDashboard();

        res.json({
          success: true,
          data: dashboard,
          message: "Vérification effectuée",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error running manual check");
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ============================================================================
  // PAWAPAY STATUS
  // ============================================================================

  /**
   * GET /api/monitoring/pawapay-status
   * Retourne le statut du provider pawaPay (disponibilité, circuit breaker)
   */
  app.get(
    "/api/monitoring/pawapay-status",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL), // Admin only
    async (req, res) => {
      try {
        const { providerRegistry } = await import("../services/mobile-money/provider-registry");

        const providers = providerRegistry.getCodes();
        const pawaPayProvider = providerRegistry.has("PAWAPAY")
          ? providerRegistry.getPawaPay()
          : null;

        let balances = null;
        if (pawaPayProvider && typeof (pawaPayProvider as any).getBalancePerCorrespondent === "function") {
          try {
            balances = await (pawaPayProvider as any).getBalancePerCorrespondent();
          } catch (error) {
            logger.warn({ err: error }, "Could not fetch pawaPay balances");
          }
        }

        res.json({
          success: true,
          data: {
            gateway: "PAWAPAY",
            registered: providers.length > 0,
            providers,
            balances,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        logger.error({ err: error }, "Error fetching pawaPay status");
        res.status(500).json({ success: false, message });
      }
    }
  );

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * GET /api/monitoring/health
   * Health check simple (pas d'auth requise)
   */
  app.get("/api/monitoring/health", async (req, res) => {
    try {
      const dashboard = await getDashboard();

      res.json({
        status: dashboard.status,
        timestamp: new Date().toISOString(),
        metrics: dashboard.metrics,
        alerts: dashboard.alerts,
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  logger.info("Monitoring routes registered");
}

export default { registerMonitoringRoutes };
