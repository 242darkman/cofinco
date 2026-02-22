/**
 * Permission Request Workflow Service
 * ====================================
 *
 * Handles permission request lifecycle:
 * - Users create requests for permissions they need
 * - Admins approve/reject requests
 * - Approved requests are automatically applied
 */

import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  permissionRequests,
  permissions,
  users,
  type PermissionRequestStatus,
} from '@shared/schema';
import { createLogger } from '../lib/logger';
import { toggleUserPermissionOverride, getUserIdsWithRole } from './rbac-service';
import { logRbacChange, type AuditLogContext } from './rbac-audit-service';
import { sendInAppNotification } from './notifications/notification-service';
import { SystemRole } from '@shared/types/roles';

const logger = createLogger('PermissionRequestService');

/**
 * Create a permission request
 */
export async function createPermissionRequest(
  requesterId: string,
  data: {
    permissionId: string;
    permissionCode: string;
    requestType: 'GRANT' | 'DENY' | 'TEMPORARY';
    reason: string;
    expiresAt?: string;
  }
) {
  if (!data.permissionId || !data.reason) {
    throw new Error('permissionId et reason sont requis');
  }

  if (data.reason.length < 10) {
    throw new Error('La raison doit contenir au moins 10 caractères');
  }

  // Check permission exists
  const [perm] = await db
    .select({ id: permissions.id, code: permissions.code, name: permissions.name })
    .from(permissions)
    .where(eq(permissions.id, data.permissionId));

  if (!perm) throw new Error('Permission non trouvée');

  // Check for duplicate pending request
  const [existing] = await db
    .select({ id: permissionRequests.id })
    .from(permissionRequests)
    .where(and(
      eq(permissionRequests.requesterId, requesterId),
      eq(permissionRequests.permissionId, data.permissionId),
      eq(permissionRequests.status, 'PENDING'),
    ));

  if (existing) {
    throw new Error('Une demande en attente existe déjà pour cette permission');
  }

  // Insert request
  const [request] = await db
    .insert(permissionRequests)
    .values({
      requesterId,
      permissionId: data.permissionId,
      permissionCode: data.permissionCode || perm.code,
      requestType: data.requestType || 'GRANT',
      reason: data.reason,
      status: 'PENDING',
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    })
    .returning();

  // Notify admins
  try {
    const adminIds = await getUserIdsWithRole(SystemRole.ADMIN);
    const [requester] = await db
      .select({ nom: users.nom, prenom: users.prenom })
      .from(users)
      .where(eq(users.id, requesterId));

    const requesterName = requester ? `${requester.prenom || ''} ${requester.nom}`.trim() : 'Un utilisateur';

    for (const adminId of adminIds) {
      await sendInAppNotification({
        userId: adminId,
        type: 'PERMISSION_REQUEST',
        titre: 'Nouvelle demande de permission',
        message: `${requesterName} demande la permission "${perm.name}" (${perm.code})`,
        lien: '/admin?tab=roles&view=demandes',
        priorite: 'NORMAL',
        referenceId: request.id,
        referenceType: 'permission_request',
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to notify admins about permission request');
  }

  return request;
}

/**
 * Get requests for a specific user
 */
export async function getMyRequests(
  userId: string,
  filters?: { status?: string }
) {
  const conditions = [eq(permissionRequests.requesterId, userId)];
  if (filters?.status) {
    conditions.push(eq(permissionRequests.status, filters.status as PermissionRequestStatus));
  }

  const rows = await db
    .select({
      id: permissionRequests.id,
      permissionId: permissionRequests.permissionId,
      permissionCode: permissionRequests.permissionCode,
      permissionName: permissions.name,
      requestType: permissionRequests.requestType,
      reason: permissionRequests.reason,
      status: permissionRequests.status,
      expiresAt: permissionRequests.expiresAt,
      reviewReason: permissionRequests.reviewReason,
      reviewedAt: permissionRequests.reviewedAt,
      createdAt: permissionRequests.createdAt,
    })
    .from(permissionRequests)
    .leftJoin(permissions, eq(permissionRequests.permissionId, permissions.id))
    .where(and(...conditions))
    .orderBy(desc(permissionRequests.createdAt));

  return rows;
}

/**
 * Get all requests (for admin view)
 */
export async function getPendingRequests(
  filters?: { status?: string }
) {
  const conditions: any[] = [];
  if (filters?.status) {
    conditions.push(eq(permissionRequests.status, filters.status as PermissionRequestStatus));
  }

  const rows = await db
    .select({
      id: permissionRequests.id,
      requesterId: permissionRequests.requesterId,
      requesterNom: users.nom,
      requesterPrenom: users.prenom,
      permissionId: permissionRequests.permissionId,
      permissionCode: permissionRequests.permissionCode,
      permissionName: permissions.name,
      requestType: permissionRequests.requestType,
      reason: permissionRequests.reason,
      status: permissionRequests.status,
      expiresAt: permissionRequests.expiresAt,
      reviewerId: permissionRequests.reviewerId,
      reviewReason: permissionRequests.reviewReason,
      reviewedAt: permissionRequests.reviewedAt,
      createdAt: permissionRequests.createdAt,
    })
    .from(permissionRequests)
    .leftJoin(permissions, eq(permissionRequests.permissionId, permissions.id))
    .leftJoin(users, eq(permissionRequests.requesterId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(permissionRequests.createdAt));

  const pendingCount = rows.filter(r => r.status === 'PENDING').length;
  return { data: rows, pendingCount };
}

/**
 * Approve or reject a request
 */
export async function reviewRequest(
  requestId: string,
  reviewerId: string,
  decision: 'APPROVED' | 'REJECTED',
  reviewReason?: string,
  auditContext?: AuditLogContext,
) {
  // Load request
  const [request] = await db
    .select()
    .from(permissionRequests)
    .where(eq(permissionRequests.id, requestId));

  if (!request) throw new Error('Demande non trouvée');
  if (request.status !== 'PENDING') throw new Error('Cette demande a déjà été traitée');

  // Update status
  const [updated] = await db
    .update(permissionRequests)
    .set({
      status: decision,
      reviewerId,
      reviewedAt: new Date(),
      reviewReason: reviewReason || null,
      updatedAt: new Date(),
    })
    .where(eq(permissionRequests.id, requestId))
    .returning();

  // If approved, apply the permission change
  if (decision === 'APPROVED') {
    if (request.requestType === 'GRANT') {
      await toggleUserPermissionOverride(request.requesterId, request.permissionId, true);
    } else if (request.requestType === 'DENY') {
      await toggleUserPermissionOverride(request.requesterId, request.permissionId, false);
    } else if (request.requestType === 'TEMPORARY') {
      // Use the actual temporary permissions system with expiry
      const { grantTemporaryPermission } = await import('./temporary-permissions-service');
      await grantTemporaryPermission({
        userId: request.requesterId,
        permissionId: request.permissionId,
        grantedBy: reviewerId,
        expiresAt: request.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // Default 24h
        reason: request.reason,
      });
    }

    if (auditContext) {
      await logRbacChange(auditContext, {
        action: 'REQUEST_APPROVED' as any,
        targetUserId: request.requesterId,
        permissionId: request.permissionId,
        permissionCode: request.permissionCode,
        newValue: request.requestType !== 'DENY',
        reason: reviewReason || `Demande approuvée (${request.requestType})`,
        metadata: { requestId, requestType: request.requestType },
      });
    }
  } else if (auditContext) {
    await logRbacChange(auditContext, {
      action: 'REQUEST_REJECTED' as any,
      targetUserId: request.requesterId,
      permissionId: request.permissionId,
      permissionCode: request.permissionCode,
      reason: reviewReason || 'Demande rejetée',
      metadata: { requestId },
    });
  }

  // Notify requester
  try {
    const [reviewer] = await db
      .select({ nom: users.nom, prenom: users.prenom })
      .from(users)
      .where(eq(users.id, reviewerId));

    const reviewerName = reviewer ? `${reviewer.prenom || ''} ${reviewer.nom}`.trim() : 'Un administrateur';
    const statusLabel = decision === 'APPROVED' ? 'approuvée' : 'rejetée';

    await sendInAppNotification({
      userId: request.requesterId,
      type: 'PERMISSION_REQUEST_REVIEWED',
      titre: `Demande de permission ${statusLabel}`,
      message: `${reviewerName} a ${statusLabel} votre demande pour "${request.permissionCode}"${reviewReason ? ` — ${reviewReason}` : ''}`,
      lien: '/admin?tab=roles&view=demandes',
      priorite: decision === 'APPROVED' ? 'NORMAL' : 'HIGH',
      referenceId: requestId,
      referenceType: 'permission_request',
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to notify requester about request review');
  }

  return updated;
}

/**
 * Cancel own pending request
 */
export async function cancelRequest(requestId: string, requesterId: string) {
  const [request] = await db
    .select()
    .from(permissionRequests)
    .where(eq(permissionRequests.id, requestId));

  if (!request) throw new Error('Demande non trouvée');
  if (request.requesterId !== requesterId) throw new Error('Vous ne pouvez annuler que vos propres demandes');
  if (request.status !== 'PENDING') throw new Error('Seules les demandes en attente peuvent être annulées');

  await db
    .update(permissionRequests)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(eq(permissionRequests.id, requestId));
}
