import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { rbacAuditLog, type RbacAuditAction } from '@shared/schema';
import { type AuditLogContext, logRbacChange } from './logging.service';

const REVERTABLE_ACTIONS: RbacAuditAction[] = ['TOGGLE', 'BULK_UPDATE'];

/**
 * Annule une entrée d'audit — applique la modification inverse
 */
export async function revertAuditEntry(
  auditId: string,
  actorContext: AuditLogContext,
  reason?: string
): Promise<{ success: boolean; error?: string; revertedAction?: string; newAuditId?: string | null }> {
  const { toggleRolePermission, toggleUserPermissionOverride } = await import('../rbac-service');

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
