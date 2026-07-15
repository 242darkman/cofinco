import { db } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Récupère la version actuelle du RBAC
 */
export async function getRbacVersion(): Promise<number> {
  const result = await db.execute<{ version: string }>(
    sql`SELECT get_rbac_version() as version`
  );
  return parseInt(result.rows[0]?.version || '1', 10);
}

/**
 * Incrémente la version du RBAC (avec suivi des modifications)
 */
export async function incrementRbacVersion(
  changeType: string,
  changeEntity: string,
  changeDetail?: Record<string, any>
): Promise<number> {
  const result = await db.execute<{ increment_rbac_version: string }>(
    sql`SELECT increment_rbac_version(
      ${changeType}::TEXT,
      ${changeEntity}::TEXT,
      ${changeDetail ? JSON.stringify(changeDetail) : null}::JSONB
    ) as increment_rbac_version`
  );
  return parseInt(result.rows[0]?.increment_rbac_version || '1', 10);
}
