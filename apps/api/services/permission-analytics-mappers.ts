import { permissionUsageLogs } from '@shared/schema';

import type { PermissionCheckLog } from './permission-analytics-types';

type PermissionUsageLogInsert = typeof permissionUsageLogs.$inferInsert;

/**
 * Convertit un log applicatif en ligne Drizzle insérable.
 *
 * Les valeurs restent typées comme données et sont passées à Drizzle, ce qui
 * évite la construction de SQL brut avec des champs issus de la requête.
 */
export function toPermissionUsageLogInsert(log: PermissionCheckLog): PermissionUsageLogInsert {
  return {
    userId: log.userId,
    userRole: log.userRole,
    permissionCode: log.permissionCode,
    action: log.action,
    subject: log.subject,
    allowed: log.allowed,
    deniedReason: log.deniedReason ?? null,
    agenceId: log.agenceId ?? null,
    resourceId: log.resourceId ?? null,
    resourceType: log.resourceType ?? null,
    endpoint: log.endpoint ?? null,
    ipAddress: log.ipAddress ?? null,
  };
}
