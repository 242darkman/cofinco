import type { Express } from "express";
import { createLogger } from "../../lib/logger";

// @ts-ignore
const logger = createLogger('Routes:Accounting:Fec');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { accountingRules, mouvementsFinanciers } from "@shared/schema";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { generateFEC, previewFEC } from "../../services/fec-export-service";

import { AuthenticatedRequest } from "./accounting-types";

export function registerAccountingFecRoutes(app: Express) {

  // ============================================================================
  // COVERAGE & OBSERVABILITY
  // ============================================================================

  /**
   * GET /api/comptabilite/coverage/report
   * Retourne les statistiques de couverture comptable (GL) :
   * - Nombre par statut (PENDING, POSTED, FAILED, SKIPPED)
   * - Pourcentage de couverture (POSTED / total nécessitant un GL)
   * - Liste des mouvements FAILED avec détails de l'erreur
   * - Inventaire des règles comptables
   */
  app.get("/api/comptabilite/coverage/report", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
      const userAgenceId = isGlobalAdmin ? undefined : req.user?.agenceId;

      // 1. Compter les mouvements par statut de posting GL
      const statusCountsQuery = db
        .select({
          glPostingStatus: mouvementsFinanciers.glPostingStatus,
          count: count(),
        })
        .from(mouvementsFinanciers);
      const statusCounts = userAgenceId
        ? await statusCountsQuery.where(eq(mouvementsFinanciers.agenceId, userAgenceId)).groupBy(mouvementsFinanciers.glPostingStatus)
        : await statusCountsQuery.groupBy(mouvementsFinanciers.glPostingStatus);

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts) {
        statusMap[row.glPostingStatus || "UNKNOWN"] = row.count;
      }

      const posted = statusMap["POSTED"] || 0;
      const failed = statusMap["FAILED"] || 0;
      const pending = statusMap["PENDING"] || 0;
      const skipped = statusMap["SKIPPED"] || 0;
      const unknown = statusMap["UNKNOWN"] || 0;
      const total = posted + failed + pending + skipped + unknown;
      const requiresGl = posted + failed + pending; // Ceux qui devraient avoir un GL
      const coveragePercent = requiresGl > 0 ? Math.round((posted / requiresGl) * 10000) / 100 : 100;

      // 2. Obtenir les mouvements FAILED (50 plus récents)
      const failedConditions = [eq(mouvementsFinanciers.glPostingStatus, "FAILED")];
      if (userAgenceId) failedConditions.push(eq(mouvementsFinanciers.agenceId, userAgenceId));

      const failedMouvements = await db
        .select({
          id: mouvementsFinanciers.id,
          reference: mouvementsFinanciers.reference,
          sourceModule: mouvementsFinanciers.sourceModule,
          typePaiement: mouvementsFinanciers.typePaiement,
          montant: mouvementsFinanciers.montant,
          sens: mouvementsFinanciers.sens,
          glPostingError: mouvementsFinanciers.glPostingError,
          createdAt: mouvementsFinanciers.createdAt,
        })
        .from(mouvementsFinanciers)
        .where(and(...failedConditions))
        .orderBy(desc(mouvementsFinanciers.createdAt))
        .limit(50);

      // 3. Inventaire des règles comptables
      const rules = await db
        .select({
          code: accountingRules.code,
          name: accountingRules.name,
          sourceType: accountingRules.sourceType,
          eventType: accountingRules.eventType,
          journalCode: accountingRules.journalCode,
          debitAccount: accountingRules.debitAccount,
          creditAccount: accountingRules.creditAccount,
          active: accountingRules.active,
        })
        .from(accountingRules)
        .orderBy(asc(accountingRules.code));

      // 4. Couverture par module source
      const moduleQuery = db
        .select({
          sourceModule: mouvementsFinanciers.sourceModule,
          glPostingStatus: mouvementsFinanciers.glPostingStatus,
          count: count(),
        })
        .from(mouvementsFinanciers);
      const moduleBreakdown = userAgenceId
        ? await moduleQuery.where(eq(mouvementsFinanciers.agenceId, userAgenceId)).groupBy(mouvementsFinanciers.sourceModule, mouvementsFinanciers.glPostingStatus)
        : await moduleQuery.groupBy(mouvementsFinanciers.sourceModule, mouvementsFinanciers.glPostingStatus);

      const byModule: Record<string, Record<string, number>> = {};
      for (const row of moduleBreakdown) {
        const mod = row.sourceModule || "UNKNOWN";
        if (!byModule[mod]) byModule[mod] = {};
        byModule[mod][row.glPostingStatus || "UNKNOWN"] = row.count;
      }

      res.json({
        success: true,
        data: {
          summary: {
            total,
            posted,
            failed,
            pending,
            skipped,
            unknown,
            coveragePercent,
            requiresGl,
          },
          byModule,
          failedMouvements,
          rules,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Coverage report generation failed');
      res.status(500).json({ success: false, error: "Failed to generate coverage report" });
    }
  });

  // ======================================================================
  // FEC EXPORT
  // ======================================================================

  // Télécharger le fichier FEC
  app.get("/api/comptabilite/fec/:exerciceId/download", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { exerciceId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const siren = req.query.siren as string | undefined;
      const fec = await generateFEC(agenceId, exerciceId, siren);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fec.filename}"`);
      res.send(fec.content);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Aperçu FEC
  app.get("/api/comptabilite/fec/:exerciceId/preview", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const { exerciceId } = req.params;
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const limit = parseInt(req.query.limit as string || '50');
      const result = await previewFEC(agenceId, exerciceId, limit);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
