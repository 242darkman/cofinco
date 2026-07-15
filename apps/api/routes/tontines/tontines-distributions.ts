import type { Express, Request, Response } from "express";
import { tontines, tontineDistributionRequests, TontinePayoutMethod } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { executeWithLedger, updateTontineSolde, updateSessionSolde } from "../../services/ledger";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import tontineProductionService from "../../services/tontine-production-service";
import tontineLifecycleService from "../../services/tontine-lifecycle-service";

const logger = createLogger('Routes:TontinesDistributions');

export function registerTontineDistributionsRoutes(app: Express) {
  app.get("/api/tontines/:id/retirable/:memberId", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await tontineProductionService.calculateRetirable(
        req.params.id,
        req.params.memberId
      );

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur calcul retirable');
      res.status(500).json({ message: error.message || "Erreur calcul retirable" });
    }
  });

  // --- DISTRIBUTION REQUESTS (V2) ---

  // List distribution requests for a tontine
  app.get("/api/tontines/:id/distribution-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const { cycleId, status } = req.query;

      const filtered = await storage.getDistributionRequests(req.params.id, {
        cycleId: cycleId as string | undefined,
        status: status as string | undefined,
      });

      res.json(filtered);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement distribution requests');
      res.status(500).json({ message: error.message || "Erreur chargement" });
    }
  });

  // Create a distribution request
  app.post("/api/tontines/:id/distribution-requests", requireAuth, attachAbility, requireAbility(Actions.DISTRIBUTE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      const {
        cycleId,
        turnId,
        beneficiaryMemberId,
        payoutMethod,
        provider,
        targetMsisdn,
        targetWalletAccountId,
        notes,
      } = req.body;

      if (!cycleId || !turnId || !beneficiaryMemberId || !payoutMethod) {
        return res.status(400).json({ message: "cycleId, turnId, beneficiaryMemberId, payoutMethod requis" });
      }

      const result = await tontineProductionService.createDistributionRequest({
        tontineId: req.params.id,
        cycleId,
        turnId,
        beneficiaryMemberId,
        agenceId,
        userId: userId!,
        payoutMethod: payoutMethod as TontinePayoutMethod,
        provider,
        targetMsisdn,
        targetWalletAccountId,
        notes,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'distribution_request_created',
            tontineId: req.params.id,
            requestId: result.requestId,
            status: result.status,
          }
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur création distribution request');
      res.status(400).json({ message: error.message || "Erreur création" });
    }
  });

  // Approve and execute a distribution request
  app.post("/api/tontines/:id/distribution-requests/:requestId/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
      const userId = req.session.user?.id;

      if (!agenceId) {
        return res.status(400).json({ message: "Agence non définie" });
      }

      // Get active session for cash distributions
      let sessionCaisseId: string | undefined;
      const activeSession = await storage.getActiveSessionForUser(userId!);
      if (activeSession) {
        sessionCaisseId = activeSession.id;
      }

      const result = await tontineProductionService.approveDistribution({
        requestId: req.params.requestId,
        agenceId,
        userId: userId!,
        sessionCaisseId,
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'distribution_approved',
            tontineId: req.params.id,
            requestId: result.requestId,
            status: result.status,
            amountPaid: result.netAmount,
          }
        });

        if (sessionCaisseId) {
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
        }
      }

      // Domain event: distribution paid — look up beneficiary info
      if (result.status === 'SUCCESS' || result.status === 'PARTIAL') {
        try {
          const distReq = await storage.getDistributionRequest(result.requestId);
          if (distReq) {
            const tontineForDist = await storage.getTontine(req.params.id);
            const benefMember = await storage.getMembreTontineById(distReq.beneficiaryMemberId);
            const clientId = benefMember?.clientId;
            if (clientId && tontineForDist) {
              dispatchDomainEvent({
                type: "TONTINE_DISTRIBUTION_PAID",
                data: {
                  tontineId: req.params.id,
                  tontineName: tontineForDist.nom,
                  clientId,
                  montant: result.netAmount || 0,
                  reference: result.paymentIntentId || result.requestId.substring(0, 8).toUpperCase(),
                  payoutMethod: distReq.payoutMethod || 'CASH',
                  agenceId,
                },
                timestamp: new Date(),
              });
            }
          }
        } catch (e) { /* non-blocking */ }
      }

      // Auto-completion: check if all members received their distribution (ROTATIVE_SUSU)
      if (result.status === 'SUCCESS') {
        try {
          const tontine = await storage.getTontine(req.params.id);
          if (tontine && tontine.statut === 'ACTIVE' && tontine.distributionType === 'ROTATIVE_SUSU') {
            const activeMembers = await storage.getMembresTontine(req.params.id);
            const allReceived = activeMembers
              .filter((m: any) => m.statut === 'ACTIVE')
              .every((m: any) => m.aRecuBenefice === true);

            if (allReceived) {
              // All members received — close cycle and complete tontine
              const activeCycle = await storage.getActiveCycle(req.params.id);
              if (activeCycle) {
                await storage.closeCycle(req.params.id, activeCycle.id, userId!);
                logger.info({ tontineId: req.params.id, cycleId: activeCycle.id }, 'Cycle auto-clôturé (tous les membres ont reçu)');
              }

              await tontineLifecycleService.transitionStatus(
                req.params.id, 'COMPLETED', userId!, 'Auto-complétée : tous les membres ont reçu leur distribution'
              );
              logger.info({ tontineId: req.params.id }, 'Tontine auto-complétée');

              const wsInstance2 = getWsInstance();
              if (wsInstance2) {
                wsInstance2.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
              }
            } else {
              // Not all received yet — check if current cycle's turns are all distributed, then close cycle + generate next
              const activeCycle = await storage.getActiveCycle(req.params.id);
              if (activeCycle) {
                const cycleTurns = await storage.getTurnsByCycle(req.params.id, activeCycle.id);
                const allTurnsDone = cycleTurns.length > 0 && cycleTurns.every(
                  (t: any) => t.status === 'PAID_OUT' || t.status === 'SKIPPED'
                );

                if (allTurnsDone) {
                  // Close current cycle
                  await storage.closeCycle(req.params.id, activeCycle.id, userId!);
                  logger.info({ tontineId: req.params.id, cycleId: activeCycle.id }, 'Cycle auto-clôturé (tous les tours distribués)');

                  // Generate next cycle
                  try {
                    const agenceId = req.user?.agenceId || (req.session.user as any)?.agenceId;
                    const nextCycle = await tontineProductionService.generateCycle({
                      tontineId: req.params.id,
                      agenceId,
                      userId: userId!,
                    });
                    logger.info({ tontineId: req.params.id, newCycleId: nextCycle.cycleId }, 'Nouveau cycle auto-généré');

                    const wsInstance2 = getWsInstance();
                    if (wsInstance2) {
                      wsInstance2.broadcast({ type: "TONTINE_UPDATE", payload: { type: "cycle_generated", tontineId: req.params.id } });
                    }
                  } catch (cycleErr: any) {
                    logger.warn({ err: cycleErr, tontineId: req.params.id }, 'Impossible de générer le cycle suivant automatiquement');
                  }
                }
              }
            }
          }
        } catch (autoErr: any) {
          // Non-blocking: log but don't fail the distribution approval
          logger.warn({ err: autoErr, tontineId: req.params.id }, 'Erreur lors de la vérification auto-complétion');
        }
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur approbation distribution');
      res.status(400).json({ message: error.message || "Erreur approbation" });
    }
  });

  // Cancel a distribution request
  app.post("/api/tontines/:id/distribution-requests/:requestId/cancel", requireAuth, attachAbility, requireAbility(Actions.CANCEL, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;

      const updated = await storage.cancelDistributionRequest(req.params.requestId, reason);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: {
            type: 'distribution_cancelled',
            tontineId: req.params.id,
            requestId: req.params.requestId,
          }
        });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation distribution');
      res.status(400).json({ message: error.message || "Erreur annulation" });
    }
  });

  // --- DASHBOARD V2 ---

  // Get tontine dashboard stats (V2 with cycles)
}
