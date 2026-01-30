/**
 * Service de Réconciliation Treasury — GL vs Opérationnel
 *
 * Ce service compare périodiquement les soldes du Grand Livre (GL)
 * avec les soldes opérationnels (coffres_forts.solde, sessions_caisse).
 *
 * Objectifs:
 * - Détecter les écarts entre GL et caches opérationnels
 * - Émettre des alertes WebSocket pour les écarts critiques
 * - Fournir des rapports de réconciliation pour audit
 * - Tracer l'historique des réconciliations
 */

import { db } from "../../db";
import { eq, isNull, and } from "drizzle-orm";
import { agences } from "@shared/schema/agences";
import { encaisseService, type ReconciliationStatus } from "./encaisse-service";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";
import { randomUUID } from "crypto";

const logger = createLogger("Treasury:ReconciliationService");

// ============================================================================
// TYPES
// ============================================================================

export interface TreasuryReconciliationResult {
  agenceId: string;
  agenceNom: string;
  codeAgence: string;
  glTotal: number;
  operationalTotal: number;
  ecart: number;
  status: ReconciliationStatus["status"];
  details: {
    coffresGL: number;
    coffresOperational: number;
    caissesGL: number;
    caissesOperational: number;
  };
  timestamp: string;
}

export interface TreasuryReconciliationReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalAgences: number;
  results: TreasuryReconciliationResult[];
  summary: {
    ok: number;
    minor: number;
    major: number;
    critical: number;
    totalEcartAbsolu: number;
  };
  globalReconciliation?: {
    glTotal: number;
    operationalTotal: number;
    ecart: number;
    status: ReconciliationStatus["status"];
  };
}

// Seuils d'alerte
const ALERT_THRESHOLDS = {
  MINOR: 50_000,    // < 50k FCFA - log uniquement
  MAJOR: 500_000,   // < 500k FCFA - alerte WebSocket
  CRITICAL: 500_000 // >= 500k FCFA - alerte urgente
};

// ============================================================================
// SERVICE
// ============================================================================

class TreasuryReconciliationService {
  private isRunning = false;
  private lastReport: TreasuryReconciliationReport | null = null;

  /**
   * Vérifie si une réconciliation est en cours
   */
  isReconciliationRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Récupère le dernier rapport de réconciliation
   */
  getLastReport(): TreasuryReconciliationReport | null {
    return this.lastReport;
  }

