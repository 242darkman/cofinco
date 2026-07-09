/**
 * Routes finance — segment /finance (partie finance-credit-refunds).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   POST   /api/finance/credit-refunds/:id/pay
 */
import type { Express } from "express";
import { comptes, creditRefundRequests, coffresForts, transactionsCompte } from "@shared/schema";
import { storage } from "../../storage";
import { createMouvementFinancier } from "../../services/ledger";
import { postGlForMouvement } from "../../services/accounting-posting-service";
import { getComptesByClient } from "../../storage/finance";
import { StatutCompte, TypeCompte } from "@shared/enum/status-constants";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { currencySymbol } from "@shared/config/currency";
import { logger } from "./shared";

export function registerFinanceCreditRefundsRoutes(app: Express) {
  /**
   * POST /api/finance/credit-refunds/:id/pay - Execute Payment (Cash, Account or Mobile Money)
   *
   * Flow:
   * - ACCOUNT: Direct transfer to client's current account (immediate)
   * - CASH/MOBILE_MONEY: Requires caisse validation - sets status to PENDING_CAISSE
   */
  /**
   * POST /api/finance/credit-refunds/:id/pay
   */
  app.post("/api/finance/credit-refunds/:id/pay", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.REMBOURSEMENT), async (req, res) => {
    const { method, sessionCaisseId, provider, phoneNumber } = req.body; // method: 'CASH' | 'ACCOUNT' | 'MOBILE_MONEY'
    const user = req.session.user!;

    try {
       const refundId = req.params.id;

       // Get refund first
       const [refundData] = await db
          .select()
          .from(creditRefundRequests)
          .where(eq(creditRefundRequests.id, refundId));

       if (!refundData) {
          return res.status(404).json({ message: "Remboursement non trouvé" });
       }
        if (refundData.statut !== 'APPROVED') {
           return res.status(400).json({ message: `Le remboursement doit être approuvé avant paiement (statut actuel: ${refundData.statut})` });
        }

        // Validate MOBILE_MONEY requirements
        if (method === 'MOBILE_MONEY') {
          if (!provider || !['MTN', 'AIRTEL'].includes(provider)) {
            return res.status(400).json({ message: "Opérateur mobile requis (MTN ou AIRTEL)" });
          }
          if (!phoneNumber || phoneNumber.trim().length < 8) {
            return res.status(400).json({ message: "Numéro de téléphone valide requis pour le paiement Mobile Money" });
          }
        }

        // Validate ACCOUNT requirements: pre-check active current account
        if (method === 'ACCOUNT') {
          const clientAccounts = await storage.getComptesByClient(refundData.clientId);
          const courantAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.CURRENT && c.statut === StatutCompte.ACTIVE);
          if (!courantAccount) {
            return res.status(400).json({ message: "Le client n'a aucun compte courant actif. Veuillez choisir un autre mode de paiement." });
          }
        }

        // For CASH or MOBILE_MONEY: Set to PENDING_CAISSE and notify caisse
        if (method === 'CASH' || method === 'MOBILE_MONEY') {
          // Update to PENDING_CAISSE status
           await db.update(creditRefundRequests).set({
              statut: 'PENDING_CAISSE',
              paymentMethod: method,
              ...(method === 'MOBILE_MONEY' ? {
                mobileMoneyProvider: provider,
                mobileMoneyPhone: phoneNumber.trim(),
              } : {}),
              updatedAt: new Date()
           }).where(eq(creditRefundRequests.id, refundId));

          // CASH: Create caisse payment request (queue)
          if (method === 'CASH' && refundData.agenceId) {
            const { createCaisseRequest } = await import("../../services/caisse-queue-service");
            const clientInfo = refundData.clientId ? await storage.getClient(refundData.clientId) : null;

            await createCaisseRequest({
              category: "FEE_REFUND",
              direction: "OUT",
              agenceId: refundData.agenceId,
              sourceType: "credit_refund",
              sourceId: refundId,
              clientId: refundData.clientId || undefined,
              montant: Number(refundData.montantRemboursable),
              label: `Restitution frais dossier`,
              description: clientInfo
                ? `Remboursement ${Number(refundData.montantRemboursable).toLocaleString('fr-FR')} ${currencySymbol()} à ${clientInfo.nom} ${clientInfo.prenom || ''}`.trim()
                : undefined,
              metadata: {
                demandeId: refundData.demandeId,
                clientNom: clientInfo?.nom,
                clientPrenom: clientInfo?.prenom,
              },
              createdBy: user.id,
            });
          }

          // Log Audit
          await logAudit(req, "REFUND_PENDING_CAISSE", "credit_refund", refundId, { method }, "success", "medium");

          // Broadcast WebSocket notification for caisse
          const wsInstance = getWsInstance();
          if (wsInstance) {
             wsInstance.broadcast({
                type: "REFUND_PENDING_CAISSE",
                payload: {
                   refundId,
                   method,
                   amount: refundData.montantRemboursable,
                   agenceId: refundData.agenceId,
                   clientId: refundData.clientId
                }
             });
          }

          const updated = await storage.getCreditRefundRequest(refundId);
          return res.json({
             ...(updated as Record<string, unknown>),
             message: method === 'CASH'
                ? 'Remboursement envoyé en caisse. Le caissier traitera le paiement.'
                : 'Remboursement Mobile Money en attente de validation caisse.'
          });
       }

       // For ACCOUNT: Execute immediate payment (existing flow)
       await db.transaction(async (tx) => {
          // 1. Lock and Get Refund
          const [refundDataLocked] = await tx
             .select()
             .from(creditRefundRequests)
             .where(eq(creditRefundRequests.id, refundId));

          if (!refundDataLocked) throw new Error("Refund not found");
          if (refundDataLocked.statut !== 'APPROVED') throw new Error("Refund must be APPROVED before payment");

          const amount = Number(refundDataLocked.montantRemboursable);

          // 2. Prepare Ledger Transaction
          let mouvement;
          let paymentRefString = '';

          // Credit Client Account (ACCOUNT method only at this point)
          const clientAccounts = await storage.getComptesByClient(refundDataLocked.clientId);
          const courantAccount = clientAccounts.find(c => c.typeCompte === TypeCompte.CURRENT && c.statut === StatutCompte.ACTIVE);
          if (!courantAccount) throw new Error("No active current account found for client");

          // Get client for agency info
          const client = await storage.getClient(refundDataLocked.clientId);
          if (!client) throw new Error("Client not found");

          // CRITICAL: Always use the CLIENT'S agency for the source of funds
          const sourceAgenceId = client.agenceId;
          if (!sourceAgenceId) throw new Error("Client has no agency assigned");

          // Identify Agency Safe (Coffre-Fort) for Source of Funds
          const [agencyCoffre] = await tx.select()
              .from(coffresForts)
              .where(eq(coffresForts.ownerId, sourceAgenceId));
          if (!agencyCoffre) throw new Error("Agency safe not found for refund source");

          // Check Safe Balance
          const safeBalance = Number(agencyCoffre.solde || 0);
          const refundAmount = Number(amount);
          if (safeBalance < refundAmount) {
              throw new Error(`Insufficient funds in agency safe (Required: ${refundAmount}, Available: ${safeBalance})`);
          }

          // DEBIT SAFE (Source)
          await tx.update(coffresForts)
            .set({
                solde: sql`${coffresForts.solde} - ${refundAmount}`,
                updatedAt: new Date()
            })
            .where(eq(coffresForts.id, agencyCoffre.id));

          // Create Debit Mouvement (Coffre)
          const coffreMouvement = await createMouvementFinancier(tx, {
            montant: refundAmount.toString(),
            sens: 'DEBIT',
            sourceModule: 'COFFRE',
            typePaiement: 'FEE_REFUND',
            methodePaiement: 'TRANSFER',
            sourceId: agencyCoffre.id,
            agenceId: refundDataLocked.agenceId,
            metadata: {
                type: 'REFUND_SOURCE',
                refundId: refundDataLocked.id,
                coffreId: agencyCoffre.id,
                description: `Source pour rbt frais (Ref: ${refundDataLocked.id})`
            }
          }, user.id);

          // CREDIT CLIENT ACCOUNT (Destination)
          mouvement = await createMouvementFinancier(tx, {
            montant: refundAmount.toString(),
            sens: 'CREDIT',
            sourceModule: 'SYSTEME',
            typePaiement: 'FEE_REFUND',
            methodePaiement: 'TRANSFER',
            clientId: refundDataLocked.clientId,
            compteId: courantAccount.id,
            metadata: {
                type: 'REFUND_PAYMENT',
                refundId: refundDataLocked.id,
                demandeId: refundDataLocked.demandeId,
                sourceMouvementId: coffreMouvement.id
            }
          }, user.id);

          // Update Client Account Balance
          const [updatedAccount] = await tx.update(comptes)
              .set({
                  soldeCourant: sql`${comptes.soldeCourant} + ${refundAmount}`,
                  updatedAt: new Date()
              })
              .where(eq(comptes.id, courantAccount.id))
              .returning();

          // Create Transaction Record
          await tx.insert(transactionsCompte).values({
            compteId: courantAccount.id,
            mouvementId: mouvement.id,
            typePaiement: 'DEPOSIT_CURRENT',
            sens: 'CREDIT', // Refund is money coming in
            montant: refundAmount.toString(),
            soldeApres: updatedAccount.soldeCourant,
            methodePaiement: 'TRANSFER',
            observations: `Remboursement Frais Dossier (Ref: ${refundDataLocked.id})`,
            createdBy: user.id
          });

          // GL Posting for coffre debit (STRICT — failure rolls back transaction)
          if (!refundDataLocked.agenceId) {
            throw new Error(`GL posting impossible: no agenceId on refund ${refundDataLocked.id}`);
          }
          await postGlForMouvement(tx, coffreMouvement, refundDataLocked.agenceId, user.id, {
            refundId: refundDataLocked.id,
            type: 'REFUND_SOURCE',
          });

          // GL Posting for client account credit (STRICT)
          await postGlForMouvement(tx, mouvement, refundDataLocked.agenceId, user.id, {
            refundId: refundDataLocked.id,
            type: 'REFUND_PAYMENT',
          });

          paymentRefString = `VIREMENT-${mouvement.reference}`;

          // Update Refund Status to PAID
          await tx.update(creditRefundRequests).set({
             statut: 'PAID',
             paidAt: new Date(),
             paidBy: user.id,
             paymentMethod: method,
             paymentReference: paymentRefString,
             mouvementId: mouvement.id
          }).where(eq(creditRefundRequests.id, refundDataLocked.id));
          
       });

       const updated = await storage.getCreditRefundRequest(refundId);

       // Domain event: refund paid (ACCOUNT method)
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

       res.json(updated);

    } catch (error: any) {
       logger.error({ err: error }, 'Payment error');
       res.status(500).json({ message: error.message });
    }
  });
}
