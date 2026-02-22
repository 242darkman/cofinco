/**
 * Routes additionnelles pour la gestion avancée des caisses
 * Force close, liquidation intelligente, historique global, et clôture flexible
 */

import { Router } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:CaisseAdmin');
import { z } from "zod";
import { caisseAdminService } from "../services/caisse-admin-service";
import { caisseLiquidationService } from "../services/caisse-liquidation-service";
import { getCaisseHistorique, getCaisseHistoriqueSummary } from "../services/caisse/session-service";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../db";
import { sessionsCaisseAuditLogs, denominationTemplates, caisses } from "@shared/schema/finance";
import { caisseSecurityCodes } from "@shared/schema/operations";
import { users, userRoles, coffresForts, agences } from "@shared/schema";
import { eq, desc, and, gte, lte, sql, count, isNull, isNotNull, or } from "drizzle-orm";
import { isAdminRole } from "@shared/types/roles";
import { createMouvementFinancier } from "../services/ledger";

export const caisseAdminRouter = Router();

// Middleware d'authentification
caisseAdminRouter.use(requireAuth);

// ============================================================================
// SCHÉMAS DE VALIDATION
// ============================================================================

const forceCloseSessionSchema = z.object({
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères"),
  keepFunds: z.boolean().optional().default(false),
});

const executeLiquidationSchema = z.object({
  destinationType: z.enum(['COFFRE', 'CAISSE']),
  destinationId: z.string().uuid(),
  motif: z.string().optional(),
});

// ============================================================================
// ROUTES - FORCE CLOSE
// ============================================================================

/**
 * POST /api/caisses/sessions/:id/force-close
 * Force la fermeture d'une session de caisse (ADMIN/CHEF uniquement)
 */
caisseAdminRouter.post(
  "/sessions/:id/force-close",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const sessionId = req.params.id;
      const userId = req.session?.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = forceCloseSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await caisseAdminService.forceCloseSession({
        sessionId,
        closedBy: userId,
        motif: parsed.data.motif,
        keepFunds: parsed.data.keepFunds,
      });

      if (!result.success) {
        const status = result.errorCode === "SESSION_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        session: result.session,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur force close session');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - LIQUIDATION INTELLIGENTE
// ============================================================================

/**
 * GET /api/caisses/:id/liquidation/check
 * Vérifie si une caisse peut être supprimée et retourne les destinations disponibles
 */
caisseAdminRouter.get(
  "/:id/liquidation/check",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const caisseId = req.params.id;

      const result = await caisseLiquidationService.checkCaisseLiquidation(caisseId);

      if (result.error) {
        const status = result.errorCode === "CAISSE_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        canDelete: result.canDelete,
        soldeActuel: result.soldeActuel,
        hasOpenSession: result.hasOpenSession,
        availableDestinations: result.availableDestinations,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur check liquidation');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * POST /api/caisses/:id/liquidation/execute
 * Exécute le transfert atomique des fonds et supprime la caisse
 */
caisseAdminRouter.post(
  "/:id/liquidation/execute",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const caisseId = req.params.id;
      const userId = req.session?.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const parsed = executeLiquidationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await caisseLiquidationService.executeLiquidation({
        caisseId,
        destinationType: parsed.data.destinationType,
        destinationId: parsed.data.destinationId,
        executedBy: userId,
        motif: parsed.data.motif,
      });

      if (!result.success) {
        const status = result.errorCode === "CAISSE_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          error: result.error,
          code: result.errorCode,
        });
      }

      res.json({
        success: true,
        caisse: result.caisse,
        montantTransfere: result.montantTransfere,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur execute liquidation');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - HISTORIQUE GLOBAL
// ============================================================================

const historiqueQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  typeOperation: z.string().optional(),
  methodePaiement: z.string().optional(),
});

/**
 * GET /api/caisses/:id/historique
 * Récupère l'historique global des opérations d'une caisse (toutes sessions confondues)
 *
 * Query params:
 * - limit: nombre d'opérations à retourner (max 100, default 50)
 * - offset: décalage pour pagination
 * - startDate: date de début (ISO string)
 * - endDate: date de fin (ISO string)
 * - typeOperation: filtre par type d'opération
 * - methodePaiement: filtre par méthode de paiement
 *
 * Retourne:
 * - operations: liste des opérations enrichies (client, caissier, session)
 * - total: nombre total d'opérations
 * - totalPages: nombre total de pages
 * - currentPage: page courante
 * - limit: nombre d'éléments par page
 */
caisseAdminRouter.get(
  "/:id/historique",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const caisseId = req.params.id;

      const parsed = historiqueQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Paramètres invalides",
          details: parsed.error.flatten(),
        });
      }

      const result = await getCaisseHistorique({
        caisseId,
        ...parsed.data,
      });

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération historique caisse');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

/**
 * GET /api/caisses/:id/historique/summary
 * Récupère un résumé statistique de l'historique d'une caisse
 *
 * Retourne:
 * - totalOperations: nombre total d'opérations
 * - totalEntrees: nombre d'opérations d'entrée
 * - totalSorties: nombre d'opérations de sortie
 * - montantEntrees: somme des entrées
 * - montantSorties: somme des sorties
 * - soldeNet: différence entrées - sorties
 * - dernierOperation: date de la dernière opération
 */
caisseAdminRouter.get(
  "/:id/historique/summary",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const caisseId = req.params.id;

      const summary = await getCaisseHistoriqueSummary(caisseId);

      res.json(summary);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération summary historique caisse');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - DIGITAL CAISSES SUMMARY (TRESORERIE)
// ============================================================================

/**
 * GET /api/caisses/digital-summary
 * Récupère un résumé des caisses digitales (MTN et Airtel) pour la trésorerie
 *
 * Query params:
 * - agenceId: (optional) filtrer par agence
 *
 * Retourne:
 * - mtn: { totalSolde, caisseCount, caisses: [...] }
 * - airtel: { totalSolde, caisseCount, caisses: [...] }
 */
caisseAdminRouter.get(
  "/digital-summary",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string | undefined;

      // Import dynamically to avoid circular dependencies
      const { getDigitalCaisseSummary } = await import("../services/mobile-money/mm-caisse-service");

      const summary = await getDigitalCaisseSummary(agenceId);

      res.json(summary);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération digital caisses summary');
      res.status(500).json({
        error: error.message || "Erreur interne",
      });
    }
  }
);

