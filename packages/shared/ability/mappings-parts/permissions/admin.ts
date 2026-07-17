/**
 * Fragment de mappings permission → CASL — domaine « admin ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permAdmin: Record<string, PermissionMapping> = {
  // ADMIN
  // =====================
  'admin.view': { action: Actions.VIEW, subject: Subjects.ADMIN },
  'admin.settings': { action: Actions.MANAGE, subject: Subjects.SETTINGS },
  'admin.manage': { action: Actions.MANAGE, subject: Subjects.ADMIN },
  'admin.users': { action: Actions.MANAGE, subject: Subjects.USER },
  'admin.roles': { action: Actions.MANAGE_ROLES, subject: Subjects.ROLE },
  'admin.logs': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  // Users
  'users.view': { action: Actions.VIEW, subject: Subjects.USER },
  'users.create': { action: Actions.CREATE, subject: Subjects.USER },
  'users.edit': { action: Actions.EDIT, subject: Subjects.USER },
  'users.delete': { action: Actions.DELETE, subject: Subjects.USER },
  'users.reset_password': { action: Actions.RESET_PASSWORD, subject: Subjects.USER },
  'users.suspend': { action: Actions.SUSPEND, subject: Subjects.USER },
  'users.activate': { action: Actions.ACTIVATE, subject: Subjects.USER },
  // Agences
  'agences.view': { action: Actions.VIEW, subject: Subjects.AGENCE },
  'agences.create': { action: Actions.CREATE, subject: Subjects.AGENCE },
  'agences.edit': { action: Actions.EDIT, subject: Subjects.AGENCE },
  'agences.delete': { action: Actions.DELETE, subject: Subjects.AGENCE },
  'agences.manage': { action: Actions.MANAGE, subject: Subjects.AGENCE },
  'agences.approve': { action: Actions.APPROVE, subject: Subjects.AGENCE },
  'agences.suspend': { action: Actions.SUSPEND, subject: Subjects.AGENCE },
  'agences.activate': { action: Actions.ACTIVATE, subject: Subjects.AGENCE },
  // Audit logs
  'audit.view': { action: Actions.VIEW, subject: Subjects.AUDIT_LOG },
  'audit.export': { action: Actions.EXPORT, subject: Subjects.AUDIT_LOG },

  // =====================
  // RBAC (Gestion des accès)
  // =====================
  'rbac.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'rbac.create': { action: Actions.CREATE, subject: Subjects.RBAC },
  'rbac.edit': { action: Actions.EDIT, subject: Subjects.RBAC },
  'rbac.delete': { action: Actions.DELETE, subject: Subjects.RBAC },
  'rbac.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },
  'rbac.roles.view': { action: Actions.VIEW, subject: Subjects.ROLE },
  'rbac.roles.edit': { action: Actions.EDIT, subject: Subjects.ROLE },
  'rbac.permissions.view': { action: Actions.VIEW, subject: Subjects.PERMISSION },
  'rbac.permissions.edit': { action: Actions.EDIT, subject: Subjects.PERMISSION },
  'permissions.view': { action: Actions.VIEW, subject: Subjects.PERMISSION },
  'permissions.assign': { action: Actions.ASSIGN, subject: Subjects.PERMISSION },
  'admin.locks.view': { action: Actions.VIEW, subject: Subjects.RBAC },
  'admin.locks.manage': { action: Actions.MANAGE, subject: Subjects.RBAC },

  // =====================
};
