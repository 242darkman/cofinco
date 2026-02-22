/**
 * RBAC Audit Service
 * ==================
 *
 * Service pour l'audit trail des modifications RBAC.
 * Gère:
 * - Logging des changements de permissions
 * - Vérification des permissions critiques
 * - Feature flags RBAC
 * - Requêtes d'historique
 */

import { db } from '../db';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import {
  rbacAuditLog,
  systemFeatureFlags,
  permissions,
  users,
  type RbacAuditAction,
  type PermissionScope,
  type InsertRbacAuditLog,
  RBAC_FEATURE_FLAGS,
} from '@shared/schema';
import { isCriticalPermissionFromDb } from '../authorization/critical-patterns';
import { createLogger } from '../lib/logger';
import { getRbacVersion } from './rbac-service';

const logger = createLogger('RbacAudit');

// ============================================
// FEATURE FLAGS
// ============================================

/**
 * Cache des feature flags (rafraîchi toutes les 60 secondes)
 */
let featureFlagsCache: Map<string, boolean> = new Map();
let featureFlagsCacheTime: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get a feature flag value (with caching)
 */
export async function getFeatureFlag(flagKey: string): Promise<boolean> {
  const now = Date.now();

  // Refresh cache if stale
  if (now - featureFlagsCacheTime > CACHE_TTL_MS) {
    await refreshFeatureFlagsCache();
  }

  return featureFlagsCache.get(flagKey) ?? false;
}

/**
 * Refresh the feature flags cache
 */
async function refreshFeatureFlagsCache(): Promise<void> {
  try {
    const flags = await db
      .select({ key: systemFeatureFlags.flagKey, value: systemFeatureFlags.flagValue })
      .from(systemFeatureFlags);

    featureFlagsCache = new Map(flags.map(f => [f.key, f.value]));
    featureFlagsCacheTime = Date.now();
  } catch (err) {
    logger.error({ err }, 'Failed to refresh feature flags cache');
  }
}

/**
 * Check if scoped overrides are enabled
 */
export async function isScopedOverridesEnabled(): Promise<boolean> {
  return getFeatureFlag(RBAC_FEATURE_FLAGS.SCOPED_OVERRIDES);
}

/**
 * Check if audit logging is enabled
 */
export async function isAuditLogEnabled(): Promise<boolean> {
  return getFeatureFlag(RBAC_FEATURE_FLAGS.AUDIT_LOG_ENABLED);
}

/**
 * Check if critical permission reason is required
 */
export async function isReasonRequiredForCritical(): Promise<boolean> {
  return getFeatureFlag(RBAC_FEATURE_FLAGS.REQUIRE_REASON_CRITICAL);
}

// ============================================
// CRITICAL PERMISSIONS
// ============================================

/**
 * Check if a permission requires reason based on DB patterns
 */
export async function requiresReason(permissionCode: string): Promise<boolean> {
  const requireReasonEnabled = await isReasonRequiredForCritical();
  if (!requireReasonEnabled) {
    return false;
  }

  return isCriticalPermissionFromDb(permissionCode);
}

/**
 * Validate reason for critical permission change
 */
export async function validateReasonForCritical(
  permissionCode: string,
  reason: string | undefined | null,
  reasonRequired: boolean
): Promise<{ valid: boolean; error?: string }> {
  if (!reasonRequired) {
    return { valid: true };
  }

  const isCritical = await isCriticalPermissionFromDb(permissionCode);
  if (isCritical && (!reason || reason.trim().length === 0)) {
    return {
      valid: false,
      error: `La permission "${permissionCode}" est critique et nécessite une justification`,
    };
  }

  return { valid: true };
}

// ============================================
// AUDIT LOGGING
// ============================================

export interface AuditLogContext {
  actorUserId: string;
  actorIp?: string;
  actorUserAgent?: string;
}

