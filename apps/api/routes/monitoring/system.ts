/**
 * @module routes/monitoring/system
 * Routes API pour les contrôles systèmes et la vérification de l'état (Health Checks).
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import {
  runMonitoringChecks,
  startMonitoring,
  stopMonitoring,
  DEFAULT_CONFIG,
  getDashboard,
} from "../../services/financial-monitoring-service";

const logger = createLogger("Routes:Monitoring:System");

/**
 * Enregistre les routes de contrôle système (démarrage, arrêt, intégrité et pawapay).
 *
 * @param app - L'instance de l'application Express
 */
export function registerMonitoringSystemRoutes(app: Express): void {
  /**
   * POST /api/monitoring/start
   * Démarre le monitoring automatique.
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
   * Arrête le monitoring automatique.
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
   * Exécute une vérification manuelle immédiate.
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

  /**
   * GET /api/monitoring/pawapay-status
   * Retourne le statut du provider pawaPay (disponibilité, coupe-circuit).
   */
  app.get(
    "/api/monitoring/pawapay-status",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ALL), // Admin only
    async (req, res) => {
      try {
        const { providerRegistry } = await import("../../services/mobile-money/provider-registry");

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

  /**
   * GET /api/monitoring/health
   * Health check simple (pas d'authentification requise).
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
        error: error instanceof Error ? error.message : "Erreur inconnue",
      });
    }
  });
}
