/**
 * Routes finance — segment /remboursements (partie remboursements).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/remboursements
 *   GET    /api/remboursements/:id/allocations
 *   POST   /api/remboursements/:id/reverse
 */
import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";
import { logger } from "./shared";

export function registerRemboursementsRoutes(app: Express) {
  // Remboursements avec allocation FIFO automatique
  /**
   * POST /api/remboursements
   */
  app.post("/api/remboursements", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;
        
        // Get active session if user is caissier
        let sessionCaisseId: string | undefined;
        if (user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }
        
        // Import de la nouvelle fonction avec allocation FIFO
        const { createRemboursementWithAllocation } = await import("../../storage/finance-enhanced");
        
        // Utiliser la nouvelle fonction avec allocation automatique
        const result = await createRemboursementWithAllocation({
          creditId: data.creditId,
          montant: data.montant,
          methodePaiement: data.methodePaiement || 'Espèces',
          sessionCaisseId,
          observations: data.observations,
          idempotencyKey: data.idempotencyKey,
          allocationOptions: data.allocationOptions || {
            strategy: 'FIFO',
            applyToFutureInstallments: true,
            createCreditBalance: true
          }
        }, user?.id);
        
        // Les notifications WebSocket sont maintenant gérées dans createRemboursementWithAllocation
        // mais on garde la compatibilité pour le dashboard
        const wsInstance = getWsInstance();
        const userAgence = user?.agence;

        if (wsInstance && userAgence) {
            wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
        }

        // Score events: credit repayment + credit fully paid
        try {
            const credit = await storage.getCredit(data.creditId);
            if (credit?.clientId) {
                const { recordScoreEvent } = await import('../services/scoring-engine');
                await recordScoreEvent({
                    clientId: credit.clientId,
                    agenceId: userAgence || undefined,
                    eventType: 'CREDIT_REMBOURSEMENT',
                    refId: result.remboursement.id,
                    refType: 'remboursement',
                    montant: Number(data.montant),
                    createdBy: user?.id,
                });

                // CREDIT_SOLDE bonus when credit is fully paid off
                if (credit.statut === 'PAID' || credit.statut === 'CLOSED' || Number(credit.soldeRestant) === 0) {
                    await recordScoreEvent({
                        clientId: credit.clientId,
                        agenceId: userAgence || undefined,
                        eventType: 'CREDIT_SOLDE',
                        refId: `solde-${data.creditId}`,
                        refType: 'credit',
                        montant: Number(credit.montant),
                        createdBy: user?.id,
                    });
                }
            }
        } catch (err) {
            logger.error({ err }, 'Scoring event error (credit repayment)');
        }

        // Retourner la réponse enrichie avec les allocations
        res.json({
          ...result.remboursement,
          mouvement_id: result.mouvement.id,
          allocations: result.allocationResult.allocations,
          overpayment_amount: result.allocationResult.overpaymentAmount,
          total_allocated: result.allocationResult.totalAllocated,
          credit_balance: result.allocationResult.creditBalance
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error creating remboursement with allocation');
        res.status(400).json({ message: error.message || 'Erreur lors du remboursement' });
      }
  });

  // Récupérer les allocations d'un remboursement
  /**
   * GET /api/remboursements/:id/allocations
   */
  app.get("/api/remboursements/:id/allocations", requireAuth, async (req, res) => {
      try {
        const { getRepaymentAllocations } = await import("../../services/repayment-allocation-service");
        const allocations = await getRepaymentAllocations(req.params.id);
        res.json(allocations);
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching repayment allocations');
        res.status(500).json({ message: error.message || 'Erreur lors de la récupération des allocations' });
      }
  });

  // Extourner un remboursement et ses allocations
  /**
   * POST /api/remboursements/:id/reverse
   */
  app.post("/api/remboursements/:id/reverse", requireAuth, attachAbility, requireAbility(Actions.REVERSE, Subjects.REMBOURSEMENT), async (req, res) => {
      try {
        const { reason } = req.body;
        const user = req.session.user;

        if (!reason || reason.trim().length < 5) {
          return res.status(400).json({ message: 'Une raison valide est requise pour l\'extourne (min. 5 caractères)' });
        }

        const { reverseRemboursement } = await import("../../storage/finance-enhanced");
        const result = await reverseRemboursement(req.params.id, reason, user?.id);

        if (!result.success) {
          return res.status(400).json({ message: result.message });
        }

        // Log audit
        await logAudit(
          req,
          "REMBOURSEMENT_REVERSED",
          "remboursement",
          req.params.id,
          { reason },
          "success",
          "high"
        );

        res.json(result);
      } catch (error: any) {
        logger.error({ err: error }, 'Error reversing repayment');
        res.status(500).json({ message: error.message || 'Erreur lors de l\'extourne du remboursement' });
      }
  });
}
