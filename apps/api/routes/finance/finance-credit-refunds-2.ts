/**
 * Routes finance — segment /finance (partie finance-credit-refunds-2).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/finance/credit-refunds/:id/validate-caisse
 *   GET    /api/finance/credit-refunds/pending-caisse
 *   GET    /api/finance/credit-refunds/pending-caisse/count
 */
import type { Express } from "express";
import { creditRefundRequests, sessionsCaisse, operationsCaisse, clients, demandesCredit } from "@shared/schema";
import { storage } from "../../storage";
import { createMouvementFinancier } from "../../services/ledger";
import { postGlForMouvement } from "../../services/accounting-posting-service";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { initiatePayout } from "../../services/mobile-money/payment-service";
import { logger } from "./shared";

export function registerFinanceCreditRefunds2Routes(app: Express) {
  /**
   * POST /api/finance/credit-refunds/:id/validate-caisse - Caisse validates and executes Cash/Mobile Money payment
   *
   * This endpoint is called by caisse staff to confirm a PENDING_CAISSE refund.
   * It requires an active caisse session and executes the actual payment.
   */
  /**
   * POST /api/finance/credit-refunds/:id/validate-caisse
   */
  app.post("/api/finance/credit-refunds/:id/validate-caisse", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION), async (req, res) => {
    const { sessionCaisseId } = req.body;
    const user = req.session.user!;

    try {
       const refundId = req.params.id;

       // Validate session caisse is required for cash payments
       if (!sessionCaisseId) {
          return res.status(400).json({ message: "Session caisse requise pour valider le paiement" });
       }

       await db.transaction(async (tx) => {
           // 1. Get and validate refund
           const [refundData] = await tx
              .select()
              .from(creditRefundRequests)
              .where(eq(creditRefundRequests.id, refundId));

           if (!refundData) throw new Error("Remboursement non trouvé");
           if (refundData.statut !== 'PENDING_CAISSE') {
              throw new Error(`Le remboursement doit être en attente de caisse (statut actuel: ${refundData.statut})`);
           }

           const amount = Number(refundData.montantRemboursable);
           const paymentMethod = refundData.paymentMethod || 'CASH';

           // 2. Validate session
           const [session] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionCaisseId));
           if (!session || session.closedAt) {
              throw new Error("Session caisse invalide ou fermée");
           }

           // 3. Create caisse operation (outgoing payment)
           const [op] = await tx.insert(operationsCaisse).values({
             sessionId: sessionCaisseId,
             typeOperation: 'WITHDRAWAL_CURRENT',
             montant: amount.toString(),
             methodePaiement: paymentMethod === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'CASH',
             reference: `REFUND-${refundData.id.substring(0,8)}`,
             description: `Remboursement Frais ${paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'} (Ref: ${refundData.id})`,
             clientId: refundData.clientId,
             createdBy: user.id
           }).returning();

           // 4. Create ledger mouvement — pass correct methodePaiement and provider for GL routing
           const mouvementMethode = paymentMethod === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'CASH';
           const mouvementProvider = paymentMethod === 'MOBILE_MONEY' ? (refundData.mobileMoneyProvider || undefined) : undefined;

           const mouvement = await createMouvementFinancier(tx, {
             montant: amount.toString(),
             sens: 'DEBIT',
             sourceModule: 'CAISSE',
             sourceId: op.id,
             typePaiement: 'FEE_REFUND',
             methodePaiement: mouvementMethode,
             ...(mouvementProvider ? { provider: mouvementProvider } : {}),
             sessionCaisseId: sessionCaisseId,
             clientId: refundData.clientId,
             agenceId: refundData.agenceId,
             metadata: {
                type: 'REFUND_PAYMENT',
                refundId: refundData.id,
                operationId: op.id,
                demandeId: refundData.demandeId,
                method: paymentMethod,
                ...(mouvementProvider ? { provider: mouvementProvider } : {}),
             }
           }, user.id);

           const paymentRefString = paymentMethod === 'MOBILE_MONEY'
              ? `MOMO-${op.reference}`
              : `CASH-${op.reference}`;

           // GL Posting (STRICT — failure rolls back transaction)
           if (!refundData.agenceId) {
             throw new Error(`GL posting impossible: no agenceId on refund ${refundData.id}`);
           }
           await postGlForMouvement(tx, mouvement, refundData.agenceId, user.id, {
             refundId: refundData.id,
             operationId: op.id,
             type: 'REFUND_CAISSE_PAYMENT',
           });

           // 5. For MOBILE_MONEY: trigger automatic payout via MoMo API
           if (paymentMethod === 'MOBILE_MONEY') {
             const momoPhone = refundData.mobileMoneyPhone;
             const momoProvider = refundData.mobileMoneyProvider as 'MTN' | 'AIRTEL';
             if (!momoPhone || !momoProvider) {
               throw new Error("Données Mobile Money manquantes sur la demande de remboursement (opérateur ou numéro)");
             }

             const { initiatePayout } = await import("../../services/mobile-money/payment-service");
             await initiatePayout({
               provider: momoProvider,
               amount,
               phone: momoPhone,
               clientId: refundData.clientId,
               agenceId: refundData.agenceId || undefined,
               description: `Restitution frais dossier — ${refundData.id.substring(0,8)}`,
               idempotencyKey: `FEE_REFUND_MOMO_${refundData.id}`,
               metadata: {
                 useCase: 'FEE_REFUND',
                 refundId: refundData.id,
                 demandeId: refundData.demandeId,
               },
             }, user.id);
           }

           // 6. Update refund to PAID
           await tx.update(creditRefundRequests).set({
              statut: 'PAID',
              paidAt: new Date(),
              paidBy: user.id,
              paymentReference: paymentRefString,
              mouvementId: mouvement.id,
              updatedAt: new Date()
           }).where(eq(creditRefundRequests.id, refundData.id));
        });

       // Log audit
       await logAudit(req, "VALIDATE_CAISSE_REFUND", "credit_refund", refundId, { sessionCaisseId }, "success", "medium");

       // Broadcast update
       const wsInstance = getWsInstance();
       if (wsInstance) {
          wsInstance.broadcast({
             type: "REFUND_PAID",
             payload: { refundId }
          });
       }

       const updated = await storage.getCreditRefundRequest(refundId);

       // Domain event: refund paid (CASH/MOBILE_MONEY via caisse)
       if (updated) {
         dispatchDomainEvent({
           type: "CREDIT_REFUND_PAID",
           data: {
             refundId: updated.id,
             reference: updated.id.substring(0, 8).toUpperCase(),
             clientId: updated.clientId,
             montant: Number(updated.montantRemboursable || 0),
             agenceId: updated.agenceId,
           },
           timestamp: new Date(),
         });
       }

       res.json({
          ...(updated as Record<string, unknown>),
          message: 'Paiement validé avec succès. Le remboursement a été effectué.'
       });

    } catch (error: any) {
       logger.error({ err: error }, 'Caisse validation error');
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending-caisse - List refunds awaiting caisse validation
   */
  /**
   * GET /api/finance/credit-refunds/pending-caisse
   */
  app.get("/api/finance/credit-refunds/pending-caisse", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
       const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

       const conditions = [eq(creditRefundRequests.statut, 'PENDING_CAISSE')];
       if (agenceFilter?.agenceId) {
          conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
       }

       const results = await db.select({
          refund: creditRefundRequests,
          demande: demandesCredit,
          client: clients
       })
       .from(creditRefundRequests)
       .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
       .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id))
       .where(and(...conditions))
       .orderBy(desc(creditRefundRequests.updatedAt));

       res.json(results);
    } catch (error: any) {
       res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending-caisse/count - Count refunds awaiting caisse validation
   */
  /**
   * GET /api/finance/credit-refunds/pending-caisse/count
   */
  app.get("/api/finance/credit-refunds/pending-caisse/count", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
       const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

       const conditions = [eq(creditRefundRequests.statut, 'PENDING_CAISSE')];
       if (agenceFilter?.agenceId) {
          conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
       }

       const [result] = await db.select({ count: count() })
          .from(creditRefundRequests)
          .where(and(...conditions));

       res.json({ count: result?.count || 0 });
    } catch (error: any) {
       res.status(500).json({ message: error.message });
    }
  });
}
