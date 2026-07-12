/**
 * @module routes/monitoring/dashboard
 * Routes API pour le tableau de bord de monitoring financier.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getDashboard } from "../../services/financial-monitoring-service";

const logger = createLogger("Routes:Monitoring:Dashboard");

/**
 * Enregistre les routes relatives au tableau de bord de monitoring.
 *
 * @param app - L'instance de l'application Express
 */
export function registerMonitoringDashboardRoutes(app: Express): void {
  /**
   * GET /api/monitoring/dashboard
   * Retourne le dashboard de monitoring avec métriques et alertes.
   */
  app.get(
    "/api/monitoring/dashboard",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (_req, res) => {
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
}
