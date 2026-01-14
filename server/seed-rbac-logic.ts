
import { db } from './db';
import { modules, permissions, rolePermissions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { MODULES_DATA, PERMISSIONS_DATA, SEED_ROLE_PERMISSIONS } from '@shared/config/rbac';

export async function seedRBAC() {
  console.log('🔐 Seeding Modules & Permissions...');
  
  // 1. Sync Modules
  const insertedModules: Record<string, string> = {}; // Name -> ID

  for (const mod of MODULES_DATA) {
    const [existing] = await db.select().from(modules).where(eq(modules.name, mod.name));
    let moduleId = existing?.id;

    if (existing) {
      await db.update(modules)
        .set({ 
          description: mod.description,
          icon: mod.icon,
          category: mod.category,
          orderIndex: mod.orderIndex
        })
        .where(eq(modules.id, existing.id));
    } else {
      const [inserted] = await db.insert(modules).values(mod).returning();
      moduleId = inserted.id;
    }
    
    if (moduleId) {
      insertedModules[mod.name] = moduleId;
    }
  }

  // 2. Sync Permissions
  const insertedPermissions: Record<string, string> = {}; // Code -> ID
  const allPermissionIds: string[] = [];

  for (const [moduleName, perms] of Object.entries(PERMISSIONS_DATA)) {
    const moduleId = insertedModules[moduleName];
    if (!moduleId) {
      console.warn(`⚠️ Module ${moduleName} not found in MODULES_DATA but used in PERMISSIONS_DATA. Skipping.`);
      continue;
    }

    for (const p of perms) {
      const [existing] = await db.select().from(permissions).where(eq(permissions.code, p.code));
      let permId = existing?.id;

      if (existing) {
        await db.update(permissions)
          .set({ 
            name: p.name,
            description: p.description,
            moduleId: moduleId
          })
          .where(eq(permissions.id, existing.id));
      } else {
        const [inserted] = await db.insert(permissions)
          .values({
            code: p.code,
            name: p.name,
            description: p.description,
            moduleId: moduleId
          })
          .returning();
        permId = inserted.id;
      }

      if (permId) {
        insertedPermissions[p.code] = permId;
        allPermissionIds.push(permId);
      }
    }
  }

  // 3. Sync Role Permissions
  console.log('👥 Syncing Role Permissions...');
  
  // Clear existing role permissions to ensure a clean state based on config
  await db.delete(rolePermissions);

  for (const [role, codes] of Object.entries(SEED_ROLE_PERMISSIONS)) {
    const valuesToInsert = [];

    if (codes.includes('*')) {
      // Grant ALL permissions
      console.log(`   - Granting ALL permissions to ${role}`);
      for (const permId of allPermissionIds) {
        valuesToInsert.push({
          role: role,
          permissionId: permId,
          granted: true
        });
      }
    } else {
      // Grant specific permissions
      console.log(`   - Granting specific permissions to ${role}`);
      for (const code of codes) {
        const permId = insertedPermissions[code];
        if (permId) {
          valuesToInsert.push({
            role: role,
            permissionId: permId,
            granted: true
          });
        } else {
          console.warn(`   ⚠️ Permission code '${code}' not found for role '${role}'`);
        }
      }
    }

    if (valuesToInsert.length > 0) {
      // Insert in chunks to avoid parameter limit if necessary, but here 100-200 is fine
      await db.insert(rolePermissions).values(valuesToInsert);
    }
  }

  console.log('   ✅ RBAC configured successfully');
}
