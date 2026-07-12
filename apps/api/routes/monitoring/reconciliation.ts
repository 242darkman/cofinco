/**
 * @module routes/monitoring/reconciliation
 * Routes API pour les processus de réconciliation comptable.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import { z } from "zod";
import {
  runReconciliation,
  type ReconciliationOptions,
} from "../../services/transaction-integrity-service";

const logger = createLogger("Routes:Monitoring:Reconciliation");

const reconciliationSchema = z.object({
  checks: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  compteId: z.string().uuid().optional(),
  limit: z.number().min(1).max(10000).optional(),
  fix: z.boolean().optional(),
});

/**
 * Enregistre les routes relatives à la réconciliation des comptes et mouvements.
 *
 * @param app - L'instance de l'application Express
 */
export function registerMonitoringReconciliationRoutes(app: Express): void {
  /**
   * GET /api/monitoring/reconciliation
   * Lance une réconciliation et retourne les résultats.
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
   * Corrige les anomalies auto-fixables.
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
}
