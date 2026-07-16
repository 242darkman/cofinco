/**
 * Fragment de bundles de permissions par module — domaine « comptabilite ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleComptabilite: Record<string, string[]> = {
  // === OPÉRATIONS - COMPTABILITÉ ===
  'Comptabilité': [
    'comptabilite.view',
    'comptabilite.create',
    'comptabilite.edit',
    'comptabilite.export',
    'comptabilite.ecritures.view',
    'comptabilite.ecritures.create',
    'comptabilite.ecritures.edit',
    'comptabilite.ecritures.delete',
    'comptabilite.ecritures.approve',
    'comptabilite.journaux.view',
    'comptabilite.journaux.create',
    'comptabilite.journaux.edit',
    'comptabilite.write',
    'comptabilite.reports',
  ],

  'Rapports': [
    'rapports.view',
    'rapports.create',
    'rapports.export',
    'rapports.schedule',
  ],
};
