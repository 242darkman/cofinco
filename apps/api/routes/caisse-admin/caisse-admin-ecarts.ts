import { Actions, Subjects } from "@shared/ability";
import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminEcartsRoutes(router: Router) {

  /**
   * GET /api/caisses/sessions/:id/mm-reconciliation
   * Récupère le statut de réconciliation Mobile Money pour une session
   */
  router.get(
    "/sessions/:id/mm-reconciliation",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id: sessionId } = req.params;
        const { mmBalanceReconciliations, sessionsCaisse } = await import("@shared/schema");
  
        // Récupérer la session pour l'agence
        const [session] = await db.select({
          id: sessionsCaisse.id,
          agenceId: sessionsCaisse.agenceId,
        })
        .from(sessionsCaisse)
        .where(eq(sessionsCaisse.id, sessionId));
  
        if (!session) {
          return res.status(404).json({ error: "Session non trouvée" });
        }
  
        // Récupérer les réconciliations MM de cette session
        const reconciliations = await db.select()
          .from(mmBalanceReconciliations)
          .where(eq(mmBalanceReconciliations.sessionId, sessionId));
  
        const providers = reconciliations.map(r => ({
          provider: r.provider as 'MTN' | 'AIRTEL',
          expectedBalance: Number(r.expectedBalance),
          providerBalance: r.providerBalance ? Number(r.providerBalance) : null,
          ecart: Number(r.ecart),
          status: r.statut as 'MATCHED' | 'DISCREPANCY' | 'API_FAILED',
        }));
  
        const hasDiscrepancy = providers.some(p => p.status === 'DISCREPANCY');
  
        res.json({
          providers,
          hasDiscrepancy,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération MM reconciliation');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/sessions/:id/mm-override
   * Valide un écart Mobile Money avec justification
   */
  router.post(
    "/sessions/:id/mm-override",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id: sessionId } = req.params;
        const { provider, reason } = req.body;
        const userId = req.session.user!.id;
  
        if (!provider || !reason) {
          return res.status(400).json({ error: "Provider et raison requis" });
        }
  
        const { mmBalanceReconciliations } = await import("@shared/schema");
  
        // Mettre à jour le statut de réconciliation
        await db.update(mmBalanceReconciliations)
          .set({
            statut: 'OVERRIDDEN',
            overrideReason: reason,
            overriddenBy: userId,
            updatedAt: new Date(),
          })
          .where(and(
            eq(mmBalanceReconciliations.sessionId, sessionId),
            eq(mmBalanceReconciliations.provider, provider)
          ));
  
        // Log audit
        const { sessionsCaisseAuditLogs, sessionsCaisse } = await import("@shared/schema");
  
        const [session] = await db.select()
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, sessionId));
  
          if (session) {
            await db.insert(sessionsCaisseAuditLogs).values({
              sessionId,
              caisseId: session.caisseId,
              action: 'MM_DISCREPANCY_OVERRIDE',
              userId: userId,
              details: { provider, reason },
              ipAddress: req.ip,
            });
          }
  
        res.json({ message: 'Écart Mobile Money validé' });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur MM override');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - APPROBATION ÉCARTS
  // ============================================================================
  
  const ecartApprovalDecisionSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    comment: z.string().optional(),
  });
  

  /**
   * GET /api/caisses/ecart-approvals
   * Liste les demandes d'approbation d'écarts pour l'agence de l'utilisateur
   */
  router.get(
    "/ecart-approvals",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
        const statut = req.query.statut as string || 'PENDING_APPROVAL';
  
        if (!agenceId) {
          return res.status(400).json({ error: "Agence non spécifiée" });
        }
  
        const { ecartApprovalService } = await import("../../services/caisse/ecart-approval-service");
        const { ecartsApprovalRequests, sessionsCaisse, users } = await import("@shared/schema");
  
        const requests = await db.select({
          id: ecartsApprovalRequests.id,
          sessionId: ecartsApprovalRequests.sessionId,
          caissierId: ecartsApprovalRequests.caissierId,
          soldeTheorique: ecartsApprovalRequests.soldeTheorique,
          montantPhysique: ecartsApprovalRequests.montantPhysique,
          ecart: ecartsApprovalRequests.ecart,
          typeEcart: ecartsApprovalRequests.typeEcart,
          justification: ecartsApprovalRequests.justification,
          niveauRequis: ecartsApprovalRequests.niveauRequis,
          statut: ecartsApprovalRequests.statut,
          createdAt: ecartsApprovalRequests.createdAt,
          caissierNom: users.nom,
          caissierPrenom: users.prenom,
        })
        .from(ecartsApprovalRequests)
        .leftJoin(users, eq(ecartsApprovalRequests.caissierId, users.id))
        .where(and(
          eq(ecartsApprovalRequests.agenceId, agenceId),
          eq(ecartsApprovalRequests.statut, statut)
        ))
        .orderBy(desc(ecartsApprovalRequests.createdAt));
  
        res.json(requests);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération écart approvals');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/ecart-approvals/:id
   * Détails d'une demande d'approbation d'écart
   */
  router.get(
    "/ecart-approvals/:id",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { ecartsApprovalRequests, users, sessionsCaisse, caisses } = await import("@shared/schema");
  
        const [request] = await db.select({
          id: ecartsApprovalRequests.id,
          sessionId: ecartsApprovalRequests.sessionId,
          caissierId: ecartsApprovalRequests.caissierId,
          agenceId: ecartsApprovalRequests.agenceId,
          soldeTheorique: ecartsApprovalRequests.soldeTheorique,
          montantPhysique: ecartsApprovalRequests.montantPhysique,
          ecart: ecartsApprovalRequests.ecart,
          typeEcart: ecartsApprovalRequests.typeEcart,
          justification: ecartsApprovalRequests.justification,
          niveauRequis: ecartsApprovalRequests.niveauRequis,
          statut: ecartsApprovalRequests.statut,
          approverId: ecartsApprovalRequests.approverId,
          approvedAt: ecartsApprovalRequests.approvedAt,
          approvalComment: ecartsApprovalRequests.approvalComment,
          thresholdApplied: ecartsApprovalRequests.thresholdApplied,
          createdAt: ecartsApprovalRequests.createdAt,
          caissierNom: users.nom,
          caissierPrenom: users.prenom,
        })
        .from(ecartsApprovalRequests)
        .leftJoin(users, eq(ecartsApprovalRequests.caissierId, users.id))
        .where(eq(ecartsApprovalRequests.id, id));
  
        if (!request) {
          return res.status(404).json({ error: "Demande non trouvée" });
        }
  
        res.json(request);
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur récupération écart approval');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/ecart-approvals/:id/decision
   * Approuver ou rejeter une demande d'écart
   */
  router.post(
    "/ecart-approvals/:id/decision",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const validation = ecartApprovalDecisionSchema.safeParse(req.body);
  
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const { decision, comment } = validation.data;
        const approverId = req.session.user!.id;
  
        const { ecartApprovalService } = await import("../../services/caisse/ecart-approval-service");
  
        const result = await ecartApprovalService.approveEcart({
          requestId: id,
          approverId,
          decision,
          comment,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
  
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
  
        // Notification WebSocket au caissier
        try {
          const { getWsInstance } = await import("../../ws-server");
          const ws = getWsInstance();
          if (ws && result.request) {
            ws.broadcast({
              type: 'ECART_APPROVAL_DECISION',
              payload: {
                requestId: id,
                decision,
                sessionId: result.request.sessionId,
              },
            });
          }
        } catch { /* WS notification is best-effort */ }
  
        res.json({
          message: decision === 'APPROVED' ? 'Écart approuvé' : 'Écart rejeté',
          request: result.request,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Erreur décision écart');
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - CLÔTURE AGENCE
  // ============================================================================
  
}
