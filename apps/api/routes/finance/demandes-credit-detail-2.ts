/**
 * Routes finance — segment /demandes-credit (partie demandes-credit-detail-2).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/demandes-credit/:id/reassign-investigation
 *   POST   /api/demandes-credit/:id/validate-investigation
 *   POST   /api/demandes-credit/:id/payer-frais
 */
import type { Express } from "express";
import { enquetesCredit } from "@shared/schema";
import { storage } from "../../storage";
import { StatutDemande } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { paymentService } from "../../services/mobile-money/payment-service";
import { MethodePaiement } from "@shared/enum/status-constants";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerDemandesCreditDetail2Routes(app: Express) {
  // Reassign investigation — change the agent on an existing enquête (only if not yet started)
  /**
   * POST /api/demandes-credit/:id/reassign-investigation
   */
  app.post("/api/demandes-credit/:id/reassign-investigation", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as Record<string, any>;
      const newAgentId = data.agentId || data.assignedAgentId;
      const priority = data.priority;
      const dueDate = data.dueDate;

      if (!newAgentId) {
        return res.status(400).json({ message: "Veuillez sélectionner un agent terrain." });
      }

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Allow reassignment for READY_FOR_INVESTIGATION (assigned but agent hasn't started)
      // or UNDER_INVESTIGATION (agent started but hasn't progressed)
      const allowedReassignStatuses = [StatutDemande.READY_FOR_INVESTIGATION, StatutDemande.UNDER_INVESTIGATION];
      if (!(allowedReassignStatuses as readonly string[]).includes(demande.statut ?? '')) {
        return res.status(400).json({ message: "Cette demande ne peut pas être réassignée dans son statut actuel." });
      }

      // Find the existing enquête for this demande
      const [existingEnquete] = await db
        .select()
        .from(enquetesCredit)
        .where(eq(enquetesCredit.demandeId, id))
        .orderBy(desc(enquetesCredit.createdAt))
        .limit(1);

      if (!existingEnquete) {
        return res.status(404).json({ message: "Aucune enquête trouvée pour cette demande." });
      }

      // Only allow reassignment if the agent hasn't started (no startedAt, status is not IN_PROGRESS/SUBMITTED)
      const blockedStatuses = ["IN_PROGRESS", "SUBMITTED", "REVIEWED", "CLOSED"];
      if (existingEnquete.statut && blockedStatuses.includes(existingEnquete.statut)) {
        return res.status(400).json({ message: "L'agent a déjà commencé l'enquête. La réassignation n'est plus possible." });
      }

      // Cancel old reminders
      try {
        const { cancelInvestigationReminders } = await import("../../services/notifications/investigation-reminder-service");
        await cancelInvestigationReminders(existingEnquete.id, "Réassignation de l'enquête");
      } catch {
        // Non-blocking
      }

      // Update the enquête with new agent, reset to ASSIGNED
      const updateValues: Record<string, any> = {
        assignedAgentId: newAgentId,
        assignedAt: new Date(),
        assignedBy: req.session?.user?.id,
        statut: "ASSIGNED",
        startedAt: null,
        updatedAt: new Date(),
      };
      if (priority) updateValues.priority = priority;
      if (dueDate) updateValues.dueDate = new Date(dueDate);

      const [updated] = await db
        .update(enquetesCredit)
        .set(updateValues)
        .where(eq(enquetesCredit.id, existingEnquete.id))
        .returning();

      // If demande was UNDER_INVESTIGATION (agent had started), reset to READY_FOR_INVESTIGATION
      if (demande.statut === StatutDemande.UNDER_INVESTIGATION) {
        await storage.updateDemandeCredit(id, {
          statut: StatutDemande.READY_FOR_INVESTIGATION,
        });
      }

      // Schedule new reminders
      if ((dueDate || existingEnquete.dueDate) && updated.id) {
        try {
          const { generateInvestigationReminderSchedule } = await import("../../services/notifications/investigation-reminder-service");
          await generateInvestigationReminderSchedule(updated.id);
        } catch {
          // Non-blocking
        }
      }

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_reassigned', id, agentId: newAgentId } });
      }

      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur réassignation enquête');
      res.status(500).json({ message: error.message || "Erreur lors de la réassignation" });
    }
  });

  // Validate investigation - changes status from INVESTIGATION_COMPLETE to PENDING_APPROVAL
  /**
   * POST /api/demandes-credit/:id/validate-investigation
   */
  app.post("/api/demandes-credit/:id/validate-investigation", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is INVESTIGATION_COMPLETE
      if (demande.statut !== StatutDemande.INVESTIGATION_COMPLETE) {
        return res.status(400).json({
          message: `Cette demande ne peut pas être validée (statut actuel: ${demande.statut}). Seules les demandes avec enquête terminée peuvent être validées.`
        });
      }

      // Update status to PENDING_APPROVAL
      const updated = await storage.updateDemandeCredit(id, {
        statut: StatutDemande.PENDING_APPROVAL,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_validated', id, statut: StatutDemande.PENDING_APPROVAL } });
      }

      // Audit log
      await logAudit(req, "VALIDATE_INVESTIGATION", "demande_credit", id, {
        previousStatut: demande.statut,
        newStatut: StatutDemande.PENDING_APPROVAL,
      }, "success", "medium");

      res.json({ success: true, demande: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur validation enquête');
      res.status(500).json({ message: error.message || "Erreur lors de la validation de l'enquête" });
    }
  });

  /**
   * POST /api/demandes-credit/:id/payer-frais
   */
  app.post("/api/demandes-credit/:id/payer-frais", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body) as any;
          const user = req.session.user;
          const isMobileMoney = data.methodePaiement === MethodePaiement.MOBILE_MONEY;
          const provider = data.provider?.toUpperCase() as 'MTN' | 'AIRTEL' | undefined;

          // Validation Agence: Le client doit payer dans SON agence
          const demande = await storage.getDemandeCredit(req.params.id);
          if (!demande) return res.status(404).json({ message: "Demande introuvable" });

          const client = await storage.getClient(demande.clientId);
          if (!client) return res.status(404).json({ message: "Client introuvable" });

          // ═══════════════════════════════════════════════════════════════════
          // MOBILE MONEY FLOW (Asynchrone - MTN MoMo / Airtel Money)
          // ═══════════════════════════════════════════════════════════════════
          if (isMobileMoney && provider) {
              // Validation du numéro de téléphone
              const phone = data.phone || data.numeroTelephone || client.telephone;
              if (!phone) {
                  return res.status(400).json({ message: "Numéro de téléphone requis pour le paiement Mobile Money" });
              }

              // Initier la collection Mobile Money
              const paymentIntent = await paymentService.initiateCollection({
                  provider,
                  amount: parseFloat(data.montant),
                  phone,
                  clientId: client.id,
                  agenceId: client.agenceId || undefined,
                  description: `Frais d'engagement - Demande ${demande.numeroDemande}`,
                  idempotencyKey: data.idempotencyKey,
                  metadata: {
                      type: 'ENGAGEMENT_FEE',
                      demandeId: req.params.id,
                      numeroDemande: demande.numeroDemande,
                  }
              }, user?.id);

              // Retourner le payment intent pour le suivi côté frontend
              return res.json({
                  paymentPending: true,
                  paymentIntent: paymentIntent,
                  message: `Veuillez confirmer le paiement de ${data.montant} ${currencySymbol()} sur votre téléphone ${provider}`
              });
          }

          // ═══════════════════════════════════════════════════════════════════
          // CASH / VIREMENT FLOW (Synchrone)
          // ═══════════════════════════════════════════════════════════════════
          let sessionCaisseId: string | undefined;
          let activeSession: any = undefined;

          if (user) {
              // Admin override
              const isManager = req.ability?.can(Actions.MANAGE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, 'all');
              if (data.sessionCaisseId && isManager) {
                  activeSession = await storage.getSessionCaisse(data.sessionCaisseId);
                  if (activeSession && !activeSession.closedAt) {
                      sessionCaisseId = activeSession.id;
                  }
              }

              // Default to user's active session if not overridden or invalid
              if (!sessionCaisseId) {
                  activeSession = await storage.getActiveSessionForUser(user.id);
                  if (activeSession) {
                      sessionCaisseId = activeSession.id;
                  }
              }
          }

          if (!sessionCaisseId) {
              return res.status(400).json({ message: "Aucune caisse ouverte. Vous devez ouvrir votre caisse pour encaisser des frais." });
          }

          // Validation agence
          if (activeSession) {
             const sessionAgenceId = activeSession.agenceId;
             const clientAgenceId = client.agenceId;

             if (sessionAgenceId && clientAgenceId && sessionAgenceId !== clientAgenceId) {
                 return res.status(403).json({ message: "Le client est affilié à une autre agence. Encaissement refusé." });
             }
          }

          const result = await storage.payerFraisEngagement({
              demandeId: req.params.id,
              montant: data.montant.toString(),
              methodePaiement: data.methodePaiement || 'Espèces',
              sessionCaisseId,
              idempotencyKey: data.idempotencyKey
          }, user?.id);

          const wsInstance = getWsInstance();
          if (wsInstance) {
              wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_frais_payes', id: req.params.id } });
              if (user?.agence) {
                  wsInstance.broadcastToAgency(user.agence, { type: "DASHBOARD_UPDATE", payload: {} });
              }
          }

          res.json(result);
      } catch (error: any) {
          logger.error({ err: error }, 'Erreur paiement frais');
          res.status(400).json({ message: error.message });
      }
  });
}
