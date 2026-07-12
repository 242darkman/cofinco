import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  getRolePermissionsList,
  createRolePermission,
  updateRolePermission,
  deleteRolePermission
} from "../../services/rbac/roles.service";
import { type AuditLogContext } from "../../services/rbac-audit-service";

const logger = createLogger('Routes:RBAC:Roles');

function getAuditContext(req: Request): AuditLogContext {
  return {
    actorUserId: req.session?.user?.id || req.session?.userId || '',
    actorIp: req.ip || req.socket?.remoteAddress,
    actorUserAgent: req.headers['user-agent'],
  };
}

export function registerRbacRolesRoutes(app: Express) {
  app.get("/api/role-permissions", requireAuth, async (req, res) => {
    try {
      const { role } = req.query;
      if (!role) {
        return res.status(400).json({ message: "Le paramètre 'role' est requis" });
      }

      const rolePerms = await getRolePermissionsList(role as string);
      res.json(rolePerms);
    } catch (error: any) {
      logger.error({ err: error }, 'Get role permissions error');
      if (error.message === "Rôle invalide") return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Erreur lors de la récupération des permissions du rôle" });
    }
  });

  app.post("/api/role-permissions", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const created = await createRolePermission(req.body, req, getAuditContext(req));
      res.status(201).json(created);
    } catch (error: any) {
      logger.error({ err: error }, 'Create role permission error');
      if (error.message === "Rôle invalide" || error.message.includes("requis")) {
        return res.status(400).json({ message: error.message });
      }
      if (error.message === "Permission non trouvée") {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Erreur lors de la création de la permission" });
    }
  });

  app.patch("/api/role-permissions/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { id } = req.params;
      const { granted } = req.body;

      const updated = await updateRolePermission(id, granted, req, getAuditContext(req));
      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Update role permission error');
      if (error.message === "Permission non trouvée") return res.status(404).json({ message: error.message });
      res.status(500).json({ message: "Erreur lors de la mise à jour de la permission" });
    }
  });

  app.delete("/api/role-permissions/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const deleted = await deleteRolePermission(req.params.id, req, getAuditContext(req));
      res.json(deleted);
    } catch (error: any) {
      logger.error({ err: error }, 'Delete role permission error');
      if (error.message === "Permission non trouvée") return res.status(404).json({ message: error.message });
      res.status(500).json({ message: "Erreur lors de la suppression de la permission" });
    }
  });
}