  /**
   * Exécute la réconciliation complète GL vs Opérationnel
   * pour toutes les agences actives
   */
  async runFullReconciliation(): Promise<TreasuryReconciliationReport> {
    if (this.isRunning) {
      throw new Error("Réconciliation déjà en cours");
    }

    this.isRunning = true;
    const runId = randomUUID();
    const startedAt = new Date();

    logger.info({ runId }, "Démarrage réconciliation Treasury GL vs Opérationnel");

    try {
      // 1. Récupérer toutes les agences actives
      const activeAgences = await db
        .select({
          id: agences.id,
          nom: agences.nom,
          codeAgence: agences.codeAgence,
        })
        .from(agences)
        .where(
          and(
            eq(agences.statut, "ACTIVE"),
            isNull(agences.deletedAt)
          )
        );

      logger.debug({ agenceCount: activeAgences.length }, "Agences à réconcilier");

      // 2. Réconcilier chaque agence
      const results: TreasuryReconciliationResult[] = [];
      const summary = { ok: 0, minor: 0, major: 0, critical: 0, totalEcartAbsolu: 0 };

      for (const agence of activeAgences) {
        try {
          const encaisse = await encaisseService.getEncaisseWithReconciliation(agence.id);
          const recon = encaisse.reconciliation;

          if (!recon) {
            logger.warn({ agenceId: agence.id }, "Pas de données de réconciliation");
            continue;
          }

          const result: TreasuryReconciliationResult = {
            agenceId: agence.id,
            agenceNom: agence.nom,
            codeAgence: agence.codeAgence,
            glTotal: recon.glTotal,
            operationalTotal: recon.operationalTotal,
            ecart: recon.ecart,
            status: recon.status,
            details: {
              coffresGL: recon.details?.coffresGL || 0,
              coffresOperational: recon.details?.coffresOperational || 0,
              caissesGL: recon.details?.caissesGL || 0,
              caissesOperational: recon.details?.caissesOperational || 0,
            },
            timestamp: new Date().toISOString(),
          };

          results.push(result);
          summary.totalEcartAbsolu += Math.abs(recon.ecart);

          // Comptabiliser par sévérité
          switch (recon.status) {
            case "OK":
              summary.ok++;
              break;
            case "MINOR":
              summary.minor++;
              break;
            case "MAJOR":
              summary.major++;
              break;
            case "CRITICAL":
              summary.critical++;
              break;
          }

          // Logger les écarts non-OK
          if (recon.status !== "OK") {
            logger.warn(
              {
                agenceId: agence.id,
                codeAgence: agence.codeAgence,
                status: recon.status,
                ecart: recon.ecart,
                glTotal: recon.glTotal,
                operationalTotal: recon.operationalTotal,
              },
              `Écart détecté: ${agence.nom}`
            );
          }
        } catch (error) {
          logger.error(
            { err: error, agenceId: agence.id },
            "Erreur réconciliation agence"
          );
        }
      }

      // 3. Réconciliation globale (toutes agences)
      let globalReconciliation;
      try {
        const globalEncaisse = await encaisseService.getEncaisseWithReconciliation();
        if (globalEncaisse.reconciliation) {
          globalReconciliation = {
            glTotal: globalEncaisse.reconciliation.glTotal,
            operationalTotal: globalEncaisse.reconciliation.operationalTotal,
            ecart: globalEncaisse.reconciliation.ecart,
            status: globalEncaisse.reconciliation.status,
          };
        }
      } catch (error) {
        logger.error({ err: error }, "Erreur réconciliation globale");
      }

      // 4. Construire le rapport
      const completedAt = new Date();
      const report: TreasuryReconciliationReport = {
        runId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        totalAgences: activeAgences.length,
        results,
        summary,
        globalReconciliation,
      };

      this.lastReport = report;

      // 5. Émettre les alertes WebSocket
      await this.emitAlerts(report);

      logger.info(
        {
          runId,
          durationMs: report.durationMs,
          totalAgences: report.totalAgences,
          summary,
        },
        "Réconciliation Treasury terminée"
      );

      return report;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Réconcilie une seule agence
   */
  async reconcileAgence(agenceId: string): Promise<TreasuryReconciliationResult | null> {
    const agence = await db
      .select({
        id: agences.id,
        nom: agences.nom,
        codeAgence: agences.codeAgence,
      })
      .from(agences)
      .where(eq(agences.id, agenceId))
      .limit(1);

    if (agence.length === 0) {
      throw new Error(`Agence non trouvée: ${agenceId}`);
    }

    const encaisse = await encaisseService.getEncaisseWithReconciliation(agenceId);
    const recon = encaisse.reconciliation;

    if (!recon) {
      return null;
    }

    return {
      agenceId: agence[0].id,
      agenceNom: agence[0].nom,
      codeAgence: agence[0].codeAgence,
      glTotal: recon.glTotal,
      operationalTotal: recon.operationalTotal,
      ecart: recon.ecart,
      status: recon.status,
      details: {
        coffresGL: recon.details?.coffresGL || 0,
        coffresOperational: recon.details?.coffresOperational || 0,
        caissesGL: recon.details?.caissesGL || 0,
        caissesOperational: recon.details?.caissesOperational || 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Émet les alertes WebSocket pour les écarts détectés
   */
  private async emitAlerts(report: TreasuryReconciliationReport): Promise<void> {
    const ws = getWsInstance();
    if (!ws) {
      logger.warn("WebSocket non disponible pour les alertes");
      return;
    }

    // Alertes individuelles pour MAJOR et CRITICAL
    for (const result of report.results) {
      if (result.status === "MAJOR" || result.status === "CRITICAL") {
        ws.broadcast({
          type: "TREASURY_RECONCILIATION_ALERT",
          payload: {
            runId: report.runId,
            agenceId: result.agenceId,
            agenceNom: result.agenceNom,
            codeAgence: result.codeAgence,
            severity: result.status,
            ecart: result.ecart,
            glTotal: result.glTotal,
            operationalTotal: result.operationalTotal,
            details: result.details,
            timestamp: result.timestamp,
          },
        });

        logger.warn(
          {
            agenceId: result.agenceId,
            severity: result.status,
            ecart: result.ecart,
          },
          `Alerte réconciliation émise: ${result.agenceNom}`
        );
      }
    }

    // Alerte globale si écart critique
    if (report.globalReconciliation &&
        (report.globalReconciliation.status === "MAJOR" ||
         report.globalReconciliation.status === "CRITICAL")) {
      ws.broadcast({
        type: "TREASURY_RECONCILIATION_ALERT",
        payload: {
          runId: report.runId,
          agenceId: null,
          agenceNom: "GLOBAL",
          codeAgence: "ALL",
          severity: report.globalReconciliation.status,
          ecart: report.globalReconciliation.ecart,
          glTotal: report.globalReconciliation.glTotal,
          operationalTotal: report.globalReconciliation.operationalTotal,
          timestamp: report.completedAt,
        },
      });
    }

    // Broadcast résumé complet
    ws.broadcast({
      type: "TREASURY_RECONCILIATION_COMPLETE",
      payload: {
        runId: report.runId,
        completedAt: report.completedAt,
        durationMs: report.durationMs,
        totalAgences: report.totalAgences,
        summary: report.summary,
        globalStatus: report.globalReconciliation?.status || "UNKNOWN",
      },
    });
  }
}

// Export singleton
export const treasuryReconciliationService = new TreasuryReconciliationService();
export default treasuryReconciliationService;
