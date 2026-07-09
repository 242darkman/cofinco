/**
 * Routes finance — segment /demandes-credit (partie demandes-credit-detail-4).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/demandes-credit/:id/scoring
 *   POST   /api/demandes-credit/:id/recalculer-score
 *   GET    /api/demandes-credit/:id/timeline
 */
import type { Express } from "express";
import { credits } from "@shared/schema";
import { storage } from "../../storage";
import { StatutDemande, StatutEnquete, DureeUnite as DureeUniteEnum } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { db } from "../../db";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerDemandesCreditDetail4Routes(app: Express) {
  // Obtenir le détail du scoring pour une demande
  /**
   * GET /api/demandes-credit/:id/scoring
   */
  app.get("/api/demandes-credit/:id/scoring", requireAuth, async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance } = await import('../../services/microfinance-scoring');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === DureeUniteEnum.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === DureeUniteEnum.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: demande.clientId,
        montantDemande: parseFloat(demande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: demande.revenusMensuels ? parseFloat(demande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: demande.chargesMensuelles ? parseFloat(demande.chargesMensuelles.toString()) : undefined
      });

      res.json({
        demandeId: demande.id,
        numeroDemande: demande.numeroDemande,
        ...scoringResult
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur calcul scoring');
      res.status(500).json({ message: error.message || "Erreur lors du calcul du scoring" });
    }
  });

  // Recalculer le score d'une demande
  /**
   * POST /api/demandes-credit/:id/recalculer-score
   */
  app.post("/api/demandes-credit/:id/recalculer-score", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.DEMANDE_CREDIT), async (req, res) => {
    try {
      const demande = await storage.getDemandeCredit(req.params.id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const { calculerScoreMicrofinance } = await import('../../services/microfinance-scoring');
      const { recalculateClientScore } = await import('../../services/scoring-engine');

      // Convertir la durée en mois
      let dureeMois = demande.dureeValeur || 1;
      if (demande.dureeUnite === DureeUniteEnum.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (demande.dureeUnite === DureeUniteEnum.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: demande.clientId,
        montantDemande: parseFloat(demande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: demande.revenusMensuels ? parseFloat(demande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: demande.chargesMensuelles ? parseFloat(demande.chargesMensuelles.toString()) : undefined
      });

      // Mettre à jour le score de la demande
      await storage.updateDemandeCredit(demande.id, {
        scoreCredit: scoringResult.score
      });

      // Recalculer le score global du client via le scoring engine
      await recalculateClientScore(demande.clientId);

      res.json({
        message: "Score recalculé avec succès",
        nouveauScore: scoringResult.score,
        grade: scoringResult.grade,
        recommendation: scoringResult.recommendation,
        details: scoringResult.details
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur recalcul scoring');
      res.status(500).json({ message: error.message || "Erreur lors du recalcul du scoring" });
    }
  });

  // Timeline d'une demande
  /**
   * GET /api/demandes-credit/:id/timeline
   */
  app.get("/api/demandes-credit/:id/timeline", requireAuth, async (req, res) => {
      try {
          // Allow fetching timeline for deleted/archived requests
          const demande = await storage.getDemandeCredit(req.params.id, true);
          if (!demande) return res.status(404).json({ message: "Demande non trouvée" });

          const timeline = [];

          // 1. Demande Créée
          if (demande.createdAt) {
              timeline.push({
                  id: 'creation',
                  type: 'DEMANDE',
                  date: demande.createdAt,
                  titre: 'Demande Créée',
                  description: `Dossier N° ${demande.numeroDemande} initié`,
                  statut: 'Créée'
              });
          }

          // 2. Frais
          if (demande.fraisEngagementPayes) {
             timeline.push({
                 id: 'frais',
                 type: 'FRAIS',
                 date: demande.updatedAt || demande.createdAt,
                 titre: 'Frais Payés',
                 description: 'Frais de dossier réglés',
                 statut: 'PAID'
             });
          }

          // 3. Enquête
          const enquetes = await storage.getEnqueteByDemandeId(demande.id);
          const enquete = enquetes?.[0];
          if (enquete) {
              const enqueteStatus = enquete.statut || StatutEnquete.IN_PROGRESS;

              timeline.push({
                  id: 'enquete_start',
                  type: 'ENQUETE',
                  date: enquete.createdAt,
                  titre: 'Enquête Terrain',
                  description: `Enquête assignée (${enquete.typeActivite || 'Activité'})`,
                  statut: enqueteStatus
              });
          }

          // 4. Decision (Comité)
          // Check if status implies approval or rejection using enum constants
          const decisionStatuses = [
            StatutDemande.APPROVED,
            StatutDemande.APPROVED_AFTER_REEVALUATION,
            StatutDemande.REJECTED,
            StatutDemande.DEFINITIVELY_REJECTED
          ];
          const isDecided = (decisionStatuses as readonly string[]).includes(demande.statut ?? '');
          if (isDecided || demande.dateRejet) {
              const isRejected = demande.statut === StatutDemande.REJECTED || demande.statut === StatutDemande.DEFINITIVELY_REJECTED;
              timeline.push({
                  id: 'decision',
                  type: 'DECISION',
                  date: demande.dateRejet || demande.updatedAt || new Date(),
                  titre: isRejected ? 'Demande Rejetée' : 'Approbation Comité',
                  description: isRejected ? (demande.motifRejet || 'Dossier rejeté') : `Montant approuvé: ${Number(demande.montantApprouve || demande.montantDemande).toLocaleString('fr-FR')} ${currencySymbol()}`,
                  statut: demande.statut
              });
          }

          // 5. Décaissement (Link via Credit)
          // Use direct DB query as storage method might be missing for this specific lookup
          const [credit] = await db.select().from(credits).where(eq(credits.demandeId, demande.id));
          
          if (credit) {
              timeline.push({
                 id: 'decaissement',
                 type: 'DECAISSEMENT',
                 date: credit.dateDebut || credit.createdAt || new Date(),
                 titre: 'Crédit Décaissé',
                 description: `Crédit N° ${credit.numeroCredit} actif.`,
                 statut: StatutDemande.DISBURSED
              });
          }

          // 6. Suppression
          if (demande.deletedAt) {
              timeline.push({
                  id: 'suppression',
                  type: 'SUPPRESSION',
                  date: demande.deletedAt,
                  titre: 'Demande Supprimée',
                  description: 'Le dossier a été supprimé.',
                  statut: StatutDemande.DELETED
              });
          }

          // Sort by date
          timeline.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

          res.json({ success: true, timeline, demande });

      } catch (error: any) {
          logger.error({ err: error }, 'Timeline error');
          res.status(500).json({ message: error.message });
      }
  });
}
