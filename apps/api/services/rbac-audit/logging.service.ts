import { db } from '../../db';
import { rbacAuditLog, type RbacAuditAction, type PermissionScope } from '@shared/schema';
import { createLogger } from '../../lib/logger';
import { getRbacVersion } from '../rbac-service';
import { isAuditLogEnabled } from './feature-flags.service';

const logger = createLogger('RbacAudit:Logging');

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
 * Enregistre une modification RBAC dans le journal d'audit
 */
export async function logRbacChange(
  context: AuditLogContext,
  entry: AuditLogEntry
): Promise<string | null> {
  // Vérifie si la journalisation d'audit est activée
  const auditEnabled = await isAuditLogEnabled();
  if (!auditEnabled) {
    logger.debug({ entry }, 'Journal d\'audit désactivé, ignoré');
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
    }, 'Journal d\'audit RBAC créé');

    return result.id;
  } catch (err) {
    logger.error({ err, entry }, 'Échec de la création du journal d\'audit RBAC');
    // Ne pas lever d'exception - la journalisation ne doit pas interrompre l'opération principale
    return null;
  }
}

/**
 * Enregistre une modification de permissions en bloc
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
    }, 'Journal d\'audit RBAC en bloc créé');

    return result.id;
  } catch (err) {
    logger.error({ err }, 'Échec de la création du journal d\'audit RBAC en bloc');
    return null;
  }
}
