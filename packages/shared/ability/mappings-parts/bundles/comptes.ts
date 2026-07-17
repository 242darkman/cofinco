/**
 * Fragment de bundles de permissions par module — domaine « comptes ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleComptes: Record<string, string[]> = {
  // === FINANCE - COMPTES ===
  'Comptes': [
    'comptes.view',
    'comptes.create',
    'comptes.edit',
    'comptes.delete',
    'comptes.export',
    'comptes.transfer',
    'comptes.suspend',
    'comptes.unsuspend',
    'comptes.close_initiate',
    'comptes.close_approve',
    'comptes.close_cancel',
    'epargnes.view',
    'epargnes.create',
    'epargnes.edit',
    'epargnes.delete',
    'epargnes.export',
    'epargnes.deposit',
    'epargnes.withdraw',
    'comptes-bloques.view',
    'comptes-bloques.create',
    'comptes-bloques.edit',
  ],
};
