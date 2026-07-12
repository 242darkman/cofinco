import { db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { modules, permissions } from '@shared/schema';

/**
 * Crée un nouveau module
 */
export async function createModule(data: {
  name: string;
  description?: string;
  icon?: string;
  category: string;
  isActive?: boolean;
  orderIndex?: number;
}) {
  const [created] = await db
    .insert(modules)
    .values({
      name: data.name,
      description: data.description || null,
      icon: data.icon || 'Shield',
      category: data.category,
      isActive: data.isActive ?? true,
      orderIndex: data.orderIndex ?? 0,
    })
    .returning();
  return created;
}

/**
 * Met à jour un module existant
 */
export async function updateModule(id: string, data: Partial<{
  name: string;
  description: string | null;
  icon: string;
  category: string;
  isActive: boolean;
  orderIndex: number;
}>) {
  const [updated] = await db
    .update(modules)
    .set(data)
    .where(eq(modules.id, id))
    .returning();
  return updated;
}

/**
 * Supprime un module — refuse s'il y a des permissions avec des assignations actives
 */
export async function deleteModule(id: string): Promise<{ success: boolean; error?: string }> {
  // Check for active assignments on the module's permissions
  const assignmentCount = await db.execute<{ cnt: string }>(sql`
    SELECT (
      (SELECT COUNT(*) FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module_id = ${id}))
      +
      (SELECT COUNT(*) FROM user_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE module_id = ${id}))
    ) as cnt
  `);
  const cnt = parseInt(assignmentCount.rows[0]?.cnt || '0', 10);
  if (cnt > 0) {
    return { success: false, error: `Ce module a ${cnt} assignation(s) active(s). Supprimez-les d'abord.` };
  }

  await db.delete(modules).where(eq(modules.id, id));
  return { success: true };
}

/**
 * Crée une nouvelle permission
 */
export async function createPermission(data: {
  moduleId: string;
  name: string;
  code: string;
  description?: string;
}) {
  const [created] = await db
    .insert(permissions)
    .values({
      moduleId: data.moduleId,
      name: data.name,
      code: data.code,
      description: data.description || null,
    })
    .returning();
  return created;
}

/**
 * Met à jour une permission existante
 */
export async function updatePermission(id: string, data: Partial<{
  name: string;
  code: string;
  description: string | null;
}>) {
  const [updated] = await db
    .update(permissions)
    .set(data)
    .where(eq(permissions.id, id))
    .returning();
  return updated;
}

/**
 * Supprime une permission — refuse s'il y a des assignations actives
 */
export async function deletePermission(id: string): Promise<{ success: boolean; error?: string }> {
  const assignmentCount = await db.execute<{ cnt: string }>(sql`
    SELECT (
      (SELECT COUNT(*) FROM role_permissions WHERE permission_id = ${id})
      +
      (SELECT COUNT(*) FROM user_permissions WHERE permission_id = ${id})
      +
      (SELECT COUNT(*) FROM temporary_permissions WHERE permission_id = ${id} AND is_active = true)
    ) as cnt
  `);
  const cnt = parseInt(assignmentCount.rows[0]?.cnt || '0', 10);
  if (cnt > 0) {
    return { success: false, error: `Cette permission a ${cnt} assignation(s) active(s). Supprimez-les d'abord.` };
  }

  await db.delete(permissions).where(eq(permissions.id, id));
  return { success: true };
}
