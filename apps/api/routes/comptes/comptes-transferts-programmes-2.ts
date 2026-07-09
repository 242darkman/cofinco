/**
 * Routes comptes — segment /comptes (partie comptes-transferts-programmes-2).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   DELETE /api/comptes/transferts-programmes/:id
 *   POST   /api/comptes/transferts-programmes/:id/run-now
 *   GET    /api/comptes/transferts-programmes/:id/history
 *   GET    /api/comptes/transferts-programmes/health
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { logAudit } from "../../audit";
import { aliasedTable, eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { logger } from "./shared";

export function registerComptesTransfertsProgrammes2Routes(app: Express) {
  /**
   * DELETE /api/comptes/transferts-programmes/:id - Annuler (soft delete) un virement programmé
   */
  /**
   * DELETE /api/comptes/transferts-programmes/:id
   */
  app.delete(
    "/api/comptes/transferts-programmes/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");

        // Vérifier existence et permissions
        const [existing] = await db
          .select({
            id: virementsProgrammes.id,
            actif: virementsProgrammes.actif,
            deletedAt: virementsProgrammes.deletedAt,
            sourceAgenceId: sourceCompte.agenceId,
            destAgenceId: destCompte.agenceId,
          })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .where(eq(virementsProgrammes.id, req.params.id))
          .limit(1);

        if (!existing) {
          return res.status(404).json({ message: "Virement programmé introuvable" });
        }

        if (existing.deletedAt) {
          return res.status(400).json({ message: "Virement déjà annulé" });
        }

        if (
          req.selectedAgenceId &&
          existing.sourceAgenceId !== req.selectedAgenceId &&
          existing.destAgenceId !== req.selectedAgenceId
        ) {
          return res.status(403).json({ message: "Accès refusé pour ce virement programmé" });
        }

        // Soft delete
        await db
          .update(virementsProgrammes)
          .set({
            deletedAt: new Date(),
            actif: false,
            updatedAt: new Date(),
          })
          .where(eq(virementsProgrammes.id, req.params.id));

        await logAudit(
          req,
          "DELETE_VIREMENT_PROGRAMME",
          "virement_programme",
          req.params.id,
          {},
          "success",
          "high"
        );

        // Broadcast WebSocket pour mise à jour temps réel
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "SCHEDULED_TRANSFER_UPDATED",
            payload: {
              transferId: req.params.id,
              action: "deleted",
              actif: false,
            },
          });
        }

        res.json({ message: "Virement programmé annulé avec succès" });
      } catch (error: any) {
        logger.error({ err: error }, 'Error deleting scheduled transfer');
        res.status(500).json({ message: error.message || "Erreur suppression virement programmé" });
      }
    }
  );

  /**
   * POST /api/comptes/transferts-programmes/:id/run-now - Exécuter immédiatement un virement programmé
   * ATTENTION: Endpoint sensible, utilise avec précaution
   */
  /**
   * POST /api/comptes/transferts-programmes/:id/run-now
   */
  app.post(
    "/api/comptes/transferts-programmes/:id/run-now",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const { processScheduledTransfers, getScheduledTransferHistory } = await import("../../services/scheduled-transfers-service");
        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");

        // Vérifier existence et permissions
        const [existing] = await db
          .select({
            id: virementsProgrammes.id,
            actif: virementsProgrammes.actif,
            deletedAt: virementsProgrammes.deletedAt,
            prochaineExecution: virementsProgrammes.prochaineExecution,
            sourceAgenceId: sourceCompte.agenceId,
            destAgenceId: destCompte.agenceId,
          })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .where(eq(virementsProgrammes.id, req.params.id))
          .limit(1);

        if (!existing) {
          return res.status(404).json({ message: "Virement programmé introuvable" });
        }

        if (existing.deletedAt) {
          return res.status(400).json({ message: "Virement annulé, impossible de l'exécuter" });
        }

        if (
          req.selectedAgenceId &&
          existing.sourceAgenceId !== req.selectedAgenceId &&
          existing.destAgenceId !== req.selectedAgenceId
        ) {
          return res.status(403).json({ message: "Accès refusé pour ce virement programmé" });
        }

        // Forcer la prochaine exécution à maintenant pour déclencher le traitement
        await db
          .update(virementsProgrammes)
          .set({
            prochaineExecution: new Date(),
            actif: true,
            processingLock: null,
            updatedAt: new Date(),
          })
          .where(eq(virementsProgrammes.id, req.params.id));

        // Exécuter le traitement (ne traitera que ce virement car c'est le seul "due")
        const results = await processScheduledTransfers(new Date(), 1);
        const result = results.find(r => r.id === req.params.id);

        await logAudit(
          req,
          "RUN_NOW_VIREMENT_PROGRAMME",
          "virement_programme",
          req.params.id,
          { result },
          result?.success ? "success" : "failure",
          "high"
        );

        // Récupérer le dernier run pour retourner les détails
        const history = await getScheduledTransferHistory(req.params.id, 1);
        const lastRun = history[0];

        // Broadcast WebSocket
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "SCHEDULED_TRANSFER_EXECUTED",
            payload: {
              scheduleId: req.params.id,
              success: result?.success ?? false,
              mouvementId: result?.mouvementId,
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (result?.success) {
          res.json({
            message: result.skipped ? "Virement déjà exécuté aujourd'hui" : "Virement exécuté avec succès",
            mouvementId: result.mouvementId,
            skipped: result.skipped,
            run: lastRun,
          });
        } else {
          res.status(400).json({
            message: result?.error || "Échec de l'exécution",
            run: lastRun,
          });
        }
      } catch (error: any) {
        logger.error({ err: error }, 'Error running scheduled transfer');
        res.status(500).json({ message: error.message || "Erreur exécution virement programmé" });
      }
    }
  );

  /**
   * GET /api/comptes/transferts-programmes/:id/history - Historique des exécutions d'un virement programmé
   */
  /**
   * GET /api/comptes/transferts-programmes/:id/history
   */
  app.get(
    "/api/comptes/transferts-programmes/:id/history",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const { getScheduledTransferHistory } = await import("../../services/scheduled-transfers-service");
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);

        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");

        // Vérifier existence et permissions
        const [existing] = await db
          .select({
            id: virementsProgrammes.id,
            sourceAgenceId: sourceCompte.agenceId,
            destAgenceId: destCompte.agenceId,
          })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .where(eq(virementsProgrammes.id, req.params.id))
          .limit(1);

        if (!existing) {
          return res.status(404).json({ message: "Virement programmé introuvable" });
        }

        if (
          req.selectedAgenceId &&
          existing.sourceAgenceId !== req.selectedAgenceId &&
          existing.destAgenceId !== req.selectedAgenceId
        ) {
          return res.status(403).json({ message: "Accès refusé pour ce virement programmé" });
        }

        const history = await getScheduledTransferHistory(req.params.id, limit);

        res.json({
          scheduleId: req.params.id,
          runs: history,
          count: history.length,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching scheduled transfer history');
        res.status(500).json({ message: error.message || "Erreur chargement historique" });
      }
    }
  );

  /**
   * GET /api/comptes/transferts-programmes/health - État de santé du système de virements programmés
   * Endpoint admin pour monitoring
   */
  /**
   * GET /api/comptes/transferts-programmes/health
   */
  app.get(
    "/api/comptes/transferts-programmes/health",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const { getScheduledTransfersHealth } = await import("../../services/scheduled-transfers-service");
        const health = await getScheduledTransfersHealth();

        // Déterminer le status global
        let status: "healthy" | "degraded" | "critical" = "healthy";
        if (health.dueCount > 100 || health.oldestDueLagSeconds > 3600) {
          status = "critical";
        } else if (health.dueCount > 20 || health.oldestDueLagSeconds > 600) {
          status = "degraded";
        }

        res.json({
          status,
          ...health,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching scheduled transfers health');
        res.status(500).json({
          status: "error",
          message: error.message || "Erreur vérification santé",
        });
      }
    }
  );
}
