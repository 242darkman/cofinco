import { Actions, Subjects } from "@shared/ability";
import { agences, coffresForts, users } from "@shared/schema";
import { caisses, sessionsCaisse, sessionsCaisseAuditLogs } from "@shared/schema/finance";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { Router } from "express";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { getCaisseHistorique, getCaisseHistoriqueSummary } from "../../services/caisse/session-service";
import { historiqueQuerySchema } from "./caisse-admin-helpers";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminHistoriqueRoutes(router: Router) {

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
  router.get(
    "/:id/historique",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const caisseId = req.params.id;
  
        // Vérifier que la caisse appartient à l'agence de l'utilisateur
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        if (!isGlobalAdmin) {
          const userAgenceId = req.session.user?.agenceId;
          const [caisseCheck] = await db
            .select({ agenceId: caisses.agenceId })
            .from(caisses)
            .where(eq(caisses.id, caisseId));
          if (!caisseCheck || caisseCheck.agenceId !== userAgenceId) {
            return res.status(403).json({ error: "Accès interdit: caisse d'une autre agence" });
          }
        }
  
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
  router.get(
    "/:id/historique/summary",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const caisseId = req.params.id;
  
        // Vérifier que la caisse appartient à l'agence de l'utilisateur
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        if (!isGlobalAdmin) {
          const userAgenceId = req.session.user?.agenceId;
          const [caisseCheck] = await db
            .select({ agenceId: caisses.agenceId })
            .from(caisses)
            .where(eq(caisses.id, caisseId));
          if (!caisseCheck || caisseCheck.agenceId !== userAgenceId) {
            return res.status(403).json({ error: "Accès interdit: caisse d'une autre agence" });
          }
        }
  
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
  router.get(
    "/digital-summary",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string | undefined;
  
        // Import dynamically to avoid circular dependencies
        const { getDigitalCaisseSummary } = await import("../../services/mobile-money/mm-caisse-service");
  
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
  router.get(
    "/coffres-summary",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        // Filtrer par agence sauf pour les admins globaux
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        const userAgenceId = req.session.user?.agenceId;
  
        const query = db.select({
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
  
        // Filter out coffres from closed/migrated agencies
        const allCoffres = !isGlobalAdmin && userAgenceId
          ? await query.where(and(eq(coffresForts.ownerId, userAgenceId), eq(agences.statut, 'ACTIVE')))
          : await query.where(eq(agences.statut, 'ACTIVE'));
  
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
   * Retourne les journaux d'audit paginés pour les sessions de caisse avec des filtres.
   */
  router.get(
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
  
        // Filtre agence (via session → agenceId)
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        const userAgenceId = req.session.user?.agenceId;
        if (!isGlobalAdmin && userAgenceId) {
          conditions.push(eq(sessionsCaisse.agenceId, userAgenceId));
        }
  
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
        const [totalResult] = await db
          .select({ total: count() })
          .from(sessionsCaisseAuditLogs)
          .innerJoin(sessionsCaisse, eq(sessionsCaisseAuditLogs.sessionId, sessionsCaisse.id))
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
          .innerJoin(sessionsCaisse, eq(sessionsCaisseAuditLogs.sessionId, sessionsCaisse.id))
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
  
}
