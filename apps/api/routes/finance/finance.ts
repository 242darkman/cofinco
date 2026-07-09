/**
 * Routes finance — segment /finance (partie finance).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/finance/credit-refunds
 *   GET    /api/finance/credit-refunds/pending/count
 *   GET    /api/finance/credit-refunds/:id
 *   POST   /api/finance/credit-refunds/:id/approve
 */
import type { Express } from "express";
import * as schema from "@shared/schema";
import { creditRefundRequests, clients, demandesCredit } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { SystemRole } from "@shared/types/roles";
import { logger } from "./shared";

export function registerFinanceRoutes(app: Express) {
  // ============================================================================
  // CREDIT REFUND WORKFLOW API
  // ============================================================================

  /**
   * GET /api/finance/credit-refunds - List refunds with filters
   */
  /**
   * GET /api/finance/credit-refunds
   */
  app.get("/api/finance/credit-refunds", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      let query = db.select({
        refund: creditRefundRequests,
        demande: demandesCredit,
        client: {
          id: clients.id,
          nom: schema.users.nom,
          prenom: schema.users.prenom,
          phone: schema.users.telephone,
        }
      })
      .from(creditRefundRequests)
      .innerJoin(demandesCredit, eq(creditRefundRequests.demandeId, demandesCredit.id))
      .innerJoin(clients, eq(creditRefundRequests.clientId, clients.id))
      .innerJoin(schema.users, eq(clients.userId, schema.users.id));

      const conditions = [];
      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      if (req.query.statut) {
        conditions.push(eq(creditRefundRequests.statut, req.query.statut as typeof creditRefundRequests.statut.enumValues[number]));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      
      const results = await query.orderBy(desc(creditRefundRequests.createdAt));
      res.json(results);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching refunds');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/pending/count - Count pending refunds (SUBMITTED + APPROVED)
   * Used for sidebar badge notification
   */
  /**
   * GET /api/finance/credit-refunds/pending/count
   */
  app.get("/api/finance/credit-refunds/pending/count", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REMBOURSEMENT), requireAgenceAccess("agenceId"), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      const conditions = [
        // Count both SUBMITTED (needs approval) and APPROVED (needs payment)
        sql`${creditRefundRequests.statut} IN ('SUBMITTED', 'APPROVED')`
      ];

      if (agenceFilter?.agenceId) {
        conditions.push(eq(creditRefundRequests.agenceId, agenceFilter.agenceId));
      }

      const [result] = await db
        .select({ count: count() })
        .from(creditRefundRequests)
        .where(and(...conditions));

      res.json({ count: result?.count || 0 });
    } catch (error: any) {
      logger.error({ err: error }, 'Error counting pending refunds');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/finance/credit-refunds/:id - Get Single Refund Details
   */
  /**
   * GET /api/finance/credit-refunds/:id
   */
  app.get("/api/finance/credit-refunds/:id", requireAuth, async (req, res) => {
     try {
        const refund = await storage.getCreditRefundRequest(req.params.id);
        if (!refund) return res.status(404).json({ message: "Refund request not found" });
        res.json(refund);
     } catch (error: any) {
        res.status(500).json({ message: error.message });
     }
  });

  /**
   * POST /api/finance/credit-refunds/:id/approve - Approve Refund Request
   * Requires N+1 Validation (Checker must be different from Maker)
   */
  /**
   * POST /api/finance/credit-refunds/:id/approve
   */
  app.post("/api/finance/credit-refunds/:id/approve", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.REMBOURSEMENT), async (req, res) => {
     try {
       const user = req.session.user!;
       const refund = await storage.getCreditRefundRequest(req.params.id);
       
       if (!refund) return res.status(404).json({ message: "Refund request not found" });
       
       if (refund.statut !== 'SUBMITTED') {
         return res.status(400).json({ message: `Cannot approve refund in status '${refund.statut}'` });
       }

       if (refund.makerId === user.id && user.role !== SystemRole.ADMIN) {
         return res.status(403).json({ message: "Segregation of Duties: Maker cannot approve their own request." });
       }

       const updated = await storage.updateCreditRefundRequest(refund.id, {
         statut: 'APPROVED',
         checkerId: user.id,
         checkerAt: new Date(),
         checkerDecision: 'APPROVED'
       });
       
       // Log Audit
       await logAudit(req, "APPROVE_REFUND", "credit_refund", refund.id, {}, "success", "medium");

       // Domain event: refund approved
       dispatchDomainEvent({
         type: "CREDIT_REFUND_APPROVED",
         data: {
           refundId: refund.id,
           reference: refund.id.substring(0, 8).toUpperCase(),
           clientId: refund.clientId,
           montant: Number(refund.montantRemboursable || 0),
           agenceId: refund.agenceId,
         },
         timestamp: new Date(),
       });

       // WebSocket: notify for real-time badge update
       const wsInstance = getWsInstance();
       if (wsInstance) {
         wsInstance.broadcast({
           type: "CREDIT_UPDATE",
           payload: { type: 'refund_approved', refundId: refund.id, demandeId: refund.demandeId }
         });
       }

       res.json(updated);
     } catch (error: any) {
       res.status(500).json({ message: error.message });
     }
  });
}
