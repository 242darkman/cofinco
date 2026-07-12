import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { userRoles } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { type RbacUpdatePayload } from '@shared/ability';

/**
 * Construit la charge utile de mise à jour RBAC pour la diffusion
 */
export function buildRbacUpdatePayload(
  scope: 'role' | 'user' | 'global',
  version: number,
  options: {
    role?: SystemRole;
    userId?: string;
    permissionCode?: string;
    granted?: boolean;
    source?: 'role_permission' | 'user_permission';
    agenceId?: string;
  } = {}
): RbacUpdatePayload {
  return {
    scope,
    version,
    role: options.role,
    userId: options.userId,
    agenceId: options.agenceId,
    changed: options.permissionCode
      ? {
          permissionCode: options.permissionCode,
          granted: options.granted ?? true,
          source: options.source || 'role_permission',
        }
      : undefined,
  };
}

/**
 * Récupère tous les identifiants d'utilisateurs ayant un rôle spécifique (pour la diffusion)
 */
export async function getUserIdsWithRole(
  role: SystemRole,
  agenceId?: string
): Promise<string[]> {
  const query = agenceId
    ? and(eq(userRoles.role, role), eq(userRoles.agenceId, agenceId))
    : eq(userRoles.role, role);

  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(query);

  return rows.map((r) => r.userId);
}

/**
 * Obtient le libellé lisible pour un rôle
 */
export function getRoleLabel(role: SystemRole): string {
  const labels: Record<SystemRole, string> = {
    [SystemRole.ADMIN]: 'Administrateur',
    [SystemRole.CHEF_AGENCE]: "Chef d'Agence",
    [SystemRole.CAISSIER]: 'Caissier',
    [SystemRole.AGENT_TERRAIN]: 'Agent Terrain',
    [SystemRole.COMPTABLE]: 'Comptable',
    [SystemRole.SUPERVISEUR]: 'Superviseur',
    [SystemRole.GESTIONNAIRE_CREDIT]: 'Gestionnaire Crédit',
    [SystemRole.AUDITEUR]: 'Auditeur',
    [SystemRole.RH]: 'Responsable RH',
    [SystemRole.SUPPORT_IT]: 'Support Informatique',
    [SystemRole.CLIENT]: 'Client',
  };
  return labels[role] || role;
}

/**
 * Vérifie si un utilisateur est administrateur (a le rôle ADMIN)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const [adminRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, SystemRole.ADMIN)));

  return !!adminRole;
}
