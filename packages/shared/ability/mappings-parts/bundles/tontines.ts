/**
 * Fragment de bundles de permissions par module — domaine « tontines ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleTontines: Record<string, string[]> = {
  // === FINANCE - TONTINES ===
  'Tontines': [
    'tontines.view',
    'tontines.create',
    'tontines.edit',
    'tontines.delete',
    'tontines.approve',
    'tontines.distribute',
    'tontines.export',
    'tontines.close',
    'tontines.manage',
    'tontines.membres.view',
    'tontines.membres.create',
    'tontines.membres.edit',
    'tontines.membres.delete',
    'tontines.contributions.view',
    'tontines.contributions.create',
  ],
};
