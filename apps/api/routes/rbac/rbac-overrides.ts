import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireAnyAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getRbacVersion, getUserPermissionOverrides } from "../../services/rbac-service";
import {
  toggleOverride,
  resetOverrides,
  bulkUpdateOverrides
} from "../../services/rbac/overrides.service";
import { type AuditLogContext } from "../../services/rbac-audit-service";

const logger = createLogger('Routes:RBAC:Overrides');

function getAuditContext(req: Request): AuditLogContext {
  return {
    actorUserId: req.session?.user?.id || req.session?.userId || '',
    actorIp: req.ip || req.socket?.remoteAddress,
    actorUserAgent: req.headers['user-agent'],
  };
}

export function registerRbacOverridesRoutes(app: Express) {
  app.get("/api/rbac/users/:userId/overrides",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.VIEW, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const overrides = await getUserPermissionOverrides(userId);
        const version = await getRbacVersion();

        res.json({ ...overrides, version });
      } catch (error: any) {
        logger.error({ err: error }, 'Get user overrides error');
        if (error.message?.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Erreur lors de la récupération des exceptions" });
      }
    }
  );

  app.patch("/api/rbac/users/:userId/overrides",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const result = await toggleOverride(userId, req.body, req, getAuditContext(req));

        res.json({
          success: true,
          version: result.newVersion,
          permissionId: result.resolvedPermissionId,
          permissionCode: result.resolvedPermissionCode,
          granted: req.body.granted,
          previousValue: result.oldValue,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Toggle user override error');
        if (error.message?.includes('not found') || error.message?.includes('Permission non trouvée')) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message?.includes('requis') || error.message?.includes('raison')) {
          return res.status(400).json({ message: error.message, requiresReason: error.message?.includes('raison') });
        }
        res.status(500).json({ message: "Erreur lors de la modification de l'exception" });
      }
    }
  );

  app.post("/api/rbac/users/:userId/overrides/reset",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const { reason } = req.body || {};

        const result = await resetOverrides(userId, reason, req, getAuditContext(req));

        res.json({
          success: true,
          version: result.newVersion,
          deleted: result.deleted,
        });
      } catch (error) {
        logger.error({ err: error }, 'Reset user overrides error');
        res.status(500).json({ message: "Erreur lors de la réinitialisation des exceptions" });
      }
    }
  );

  app.put("/api/rbac/users/:userId/overrides/bulk",
    requireAuth,
    attachAbility,
    requireAnyAbility([
      { action: Actions.MANAGE, subject: Subjects.RBAC },
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ]),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const updates = req.body.changes || req.body.updates;

        if (!Array.isArray(updates) || updates.length === 0) {
          return res.status(400).json({ message: "updates array requis" });
        }

        const { scope, agenceId, reason } = req.body;
        const result = await bulkUpdateOverrides(userId, updates, req, getAuditContext(req), { scope, agenceId, reason });

        res.json({
          success: true,
          ...result
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Bulk update user overrides error');
        if (error.message === "Utilisateur non trouvé") {
          return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Erreur lors de la mise à jour des exceptions" });
      }
    }
  );
}
