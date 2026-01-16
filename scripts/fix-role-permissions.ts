
import { db } from "../server/db";
import { rolePermissions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const ROLE_MAPPING: Record<string, string> = {
  'Administrateur': 'admin',
  'Chef d\'Agence': 'chef_agence',
  'Agent Caisse': 'agent_caisse',
  'Agent Terrain': 'terrain',
  'Comptable': 'comptable',
  'Gestionnaire Crédit': 'gestionnaire_credit',
  'Superviseur': 'superviseur',
  'Agent': 'agent'
};

async function fixRolePermissions() {
  console.log('Starting role permissions fix...');

  for (const [oldRole, newRole] of Object.entries(ROLE_MAPPING)) {
    console.log(`Processing mapping: ${oldRole} -> ${newRole}`);
    
    // Get permissions for the old role
    const permissions = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.role, oldRole));

    console.log(`Found ${permissions.length} permissions for ${oldRole}`);

    if (permissions.length === 0) {
      console.log(`No permissions found for ${oldRole}, skipping...`);
      continue;
    }

    // Insert permissions for the new role if they don't exist
    let insertedCount = 0;
    for (const perm of permissions) {
      // Check if permission already exists for new role
      const existing = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.role, newRole),
            eq(rolePermissions.permissionId, perm.permissionId)
          )
        );

      if (existing.length === 0) {
        await db.insert(rolePermissions).values({
          role: newRole,
          permissionId: perm.permissionId,
          granted: perm.granted
        });
        insertedCount++;
      }
    }

    console.log(`Inserted ${insertedCount} new permissions for ${newRole}`);
  }

  console.log('Role permissions fix completed.');
  process.exit(0);
}

fixRolePermissions().catch((err) => {
  console.error('Error fixing role permissions:', err);
  process.exit(1);
});