// ============================================================================
// ROUTES - COFFRES-FORTS SUMMARY (pour Trésorerie)
// ============================================================================

/**
 * GET /api/caisses/coffres-summary
 * Retourne la liste des coffres-forts avec leurs soldes réels (table coffres_forts)
 */
caisseAdminRouter.get(
  "/coffres-summary",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (_req, res) => {
    try {
      const allCoffres = await db.select({
        id: coffresForts.id,
        nom: coffresForts.nom,
        solde: coffresForts.solde,
        statut: coffresForts.statut,
        ownerType: coffresForts.ownerType,
        agenceId: coffresForts.ownerId,
        agenceNom: agences.nom,
      })
      .from(coffresForts)
      .leftJoin(agences, eq(coffresForts.ownerId, agences.id));

      res.json(allCoffres);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération coffres-forts summary');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// ROUTES - AUDIT LOGS
// ============================================================================

/**
 * GET /api/caisses/audit-logs
 * Returns paginated audit logs for caisse sessions with filters.
 */
caisseAdminRouter.get(
  "/audit-logs",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 20, 100);
      const action = req.query.action as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;

      const conditions = [];
      if (action) conditions.push(eq(sessionsCaisseAuditLogs.action, action));
      if (sessionId) conditions.push(eq(sessionsCaisseAuditLogs.sessionId, sessionId));
      if (dateFrom) conditions.push(gte(sessionsCaisseAuditLogs.createdAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(sessionsCaisseAuditLogs.createdAt, new Date(dateTo)));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult] = await db
        .select({ total: count() })
        .from(sessionsCaisseAuditLogs)
        .where(whereClause);

      const total = totalResult?.total || 0;

      const logs = await db
        .select({
          id: sessionsCaisseAuditLogs.id,
          sessionId: sessionsCaisseAuditLogs.sessionId,
          action: sessionsCaisseAuditLogs.action,
          statutAvant: sessionsCaisseAuditLogs.statutAvant,
          statutApres: sessionsCaisseAuditLogs.statutApres,
          details: sessionsCaisseAuditLogs.details,
          userId: sessionsCaisseAuditLogs.userId,
          ipAddress: sessionsCaisseAuditLogs.ipAddress,
          createdAt: sessionsCaisseAuditLogs.createdAt,
          userName: users.nom,
          userPrenom: users.prenom,
        })
        .from(sessionsCaisseAuditLogs)
        .leftJoin(users, eq(sessionsCaisseAuditLogs.userId, users.id))
        .where(whereClause)
        .orderBy(desc(sessionsCaisseAuditLogs.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage);

      res.json({
        data: logs,
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage),
        },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération audit logs');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// DENOMINATION TEMPLATES (Modèles de billetage)
// ============================================================================

/**
 * GET /api/caisses/denomination-templates
 * Returns denomination templates, optionally filtered by agence or caisse.
 */
caisseAdminRouter.get(
  "/denomination-templates",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { agenceId, caisseId, typeTemplate } = req.query;
      const conditions = [];

      if (agenceId) conditions.push(eq(denominationTemplates.agenceId, agenceId as string));
      if (caisseId) conditions.push(eq(denominationTemplates.caisseId, caisseId as string));
      if (typeTemplate) conditions.push(eq(denominationTemplates.typeTemplate, typeTemplate as string));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const templates = await db
        .select({
          id: denominationTemplates.id,
          nom: denominationTemplates.nom,
          description: denominationTemplates.description,
          agenceId: denominationTemplates.agenceId,
          caisseId: denominationTemplates.caisseId,
          billetage: denominationTemplates.billetage,
          totalCalcule: denominationTemplates.totalCalcule,
          typeTemplate: denominationTemplates.typeTemplate,
          usageCount: denominationTemplates.usageCount,
          lastUsedAt: denominationTemplates.lastUsedAt,
          createdAt: denominationTemplates.createdAt,
        })
        .from(denominationTemplates)
        .where(whereClause)
        .orderBy(desc(denominationTemplates.usageCount), desc(denominationTemplates.createdAt));

      res.json(templates);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération denomination templates');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/denomination-templates
 * Create a new denomination template.
 */
caisseAdminRouter.post(
  "/denomination-templates",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { nom, description, agenceId, caisseId, billetage, typeTemplate } = req.body;

      if (!nom || !billetage) {
        return res.status(400).json({ error: "Nom et billetage requis" });
      }

      // Calculate total from billetage
      const totalCalcule = Object.entries(billetage).reduce((sum, [denom, count]) => {
        return sum + (parseInt(denom) * (count as number));
      }, 0);

      const userId = req.user?.id;

      const [created] = await db.insert(denominationTemplates).values({
        nom,
        description: description || null,
        agenceId: agenceId || null,
        caisseId: caisseId || null,
        billetage,
        totalCalcule: totalCalcule.toString(),
        typeTemplate: typeTemplate || 'GENERAL',
        createdBy: userId,
      }).returning();

      res.status(201).json(created);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur création denomination template');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/denomination-templates/:id/use
 * Mark a template as used (increment usage count).
 */
caisseAdminRouter.post(
  "/denomination-templates/:id/use",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [updated] = await db.update(denominationTemplates)
        .set({
          usageCount: sql`${denominationTemplates.usageCount} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(denominationTemplates.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Modèle non trouvé" });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur marquage utilisation template');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * DELETE /api/caisses/denomination-templates/:id
 * Delete a denomination template.
 */
caisseAdminRouter.delete(
  "/denomination-templates/:id",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;

      await db.delete(denominationTemplates).where(eq(denominationTemplates.id, id));

      res.json({ message: "Modèle supprimé" });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur suppression denomination template');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// ROUTES - RÉCONCILIATION MOBILE MONEY
// ============================================================================

/**
 * GET /api/caisses/sessions/:id/mm-reconciliation
 * Récupère le statut de réconciliation Mobile Money pour une session
 */
caisseAdminRouter.get(
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
caisseAdminRouter.post(
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
caisseAdminRouter.get(
  "/ecart-approvals",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
      const statut = req.query.statut as string || 'PENDING_APPROVAL';

      if (!agenceId) {
        return res.status(400).json({ error: "Agence non spécifiée" });
      }

      const { ecartApprovalService } = await import("../services/caisse/ecart-approval-service");
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
caisseAdminRouter.get(
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
caisseAdminRouter.post(
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

      const { ecartApprovalService } = await import("../services/caisse/ecart-approval-service");

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
        const { getWsInstance } = await import("../ws-server");
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

/**
 * GET /api/caisses/agency/:agenceId/closure-status
 * Vérifie si l'agence est prête pour la clôture journalière
 */
caisseAdminRouter.get(
  "/agency/:agenceId/closure-status",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { agenceId } = req.params;
      const date = req.query.date ? new Date(req.query.date as string) : undefined;

      const { agencyClosureService } = await import("../services/caisse/agency-closure-service");

      const status = await agencyClosureService.checkClosureReadiness(agenceId, date);

      res.json(status);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur vérification clôture agence');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/agency/:agenceId/finalize-closure
 * Finalise la clôture journalière de l'agence
 */
caisseAdminRouter.post(
  "/agency/:agenceId/finalize-closure",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { agenceId } = req.params;
      const { observations } = req.body;
      const closedBy = req.session.user!.id;

      const { agencyClosureService } = await import("../services/caisse/agency-closure-service");

      const result = await agencyClosureService.finalizeClosure({
        agenceId,
        closedBy,
        observations,
        ipAddress: req.ip,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        message: 'Clôture agence finalisée',
        closure: result.closure,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur finalisation clôture agence');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/agency/:agenceId/closures/history
 * Historique des clôtures d'une agence
 */
caisseAdminRouter.get(
  "/agency/:agenceId/closures/history",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { agenceId } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;

      const { agencyClosureService } = await import("../services/caisse/agency-closure-service");

      const history = await agencyClosureService.getClosureHistory(agenceId, limit);

      res.json(history);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération historique clôtures');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// ROUTES - SUGGESTION BILLETAGE PRÉDICTIF
// ============================================================================

const billetageSuggestionSchema = z.object({
  caisseId: z.string().uuid(),
  targetAmount: z.number().positive(),
  prioritizeSmallDenominations: z.boolean().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  isEndOfMonth: z.boolean().optional(),
});

const saveTemplateSchema = z.object({
  nom: z.string().min(1).max(100),
  description: z.string().optional(),
  billetage: z.record(z.string(), z.number().int().min(0)),
  agenceId: z.string().uuid().optional(),
  caisseId: z.string().uuid().optional(),
});

/**
 * POST /api/caisses/billetage/suggestion
 * Génère une suggestion de billetage prédictive basée sur l'historique
 */
caisseAdminRouter.post(
  "/billetage/suggestion",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const validation = billetageSuggestionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const { caisseId, targetAmount, ...options } = validation.data;
      const { predictiveBilletageService } = await import("../services/caisse/predictive-billetage-service");

      const suggestion = await predictiveBilletageService.getSuggestion({
        caisseId,
        targetAmount,
        options,
      });

      res.json(suggestion);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur suggestion billetage');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/billetage/patterns/:caisseId
 * Récupère les patterns historiques d'une caisse
 */
caisseAdminRouter.get(
  "/billetage/patterns/:caisseId",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { caisseId } = req.params;
      const { predictiveBilletageService } = await import("../services/caisse/predictive-billetage-service");

      const pattern = await predictiveBilletageService.analyzeHistoricalPattern(caisseId);

      res.json(pattern);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur analyse patterns billetage');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/billetage/templates
 * Récupère les templates de billetage fréquemment utilisés
 */
caisseAdminRouter.get(
  "/billetage/templates",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
      const caisseId = req.query.caisseId as string | undefined;

      const { predictiveBilletageService } = await import("../services/caisse/predictive-billetage-service");

      const templates = await predictiveBilletageService.getFrequentTemplates(agenceId, caisseId);

      res.json(templates);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération templates billetage');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/billetage/templates
 * Sauvegarde un template de billetage personnalisé
 */
caisseAdminRouter.post(
  "/billetage/templates",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const validation = saveTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const userId = req.session.user!.id;
      const { predictiveBilletageService } = await import("../services/caisse/predictive-billetage-service");

      const template = await predictiveBilletageService.saveTemplate({
        ...validation.data,
        createdBy: userId,
      });

      res.status(201).json({
        ...template,
        message: 'Template sauvegardé avec succès',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur sauvegarde template billetage');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// ROUTES - TRANSFERT DE GARDE (HANDOVER)
// ============================================================================

const initiateHandoverSchema = z.object({
  sessionId: z.string().uuid(),
  toCaissierId: z.string().uuid(),
  montantCompte: z.number().positive(),
  billetage: z.record(z.string(), z.number().int().min(0)).optional(),
  motif: z.string().optional(),
  observations: z.string().optional(),
});

const confirmHandoverSchema = z.object({
  montantVerifie: z.number().nonnegative(),
  billetage: z.record(z.string(), z.number().int().min(0)).optional(),
  observations: z.string().optional(),
  ecartJustification: z.string().optional(),
});

const cancelHandoverSchema = z.object({
  reason: z.string().min(5, "La raison doit contenir au moins 5 caractères"),
});

const approveHandoverSchema = z.object({
  comment: z.string().optional(),
});

/**
 * POST /api/caisses/handovers
 * Initie un transfert de garde
 */
caisseAdminRouter.post(
  "/handovers",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const validation = initiateHandoverSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const fromCaissierId = req.session.user!.id;
      const { handoverService } = await import("../services/caisse/handover-service");

      const result = await handoverService.initiateHandover({
        ...validation.data,
        fromCaissierId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      res.status(201).json({
        handover: result.handover,
        message: 'Transfert de garde initié. En attente de confirmation par le caissier entrant.',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur initiation handover');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/handovers/pending
 * Liste les transferts en attente pour l'utilisateur courant
 */
caisseAdminRouter.get(
  "/handovers/pending",
  requireAuth,
  async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const { handoverService } = await import("../services/caisse/handover-service");

      const handovers = await handoverService.getPendingHandovers(userId);

      res.json(handovers);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération handovers pending');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/handovers/:id
 * Récupère les détails d'un transfert
 */
caisseAdminRouter.get(
  "/handovers/:id",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { handoverService } = await import("../services/caisse/handover-service");

      const handover = await handoverService.getHandoverById(id);

      if (!handover) {
        return res.status(404).json({ error: 'Transfert non trouvé' });
      }

      res.json(handover);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération handover');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/handovers/:id/start-counting
 * Démarre le comptage (caissier entrant)
 */
caisseAdminRouter.post(
  "/handovers/:id/start-counting",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const toCaissierId = req.session.user!.id;
      const { handoverService } = await import("../services/caisse/handover-service");

      const result = await handoverService.startCounting(id, toCaissierId, req.ip);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ message: 'Comptage démarré' });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur démarrage comptage');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/handovers/:id/confirm
 * Confirme le transfert (caissier entrant)
 */
caisseAdminRouter.post(
  "/handovers/:id/confirm",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const validation = confirmHandoverSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const toCaissierId = req.session.user!.id;
      const { handoverService } = await import("../services/caisse/handover-service");

      const result = await handoverService.confirmHandover({
        handoverId: id,
        toCaissierId,
        ...validation.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      res.json({
        handover: result.handover,
        requiresApproval: result.requiresApproval,
        message: result.requiresApproval
          ? 'Écart détecté. En attente d\'approbation par un superviseur.'
          : 'Transfert confirmé. Vous êtes maintenant responsable de cette caisse.',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur confirmation handover');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/handovers/:id/approve
 * Approuve un transfert contesté (superviseur)
 */
caisseAdminRouter.post(
  "/handovers/:id/approve",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const validation = approveHandoverSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const approvedBy = req.session.user!.id;
      const { handoverService } = await import("../services/caisse/handover-service");

      const result = await handoverService.approveDisputed(
        id,
        approvedBy,
        validation.data.comment,
        req.ip
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        handover: result.handover,
        message: 'Transfert approuvé et finalisé.',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur approbation handover');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/handovers/:id/cancel
 * Annule un transfert en cours
 */
caisseAdminRouter.post(
  "/handovers/:id/cancel",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const validation = cancelHandoverSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const cancelledBy = req.session.user!.id;
      const { handoverService } = await import("../services/caisse/handover-service");

      const result = await handoverService.cancelHandover({
        handoverId: id,
        cancelledBy,
        reason: validation.data.reason,
        ipAddress: req.ip,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        handover: result.handover,
        message: 'Transfert annulé.',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur annulation handover');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/sessions/:sessionId/handovers
 * Historique des transferts pour une session
 */
caisseAdminRouter.get(
  "/sessions/:sessionId/handovers",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { handoverService } = await import("../services/caisse/handover-service");

      const history = await handoverService.getHandoverHistory(sessionId);

      res.json(history);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération historique handovers');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// ROUTES - CODES DE SÉCURITÉ
// ============================================================================

const generateCodeSchema = z.object({
  agenceId: z.string().uuid().optional(),
  caisseId: z.string().uuid().optional(),
  codeType: z.enum(['EMERGENCY', 'DAILY', 'PERMANENT']),
  description: z.string().optional(),
  maxUsages: z.number().int().min(1).optional(),
  expiresInHours: z.number().int().min(1).optional(),
  authorizationDurationHours: z.number().int().min(1).max(24).optional(),
  assignedToUserId: z.string().uuid().optional(),
  sendNotification: z.boolean().optional(),
});

const validateCodeSchema = z.object({
  code: z.string().min(4).max(12),
  agenceId: z.string().uuid().optional(),
  caisseId: z.string().uuid().optional(),
  action: z.string().optional(),
});

const rotationPolicySchema = z.object({
  agenceId: z.string().uuid().optional(),
  rotationFrequencyDays: z.number().int().min(1).max(365).optional(),
  maxUsageBeforeRotation: z.number().int().min(1).optional(),
  notifyDaysBeforeExpiry: z.number().int().min(1).max(30).optional(),
  autoGenerateOnExpiry: z.boolean().optional(),
});

/**
 * GET /api/caisses/security-codes
 * Liste tous les codes de sécurité pour une agence/caisse (actifs et inactifs)
 */
caisseAdminRouter.get(
  "/security-codes",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
      const caisseId = req.query.caisseId as string | undefined;
      const activeOnly = req.query.activeOnly === 'true';

      // Build conditions
      const conditions = [];

      if (caisseId) {
        conditions.push(eq(caisseSecurityCodes.caisseId, caisseId));
      } else if (agenceId) {
        conditions.push(eq(caisseSecurityCodes.agenceId, agenceId));
      }

      if (activeOnly) {
        conditions.push(eq(caisseSecurityCodes.active, true));
      }

      // Query with user join
      const codes = await db
        .select({
          id: caisseSecurityCodes.id,
          codeType: caisseSecurityCodes.codeType,
          agenceId: caisseSecurityCodes.agenceId,
          caisseId: caisseSecurityCodes.caisseId,
          active: caisseSecurityCodes.active,
          expiresAt: caisseSecurityCodes.expiresAt,
          maxUsages: caisseSecurityCodes.maxUsages,
          usageCount: caisseSecurityCodes.usageCount,
          authorizationDurationHours: caisseSecurityCodes.authorizationDurationHours,
          description: caisseSecurityCodes.description,
          createdBy: caisseSecurityCodes.createdBy,
          createdAt: caisseSecurityCodes.createdAt,
          assignedToUserId: caisseSecurityCodes.agentId,
          // Joined user info
          assignedUserName: sql<string>`CONCAT(${users.prenom}, ' ', ${users.nom})`.as('assignedUserName'),
        })
        .from(caisseSecurityCodes)
        .leftJoin(users, eq(caisseSecurityCodes.agentId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(caisseSecurityCodes.createdAt))
        .limit(100); // Limiter pour éviter les surcharges

      res.json(codes);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération codes sécurité');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/security-codes
 * Génère un nouveau code de sécurité
 */
caisseAdminRouter.post(
  "/security-codes",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const validation = generateCodeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const userId = req.session.user!.id;
      const userAgenceId = req.session.user!.agenceId;
      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      // Déterminer l'agenceId cible
      let targetAgenceId = validation.data.agenceId || userAgenceId;

      // Si un utilisateur est assigné, utiliser son agenceId (sauf si agenceId explicite)
      if (validation.data.assignedToUserId && !validation.data.agenceId) {
        // Architecture V3: Récupérer l'agence via userRoles (users.agenceId n'existe plus)
        const [assignedRole] = await db.select({ agenceId: userRoles.agenceId })
          .from(userRoles)
          .where(and(
            eq(userRoles.userId, validation.data.assignedToUserId),
            isNotNull(userRoles.agenceId)
          ))
          .orderBy(desc(userRoles.isPrimary)) // Priorité au rôle principal
          .limit(1);

        if (assignedRole?.agenceId) {
          targetAgenceId = assignedRole.agenceId;
        }
      }

      const result = await securityCodeRotationService.generateCode({
        ...validation.data,
        agenceId: targetAgenceId,
        createdBy: userId,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(201).json({
        code: result.code, // Le code en clair (à afficher une seule fois)
        codeId: result.codeId,
        expiresAt: result.expiresAt,
        message: 'Code généré avec succès. Ce code ne sera affiché qu\'une seule fois.',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur génération code sécurité');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/security-codes/validate
 * Valide un code de sécurité et crée une autorisation
 */
caisseAdminRouter.post(
  "/security-codes/validate",
  requireAuth,
  async (req, res) => {
    try {
      const validation = validateCodeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const userId = req.session.user!.id;
      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      const result = await securityCodeRotationService.validateCode({
        ...validation.data,
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (!result.success) {
        return res.status(401).json({
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      res.json({
        success: true,
        authorization: result.authorization,
        message: 'Code validé avec succès',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur validation code sécurité');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * DELETE /api/caisses/security-codes/:id
 * Révoque un code de sécurité
 */
caisseAdminRouter.delete(
  "/security-codes/:id",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.session.user!.id;

      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      const success = await securityCodeRotationService.revokeCode(id, userId, reason);

      if (!success) {
        return res.status(400).json({ error: 'Impossible de révoquer le code' });
      }

      res.json({ message: 'Code révoqué avec succès' });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur révocation code sécurité');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/security-codes/statistics
 * Statistiques des codes de sécurité
 */
caisseAdminRouter.get(
  "/security-codes/statistics",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string || req.session.user?.agenceId;

      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      const statistics = await securityCodeRotationService.getStatistics(agenceId);

      res.json(statistics);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur statistiques codes sécurité');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/security-codes/rotation-policy
 * Récupère la politique de rotation
 */
caisseAdminRouter.get(
  "/security-codes/rotation-policy",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const agenceId = req.query.agenceId as string || req.session.user?.agenceId;

      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      const policy = await securityCodeRotationService.getRotationPolicy(agenceId);

      res.json(policy || {
        rotationFrequencyDays: 30,
        maxUsageBeforeRotation: null,
        notifyDaysBeforeExpiry: 7,
        autoGenerateOnExpiry: false,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération politique rotation');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * PUT /api/caisses/security-codes/rotation-policy
 * Met à jour la politique de rotation
 */
caisseAdminRouter.put(
  "/security-codes/rotation-policy",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const validation = rotationPolicySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const userId = req.session.user!.id;
      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      const policy = await securityCodeRotationService.upsertRotationPolicy({
        ...validation.data,
        updatedBy: userId,
      });

      res.json({
        policy,
        message: 'Politique de rotation mise à jour',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur mise à jour politique rotation');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/security-codes/check-rotation
 * Vérifie et applique les rotations (peut être appelé par un cron)
 */
caisseAdminRouter.post(
  "/security-codes/check-rotation",
  attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { securityCodeRotationService } = await import("../services/caisse/security-code-rotation-service");

      const result = await securityCodeRotationService.checkAndApplyRotation();

      res.json({
        ...result,
        message: 'Vérification de rotation effectuée',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur vérification rotation');
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

// ============================================================================
// ROUTES - PAYMENT REQUESTS (Demandes de paiement centralisées)
// ============================================================================

const processRequestSchema = z.object({
  sessionCaisseId: z.string().uuid(),
});

const cancelRequestSchema = z.object({
  reason: z.string().min(3, "Le motif doit contenir au moins 3 caractères"),
});

/**
 * GET /api/caisses/payment-requests
 * Liste les demandes de paiement en attente pour une agence
 */
caisseAdminRouter.get(
  "/payment-requests",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const userRole = req.session.user?.role;
      const isAdmin = isAdminRole(userRole);
      // Admins see all agencies (ignore agenceId param); regular users filter by their agency
      const agenceId = isAdmin ? undefined : (req.query.agenceId as string || req.session.user?.agenceId);
      const category = req.query.category as string | undefined;
      const caisseId = req.query.caisseId as string | undefined;

      if (!isAdmin && !agenceId) {
        return res.status(400).json({ error: "Agence non spécifiée" });
      }

      const { getPendingRequests } = await import("../services/caisse-queue-service");
      const requests = await getPendingRequests(agenceId, category, caisseId);

      res.json(requests);
    } catch (error: any) {
      logger.error({ err: error }, "Erreur récupération payment requests");
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * GET /api/caisses/payment-requests/count
 * Nombre de demandes en attente (pour badge sidebar)
 */
caisseAdminRouter.get(
  "/payment-requests/count",
  requireAuth,
  async (req, res) => {
    try {
      const userRole = req.session.user?.role;
      const isAdmin = isAdminRole(userRole);

      // Admins see all agencies (ignore agenceId param); regular users filter by their agency
      const agenceId = isAdmin ? undefined : (req.query.agenceId as string || req.session.user?.agenceId);

      if (!isAdmin && !agenceId) {
        return res.status(400).json({ error: "Agence non spécifiée" });
      }

      const { getPendingCount } = await import("../services/caisse-queue-service");
      const count = await getPendingCount(agenceId);

      res.json({ count });
    } catch (error: any) {
      logger.error({ err: error }, "Erreur comptage payment requests");
      res.status(500).json({ error: error.message || "Erreur interne" });
    }
  }
);

/**
 * POST /api/caisses/payment-requests/:id/process
 * Traite une demande de paiement (caissier)
 */
caisseAdminRouter.post(
  "/payment-requests/:id/process",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user!.id;

      const validation = processRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const { processRequest } = await import("../services/caisse-queue-service");
      const result = await processRequest(id, validation.data.sessionCaisseId, userId);

      res.json({
        success: true,
        request: result,
        message: "Demande traitée avec succès",
      });
    } catch (error: any) {
      logger.error({ err: error, requestId: req.params.id }, "Erreur traitement payment request");
      res.status(400).json({ error: error.message || "Erreur lors du traitement" });
    }
  }
);

/**
 * POST /api/caisses/payment-requests/:id/cancel
 * Annule une demande de paiement
 */
caisseAdminRouter.post(
  "/payment-requests/:id/cancel",
  attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user!.id;

      const validation = cancelRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Données invalides",
          details: validation.error.format(),
        });
      }

      const { cancelRequest } = await import("../services/caisse-queue-service");
      const result = await cancelRequest(id, validation.data.reason, userId);

      res.json({
        success: true,
        request: result,
        message: "Demande annulée",
      });
    } catch (error: any) {
      logger.error({ err: error, requestId: req.params.id }, "Erreur annulation payment request");
      res.status(400).json({ error: error.message || "Erreur lors de l'annulation" });
    }
  }
);

// ============================================================================
// ROUTES - CORRECTION DE SOLDE CAISSE (Admin/Supervision)
// ============================================================================

const balanceCorrectionSchema = z.object({
  newBalance: z.number().min(0, "Le nouveau solde doit être >= 0"),
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères"),
});

/**
 * POST /api/caisses/:id/balance-correction
 * Corrige le solde d'une caisse (ex: solde négatif suite à une incohérence).
 * Réservé aux admins/supervision. Crée un log d'audit détaillé.
 */
caisseAdminRouter.post(
  "/:id/balance-correction",
  attachAbility,
  requireAbility(Actions.MANAGE, Subjects.CAISSE),
  async (req, res) => {
    try {
      const caisseId = req.params.id;
      const userId = req.user?.id;
      const parsed = balanceCorrectionSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.errors.map((e) => e.message).join("; "),
        });
      }

      const { newBalance, motif } = parsed.data;

      // 1. Récupérer la caisse actuelle (avec agenceId pour le mouvement financier)
      const [caisse] = await db
        .select({
          id: caisses.id,
          nom: caisses.nom,
          solde: caisses.solde,
          statut: caisses.statut,
          agenceId: caisses.agenceId,
        })
        .from(caisses)
        .where(eq(caisses.id, caisseId));

      if (!caisse) {
        return res.status(404).json({ error: "Caisse introuvable" });
      }

      const oldBalance = Number(caisse.solde || 0);

      // 2. Vérifier qu'il n'y a pas de session active sur cette caisse
      const { sessionsCaisse, agences: agencesTable } = await import("@shared/schema");
      const [activeSession] = await db
        .select({ id: sessionsCaisse.id })
        .from(sessionsCaisse)
        .where(
          and(
            eq(sessionsCaisse.caisseId, caisseId),
            isNull(sessionsCaisse.closedAt),
            sql`${sessionsCaisse.statut} IN ('OPEN', 'CLOSING_COUNT', 'CLOSING_VALIDATION')`
          )
        )
        .limit(1);

      if (activeSession) {
        return res.status(409).json({
          error: "Impossible de corriger le solde : une session est active sur cette caisse. Fermez-la d'abord.",
        });
      }

      // 3. Récupérer l'agenceId de la caisse
      const agenceId = caisse.agenceId;

      // 4. Appliquer la correction dans une transaction (avec mouvement financier pour satisfaire BALANCE_GUARD)
      const delta = newBalance - oldBalance;
      await db.transaction(async (tx) => {
        // Créer un mouvement financier d'ajustement (requis par le trigger BALANCE_GUARD)
        if (Math.abs(delta) > 0) {
          await createMouvementFinancier(
            tx,
            {
              agenceId: agenceId || undefined,
              sens: delta > 0 ? "CREDIT" : "DEBIT",
              montant: Math.abs(delta).toString(),
              sourceModule: "CAISSE",
              typePaiement: "ADJUSTMENT",
              requiresGlPosting: false,
              metadata: {
                type: "ADMIN_BALANCE_CORRECTION",
                caisseId,
                caisseName: caisse.nom,
                oldBalance,
                newBalance,
                motif,
                correctedBy: userId,
              },
            },
            userId
          );
        } else {
          // Pas de delta — bypass le guard manuellement
          await tx.execute(sql`SELECT set_config('app.mouvement_created', 'true', true)`);
        }

        // Mettre à jour le solde
        await tx
          .update(caisses)
          .set({
            solde: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, caisseId));

        // Log d'audit — sessionId requis (NOT NULL), utiliser la dernière session fermée
        const [lastSession] = await tx
          .select({ id: sessionsCaisse.id })
          .from(sessionsCaisse)
          .where(eq(sessionsCaisse.caisseId, caisseId))
          .orderBy(desc(sessionsCaisse.createdAt))
          .limit(1);

        if (lastSession) {
          await tx.insert(sessionsCaisseAuditLogs).values({
            sessionId: lastSession.id,
            caisseId,
            action: "BALANCE_CORRECTION",
            userId,
            details: {
              oldBalance,
              newBalance,
              delta,
              motif,
              caisseName: caisse.nom,
              correctedBy: userId,
            },
            ipAddress: req.ip,
          });
        }
      });

      logger.warn(
        { caisseId, caisseName: caisse.nom, oldBalance, newBalance, userId, motif },
        "[BALANCE_CORRECTION] Solde caisse corrigé par supervision"
      );

      res.json({
        success: true,
        caisse: {
          id: caisseId,
          nom: caisse.nom,
          oldBalance,
          newBalance,
        },
        message: `Solde corrigé de ${oldBalance.toLocaleString('fr-FR')} à ${newBalance.toLocaleString('fr-FR')} FCFA`,
      });
    } catch (error: any) {
      logger.error({ err: error, caisseId: req.params.id }, "Erreur correction solde caisse");
      res.status(500).json({ error: error.message || "Erreur lors de la correction" });
    }
  }
);

export default caisseAdminRouter;
