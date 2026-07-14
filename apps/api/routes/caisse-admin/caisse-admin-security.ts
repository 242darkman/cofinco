import { Actions, Subjects } from "@shared/ability";
import { userRoles, users } from "@shared/schema";
import { caisseSecurityCodes } from "@shared/schema/operations";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { generateCodeSchema, rotationPolicySchema, validateCodeSchema } from "./caisse-admin-helpers";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminSecurityRoutes(router: Router) {

  /**
   * GET /api/caisses/security-codes
   * Liste tous les codes de sécurité pour une agence/caisse (actifs et inactifs)
   */
  router.get(
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
  router.post(
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
        const { securityCodeGenerator } = await import("../../services/caisse/security-code-generator");
  
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
  
        const result = await securityCodeGenerator.generateCode({
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
  router.post(
    "/security-codes/validate",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
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
        const { securityCodeValidator } = await import("../../services/caisse/security-code-validator");
  
        const result = await securityCodeValidator.validateCode({
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
  router.delete(
    "/security-codes/:id",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.session.user!.id;
  
        const { securityCodeValidator } = await import("../../services/caisse/security-code-validator");
  
        const success = await securityCodeValidator.revokeCode(id, userId, reason);
  
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
  router.get(
    "/security-codes/statistics",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
  
        const { securityCodeStats } = await import("../../services/caisse/security-code-stats");
  
        const statistics = await securityCodeStats.getStatistics(agenceId);
  
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
  router.get(
    "/security-codes/rotation-policy",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const agenceId = req.query.agenceId as string || req.session.user?.agenceId;
  
        const { securityCodePolicy } = await import("../../services/caisse/security-code-policy");
  
        const policy = await securityCodePolicy.getRotationPolicy(agenceId);
  
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
  router.put(
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
        const { securityCodePolicy } = await import("../../services/caisse/security-code-policy");
  
        const policy = await securityCodePolicy.upsertRotationPolicy({
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
  router.post(
    "/security-codes/check-rotation",
    attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { securityCodePolicy } = await import("../../services/caisse/security-code-policy");
  
        const result = await securityCodePolicy.checkAndApplyRotation();
  
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
  
}
