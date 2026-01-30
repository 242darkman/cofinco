/**
 * Temporary Permissions Service
 * =============================
 *
 * Gère les permissions temporaires avec expiration automatique.
 *
 * Fonctionnalités:
 * - Accorder une permission temporaire à un utilisateur
 * - Révoquer manuellement une permission temporaire
 * - Expirer automatiquement les permissions (appelé par cron)
 * - Obtenir les permissions temporaires actives pour un utilisateur
 */

import { db } from '../db';
import { temporaryPermissions, permissions, users } from '@shared/schema';
import { eq, and, lte, desc, sql } from 'drizzle-orm';
import { getWsInstance } from '../ws-server';
import { incrementRbacVersion } from './rbac-service';

// Types
export interface GrantTempPermissionParams {
  userId: string;
  permissionId: string;
  grantedBy: string;
  expiresAt: Date;
  reason: string;
}

export interface TempPermissionResult {
  id: string;
  userId: string;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  grantedBy: string;
  granterName: string;
  grantedAt: Date;
  expiresAt: Date;
  reason: string;
  isActive: boolean;
  timeRemaining?: number; // milliseconds
}

export interface ExpiredPermissionInfo {
  id: string;
  userId: string;
  permissionCode: string;
  expiresAt: Date;
}

/**
 * Accorder une permission temporaire à un utilisateur
 */
export async function grantTemporaryPermission(
  params: GrantTempPermissionParams
): Promise<TempPermissionResult> {
  const { userId, permissionId, grantedBy, expiresAt, reason } = params;

  // Vérifier que la permission existe
  const [perm] = await db.select()
    .from(permissions)
    .where(eq(permissions.id, permissionId));

  if (!perm) {
    throw new Error(`Permission non trouvée: ${permissionId}`);
  }

  // Vérifier s'il existe déjà une permission temporaire active
  const [existing] = await db.select()
    .from(temporaryPermissions)
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.permissionId, permissionId),
      eq(temporaryPermissions.isActive, true)
    ));

  if (existing) {
    throw new Error('Une permission temporaire active existe déjà pour cette permission');
  }

  // Insérer la nouvelle permission temporaire
  const [created] = await db.insert(temporaryPermissions)
    .values({
      userId,
      permissionId,
      grantedBy,
      expiresAt,
      reason,
      isActive: true,
    })
    .returning();

  // Obtenir les infos du granter
  const [granter] = await db.select({ nom: users.nom, prenom: users.prenom })
    .from(users)
    .where(eq(users.id, grantedBy));

  // Incrémenter la version RBAC
  await incrementRbacVersion('temporary_permission', 'granted', { userId, permissionCode: perm.code });

  // Notifier l'utilisateur via WebSocket
  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.sendToUser(userId, {
      type: 'RBAC_UPDATE',
      payload: {
        entity: 'temporary_permission',
        action: 'granted',
        userId,
        permissionCode: perm.code,
        expiresAt: expiresAt.toISOString(),
      }
    });
  }

  return {
    id: created.id,
    userId: created.userId,
    permissionId: created.permissionId,
    permissionCode: perm.code,
    permissionName: perm.name,
    grantedBy: created.grantedBy,
    granterName: granter ? `${granter.prenom || ''} ${granter.nom}`.trim() : 'Inconnu',
    grantedAt: created.grantedAt,
    expiresAt: created.expiresAt,
    reason: created.reason,
    isActive: created.isActive,
    timeRemaining: created.expiresAt.getTime() - Date.now(),
  };
}

/**
 * Révoquer une permission temporaire
 */
export async function revokeTemporaryPermission(
  tempPermId: string,
  revokedBy: string,
  revokeReason?: string
): Promise<{ success: boolean }> {
  // Obtenir la permission avec son code
  const [existing] = await db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(eq(temporaryPermissions.id, tempPermId));

  if (!existing || !existing.tp.isActive) {
    throw new Error('Permission temporaire non trouvée ou déjà révoquée');
  }

  // Marquer comme révoquée
  await db.update(temporaryPermissions)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokeReason,
    })
    .where(eq(temporaryPermissions.id, tempPermId));

  // Incrémenter la version RBAC
  await incrementRbacVersion('temporary_permission', 'revoked', {
    userId: existing.tp.userId,
    permissionCode: existing.permCode,
  });

  // Notifier l'utilisateur
  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.sendToUser(existing.tp.userId, {
      type: 'RBAC_UPDATE',
      payload: {
        entity: 'temporary_permission',
        action: 'revoked',
        userId: existing.tp.userId,
        permissionCode: existing.permCode,
      }
    });
  }

  return { success: true };
}

/**
 * Obtenir toutes les permissions temporaires actives pour un utilisateur
 */
