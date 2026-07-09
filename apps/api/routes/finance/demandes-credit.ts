/**
 * Routes finance — segment /demandes-credit (partie demandes-credit).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/demandes-credit/counts
 *   GET    /api/demandes-credit
 *   POST   /api/demandes-credit
 */
import type { Express } from "express";
import { insertDemandeCreditSchema, demandesCredit } from "@shared/schema";
import { storage } from "../../storage";
import { StatutDemande } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { db } from "../../db";
import {
  validerCoherenceFrequenceDuree,
  calculerNombreEcheances,
  type FrequenceRemboursement as FrequenceRemboursementType,
  type DureeUnite
} from "@shared/config/credit-durations";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerDemandesCreditRoutes(app: Express) {
  // Aggregation endpoint for dashboard badges
  /**
   * GET /api/demandes-credit/counts
   */
  app.get("/api/demandes-credit/counts", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

        // Base query - only select status and count
        const query = db.select({
            status: demandesCredit.statut,
            count: count()
        })
        .from(demandesCredit)
        .groupBy(demandesCredit.statut);

        // Apply Agency Filter - utilise directement l'agenceId (plus sûr)
        if (agenceFilter?.agenceId) {
             query.where(eq(demandesCredit.agenceId, agenceFilter.agenceId));
        }
        
        const results = await query;

        // Map to frontend tabs using standardized EN enum values
        // toProcess = PENDING_FEES
        // investigation = READY_FOR_INVESTIGATION + UNDER_INVESTIGATION + INVESTIGATION_COMPLETE
        // approval = PENDING_APPROVAL
        // commission = APPROVED + APPROVED_AFTER_REEVALUATION
        // reevaluation = REEVALUATION_IN_PROGRESS

        const mapping = {
            toProcess: 0,
            investigation: 0,
            approval: 0,
            commission: 0,
            reevaluation: 0,
            archives: 0
        };

        for (const row of results) {
            const s = row.status || '';
            const c = Number(row.count);

            if (([StatutDemande.PENDING_FEES] as readonly string[]).includes(s)) {
                mapping.toProcess += c;
            } else if (([StatutDemande.READY_FOR_INVESTIGATION, StatutDemande.UNDER_INVESTIGATION, StatutDemande.INVESTIGATION_COMPLETE] as readonly string[]).includes(s)) {
                mapping.investigation += c;
            } else if (s === StatutDemande.PENDING_APPROVAL) {
                mapping.approval += c;
            } else if (([StatutDemande.APPROVED, StatutDemande.APPROVED_AFTER_REEVALUATION] as readonly string[]).includes(s)) {
                mapping.commission += c;
            } else if (s === StatutDemande.REEVALUATION_IN_PROGRESS) {
                mapping.reevaluation += c;
            } else if (([StatutDemande.REJECTED, StatutDemande.CANCELLED, StatutDemande.DEFINITIVELY_REJECTED, StatutDemande.DELETED] as readonly string[]).includes(s)) {
                mapping.archives += c;
            }
        }

        res.json(mapping);
      } catch (error: any) {
          logger.error({ err: error }, 'Error fetching credit counts');
          res.status(500).json({ message: "Erreur lors du comptage des dossiers" });
      }
  });

  /**
   * GET /api/demandes-credit
   */
  app.get("/api/demandes-credit", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const includeDeleted = req.query.includeDeleted === 'true';
      const filter = agenceFilter ? { agenceId: agenceFilter.agenceId, includeDeleted } : { includeDeleted };

      const demandes = await storage.getAllDemandes(filter);

      res.json(demandes);
  });

  // Create demande credit (roles: admin, chef, credit, superviseur, terrain)
  /**
   * POST /api/demandes-credit
   */
  app.post("/api/demandes-credit", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.DEMANDE_CREDIT), requireAgenceAccess(), async (req, res) => {
      const data = normalizeKeysDeep(req.body) as any;

      // Auto-generate numeroDemande if not provided
      if (!data.numeroDemande) {
          // Format: DEM-YYYYMMDD-XXXX
          const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
          const { randomInt } = await import('crypto');
          const randomSuffix = randomInt(1000, 10000).toString();
          data.numeroDemande = `DEM-${dateStr}-${randomSuffix}`;
      }

      // Plan de crédit obligatoire
      if (!data.creditPlanId) {
        return res.status(400).json({ message: "Un plan de crédit est requis pour créer une demande" });
      }

      // Validation coherence frequence/duree
      if (data.frequenceRemboursement && data.dureeValeur && data.dureeUnite) {
        const resultatValidation = validerCoherenceFrequenceDuree(
          data.frequenceRemboursement as FrequenceRemboursementType,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );

        if (!resultatValidation.isValid) {
          return res.status(400).json({
            message: resultatValidation.debugMessage || "Durée invalide pour cette fréquence",
            code: resultatValidation.errorCode || "INVALID_DURATION_FREQUENCY"
          });
        }

        // Calculer automatiquement le nombre d'echeances
        data.nombreEcheances = calculerNombreEcheances(
          data.frequenceRemboursement as FrequenceRemboursementType,
          Number(data.dureeValeur),
          data.dureeUnite as DureeUnite
        );
      }

      // Nettoyage des champs numériques optionnels (évite "invalid input syntax for type numeric: ''")
      const optionalNumericFields = ['revenusMensuels', 'revenuJournalier', 'chargesMensuelles', 'montantApprouve', 'montantFraisEngagement'];
      for (const field of optionalNumericFields) {
        if (data[field] === "") {
          data[field] = null;
        }
      }

      // Always enforce the client's agency
      if (data.clientId) {
        const client = await storage.getClient(data.clientId);
        if (client) {
          data.agenceId = client.agenceId;
        }
      }

      // Validation du plan de crédit (obligatoire, déjà vérifié L1287)
      const plan = await storage.getCreditPlan(data.creditPlanId);
      if (!plan) {
        return res.status(400).json({ message: "Plan de crédit introuvable" });
      }
      if (!plan.isActive) {
        return res.status(400).json({ message: "Ce plan de crédit n'est plus actif" });
      }
      const now = new Date();
      if (plan.effectiveFrom && new Date(plan.effectiveFrom) > now) {
        return res.status(400).json({ message: "Ce plan n'est pas encore en vigueur" });
      }
      if (plan.effectiveTo && new Date(plan.effectiveTo) < now) {
        return res.status(400).json({ message: "Ce plan de crédit a expiré" });
      }
      const montant = parseFloat(data.montantDemande);
      if (plan.montantMin && montant < parseFloat(plan.montantMin)) {
        return res.status(400).json({ message: `Montant minimum pour ce plan : ${plan.montantMin}` });
      }
      if (plan.montantMax && montant > parseFloat(plan.montantMax)) {
        return res.status(400).json({ message: `Montant maximum pour ce plan : ${plan.montantMax}` });
      }

      const parsed = insertDemandeCreditSchema.parse(data);

      // Vérifier agence du client
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter?.agenceId) {
        const client = await storage.getClient(parsed.clientId);
        if (!client || client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      const demande = await storage.createDemandeCredit(parsed);
      
      
      // Notify Admins
       const wsInstance = getWsInstance();
      const userAgence = req.session.user?.agence;

      if (wsInstance && userAgence) {
         // Broadcast only to this agency
         wsInstance.broadcastToAgency(userAgence, {
            type: "NOTIFICATION",
            payload: {
               message: `Nouvelle demande de crédit #${demande.id}`,
               targetRole: "admin"
            }
         });
         // Update Dashboard & Credits List
         wsInstance.broadcastToAgency(userAgence, { type: "DASHBOARD_UPDATE", payload: {} });
         wsInstance.broadcastToAgency(userAgence, { type: "CREDIT_UPDATE", payload: {} });
         
         // Activité en temps réel
         wsInstance.broadcastToAgency(userAgence, {
           type: "LIVE_ACTIVITY",
           payload: {
             action: `Nouveau crédit: ${Number(parsed.montantDemande || 0).toLocaleString()} ${currencySymbol()}`,
             user: req.session.user?.nom || 'Système',
             type: 'credit',
             timestamp: new Date().toISOString()
           }
         });
      }
      
      // Domain event: credit request created
      dispatchDomainEvent({
        type: "CREDIT_REQUEST_CREATED",
        data: {
          demandeId: demande.id,
          numeroDemande: demande.numeroDemande,
          clientId: parsed.clientId,
          montantDemande: Number(parsed.montantDemande || 0),
          agenceId: req.session.user?.agenceId,
          createdByUserId: req.session.user?.id,
          createdByName: req.session.user?.nom,
        },
        timestamp: new Date(),
      });

      res.json(demande);
  });
}
