/**
 * Routes finance — segment /enquetes-credit (partie enquetes-credit-detail).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   PATCH  /api/enquetes-credit/:id/soumettre
 *   POST   /api/enquetes-credit/:id/valider
 *   PATCH  /api/enquetes-credit/:id/supervisor-notes
 */
import type { Express } from "express";
import { enquetesCredit, creditPlans } from "@shared/schema";
import { storage } from "../../storage";
import { StatutDemande, StatutEnquete } from "@shared/enum/status-constants";
import type {
  StatutCreditDz,
  StatutDemandeDz,
  DisbursementStatusDz,
  DisbursementChannelDz,
  StatutEnqueteCreditDz,
} from "@shared/enum/enums";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { logger } from "./shared";

export function registerEnquetesCreditDetailRoutes(app: Express) {
  // Agent submits investigation data on an existing IN_PROGRESS enquête
  /**
   * PATCH /api/enquetes-credit/:id/soumettre
   */
  app.patch("/api/enquetes-credit/:id/soumettre", requireAuth, attachAbility, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ message: "Non authentifié" });

      const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.id, id)).limit(1);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      // Only the assigned agent or a supervisor can submit
      if (enquete.assignedAgentId !== userId) {
        const canSupervise = req.ability?.can(Actions.APPROVE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, Subjects.CAISSE);
        if (!canSupervise) {
          return res.status(403).json({ message: "Vous n'êtes pas autorisé à soumettre cette enquête." });
        }
      }

      // Only IN_PROGRESS enquêtes can be submitted
      if (enquete.statut !== "IN_PROGRESS") {
        return res.status(400).json({ message: `Cette enquête ne peut pas être soumise (statut actuel: ${enquete.statut}).` });
      }

      const data = normalizeKeysDeep(req.body) as any;

      const updatePayload: Record<string, any> = {
        statut: "SUBMITTED",
        submittedAt: new Date(),
        updatedAt: new Date(),
      };

      // Investigation data fields
      if (data.categorieActivite) updatePayload.categorieActivite = data.categorieActivite;
      if (data.typeActivite) updatePayload.typeActivite = data.typeActivite;
      if (data.ancienneteActivite != null) updatePayload.ancienneteActivite = parseInt(data.ancienneteActivite) || 0;
      if (data.objetCredit) updatePayload.objetCredit = data.objetCredit;
      if (data.revenuMensuel) updatePayload.revenuMensuel = data.revenuMensuel.toString();
      if (data.typeRevenu) updatePayload.typeRevenu = data.typeRevenu;
      if (data.revenuJournalier) updatePayload.revenuJournalier = data.revenuJournalier.toString();
      if (data.joursTravailMois != null) updatePayload.joursTravailMois = parseInt(data.joursTravailMois) || 26;
      if (data.chargesMensuelles) updatePayload.chargesMensuelles = data.chargesMensuelles.toString();
      if (data.autresCredits) updatePayload.autresCredits = data.autresCredits;
      if (data.garantiesProposees) updatePayload.garantiesProposees = data.garantiesProposees;
      if (data.photosActivite) updatePayload.photosActivite = data.photosActivite;
      if (data.documentsJustificatifs) updatePayload.documentsJustificatifs = data.documentsJustificatifs;
      if (data.observations) updatePayload.observations = data.observations;

      // Agent recommendation
      if (data.agentRecommendation) updatePayload.agentRecommendation = data.agentRecommendation;
      if (data.recommendedAmount) updatePayload.recommendedAmount = data.recommendedAmount.toString();
      if (data.riskLevel) updatePayload.riskLevel = data.riskLevel;
      if (data.riskFactors) updatePayload.riskFactors = data.riskFactors;

      // Client situation (observed by agent, propagated to client after validation)
      if (data.situationMatrimoniale) updatePayload.situationMatrimoniale = data.situationMatrimoniale;
      if (data.personnesCharge != null) updatePayload.personnesCharge = parseInt(data.personnesCharge) || 0;
      if (data.typeHabitation) updatePayload.typeHabitation = data.typeHabitation;

      // Geo data
      if (data.geoLatitude != null) updatePayload.geoLatitude = data.geoLatitude.toString();
      if (data.geoLongitude != null) updatePayload.geoLongitude = data.geoLongitude.toString();
      if (data.geoAccuracy != null) updatePayload.geoAccuracy = data.geoAccuracy.toString();
      if (data.geoTimestamp) updatePayload.geoTimestamp = new Date(data.geoTimestamp);

      const [updated] = await db.update(enquetesCredit).set(updatePayload).where(eq(enquetesCredit.id, id)).returning();

      // Update the associated demande status to INVESTIGATION_COMPLETE
      if (enquete.demandeId) {
        await storage.updateDemandeCredit(enquete.demandeId, {
          statut: StatutDemande.INVESTIGATION_COMPLETE,
        });
      }

      // Cancel deadline reminders — enquête soumise
      try {
        const { cancelInvestigationReminders } = await import("../../services/notifications/investigation-reminder-service");
        await cancelInvestigationReminders(id, "Enquête soumise par l'agent");
      } catch {
        // Non-blocking
      }

      // Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_submitted', id, demandeId: enquete.demandeId, agentId: enquete.assignedAgentId } });

        // Targeted notification to supervisors/approvers
        const userAgence = req.session.user?.agence;
        if (userAgence) {
          const agentName = req.session.user?.nom ? `${req.session.user.prenom || ''} ${req.session.user.nom}`.trim() : 'Agent terrain';
          wsInstance.broadcastToAgency(userAgence, {
            type: "NOTIFICATION",
            payload: {
              message: `Enquête soumise par ${agentName}`,
              subtype: 'investigation_submitted',
              demandeId: enquete.demandeId,
              enqueteId: id,
              recommendation: data.agentRecommendation || null,
            }
          });
          wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
        }
      }

      // Domain event for notification pipeline
      if (enquete.demandeId) {
        try {
          const demande = await storage.getDemandeCredit(enquete.demandeId);
          const agentUser = req.session.user;
          dispatchDomainEvent({
            type: "CREDIT_INVESTIGATION_SUBMITTED",
            data: {
              demandeId: enquete.demandeId,
              numeroDemande: demande?.numeroDemande || '',
              enqueteId: id,
              clientId: enquete.clientId || demande?.clientId || '',
              agentName: agentUser?.nom ? `${agentUser.prenom || ''} ${agentUser.nom}`.trim() : 'Agent terrain',
              agentRecommendation: data.agentRecommendation || undefined,
              riskLevel: data.riskLevel || undefined,
              agenceId: agentUser?.agence || undefined,
            },
            timestamp: new Date(),
          });
        } catch {
          // Non-blocking
        }
      }

      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur soumission enquête agent');
      res.status(500).json({ message: error.message || "Erreur lors de la soumission de l'enquête" });
    }
  });

  /**
   * POST /api/enquetes-credit/:id/valider
   */
  app.post("/api/enquetes-credit/:id/valider", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      const { decision, montant_approuve, commentaire, raison, supervisorNotes } = req.body;

      const enquete = await storage.getEnqueteCredit(req.params.id);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      // IDEMPOTENCE CHECK: Verify enquete is not already processed
      const terminalStatuses = [StatutEnquete.APPROVED, StatutEnquete.REJECTED, StatutEnquete.REDUCED];
      if ((terminalStatuses as readonly string[]).includes(enquete.statut)) {
          return res.status(409).json({
              message: "Cette enquête a déjà été traitée",
              statut_actuel: enquete.statut,
              code: "ALREADY_PROCESSED"
          });
      }

      const decisionLower = decision?.toLowerCase?.() || decision;
      const statutEnquete = decisionLower === 'approved'
        ? StatutEnquete.APPROVED
        : decisionLower === 'rejected'
          ? StatutEnquete.REJECTED
          : StatutEnquete.REDUCED;

      // Validate montant_approuve against plan range if available
      const planId = enquete.creditPlanId;
      if (montant_approuve && planId) {
          const [plan] = await db.select().from(creditPlans).where(eq(creditPlans.id, planId)).limit(1);
          if (plan) {
              const min = parseFloat(plan.montantMin || '0');
              const max = parseFloat(plan.montantMax || 'Infinity');
              const approved = parseFloat(montant_approuve);
              if (approved < min || approved > max) {
                  return res.status(400).json({
                      message: `Le montant approuvé (${approved}) est hors des limites du plan "${plan.nom}" (${min} - ${max})`,
                  });
              }
          }
      }

      const updatedEnquete = await storage.updateEnqueteCredit(req.params.id, {
          statut: statutEnquete,
          recommandation: commentaire || raison,
          supervisorNotes: supervisorNotes || null,
          reviewedAt: new Date(),
          reviewedBy: req.session?.user?.id,
      });

      // Propagate client situation data on approval
      if (statutEnquete === StatutEnquete.APPROVED && enquete.clientId) {
          const clientUpdates: Record<string, any> = {};
          if (enquete.situationMatrimoniale) {
              clientUpdates.situationMatrimoniale = enquete.situationMatrimoniale;
          }
          if (enquete.personnesCharge != null && enquete.personnesCharge !== undefined) {
              clientUpdates.nombrePersonnesCharge = enquete.personnesCharge;
          }
          if (Object.keys(clientUpdates).length > 0) {
              await storage.updateClient(enquete.clientId, clientUpdates);
          }
      }

      // Update Demande status - Workflow: UNDER_INVESTIGATION -> INVESTIGATION_COMPLETE -> PENDING_APPROVAL
      if (enquete.demandeId) {
          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: StatutDemande.INVESTIGATION_COMPLETE as StatutDemandeDz
          });

          await storage.updateDemandeCredit(enquete.demandeId, {
              statut: StatutDemande.PENDING_APPROVAL as StatutDemandeDz,
              montantApprouve: montant_approuve ? montant_approuve.toString() : undefined
          });

          const wsInstance = getWsInstance();
          if (wsInstance) {
               wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'demande_updated', id: enquete.demandeId, statut: StatutDemande.PENDING_APPROVAL } });
          }
      }

      res.json(updatedEnquete);
  });

  // PATCH supervisor notes on an enquête (works regardless of status)
  /**
   * PATCH /api/enquetes-credit/:id/supervisor-notes
   */
  app.patch("/api/enquetes-credit/:id/supervisor-notes", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { supervisorNotes } = req.body;
      const enquete = await storage.getEnqueteCredit(req.params.id);
      if (!enquete) return res.status(404).json({ message: "Enquête non trouvée" });

      const updated = await storage.updateEnqueteCredit(req.params.id, {
        supervisorNotes: supervisorNotes ?? null,
      });
      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur mise à jour supervisor notes');
      res.status(500).json({ message: error.message || "Erreur" });
    }
  });
}