export async function getUserTemporaryPermissions(userId: string): Promise<TempPermissionResult[]> {
  const results = await db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
    permName: permissions.name,
    granterNom: users.nom,
    granterPrenom: users.prenom,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .leftJoin(users, eq(temporaryPermissions.grantedBy, users.id))
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.isActive, true)
    ))
    .orderBy(desc(temporaryPermissions.expiresAt));

  const now = Date.now();

  return results.map(r => ({
    id: r.tp.id,
    userId: r.tp.userId,
    permissionId: r.tp.permissionId,
    permissionCode: r.permCode || '',
    permissionName: r.permName || '',
    grantedBy: r.tp.grantedBy,
    granterName: `${r.granterPrenom || ''} ${r.granterNom || ''}`.trim(),
    grantedAt: r.tp.grantedAt,
    expiresAt: r.tp.expiresAt,
    reason: r.tp.reason,
    isActive: r.tp.isActive,
    timeRemaining: r.tp.expiresAt.getTime() - now,
  }));
}

/**
 * Obtenir toutes les permissions temporaires (admin view)
 */
export async function getAllTemporaryPermissions(options?: {
  activeOnly?: boolean;
  limit?: number;
}): Promise<TempPermissionResult[]> {
  const { activeOnly = true, limit = 100 } = options || {};

  let query = db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
    permName: permissions.name,
    granterNom: users.nom,
    granterPrenom: users.prenom,
    userName: sql<string>`(SELECT nom || ' ' || COALESCE(prenom, '') FROM users WHERE id = ${temporaryPermissions.userId})`.as('user_name'),
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .leftJoin(users, eq(temporaryPermissions.grantedBy, users.id))
    .orderBy(desc(temporaryPermissions.expiresAt))
    .limit(limit);

  if (activeOnly) {
    query = query.where(eq(temporaryPermissions.isActive, true)) as typeof query;
  }

  const results = await query;
  const now = Date.now();

  return results.map(r => ({
    id: r.tp.id,
    userId: r.tp.userId,
    permissionId: r.tp.permissionId,
    permissionCode: r.permCode || '',
    permissionName: r.permName || '',
    grantedBy: r.tp.grantedBy,
    granterName: `${r.granterPrenom || ''} ${r.granterNom || ''}`.trim(),
    grantedAt: r.tp.grantedAt,
    expiresAt: r.tp.expiresAt,
    reason: r.tp.reason,
    isActive: r.tp.isActive,
    timeRemaining: r.tp.expiresAt.getTime() - now,
  }));
}

/**
 * Expirer toutes les permissions temporaires dépassées
 * Appelé par le cron job
 */
export async function expireTemporaryPermissions(): Promise<ExpiredPermissionInfo[]> {
  const now = new Date();

  // Trouver toutes les permissions actives expirées
  const expiredPerms = await db.select({
    tp: temporaryPermissions,
    permCode: permissions.code,
  })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(and(
      eq(temporaryPermissions.isActive, true),
      lte(temporaryPermissions.expiresAt, now)
    ));

  if (expiredPerms.length === 0) {
    return [];
  }

  // Désactiver toutes les permissions expirées
  await db.update(temporaryPermissions)
    .set({ isActive: false })
    .where(and(
      eq(temporaryPermissions.isActive, true),
      lte(temporaryPermissions.expiresAt, now)
    ));

  // Incrémenter la version RBAC une seule fois
  await incrementRbacVersion('temporary_permission', 'batch_expired', {
    count: expiredPerms.length,
  });

  // Notifier les utilisateurs affectés
  const wsInstance = getWsInstance();
  if (wsInstance) {
    for (const expired of expiredPerms) {
      wsInstance.sendToUser(expired.tp.userId, {
        type: 'RBAC_UPDATE',
        payload: {
          entity: 'temporary_permission',
          action: 'expired',
          userId: expired.tp.userId,
          permissionCode: expired.permCode,
        }
      });
    }
  }

  return expiredPerms.map(p => ({
    id: p.tp.id,
    userId: p.tp.userId,
    permissionCode: p.permCode || '',
    expiresAt: p.tp.expiresAt,
  }));
}

/**
 * Obtenir les codes de permissions temporaires actives pour un utilisateur
 * Utilisé par le constructeur d'ability
 */
export async function getActiveTemporaryPermissionCodes(userId: string): Promise<string[]> {
  const now = new Date();

  const perms = await db.select({ code: permissions.code })
    .from(temporaryPermissions)
    .leftJoin(permissions, eq(temporaryPermissions.permissionId, permissions.id))
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.isActive, true),
      lte(now, temporaryPermissions.expiresAt)
    ));

  return perms.map(p => p.code).filter(Boolean) as string[];
}

/**
 * Vérifier si un utilisateur a une permission temporaire spécifique
 */
export async function hasTemporaryPermission(
  userId: string,
  permissionCode: string
): Promise<boolean> {
  const codes = await getActiveTemporaryPermissionCodes(userId);
  return codes.includes(permissionCode);
}
