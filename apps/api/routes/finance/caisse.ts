/**
 * Routes finance — segment /caisse (partie caisse).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/caisse/authorization-status
 *   POST   /api/caisse/access-codes/validate
 *   POST   /api/caisse/access-codes/generate
 *   GET    /api/caisse/access-codes
 *   DELETE /api/caisse/access-codes/:id
 *   GET    /api/caisse/authorizations
 *   POST   /api/caisse/authorizations/:id/revoke
 */
import type { Express } from "express";
import * as schema from "@shared/schema";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { db } from "../../db";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { accessControlService } from "../../services/caisse/access-control-service";
import { logger } from "./shared";

export function registerCaisseRoutes(app: Express) {
  /**
   * GET /api/caisse/authorization-status
   * Vérifie si l'utilisateur a une autorisation valide pour accéder à la caisse
   */
  /**
   * GET /api/caisse/authorization-status
   */
  app.get("/api/caisse/authorization-status", requireAuth, async (req, res) => {
    try {
      const user = req.session.user!;
      const caisseId = req.query.caisseId as string | undefined;
      const agenceId = (req.query.agenceId as string | undefined) || user.agenceId;

      const status = await accessControlService.checkUserAuthorization(user.id, caisseId, agenceId);
      res.json(status);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking authorization');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/caisse/access-codes/validate
   * Valide un code de sécurité et crée une autorisation temporaire
   */
  /**
   * POST /api/caisse/access-codes/validate
   */
  app.post("/api/caisse/access-codes/validate", requireAuth, async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      if (!data.code) {
        return res.status(400).json({ error: "Le code de sécurité est requis" });
      }

      const result = await accessControlService.validateSecurityCode({
        userId: user.id,
        code: data.code,
        caisseId: data.caisseId,
        agenceId: data.agenceId || user.agenceId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        return res.status(401).json({ success: false, error: result.error });
      }

      await logAudit(
        req,
        "ACCESS_CODE_VALIDATED",
        "caisse_access",
        result.authorization?.id || '',
        { caisseId: data.caisseId },
        "success",
        "medium"
      );

      res.json({
        success: true,
        authorization: result.authorization,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error validating access code');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/caisse/access-codes/generate
   * Génère un nouveau code de sécurité (admin/chef d'agence seulement)
   */
  /**
   * POST /api/caisse/access-codes/generate
   */
  app.post("/api/caisse/access-codes/generate", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      const agenceId = data.agenceId || user.agenceId;
      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      // Calculate expiry date
      let expiresAt: Date | undefined;
      if (data.expiresInHours) {
        expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
      } else if (data.expiresAt) {
        expiresAt = new Date(data.expiresAt);
      }

      const result = await accessControlService.generateSecurityCodeForCaisse({
        createdBy: user.id,
        agenceId,
        caisseId: data.caisseId,
        codeType: data.codeType || 'EMERGENCY',
        maxUsages: data.maxUsages ?? 1,
        authorizationDurationHours: data.authorizationDurationHours ?? 4,
        expiresAt,
        description: data.description,
        assignedToUserId: data.assignedToUserId,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Send notifications to assigned user if requested
      if (data.sendNotification && data.assignedToUserId && result.code) {
        try {
          // Get user info for notifications
          const [assignedUser] = await db.select({
            id: schema.users.id,
            nom: schema.users.nom,
            prenom: schema.users.prenom,
            email: schema.users.email,
            telephone: schema.users.telephone,
          }).from(schema.users).where(eq(schema.users.id, data.assignedToUserId));

          if (assignedUser) {
            const validityLabel = data.expiresInHours ? `${data.expiresInHours}h` : '24h';
            const authLabel = data.authorizationDurationHours ? `${data.authorizationDurationHours}h` : '4h';
            const userName = `${assignedUser.prenom || ''} ${assignedUser.nom || ''}`.trim();
            const codeTypeLabels: Record<string, string> = {
              EMERGENCY: 'Urgence',
              DAILY: 'Journalier',
              PERMANENT: 'Permanent',
            };

            // Send push notification
            const { sendPushToUser } = await import('../services/push-notification-service');
            await sendPushToUser(data.assignedToUserId, {
              title: '🔑 Code d\'accès caisse',
              body: `Votre code: ${result.code} (valide ${validityLabel})`,
              data: {
                type: 'access_code',
                code: result.code,
                expiresAt: expiresAt?.toISOString(),
              },
            });

            // Send SMS and Email via notification service
            const { emitNotificationEvent, sendInAppNotification } = await import('../services/notifications/notification-service');

            const notificationPayload = {
              userName,
              code: result.code,
              validityHours: validityLabel,
              authorizationHours: authLabel,
              codeType: codeTypeLabels[data.codeType] || data.codeType,
              description: data.description || '',
            };

            await emitNotificationEvent(
              'ACCESS_CODE_GENERATED',
              { codeId: result.codeId, assignedTo: data.assignedToUserId },
              {
                smsRecipients: assignedUser.telephone ? [{
                  phone: assignedUser.telephone,
                  templateCode: 'ACCESS_CODE_GENERATED',
                  payload: notificationPayload,
                  userId: assignedUser.id,
                  agenceId,
                }] : undefined,
                emailRecipients: assignedUser.email ? [{
                  email: assignedUser.email,
                  templateCode: 'ACCESS_CODE_GENERATED',
                  payload: notificationPayload,
                  userId: assignedUser.id,
                  agenceId,
                }] : undefined,
                inAppRecipients: [{
                  userId: assignedUser.id,
                  type: 'ACCESS_CODE',
                  titre: '🔑 Code d\'accès caisse',
                  message: `Code: ${result.code} - Valide ${validityLabel}, donne ${authLabel} d'accès`,
                  priorite: 'HIGH',
                  referenceId: result.codeId,
                  referenceType: 'caisse_security_code',
                  expiresAt,
                }],
              }
            );

            logger.info({ userId: data.assignedToUserId, channels: ['push', 'sms', 'email', 'in_app'] }, 'Access code notifications sent');
          }
        } catch (notifErr) {
          // Don't fail the request if notification fails
          logger.warn({ err: notifErr, userId: data.assignedToUserId }, 'Failed to send access code notifications');
        }
      }

      await logAudit(
        req,
        "ACCESS_CODE_GENERATED",
        "caisse_security_code",
        result.codeId || '',
        {
          agenceId,
          caisseId: data.caisseId,
          codeType: data.codeType,
          maxUsages: data.maxUsages,
          assignedToUserId: data.assignedToUserId,
          notificationSent: !!(data.sendNotification && data.assignedToUserId),
        },
        "success",
        "high"
      );

      res.json({
        success: true,
        code: result.code, // Returned only at creation time
        codeId: result.codeId,
        expiresAt,
        notificationSent: !!(data.sendNotification && data.assignedToUserId),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error generating access code');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/access-codes
   * Liste les codes de sécurité actifs pour une agence
   */
  /**
   * GET /api/caisse/access-codes
   */
  app.get("/api/caisse/access-codes", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const agenceId = (req.query.agenceId as string) || user.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      const codes = await accessControlService.getActiveCodesForAgence(agenceId);
      res.json(codes);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching access codes');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/caisse/access-codes/:id
   * Désactive un code de sécurité
   */
  /**
   * DELETE /api/caisse/access-codes/:id
   */
  app.delete("/api/caisse/access-codes/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      await accessControlService.deactivateSecurityCode(req.params.id);

      await logAudit(
        req,
        "ACCESS_CODE_DEACTIVATED",
        "caisse_security_code",
        req.params.id,
        {},
        "success",
        "medium"
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error deactivating access code');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/caisse/authorizations
   * Liste les autorisations actives pour une agence
   */
  /**
   * GET /api/caisse/authorizations
   */
  app.get("/api/caisse/authorizations", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const agenceId = (req.query.agenceId as string) || user.agenceId;

      if (!agenceId) {
        return res.status(400).json({ error: "L'agence est requise" });
      }

      const authorizations = await accessControlService.getActiveAuthorizationsForAgence(agenceId);
      res.json(authorizations);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching authorizations');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/caisse/authorizations/:id/revoke
   * Révoque une autorisation active
   */
  /**
   * POST /api/caisse/authorizations/:id/revoke
   */
  app.post("/api/caisse/authorizations/:id/revoke", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.CAISSE), async (req, res) => {
    try {
      const user = req.session.user!;
      const data = normalizeKeysDeep(req.body) as any;

      await accessControlService.revokeAuthorization(
        req.params.id,
        user.id,
        data.reason
      );

      await logAudit(
        req,
        "AUTHORIZATION_REVOKED",
        "caisse_user_authorization",
        req.params.id,
        { reason: data.reason },
        "success",
        "high"
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error revoking authorization');
      res.status(500).json({ error: error.message });
    }
  });
}
