import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireAnyAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import {
  getAllPermissions,
  bulkAssignPermissions,
  getRequestablePermissions
} from "../../services/rbac/permissions.service";
import {
  getUserPermissions,
  toggleUserPermission,
  resetUserPermissions,
} from "../../services/rbac/user-permissions.service";
import { getPermissionsForUserV2 } from "../../services/permissions-service";
import {
  getPermissionCatalog,
  getRbacVersion,
  createPermission as createPermissionService,
  updatePermission as updatePermissionService,
  deletePermission as deletePermissionService,
  incrementRbacVersion
} from "../../services/rbac-service";
import { logRbacChange, type AuditLogContext } from "../../services/rbac-audit-service";
import { broadcastRbacUpdate } from "../../services/rbac/permissions.service";
import { buildRbacUpdatePayload } from "../../services/rbac-service";

const logger = createLogger('Routes:RBAC:Permissions');

function getAuditContext(req: Request): AuditLogContext {
  return {
    actorUserId: req.session?.user?.id || req.session?.userId || '',
    actorIp: req.ip || req.socket?.remoteAddress,
    actorUserAgent: req.headers['user-agent'],
  };
}

export function registerRbacPermissionsRoutes(app: Express) {
  app.get("/api/permissions", requireAuth, async (req, res) => {
    try {
      const { module_id } = req.query;
      const allPermissions = await getAllPermissions(module_id as string);
      res.json(allPermissions);
    } catch (error) {
      logger.error({ err: error }, 'Get permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  app.get("/api/my-permissions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const agenceIdActive = req.session.user?.agenceId;

      if (!userId || !userRole) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const permissionsData = await getPermissionsForUserV2(userId, userRole, agenceIdActive);
      res.json(permissionsData);
    } catch (error) {
      logger.error({ err: error }, 'Get my permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  app.get("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const result = await getUserPermissions(req.params.userId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Get user permissions error');
      if (error.message?.includes('non trouvé')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Erreur lors de la récupération des permissions utilisateur" });
    }
  });

  app.post("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      const { permission_id, granted } = req.body;
      if (!permission_id) return res.status(400).json({ message: "permission_id requis" });

      const result = await toggleUserPermission(req.params.userId, permission_id, granted, req, getAuditContext(req));
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Toggle user permission error');
      if (error.message === "Permission non trouvée") return res.status(404).json({ message: error.message });
      res.status(500).json({ message: "Erreur lors de la modification de la permission" });
    }
  });

  app.delete("/api/user-permissions/:userId", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.RBAC), async (req, res) => {
    try {
      await resetUserPermissions(req.params.userId, req, getAuditContext(req));
      res.json({ message: "Permissions réinitialisées" });
    } catch (error) {
      logger.error({ err: error }, 'Reset user permissions error');
      res.status(500).json({ message: "Erreur lors de la réinitialisation" });
    }
  });

  app.get("/api/rbac/catalog", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.VIEW, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const catalog = await getPermissionCatalog();
      const version = await getRbacVersion();
      res.json({ ...catalog, version });
    } catch (error) {
      logger.error({ err: error }, 'Get RBAC catalog error');
      res.status(500).json({ message: "Erreur lors de la récupération du catalogue" });
    }
  });

  app.post("/api/rbac/permissions/bulk-assign", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { assignments } = req.body;
      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ message: "assignments array requis" });
      }

      const result = await bulkAssignPermissions(assignments, req, getAuditContext(req));
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error({ err: error }, 'Bulk assign permissions error');
      res.status(500).json({ message: "Erreur lors de l'assignation des permissions" });
    }
  });

  app.post("/api/rbac/permissions", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { moduleId, name, code, description } = req.body;
      if (!moduleId || !name || !code) return res.status(400).json({ message: "moduleId, name et code requis" });

      const created = await createPermissionService({ moduleId, name, code, description });

      await logRbacChange(getAuditContext(req), {
        action: 'PERMISSION_CREATE' as any,
        permissionCode: created.code,
        metadata: { permissionId: created.id, moduleId, name: created.name },
      });

      const newVersion = await incrementRbacVersion('permission_create', 'permission', { id: created.id });
      await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') return res.status(400).json({ message: "Une permission avec ce code existe déjà" });
      logger.error({ err: error }, 'Create permission error');
      res.status(500).json({ message: "Erreur lors de la création de la permission" });
    }
  });

  app.patch("/api/rbac/permissions/:id", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, code, description } = req.body;

      const updated = await updatePermissionService(id, { name, code, description });
      if (!updated) return res.status(404).json({ message: "Permission non trouvée" });

      await logRbacChange(getAuditContext(req), {
        action: 'PERMISSION_UPDATE' as any,
        permissionId: id,
        permissionCode: updated.code,
        metadata: { changes: req.body },
      });

      const newVersion = await incrementRbacVersion('permission_update', 'permission', { id });
      await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

      res.json(updated);
    } catch (error: any) {
      if (error?.code === '23505') return res.status(400).json({ message: "Une permission avec ce code existe déjà" });
      logger.error({ err: error }, 'Update permission error');
      res.status(500).json({ message: "Erreur lors de la mise à jour de la permission" });
    }
  });

  app.delete("/api/rbac/permissions/:id", requireAuth, attachAbility, requireAnyAbility([
    { action: Actions.MANAGE, subject: Subjects.RBAC },
    { action: Actions.MANAGE, subject: Subjects.ALL },
  ]), async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deletePermissionService(id);
      if (!result.success) return res.status(400).json({ message: result.error });

      const newVersion = await incrementRbacVersion('permission_delete', 'permission', { id });
      await broadcastRbacUpdate(buildRbacUpdatePayload('global', newVersion));

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Delete permission error');
      res.status(500).json({ message: "Erreur lors de la suppression de la permission" });
    }
  });

  app.get("/api/rbac/permissions/requestable", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.user?.id || req.session?.userId;
      const agenceIdActive = req.session?.user?.agenceId;
      if (!userId) return res.status(401).json({ message: "Non authentifié" });

      const result = await getRequestablePermissions(userId, agenceIdActive);
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, 'Get requestable permissions error');
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });
}
