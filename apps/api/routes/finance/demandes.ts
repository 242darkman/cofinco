/**
 * Routes finance — segment /demandes (partie demandes).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/demandes/:id/reject-from-commission
 */
import type { Express } from "express";
import { storage } from "../../storage";
import { StatutDemande } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { getWsInstance } from "../../ws-server";
import { logger } from "./shared";

export function registerDemandesRoutes(app: Express) {
  // Reject a credit application from Commission Crédit phase
  /**
   * POST /api/demandes/:id/reject-from-commission
   */
  app.post("/api/demandes/:id/reject-from-commission", requireAuth, attachAbility, requireAbility(Actions.REJECT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const { id } = req.params;
      const { motif_rejet } = req.body;

      // Validation
      if (!motif_rejet || typeof motif_rejet !== 'string') {
        return res.status(400).json({ message: "Le motif de rejet est requis" });
      }

      if (motif_rejet.trim().length < 10) {
        return res.status(400).json({ message: "Le motif de rejet doit contenir au moins 10 caractères" });
      }

      if (motif_rejet.length > 500) {
        return res.status(400).json({ message: "Le motif de rejet ne peut pas dépasser 500 caractères" });
      }

      // Get demande
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      // Verify status is eligible for commission rejection
      const statutsEligiblesCommission = [StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION] as string[];
      if (!demande.statut || !statutsEligiblesCommission.includes(demande.statut)) {
        return res.status(400).json({
          message: `Cette demande ne peut pas être rejetée depuis la commission (statut actuel: ${demande.statut}). Seules les demandes approuvées peuvent être rejetées à cette étape.`
        });
      }

      // Update demande status to REJECTED
      const updated = await storage.updateDemandeCredit(id, {
        statut: StatutDemande.REJECTED,
        motifRejet: motif_rejet.trim(),
        dateRejet: new Date()
      });

      // Log audit
      await logAudit(
        req,
        "REJECT_FROM_COMMISSION",
        "demande_credit",
        id,
        {
          numeroDemande: demande.numeroDemande,
          motifRejet: motif_rejet.trim(),
          statusAvant: StatutDemande.APPROVED,
          statusApres: StatutDemande.REJECTED
        },
        "success",
        "high"
      );

      // Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ 
          type: "CREDIT_UPDATE", 
          payload: { 
            type: 'demande_rejected_from_commission', 
            id,
            motif: motif_rejet.trim()
          } 
        });

        const userAgence = req.session.user?.agence;
        if (userAgence) {
          wsInstance.broadcastToAgency(userAgence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Demande rejetée en commission: ${demande.numeroDemande}`,
              user: req.session.user?.nom || 'Système',
              type: 'validation',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({ 
        success: true,
        message: "Demande rejetée avec succès",
        demande: updated
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur rejet commission');
      res.status(500).json({ message: error.message || "Erreur lors du rejet de la demande" });
    }
  });
}
