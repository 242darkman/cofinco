import { db } from '../../db';
import { sql } from 'drizzle-orm';

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
 * Récupère les permissions effectives avec leur source pour le débogage
 * (Utilise la vue v_effective_permissions)
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
 * Explique pourquoi un utilisateur possède ou non une permission spécifique
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
