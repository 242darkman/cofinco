/**
 * @module routes/monitoring/alerts
 * Routes API pour la gestion des alertes du monitoring financier.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import {
  getActiveAlerts,
  acknowledgeAlert,
  dismissAlert,
} from "../../services/financial-monitoring-service";

const logger = createLogger("Routes:Monitoring:Alerts");

/**
 * Enregistre les routes relatives à la gestion des alertes de monitoring.
 *
 * @param app - L'instance de l'application Express
 */
export function registerMonitoringAlertsRoutes(app: Express): void {
  /**
   * GET /api/monitoring/alerts
   * Liste les alertes actives avec filtres.
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
   * Acquitte une alerte.
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
   * Rejette ou ferme une alerte.
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
}
