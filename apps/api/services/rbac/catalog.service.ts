import { db } from '../../db';
import { eq, asc } from 'drizzle-orm';
import { modules, permissions } from '@shared/schema';
import {
  Actions,
  Subjects,
  getPermissionMapping,
  type PermissionCatalogEntry,
} from '@shared/ability';

/**
 * Récupère le catalogue complet des permissions avec les modules
 */
export async function getPermissionCatalog(): Promise<{
  modules: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string;
    icon: string | null;
    orderIndex: number;
    permissionCount: number;
  }>;
  permissions: PermissionCatalogEntry[];
  totalPermissions: number;
}> {
  // Get all modules
  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.isActive, true))
    .orderBy(asc(modules.orderIndex), asc(modules.name));

  // Get all permissions with module info
  const permissionRows = await db
    .select({
      id: permissions.id,
      code: permissions.code,
      name: permissions.name,
      description: permissions.description,
      moduleId: permissions.moduleId,
      moduleName: modules.name,
      moduleCategory: modules.category,
    })
    .from(permissions)
    .innerJoin(modules, eq(permissions.moduleId, modules.id))
    .where(eq(modules.isActive, true))
    .orderBy(asc(modules.orderIndex), asc(permissions.code));

  // Build catalog entries with CASL mapping
  const catalogEntries: PermissionCatalogEntry[] = permissionRows.map((p) => {
    const mapping = getPermissionMapping(p.code);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description || undefined,
      moduleId: p.moduleId,
      moduleName: p.moduleName,
      moduleCategory: p.moduleCategory,
      action: mapping?.action || (Actions.VIEW as any),
      subject: mapping?.subject || (Subjects.ALL as any),
    };
  });

  // Count permissions per module
  const modulePermissionCounts = new Map<string, number>();
  for (const perm of permissionRows) {
    const count = modulePermissionCounts.get(perm.moduleId) || 0;
    modulePermissionCounts.set(perm.moduleId, count + 1);
  }

  const modulesWithCounts = moduleRows.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    category: m.category,
    icon: m.icon,
    orderIndex: m.orderIndex,
    permissionCount: modulePermissionCounts.get(m.id) || 0,
  }));

  return {
    modules: modulesWithCounts,
    permissions: catalogEntries,
    totalPermissions: catalogEntries.length,
  };
}
