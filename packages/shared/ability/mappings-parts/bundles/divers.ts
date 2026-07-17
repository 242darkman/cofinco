/**
 * Fragment de bundles de permissions par module — domaine « divers ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleDivers: Record<string, string[]> = {
  // === ADMINISTRATION ===
  'Administration': [
    'admin.view',
    'admin.settings',
    'admin.manage',
    'admin.users',
    'admin.roles',
    'admin.logs',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'users.reset_password',
    'users.suspend',
    'users.activate',
    'sessions.view',
    'sessions.terminate',
  ],

  'Agences': [
    'agences.view',
    'agences.create',
    'agences.edit',
    'agences.delete',
    'agences.manage',
    'agences.approve',
    'agences.suspend',
    'agences.activate',
  ],

  'RBAC': [
    'rbac.view',
    'rbac.create',
    'rbac.edit',
    'rbac.delete',
    'rbac.manage',
    'rbac.roles.view',
    'rbac.roles.edit',
    'rbac.permissions.view',
    'rbac.permissions.edit',
    'permissions.view',
    'permissions.assign',
    'admin.locks.view',
    'admin.locks.manage',
  ],

  'Audit': [
    'audit.view',
    'audit.export',
  ],

  'Paramètres': [
    'parametres.view',
    'parametres.edit',
  ],

  'Maintenance': [
    'maintenance.view',
    'maintenance.purge',
    'maintenance.migrate',
    'maintenance.seed',
    'maintenance.manage',
  ],
};
