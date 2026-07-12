import { db } from '../../db';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { rbacAuditLog, users, type RbacAuditAction, type PermissionScope } from '@shared/schema';

export interface AuditHistoryFilters {
  actorUserId?: string;
  targetUserId?: string;
  targetRole?: string;
  action?: RbacAuditAction;
  permissionCode?: string;
  scope?: PermissionScope;
  agenceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Récupère l'historique d'audit RBAC avec filtres
 */
export async function getAuditHistory(filters: AuditHistoryFilters = {}): Promise<{
  data: Array<{
    id: string;
    createdAt: Date;
    actorUserId: string;
    actorName: string | null;
    targetUserId: string | null;
    targetName: string | null;
    targetRole: string | null;
    action: RbacAuditAction;
    permissionCode: string | null;
    oldValue: boolean | null;
    newValue: boolean | null;
    scope: PermissionScope;
    agenceId: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
  }>;
  total: number;
}> {
  const {
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    ...otherFilters
  } = filters;

  // Build conditions
  const conditions = [];

  if (otherFilters.actorUserId) {
    conditions.push(eq(rbacAuditLog.actorUserId, otherFilters.actorUserId));
  }
  if (otherFilters.targetUserId) {
    conditions.push(eq(rbacAuditLog.targetUserId, otherFilters.targetUserId));
  }
  if (otherFilters.targetRole) {
    conditions.push(eq(rbacAuditLog.targetRole, otherFilters.targetRole));
  }
  if (otherFilters.action) {
    conditions.push(eq(rbacAuditLog.action, otherFilters.action));
  }
  if (otherFilters.permissionCode) {
    conditions.push(eq(rbacAuditLog.permissionCode, otherFilters.permissionCode));
  }
  if (otherFilters.scope) {
    conditions.push(eq(rbacAuditLog.scope, otherFilters.scope));
  }
  if (otherFilters.agenceId) {
    conditions.push(eq(rbacAuditLog.agenceId, otherFilters.agenceId));
  }
  if (startDate) {
    conditions.push(gte(rbacAuditLog.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(rbacAuditLog.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Actor alias
  const actorAlias = sql<string>`(
    SELECT CONCAT(COALESCE(${users.prenom}, ''), ' ', ${users.nom}) FROM ${users} WHERE ${users.id} = ${rbacAuditLog.actorUserId}
  )`.as('actor_name');

  // Target alias
  const targetAlias = sql<string>`(
    SELECT CONCAT(COALESCE(${users.prenom}, ''), ' ', ${users.nom}) FROM ${users} WHERE ${users.id} = ${rbacAuditLog.targetUserId}
  )`.as('target_name');

  // Query data
  const data = await db
    .select({
      id: rbacAuditLog.id,
      createdAt: rbacAuditLog.createdAt,
      actorUserId: rbacAuditLog.actorUserId,
      actorName: actorAlias,
      targetUserId: rbacAuditLog.targetUserId,
      targetName: targetAlias,
      targetRole: rbacAuditLog.targetRole,
      action: rbacAuditLog.action,
      permissionCode: rbacAuditLog.permissionCode,
      oldValue: rbacAuditLog.oldValue,
      newValue: rbacAuditLog.newValue,
      scope: rbacAuditLog.scope,
      agenceId: rbacAuditLog.agenceId,
      reason: rbacAuditLog.reason,
      metadata: rbacAuditLog.metadata,
    })
    .from(rbacAuditLog)
    .where(whereClause)
    .orderBy(desc(rbacAuditLog.createdAt))
    .limit(limit)
    .offset(offset);

  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rbacAuditLog)
    .where(whereClause);

  return {
    data: data.map(d => ({
      ...d,
      metadata: (d.metadata || {}) as Record<string, unknown>,
    })),
    total: countResult?.count || 0,
  };
}

/**
 * Récupère l'historique d'audit pour un utilisateur spécifique
 */
export async function getUserAuditHistory(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ReturnType<typeof getAuditHistory>> {
  return getAuditHistory({
    targetUserId: userId,
    ...options,
  });
}

/**
 * Récupère les entrées d'audit récentes pour un code de permission
 */
export async function getPermissionAuditHistory(
  permissionCode: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ReturnType<typeof getAuditHistory>> {
  return getAuditHistory({
    permissionCode,
    ...options,
  });
}
