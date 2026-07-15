/**
 * @module routes/payments/reconciliation
 * Routes API pour la réconciliation Mobile Money.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { db } from "../../db";
import { mmReconciliationReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  getReconciliationReports,
  markReportReviewed,
  markReportResolved,
  generateReconciliationReport,
} from "../../cron/mm-reconciliation-report";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";

const logger = createLogger('Routes:Payments:Reconciliation');

const reconciliationReportsFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  provider: z.enum(["MTN", "AIRTEL"]).optional(),
  statut: z.enum(["GENERATED", "REVIEWED", "RESOLVED"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const reviewReportSchema = z.object({
  notes: z.string().optional(),
});

export function registerPaymentsReconciliationRoutes(app: Express): void {
  app.get("/api/payments/reconciliation/reports", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
    try {
      const parsed = reconciliationReportsFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "Paramètres invalides", details: parsed.error.errors });
      }

      const reports = await getReconciliationReports({
        from: parsed.data.from ? new Date(parsed.data.from) : undefined,
        to: parsed.data.to ? new Date(parsed.data.to) : undefined,
        provider: parsed.data.provider,
        statut: parsed.data.statut,
        limit: parsed.data.limit,
      });

      res.json({ reports });
    } catch (error) {
      logger.error({ err: error }, 'Reconciliation reports list error');
      res.status(500).json({ error: "Erreur lors de la récupération des rapports" });
    }
  });

  app.get("/api/payments/reconciliation/reports/:id", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
    try {
      const [report] = await db.select().from(mmReconciliationReports).where(eq(mmReconciliationReports.id, req.params.id));

      if (!report) {
        return res.status(404).json({ error: "Rapport non trouvé" });
      }

      res.json(report);
    } catch (error) {
      logger.error({ err: error }, 'Reconciliation report detail error');
      res.status(500).json({ error: "Erreur lors de la récupération du rapport" });
    }
  });

  app.post("/api/payments/reconciliation/reports/:id/review", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
    try {
      const parsed = reviewReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Données invalides", details: parsed.error.errors });
      }

      await markReportReviewed(req.params.id, req.session!.user!.id, parsed.data.notes);
      res.json({ success: true, message: "Rapport marqué comme reviewé" });
    } catch (error) {
      logger.error({ err: error }, 'Review report error');
      res.status(500).json({ error: "Erreur lors du marquage du rapport" });
    }
  });

  app.post("/api/payments/reconciliation/reports/:id/resolve", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
    try {
      await markReportResolved(req.params.id, req.session!.user!.id);
      res.json({ success: true, message: "Rapport marqué comme résolu" });
    } catch (error) {
      logger.error({ err: error }, 'Resolve report error');
      res.status(500).json({ error: "Erreur lors de la résolution du rapport" });
    }
  });

  app.post("/api/payments/reconciliation/generate", requireAuth, attachAbility, requireAbility(Actions.RECONCILE, Subjects.CAISSE), async (req, res) => {
    try {
      const { date, provider } = req.body;

      if (!provider || !["MTN", "AIRTEL"].includes(provider)) {
        return res.status(400).json({ error: "Provider invalide (MTN ou AIRTEL)" });
      }

      const reportDate = date ? new Date(date) : new Date();
      reportDate.setDate(reportDate.getDate() - 1);

      const result = await generateReconciliationReport(reportDate, provider);

      res.json({
        success: true,
        report: {
          id: result.reportId,
          stats: result.stats,
          anomalyCount: result.anomalies.length,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Generate report error');
      res.status(500).json({ error: "Erreur lors de la génération du rapport" });
    }
  });
}
