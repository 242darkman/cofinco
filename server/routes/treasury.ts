/**
 * Routes API Treasury v2 — Encaisse Canonique
 *
 * Endpoints:
 * - GET /api/treasury/v2/encaisse       - Encaisse depuis GL (source unique de vérité)
 * - GET /api/treasury/v2/encaisse/reconcile - Encaisse avec réconciliation GL vs Opérationnel
 * - GET /api/treasury/v2/encaisse/breakdown - Détail par compte GL
 *
 * Toutes les routes retournent des données basées sur le Grand Livre (GL)
 * conformément au plan comptable OHADA.
 */

import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { encaisseService } from "../services/treasury/encaisse-service";
import type { EncaisseCanonique } from "../services/treasury/encaisse-service";
import { treasuryReconciliationService } from "../services/treasury/treasury-reconciliation-service";

const logger = createLogger("Routes:Treasury");

export function registerTreasuryRoutes(app: Express) {
  // ============================================================================
  // ENCAISSE CANONIQUE (Single Source of Truth)
  // ============================================================================

  /**
   * GET /api/treasury/v2/encaisse
   *
   * Retourne l'encaisse disponible calculée depuis le Grand Livre (GL).
   * C'est la SEULE source de vérité pour l'encaisse.
   *
   * Query params:
   * - agenceId: string (optionnel) - Filtrer par agence
   * - withReconciliation: boolean (optionnel) - Inclure la réconciliation
   *
   * Headers de réponse:
   * - X-Source: "GL" - Indique que les données viennent du Grand Livre
   * - X-Computed-At: ISO timestamp - Date de calcul
   *
   * Response: EncaisseCanonique
   */
  app.get(
    "/api/treasury/v2/encaisse",
    requireAuth,
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string | undefined;
        const withReconciliation = req.query.withReconciliation === "true";

        logger.debug(
          { agenceId, withReconciliation, userId: req.session?.userId },
          "GET /api/treasury/v2/encaisse"
        );

        let result: EncaisseCanonique;

        if (withReconciliation) {
          result = await encaisseService.getEncaisseWithReconciliation(agenceId);
        } else {
          result = await encaisseService.getEncaisseFromGL(agenceId);
        }

        // Headers pour cache et traçabilité
        res.setHeader("X-Source", "GL");
        res.setHeader("X-Computed-At", result.meta.computedAt);
        res.setHeader("Cache-Control", "private, max-age=15"); // 15 secondes

        // ETag pour cache conditionnel
        const etag = `"${Buffer.from(
          `${result.totalDisponible}-${result.meta.computedAt}`
        ).toString("base64")}"`;
        res.setHeader("ETag", etag);

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, "Erreur GET /api/treasury/v2/encaisse");
        res.status(500).json({
          error: "TREASURY_ERROR",
          message: "Erreur lors du calcul de l'encaisse",
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/treasury/v2/encaisse/reconcile
   *
   * Retourne l'encaisse avec comparaison détaillée GL vs Opérationnel.
   * Utilisé pour détecter les écarts et les audits.
   *
   * Query params:
   * - agenceId: string (optionnel) - Filtrer par agence
   *
   * Response: EncaisseCanonique avec reconciliation complète
   */
  app.get(
    "/api/treasury/v2/encaisse/reconcile",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.ACCOUNTING),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string | undefined;

        logger.info(
          { agenceId, userId: req.session?.userId },
          "Demande de réconciliation encaisse"
        );

        const result = await encaisseService.getEncaisseWithReconciliation(agenceId);

        res.setHeader("X-Source", "GL");
        res.setHeader("X-Computed-At", result.meta.computedAt);

        // Log si écart détecté
        if (result.reconciliation && result.reconciliation.status !== "OK") {
          logger.warn(
            {
              agenceId,
              status: result.reconciliation.status,
              ecart: result.reconciliation.ecart,
            },
            "Écart de réconciliation détecté"
          );
        }

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, "Erreur GET /api/treasury/v2/encaisse/reconcile");
        res.status(500).json({
          error: "RECONCILIATION_ERROR",
          message: "Erreur lors de la réconciliation",
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/treasury/v2/encaisse/breakdown
   *
   * Retourne le détail des soldes par compte GL de trésorerie.
   * Utile pour audit et debugging.
   *
   * Query params:
   * - agenceId: string (optionnel) - Filtrer par agence
   *
   * Response: Array<{ numeroCompte, intitule, solde, categorie }>
   */
  app.get(
    "/api/treasury/v2/encaisse/breakdown",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.ACCOUNTING),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string | undefined;

        const breakdown = await encaisseService.getEncaisseBreakdownDetailed(agenceId);

        // Calculer les totaux par catégorie
        const totals: Record<string, number> = {};
        for (const item of breakdown) {
          if (!totals[item.categorie]) totals[item.categorie] = 0;
          totals[item.categorie] += item.solde;
        }

        const grandTotal = Object.values(totals).reduce((sum, v) => sum + v, 0);

        res.setHeader("X-Source", "GL");
        res.json({
          accounts: breakdown,
          totals,
          grandTotal,
          meta: {
            computedAt: new Date().toISOString(),
            agenceId: agenceId || null,
          },
        });
      } catch (error: any) {
        logger.error({ err: error }, "Erreur GET /api/treasury/v2/encaisse/breakdown");
        res.status(500).json({
          error: "BREAKDOWN_ERROR",
          message: "Erreur lors de la récupération du breakdown",
          details: error.message,
        });
      }
    }
  );

  // ============================================================================
  // RECONCILIATION ADMIN (GL vs Opérationnel)
  // ============================================================================

  /**
   * POST /api/treasury/v2/reconciliation/run
   *
   * Déclenche une réconciliation manuelle GL vs Opérationnel.
   * Nécessite la permission MANAGE sur TREASURY.
   *
   * Response: TreasuryReconciliationReport
   */
  app.post(
    "/api/treasury/v2/reconciliation/run",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.TREASURY),
    async (req, res) => {
      try {
        logger.info(
          { userId: req.session?.userId },
          "Réconciliation Treasury manuelle déclenchée"
        );

        if (treasuryReconciliationService.isReconciliationRunning()) {
          return res.status(409).json({
            error: "RECONCILIATION_IN_PROGRESS",
            message: "Une réconciliation est déjà en cours",
          });
        }

        const report = await treasuryReconciliationService.runFullReconciliation();

        res.json({
          success: true,
          report,
        });
      } catch (error: any) {
        logger.error({ err: error }, "Erreur POST /api/treasury/v2/reconciliation/run");
        res.status(500).json({
          error: "RECONCILIATION_ERROR",
          message: "Erreur lors de la réconciliation",
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/treasury/v2/reconciliation/status
   *
   * Vérifie si une réconciliation est en cours.
   *
   * Response: { isRunning: boolean, lastReport?: TreasuryReconciliationReport }
   */
  app.get(
    "/api/treasury/v2/reconciliation/status",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.TREASURY),
    async (req, res) => {
      try {
        const isRunning = treasuryReconciliationService.isReconciliationRunning();
        const lastReport = treasuryReconciliationService.getLastReport();

        res.json({
          isRunning,
          lastReport: lastReport
            ? {
                runId: lastReport.runId,
                completedAt: lastReport.completedAt,
                durationMs: lastReport.durationMs,
                totalAgences: lastReport.totalAgences,
                summary: lastReport.summary,
                globalStatus: lastReport.globalReconciliation?.status,
              }
            : null,
        });
      } catch (error: any) {
        logger.error({ err: error }, "Erreur GET /api/treasury/v2/reconciliation/status");
        res.status(500).json({
          error: "STATUS_ERROR",
          message: "Erreur lors de la récupération du statut",
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/treasury/v2/reconciliation/report
   *
   * Récupère le dernier rapport de réconciliation complet.
   * Nécessite la permission READ sur ACCOUNTING.
   *
   * Response: TreasuryReconciliationReport | null
   */
  app.get(
    "/api/treasury/v2/reconciliation/report",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.ACCOUNTING),
    async (req, res) => {
      try {
        const report = treasuryReconciliationService.getLastReport();

        if (!report) {
          return res.status(404).json({
            error: "NO_REPORT",
            message: "Aucun rapport de réconciliation disponible",
          });
        }

        res.json(report);
      } catch (error: any) {
        logger.error({ err: error }, "Erreur GET /api/treasury/v2/reconciliation/report");
        res.status(500).json({
          error: "REPORT_ERROR",
          message: "Erreur lors de la récupération du rapport",
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/treasury/v2/reconciliation/agence/:agenceId
   *
   * Réconcilie une seule agence à la demande.
   * Nécessite la permission READ sur ACCOUNTING.
   *
   * Response: TreasuryReconciliationResult
   */
  app.get(
    "/api/treasury/v2/reconciliation/agence/:agenceId",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.ACCOUNTING),
    async (req, res) => {
      try {
        const { agenceId } = req.params;

        logger.info(
          { agenceId, userId: req.session?.userId },
          "Réconciliation agence demandée"
        );

        const result = await treasuryReconciliationService.reconcileAgence(agenceId);

        if (!result) {
          return res.status(404).json({
            error: "NO_DATA",
            message: "Pas de données de réconciliation pour cette agence",
          });
        }

        res.json(result);
      } catch (error: any) {
        logger.error(
          { err: error, agenceId: req.params.agenceId },
          "Erreur GET /api/treasury/v2/reconciliation/agence/:agenceId"
        );
        res.status(500).json({
          error: "RECONCILIATION_ERROR",
          message: "Erreur lors de la réconciliation de l'agence",
          details: error.message,
        });
      }
    }
  );

  // ============================================================================
  // DEPRECATION NOTICE pour anciens endpoints
  // ============================================================================

  /**
   * Route de migration - Indique aux clients de migrer vers v2
   * À activer plus tard via feature flag
   */
  // app.get("/api/balances/cash-position", (req, res) => {
  //   res.status(301).redirect("/api/treasury/v2/encaisse");
  // });

  logger.info("Treasury v2 routes registered");
}
