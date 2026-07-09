/**
 * Routes finance — segment /demandes-credit (partie demandes-credit-detail).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   PATCH  /api/demandes-credit/:id
 *   DELETE /api/demandes-credit/:id
 *   PUT    /api/demandes-credit/:id/cancel
 *   POST   /api/demandes-credit/:id/start-investigation
 */
import type { Express } from "express";
import { enquetesCredit } from "@shared/schema";
import { storage } from "../../storage";
import { DemandeTransitionError } from "@shared/machines/demande-workflow";
import { StatutDemande } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerDemandesCreditDetailRoutes(app: Express) {
  /**
   * PATCH /api/demandes-credit/:id
   */
  app.patch("/api/demandes-credit/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = normalizeKeysDeep(req.body) as any;

      // Verify existence
      const existing = await storage.getDemandeCredit(id);
      if (!existing) return res.status(404).json({ message: "Demande non trouvée" });

      let updated;

      // Auto-set dateRejet when status is REJECTED or DEFINITIVELY_REJECTED
      if (updateData.statut === StatutDemande.REJECTED || updateData.statut === StatutDemande.DEFINITIVELY_REJECTED) {
        if (!updateData.dateRejet) {
          updateData.dateRejet = new Date();
        }
      }

      // Auto-transition: UNDER_INVESTIGATION → INVESTIGATION_COMPLETE → PENDING_APPROVAL → APPROVED
      // When approving from investigation status, automatically route through intermediate states
      if (updateData.statut === StatutDemande.APPROVED && existing.statut === StatutDemande.UNDER_INVESTIGATION) {
        updated = await db.transaction(async (tx) => {
          await storage.updateDemandeCredit(id, { statut: StatutDemande.INVESTIGATION_COMPLETE }, tx);
          await storage.updateDemandeCredit(id, { statut: StatutDemande.PENDING_APPROVAL }, tx);
          return await storage.updateDemandeCredit(id, updateData, tx);
        });
      }
      // Auto-transition: INVESTIGATION_COMPLETE → PENDING_APPROVAL → APPROVED
      else if (updateData.statut === StatutDemande.APPROVED && existing.statut === StatutDemande.INVESTIGATION_COMPLETE) {
        updated = await db.transaction(async (tx) => {
          await storage.updateDemandeCredit(id, { statut: StatutDemande.PENDING_APPROVAL }, tx);
          return await storage.updateDemandeCredit(id, updateData, tx);
        });
      }
      // Logic for Refund on Rejection
      else if (updateData.statut === StatutDemande.REJECTED && updateData.montantRemboursement && Number(updateData.montantRemboursement) > 0) {
          const refundAmount = Number(updateData.montantRemboursement);

          updated = await db.transaction(async (tx) => {
            // 1. Validation
            if (!existing.fraisEngagementPayes) {
               throw new Error("Aucun frais n'a été payé pour cette demande.");
            }
            const maxRefund = Number(existing.montantFraisEngagement || 0);
            if (refundAmount > maxRefund) {
               throw new Error(`Le montant du remboursement (${refundAmount}) ne peut pas excéder les frais payés (${maxRefund}).`);
            }

            // 2. Create Refund Request (Wait for approval/payment)
            await storage.createCreditRefundRequest({
              demandeId: existing.id,
              clientId: existing.clientId,
              agenceId: req.session.user?.agenceId!, // Validated by middleware
              montantEncaisse: existing.montantFraisEngagement?.toString() || '0',
              montantRemboursable: refundAmount.toString(),
              montantNonRemboursable: (maxRefund - refundAmount).toString(),
              statut: 'SUBMITTED', // Ready for approval/payment
              motifRejetCredit: updateData.motifRejet,
              motifRemboursement: "Remboursement suite rejet", // Default
              makerId: req.session.user?.id,
              makerAt: new Date(),
            }, tx);

            // 3. Update Demande Status (State Machine guard in storage layer)
            // Motif Rejet Update
            if (updateData.motifRejet) {
                 updateData.motifRejet += ` (Remboursement de ${refundAmount} ${currencySymbol()} en attente)`;
            }

            return await storage.updateDemandeCredit(id, updateData, tx);
          });
      } else {
          // Normal update (State Machine guard in storage layer)
          updated = await storage.updateDemandeCredit(id, updateData);
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({
            type: "CREDIT_UPDATE",
            payload: {
              type: 'demande_updated',
              id,
              statut: updateData.statut
            }
          });

           // Si approuvée, notifier en temps réel + SMS
           if (updateData.statut === StatutDemande.APPROVED) {
              const userAgence = req.session.user?.agence;
              if (userAgence) {
                wsInstance.broadcastToAgency(userAgence, {
                  type: "LIVE_ACTIVITY",
                  payload: {
                    action: `Crédit Approuvé: #${existing.numeroDemande}`,
                    user: req.session.user?.nom || 'Système',
                    type: 'validation',
                    timestamp: new Date().toISOString()
                  }
                });
              }

              // Dispatch domain event for credit approval notification
              const montantNotification = existing.montantApprouve || existing.montantDemande;
              if (existing.clientId && montantNotification) {
                dispatchDomainEvent({
                  type: "CREDIT_APPROVED",
                  data: {
                    demandeId: existing.id,
                    numeroDemande: existing.numeroDemande,
                    clientId: existing.clientId,
                    montantApprouve: Number(montantNotification),
                    agenceId: req.session.user?.agenceId,
                    approvedByUserId: req.user?.id,
                  },
                  timestamp: new Date(),
                });
              }
           }

           // Si rejetée, notifier le client
           if (updateData.statut === StatutDemande.REJECTED && existing.clientId) {
              dispatchDomainEvent({
                type: "CREDIT_REJECTED",
                data: {
                  demandeId: existing.id,
                  numeroDemande: existing.numeroDemande,
                  clientId: existing.clientId,
                  motifRejet: updateData.motifRejet,
                  agenceId: req.session.user?.agenceId,
                  rejectedByUserId: req.user?.id,
                },
                timestamp: new Date(),
              });
           }
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur mise à jour demande crédit');

      // State Machine error: return 400 with clear message
      if (error instanceof DemandeTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(500).json({ message: error.message || "Erreur lors de la mise à jour de la demande" });
    }
  });

  /**
   * DELETE /api/demandes-credit/:id
   */
  app.delete("/api/demandes-credit/:id", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      const success = await storage.deleteDemandeCredit(req.params.id);
      if (!success) return res.status(404).json({ message: "Demande non trouvée" });
      
       const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_deleted', id: req.params.id } });
      }
      
      res.json({ success: true });
  });

  /**
   * PUT /api/demandes-credit/:id/cancel
   */
  app.put("/api/demandes-credit/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { motif } = req.body;
      // State Machine guard is in storage.cancelDemandeCredit
      const demande = await storage.cancelDemandeCredit(req.params.id, motif);

      if (!demande) return res.status(404).json({ message: "Demande non trouvée" });

      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_cancelled', id: req.params.id } });
      }

      res.json(demande);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation demande crédit');

      // State Machine error: return 400 with clear message
      if (error instanceof DemandeTransitionError) {
        return res.status(400).json({
          code: error.code,
          message: error.message,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus
        });
      }

      res.status(500).json({ message: error.message || "Erreur lors de l'annulation de la demande" });
    }
  });

  // Assign investigation — creates enquête with ASSIGNED status, demande stays at READY_FOR_INVESTIGATION
  /**
   * POST /api/demandes-credit/:id/start-investigation
   */
  app.post("/api/demandes-credit/:id/start-investigation", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as Record<string, any>;
      const assignedAgentId = data.agentId || data.assignedAgentId;
      const priority = data.priority || "MEDIUM";
      const dueDate = data.dueDate;

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is READY_FOR_INVESTIGATION
      if (demande.statut !== StatutDemande.READY_FOR_INVESTIGATION) {
        return res.status(400).json({
          message: `Cette demande ne peut pas démarrer une enquête (statut actuel: ${demande.statut}). Seules les demandes en attente d'enquête peuvent démarrer.`
        });
      }

      if (!assignedAgentId) {
        return res.status(400).json({ message: "Veuillez sélectionner un agent terrain pour l'enquête." });
      }

      // Create the enquête record with agent assignment (statut = ASSIGNED)
      // The demande stays at READY_FOR_INVESTIGATION until the agent starts the investigation
      const enqueteValues: Record<string, any> = {
        clientId: demande.clientId,
        demandeId: id,
        creditPlanId: demande.creditPlanId || null,
        montantDemande: demande.montantDemande?.toString() || "0",
        objetCredit: demande.objetCredit || "À définir",
        assignedAgentId,
        assignedAt: new Date(),
        assignedBy: req.session?.user?.id,
        priority,
        statut: "ASSIGNED",
        ...(dueDate && { dueDate: new Date(dueDate) }),
      };

      const [enquete] = await db
        .insert(enquetesCredit)
        .values(enqueteValues as any)
        .returning();

      const wsInstance = getWsInstance();
      if (wsInstance) {
        // Broadcast to all for badge/list updates
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_assigned', id, agentId: assignedAgentId } });
        // Targeted notification to the assigned agent for instant visibility
        wsInstance.sendToUser(assignedAgentId, {
          type: "CREDIT_UPDATE",
          payload: { type: 'enquete_assigned_to_me', enqueteId: enquete.id, demandeId: id, priority },
        });
      }

      // Domain event: investigation assigned/started
      dispatchDomainEvent({
        type: "CREDIT_INVESTIGATION_ASSIGNED",
        data: {
          demandeId: id,
          numeroDemande: demande.numeroDemande,
          clientId: demande.clientId,
          agentId: assignedAgentId,
          agentName: req.session.user?.nom || 'Agent',
          agenceId: req.session.user?.agenceId,
        },
        timestamp: new Date(),
      });

      // Schedule deadline reminders for the agent (J-3, J-1, J, J+1)
      if (dueDate && enquete.id) {
        try {
          const { generateInvestigationReminderSchedule } = await import("../../services/notifications/investigation-reminder-service");
          const count = await generateInvestigationReminderSchedule(enquete.id);
          if (count > 0) {
            logger.info({ enqueteId: enquete.id, reminderCount: count }, "Investigation reminders scheduled");
          }
        } catch (reminderErr) {
          // Non-blocking: reminder scheduling failure should not break assignment
          logger.warn({ err: reminderErr, enqueteId: enquete.id }, "Failed to schedule investigation reminders");
        }
      }

      res.json({ success: true, demande, enquete });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur démarrage enquête');
      res.status(500).json({ message: error.message || "Erreur lors du démarrage de l'enquête" });
    }
  });
}
