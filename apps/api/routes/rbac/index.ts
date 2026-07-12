import type { Express } from "express";
import { registerRbacModulesRoutes } from "./rbac-modules";
import { registerRbacPermissionsRoutes } from "./rbac-permissions";
import { registerRbacRolesRoutes } from "./rbac-roles";
import { registerRbacOverridesRoutes } from "./rbac-overrides";
import { registerRbacTempPermissionsRoutes } from "./rbac-temp-permissions";
import { registerRbacAuditRoutes } from "./rbac-audit";
import { registerRbacHierarchyRoutes } from "./rbac-hierarchy";
import { registerRbacCriticalRoutes } from "./rbac-critical";
import { registerRbacConditionTemplatesRoutes } from "./rbac-condition-templates";
import { registerRbacRequestsRoutes } from "./rbac-requests";
import { registerRbacCoreRoutes } from "./rbac-core";

export function registerRbacRoutes(app: Express) {
  registerRbacModulesRoutes(app);
  registerRbacPermissionsRoutes(app);
  registerRbacRolesRoutes(app);
  registerRbacOverridesRoutes(app);
  registerRbacTempPermissionsRoutes(app);
  registerRbacAuditRoutes(app);
  registerRbacHierarchyRoutes(app);
  registerRbacCriticalRoutes(app);
  registerRbacConditionTemplatesRoutes(app);
  registerRbacRequestsRoutes(app);
  registerRbacCoreRoutes(app);
}
