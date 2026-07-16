/**
 * Fragment de bundles de permissions par module — domaine « rh ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleRh: Record<string, string[]> = {
  // === RH ===
  'RH': [
    'rh.view',
    'rh.create',
    'rh.edit',
    'rh.delete',
    'rh.export',
    'rh.approve',
    'rh.manage',
    'rh.employes.view',
    'rh.employes.create',
    'rh.employes.edit',
    'rh.employes.delete',
    'paie.view',
    'paie.create',
    'paie.edit',
    'paie.approve',
  ],

  'Employés': [
    'employes.view',
    'employes.create',
    'employes.edit',
    'employes.delete',
    'employes.manage',
  ],

  'Départements': [
    'departments.view',
    'departments.create',
    'departments.edit',
    'departments.delete',
    'departments.manage',
  ],
};
