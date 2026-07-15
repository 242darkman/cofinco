import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { users, temporaryPermissions } from '@shared/schema';
import { getPermissionCatalog } from './catalog.service';

export interface SimulatedPermission {
  id: string;
  code: string;
  name: string;
  granted: boolean;
  source: 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE' | 'ADMIN' | 'NONE';
  sourceRole?: string;
  expiresAt?: string | null;
}

export interface SimulatedModule {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  permissions: SimulatedPermission[];
}

export interface SimulationResult {
  user: { id: string; nom: string; prenom: string | null };
  roles: string[];
  isAdmin: boolean;
  summary: {
    total: number;
    granted: number;
    denied: number;
    bySource: { role: number; override: number; temporary: number };
  };
  modules: SimulatedModule[];
}

/**
 * Simule les permissions pour un utilisateur — aperçu en lecture seule des permissions effectives regroupées par module
 */
export async function simulateUserPermissions(
  userId: string,
  agenceId?: string
): Promise<SimulationResult> {
  const { buildAbilityForUser } = await import('../../authorization/ability');
  const { getEffectivePermissionsWithSource } = await import('../rbac-audit-service'); // Note: keep import relative to current file's parent since it's outside rbac dir or use correct path

  // Get user info
  const [user] = await db
    .select({ id: users.id, nom: users.nom, prenom: users.prenom })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) throw new Error('Utilisateur non trouvé');

  // Get ability info (roles, isAdmin)
  const ability = await buildAbilityForUser({ userId, agenceIdActive: agenceId });

  // Get effective permissions with source
  const effective = await getEffectivePermissionsWithSource(userId, agenceId);
  const effectiveMap = new Map(effective.map((e: any) => [e.permissionCode, e]));

  // Get temporary permissions for expiry info
  const tempPerms = await db
    .select({
      permissionId: temporaryPermissions.permissionId,
      expiresAt: temporaryPermissions.expiresAt,
    })
    .from(temporaryPermissions)
    .where(and(
      eq(temporaryPermissions.userId, userId),
      eq(temporaryPermissions.isActive, true),
    ));
  const tempMap = new Map(tempPerms.map(t => [t.permissionId, t.expiresAt]));

  // Get full catalog
  const catalog = await getPermissionCatalog();

  // Build simulation grouped by module
  const simulatedModules: SimulatedModule[] = catalog.modules.map(mod => {
    const modulePerms = catalog.permissions.filter(p => p.moduleId === mod.id);
    const simPerms: SimulatedPermission[] = modulePerms.map(p => {
      const eff = effectiveMap.get(p.code);
      const tempExpiry = tempMap.get(p.id);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        granted: eff?.granted ?? false,
        source: eff?.source ?? 'NONE',
        sourceRole: eff?.sourceRole || undefined,
        expiresAt: tempExpiry ? tempExpiry.toISOString() : null,
      };
    });
    return {
      id: mod.id,
      name: mod.name,
      category: mod.category,
      icon: mod.icon,
      permissions: simPerms,
    };
  });

  // Summary
  const allPerms = simulatedModules.flatMap(m => m.permissions);
  const granted = allPerms.filter(p => p.granted).length;
  const summary = {
    total: allPerms.length,
    granted,
    denied: allPerms.length - granted,
    bySource: {
      role: allPerms.filter(p => p.source === 'ROLE').length,
      override: allPerms.filter(p => p.source === 'OVERRIDE_GLOBAL' || p.source === 'OVERRIDE_AGENCE').length,
      temporary: allPerms.filter(p => p.source === 'TEMPORARY').length,
    },
  };

  return {
    user: { id: user.id, nom: user.nom, prenom: user.prenom },
    roles: ability.roles || [ability.role],
    isAdmin: ability.isAdmin,
    summary,
    modules: simulatedModules,
  };
}
