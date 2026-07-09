/**
 * Routes finance — segment /demandes-credit (partie demandes-credit-detail-3).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/demandes-credit/:id/envoyer-caisse
 *   GET    /api/demandes-credit/caisse-statuses
 *   POST   /api/demandes-credit/:id/initiate-refund
 *   GET    /api/demandes-credit/:id/refund-status
 *   GET    /api/demandes-credit/:id/enquete
 */
import type { Express } from "express";
import * as schema from "@shared/schema";
import { creditRefundRequests, clients, creditPlans } from "@shared/schema";
import { storage } from "../../storage";
import { StatutDemande } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerDemandesCreditDetail3Routes(app: Express) {
  // ═══════════════════════════════════════════════════════════════════
  // ENVOYER EN CAISSE — Frais d'engagement (CASH seulement)
  // ═══════════════════════════════════════════════════════════════════
  /**
   * POST /api/demandes-credit/:id/envoyer-caisse
   */
  app.post("/api/demandes-credit/:id/envoyer-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
    try {
      const { id: demandeId } = req.params;
      const user = req.session.user;
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      // 1. Validate demande
      const demande = await storage.getDemandeCredit(demandeId);
      if (!demande) return res.status(404).json({ message: "Demande introuvable" });

      if ((demande as any).fraisPaye) {
        return res.status(400).json({ message: "Les frais sont déjà payés pour cette demande" });
      }

      // 2. Get client info
      const client = await storage.getClient(demande.clientId);
      if (!client) return res.status(404).json({ message: "Client introuvable" });

      const agenceId = client.agenceId;
      if (!agenceId) return res.status(400).json({ message: "Agence du client introuvable" });

      // 3. Compute fee amount
      const montant = parseFloat(
        (demande as any).montantFraisEngagement
        || (Number(demande.montantDemande || 0) * 0.10).toString()
      );

      if (!montant || montant <= 0) {
        return res.status(400).json({ message: "Montant des frais invalide" });
      }

      // 4. Check no duplicate pending request
      const { caissePaymentRequests } = await import("@shared/schema");
      const { eq: eqOp, and: andOp } = await import("drizzle-orm");
      const [existing] = await db
        .select({ id: caissePaymentRequests.id })
        .from(caissePaymentRequests)
        .where(andOp(
          eqOp(caissePaymentRequests.sourceType, "demande_credit"),
          eqOp(caissePaymentRequests.sourceId, demandeId),
          eqOp(caissePaymentRequests.statut, "PENDING"),
        ));

      if (existing) {
        return res.status(409).json({ message: "Une demande de paiement est déjà en attente pour cette demande de crédit" });
      }

      // 5. Create caisse payment request
      const { createCaisseRequest } = await import("../../services/caisse-queue-service");

      const request = await createCaisseRequest({
        category: "ENGAGEMENT_FEE",
        direction: "IN",
        agenceId,
        sourceType: "demande_credit",
        sourceId: demandeId,
        clientId: client.id,
        montant,
        label: `Frais d'engagement - ${demande.numeroDemande}`,
        description: `Frais de dossier crédit ${montant.toLocaleString('fr-FR')} ${currencySymbol()} pour ${client.nom} ${client.prenom || ''}`.trim(),
        metadata: {
          numeroDemande: demande.numeroDemande,
          montantCredit: demande.montantDemande,
          clientNom: client.nom,
          clientPrenom: client.prenom,
        },
        createdBy: user.id,
      });

      res.json({
        success: true,
        requestId: request.id,
        message: "Demande envoyée en caisse",
      });
    } catch (error: any) {
      logger.error({ err: error }, "Erreur envoi en caisse frais engagement");
      res.status(400).json({ message: error.message || "Erreur lors de l'envoi en caisse" });
    }
  });

  // Check caisse payment status for multiple credit demands (batch)
  /**
   * GET /api/demandes-credit/caisse-statuses
   */
  app.get("/api/demandes-credit/caisse-statuses", requireAuth, async (req, res) => {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) return res.json({});

      const ids = idsParam.split(",").filter(Boolean).slice(0, 50);
      if (ids.length === 0) return res.json({});

      const { caissePaymentRequests } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, inArray: inArrayOp } = await import("drizzle-orm");

      const rows = await db
        .select({
          sourceId: caissePaymentRequests.sourceId,
          statut: caissePaymentRequests.statut,
        })
        .from(caissePaymentRequests)
        .where(andOp(
          eqOp(caissePaymentRequests.sourceType, "demande_credit"),
          inArrayOp(caissePaymentRequests.sourceId, ids),
          eqOp(caissePaymentRequests.statut, "PENDING"),
        ));

      const result: Record<string, { hasPending: boolean }> = {};
      for (const row of rows) {
        result[row.sourceId] = { hasPending: true };
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur vérification statuts caisse demandes");
      res.status(500).json({ message: error.message || "Erreur interne" });
    }
  });

  // Initiate refund for already rejected demande
  /**
   * POST /api/demandes-credit/:id/initiate-refund
   */
  app.post("/api/demandes-credit/:id/initiate-refund", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body) as { montantRemboursement: number; motif?: string };
      const user = req.session.user;

      if (!user) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // 1. Validate demande exists and is rejected
      const demande = await storage.getDemandeCredit(id);
      if (!demande) {
        return res.status(404).json({ message: "Demande non trouvée" });
      }

      const isRejected = demande.statut === StatutDemande.REJECTED ||
                         demande.statut === StatutDemande.DEFINITIVELY_REJECTED;

      if (!isRejected) {
        return res.status(400).json({ message: "La demande n'est pas en statut rejeté" });
      }

      // 2. Validate fees were paid
      if (!demande.fraisEngagementPayes) {
        return res.status(400).json({ message: "Aucun frais n'a été payé pour cette demande" });
      }

      // 3. Validate refund amount
      const refundAmount = Number(data.montantRemboursement);
      const maxRefund = Number(demande.montantFraisEngagement || 0);

      if (isNaN(refundAmount) || refundAmount <= 0) {
        return res.status(400).json({ message: "Montant de remboursement invalide" });
      }

      if (refundAmount > maxRefund) {
        return res.status(400).json({
          message: `Le montant (${refundAmount}) ne peut pas excéder les frais payés (${maxRefund})`
        });
      }

      // 4. Check if a refund request already exists for this demande
      const existingRefunds = await db.select()
        .from(creditRefundRequests)
        .where(and(
          eq(creditRefundRequests.demandeId, id),
          inArray(creditRefundRequests.statut, ['SUBMITTED', 'APPROVED', 'PENDING_CAISSE'])
        ));

      if (existingRefunds.length > 0) {
        return res.status(400).json({
          message: "Une demande de remboursement est déjà en cours pour ce dossier"
        });
      }

      // 5. Create Refund Request
      const refundRequest = await storage.createCreditRefundRequest({
        demandeId: demande.id,
        clientId: demande.clientId,
        agenceId: user.agenceId!,
        montantEncaisse: demande.montantFraisEngagement?.toString() || '0',
        montantRemboursable: refundAmount.toString(),
        montantNonRemboursable: (maxRefund - refundAmount).toString(),
        statut: 'SUBMITTED',
        motifRejetCredit: demande.motifRejet || undefined,
        motifRemboursement: data.motif || "Remboursement suite rejet de la demande",
        makerId: user.id,
        makerAt: new Date(),
      });

      // 6. Notify via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "CREDIT_UPDATE",
          payload: { type: 'refund_created', demandeId: id, refundId: refundRequest.id }
        });
        if (user.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Demande remboursement créée: ${refundAmount.toLocaleString('fr-FR')} ${currencySymbol()}`,
              user: user.nom || 'Système',
              type: 'finance',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      res.json({
        success: true,
        message: "Demande de remboursement créée avec succès",
        refund: refundRequest
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur création remboursement');
      res.status(500).json({ message: error.message || "Erreur lors de la création du remboursement" });
    }
  });

  // Get refund status for a demande
  /**
   * GET /api/demandes-credit/:id/refund-status
   */
  app.get("/api/demandes-credit/:id/refund-status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Find any refund request for this demande (not cancelled/rejected)
      const refunds = await db.select()
        .from(creditRefundRequests)
        .where(eq(creditRefundRequests.demandeId, id))
        .orderBy(desc(creditRefundRequests.createdAt));

      // Find the most relevant refund (paid > in progress > none)
      const activeRefund = refunds.find(r =>
        ['PAID', 'PENDING_CAISSE', 'APPROVED', 'SUBMITTED'].includes(r.statut)
      );

      if (!activeRefund) {
        return res.json({ refund: null });
      }

      res.json({
        refund: {
          id: activeRefund.id,
          statut: activeRefund.statut,
          montantRemboursable: Number(activeRefund.montantRemboursable),
          montantEncaisse: Number(activeRefund.montantEncaisse),
          paymentMethod: activeRefund.paymentMethod,
          paidAt: activeRefund.paidAt,
          createdAt: activeRefund.createdAt
        }
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération statut remboursement');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/demandes-credit/:id/enquete
   */
  app.get("/api/demandes-credit/:id/enquete", requireAuth, async (req, res) => {
      const enquetesList = await storage.getEnqueteByDemandeId(req.params.id);
      if (!enquetesList || enquetesList.length === 0) return res.json([]);
      const enquete = enquetesList[0];
      // Enrich with credit plan data
      const planId = enquete.creditPlanId;
      let creditPlanData = null;
      if (planId) {
          const [plan] = await db.select().from(creditPlans).where(eq(creditPlans.id, planId)).limit(1);
          if (plan) {
              creditPlanData = {
                  id: plan.id, nom: plan.nom, montantMin: plan.montantMin, montantMax: plan.montantMax,
                  tauxInteret: plan.tauxInteret, dureeValeur: plan.dureeValeur, dureeUnite: plan.dureeUnite,
                  frequenceRemboursement: plan.frequenceRemboursement, collateralRequired: plan.collateralRequired,
                  collateralTypes: plan.collateralTypes, documentsRequis: plan.documentsRequis,
                  maxDebtToIncomeRatio: plan.maxDebtToIncomeRatio, guaranteeDepositPercent: plan.guaranteeDepositPercent,
                  interestMethod: plan.interestMethod, amortizationType: plan.amortizationType,
              };
          }
      } else {
          // Fallback: get plan from the demande
          const demande = await storage.getDemandeCredit(req.params.id);
          if (demande?.creditPlanId) {
              const [plan] = await db.select().from(creditPlans).where(eq(creditPlans.id, demande.creditPlanId)).limit(1);
              if (plan) {
                  creditPlanData = {
                      id: plan.id, nom: plan.nom, montantMin: plan.montantMin, montantMax: plan.montantMax,
                      tauxInteret: plan.tauxInteret, dureeValeur: plan.dureeValeur, dureeUnite: plan.dureeUnite,
                      frequenceRemboursement: plan.frequenceRemboursement, collateralRequired: plan.collateralRequired,
                      collateralTypes: plan.collateralTypes, documentsRequis: plan.documentsRequis,
                      maxDebtToIncomeRatio: plan.maxDebtToIncomeRatio, guaranteeDepositPercent: plan.guaranteeDepositPercent,
                      interestMethod: plan.interestMethod, amortizationType: plan.amortizationType,
                  };
              }
          }
      }
      // Enrich with client situation
      let clientSituation = null;
      if (enquete.clientId) {
          const [client] = await db.select().from(clients).where(eq(clients.id, enquete.clientId)).limit(1);
          if (client) {
              clientSituation = {
                  situationMatrimoniale: client.situationMatrimoniale,
                  nombrePersonnesCharge: client.nombrePersonnesCharge,
                  statutLogement: client.statutLogement,
              };
          }
      }
      res.json({ ...enquete, creditPlan: creditPlanData, clientSituation });
  });
}