export interface AuditLogEntry {
  targetUserId?: string;
  targetRole?: string;
  action: RbacAuditAction;
  permissionId?: string;
  permissionCode?: string;
  oldValue?: boolean | null;
  newValue?: boolean | null;
  scope?: PermissionScope;
  agenceId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an RBAC change to the audit trail
 */
export async function logRbacChange(
  context: AuditLogContext,
  entry: AuditLogEntry
): Promise<string | null> {
  // Check if audit logging is enabled
  const auditEnabled = await isAuditLogEnabled();
  if (!auditEnabled) {
    logger.debug({ entry }, 'Audit log disabled, skipping');
    return null;
  }

  const versionBefore = await getRbacVersion();

  try {
    const [result] = await db.insert(rbacAuditLog).values({
      actorUserId: context.actorUserId,
      actorIp: context.actorIp,
      actorUserAgent: context.actorUserAgent,
      targetUserId: entry.targetUserId,
      targetRole: entry.targetRole,
      action: entry.action,
      permissionId: entry.permissionId,
      permissionCode: entry.permissionCode,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      scope: entry.scope || 'GLOBAL',
      agenceId: entry.agenceId,
      reason: entry.reason,
      metadata: entry.metadata || {},
      rbacVersionBefore: versionBefore,
    }).returning({ id: rbacAuditLog.id });

    logger.info({
      auditId: result.id,
      action: entry.action,
      targetUserId: entry.targetUserId,
      permissionCode: entry.permissionCode,
    }, 'RBAC audit log created');

    return result.id;
  } catch (err) {
    logger.error({ err, entry }, 'Failed to create RBAC audit log');
    // Don't throw - audit logging should not break the main operation
    return null;
  }
}

/**
 * Log a bulk permission change
 */
export async function logBulkRbacChange(
  context: AuditLogContext,
  targetUserId: string,
  changes: Array<{
    permissionCode: string;
    oldValue?: boolean | null;
    newValue?: boolean | null;
  }>,
  options: {
    scope?: PermissionScope;
    agenceId?: string | null;
    reason?: string;
  } = {}
): Promise<string | null> {
  const auditEnabled = await isAuditLogEnabled();
  if (!auditEnabled) {
    return null;
  }

  const versionBefore = await getRbacVersion();

  try {
    const [result] = await db.insert(rbacAuditLog).values({
      actorUserId: context.actorUserId,
      actorIp: context.actorIp,
      actorUserAgent: context.actorUserAgent,
      targetUserId,
      action: 'BULK_UPDATE',
      scope: options.scope || 'GLOBAL',
      agenceId: options.agenceId,
      reason: options.reason,
      metadata: {
        changesCount: changes.length,
        changes: changes.map(c => ({
          permissionCode: c.permissionCode,
          oldValue: c.oldValue,
          newValue: c.newValue,
        })),
      },
      rbacVersionBefore: versionBefore,
    }).returning({ id: rbacAuditLog.id });

    logger.info({
      auditId: result.id,
      targetUserId,
      changesCount: changes.length,
    }, 'RBAC bulk audit log created');

    return result.id;
  } catch (err) {
    logger.error({ err }, 'Failed to create RBAC bulk audit log');
    return null;
  }
}

// ============================================
// AUDIT HISTORY QUERIES
// ============================================

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
 * Get RBAC audit history with filters
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
    SELECT CONCAT(COALESCE(prenom, ''), ' ', nom) FROM users WHERE id = ${rbacAuditLog.actorUserId}
  )`.as('actor_name');

  // Target alias
  const targetAlias = sql<string>`(
    SELECT CONCAT(COALESCE(prenom, ''), ' ', nom) FROM users WHERE id = ${rbacAuditLog.targetUserId}
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
 * Get audit history for a specific user
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
 * Get recent audit entries for a permission code
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

// ============================================
// EFFECTIVE PERMISSIONS WITH SOURCE
// ============================================

export interface EffectivePermissionWithSource {
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  granted: boolean;
  source: 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE';
  sourceRole?: string;
  sourceAgenceId?: string | null;
  conditions?: Record<string, unknown>;
}

/**
 * Get effective permissions with their source for debugging
 * (Uses the v_effective_permissions view)
 */
export async function getEffectivePermissionsWithSource(
  userId: string,
  agenceId?: string
): Promise<EffectivePermissionWithSource[]> {
  const results = await db.execute<{
    permission_id: string;
    permission_code: string;
    permission_name: string;
    granted: boolean;
    source: 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE';
    source_role: string | null;
    source_agence_id: string | null;
    conditions: Record<string, unknown> | null;
  }>(sql`
    SELECT
      permission_id,
      permission_code,
      permission_name,
      granted,
      source,
      source_role,
      source_agence_id,
      conditions
    FROM v_effective_permissions
    WHERE user_id = ${userId}
      AND (
        source_agence_id IS NULL
        OR source_agence_id = ${agenceId || null}
      )
    ORDER BY permission_code
  `);

  return results.rows.map(r => ({
    permissionId: r.permission_id,
    permissionCode: r.permission_code,
    permissionName: r.permission_name,
    granted: r.granted,
    source: r.source,
    sourceRole: r.source_role || undefined,
    sourceAgenceId: r.source_agence_id,
    conditions: r.conditions || undefined,
  }));
}

/**
 * Explain why a user has or doesn't have a specific permission
 */
export async function explainPermission(
  userId: string,
  permissionCode: string,
  agenceId?: string
): Promise<{
  hasPermission: boolean;
  source: 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE' | 'NONE';
  explanation: string;
  details: Record<string, unknown>;
}> {
  const effective = await getEffectivePermissionsWithSource(userId, agenceId);
  const match = effective.find(p => p.permissionCode === permissionCode);

  if (!match) {
    return {
      hasPermission: false,
      source: 'NONE',
      explanation: `L'utilisateur n'a pas la permission "${permissionCode}" car elle n'est ni accordée par son rôle, ni par un override, ni par une permission temporaire.`,
      details: { permissionCode, checked: true },
    };
  }

  const sourceLabels = {
    ROLE: `héritée du rôle "${match.sourceRole}"`,
    TEMPORARY: 'accordée temporairement',
    OVERRIDE_GLOBAL: 'définie par un override global',
    OVERRIDE_AGENCE: `définie par un override pour l'agence ${match.sourceAgenceId}`,
  };

  const explanation = match.granted
    ? `L'utilisateur a la permission "${permissionCode}" ${sourceLabels[match.source]}.`
    : `La permission "${permissionCode}" est explicitement refusée ${sourceLabels[match.source]}.`;

  return {
    hasPermission: match.granted,
    source: match.source,
    explanation,
    details: {
      permissionId: match.permissionId,
      permissionCode: match.permissionCode,
      granted: match.granted,
      source: match.source,
      sourceRole: match.sourceRole,
      sourceAgenceId: match.sourceAgenceId,
      conditions: match.conditions,
    },
  };
}

// ============================================
// AUDIT REVERT
// ============================================

const REVERTABLE_ACTIONS: RbacAuditAction[] = ['TOGGLE', 'BULK_UPDATE'];

/**
 * Revert an audit entry — applies the inverse change
 */
export async function revertAuditEntry(
  auditId: string,
  actorContext: AuditLogContext,
  reason?: string
): Promise<{ success: boolean; error?: string; revertedAction?: string; newAuditId?: string | null }> {
  const { toggleRolePermission, toggleUserPermissionOverride } = await import('./rbac-service');

  // 1. Load the audit entry
  const [entry] = await db
    .select()
    .from(rbacAuditLog)
    .where(eq(rbacAuditLog.id, auditId));

  if (!entry) {
    return { success: false, error: "Entrée d'audit non trouvée" };
  }

  // 2. Check if revertable
  if (!REVERTABLE_ACTIONS.includes(entry.action)) {
    return { success: false, error: `L'action "${entry.action}" ne peut pas être annulée` };
  }

  // 3. Apply inverse based on action type
  if (entry.action === 'TOGGLE') {
    if (!entry.permissionId) {
      return { success: false, error: "L'entrée ne contient pas de permissionId" };
    }

    const revertValue = entry.oldValue ?? null;

    if (entry.targetUserId) {
      await toggleUserPermissionOverride(entry.targetUserId, entry.permissionId, revertValue);
    } else if (entry.targetRole) {
      // For role permissions, oldValue null means it didn't exist (revert = remove = granted=false)
      await toggleRolePermission(
        entry.targetRole as any,
        entry.permissionId,
        revertValue ?? false
      );
    } else {
      return { success: false, error: "L'entrée ne contient ni targetUserId ni targetRole" };
    }
  } else if (entry.action === 'BULK_UPDATE') {
    const metadata = entry.metadata as Record<string, any> | null;
    const changes = metadata?.changes as Array<{
      permissionId?: string;
      permissionCode?: string;
      oldValue?: boolean | null;
      newValue?: boolean | null;
    }> | undefined;

    if (!changes || changes.length === 0) {
      return { success: false, error: "L'entrée BULK_UPDATE ne contient pas de détails de changements" };
    }

    // Revert each change
    for (const change of changes) {
      const permId = change.permissionId;
      if (!permId) continue;

      const revertValue = change.oldValue ?? null;
      if (entry.targetUserId) {
        await toggleUserPermissionOverride(entry.targetUserId, permId, revertValue);
      } else if (entry.targetRole) {
        await toggleRolePermission(entry.targetRole as any, permId, revertValue ?? false);
      }
    }
  }

  // 4. Create audit entry for the revert
  const newAuditId = await logRbacChange(actorContext, {
    action: 'REVERT' as RbacAuditAction,
    targetUserId: entry.targetUserId || undefined,
    targetRole: entry.targetRole || undefined,
    permissionId: entry.permissionId || undefined,
    permissionCode: entry.permissionCode || undefined,
    reason: reason || `Annulation de l'action ${entry.action}`,
    metadata: { revertedAuditId: auditId, revertedAction: entry.action },
  });

  return { success: true, revertedAction: entry.action, newAuditId };
}
